import * as vscode from 'vscode';
import type { LLMProvider, SendOptions, StreamResult } from '../llm-provider';

const DEFAULT_ENDPOINT = 'http://localhost:11434';

// Talks to a local Ollama server. No API key — endpoint is read live from
// `animeCompanion.chat.ollamaEndpoint` so the user can change hosts without
// reloading the window. Streams NDJSON (one JSON object per line), NOT SSE.
export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama' as const;
  readonly defaultModel = 'llama3.2';
  readonly requiresApiKey = false;

  sendStream(opts: SendOptions): { stream: AsyncIterable<string>; result: StreamResult } {
    const result: StreamResult = {};
    const stream = this._stream(opts, result);
    return { stream, result };
  }

  private async *_stream(opts: SendOptions, result: StreamResult): AsyncIterable<string> {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const rawEndpoint = cfg.get<string>('chat.ollamaEndpoint', DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT;
    const endpoint = rawEndpoint.trim().replace(/\/+$/, '');
    const url = `${endpoint}/api/chat`;

    const ollamaOptions: Record<string, unknown> = {};
    if (opts.temperature !== undefined) ollamaOptions.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) ollamaOptions.num_predict = opts.maxTokens;

    const body: Record<string, unknown> = {
      model: opts.model || this.defaultModel,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (err) {
      throw new Error(friendlyConnectError(err, endpoint));
    }

    if (!resp.ok) {
      const errText = await safeReadError(resp);
      throw new Error(errText || `Ollama API error ${resp.status} at ${url}`);
    }
    if (!resp.body) {
      throw new Error(`Ollama returned empty body from ${url}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          const chunk = tryParse(line);
          if (!chunk) continue;

          const delta = chunk?.message?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta;
          }
          if (chunk?.done) {
            // Map Ollama's token counters to our usage shape.
            if (typeof chunk.prompt_eval_count === 'number' || typeof chunk.eval_count === 'number') {
              result.usage = {
                inputTokens: chunk.prompt_eval_count,
                outputTokens: chunk.eval_count,
              };
            }
          }
        }
      }

      // Flush trailing partial line if the server didn't end with \n.
      const tail = buffer.trim();
      if (tail) {
        const chunk = tryParse(tail);
        const delta = chunk?.message?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          yield delta;
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }
}

function tryParse(line: string): any | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function friendlyConnectError(err: unknown, endpoint: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  // fetch() in undici wraps ECONNREFUSED as 'fetch failed' with a cause chain.
  const looksRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|getaddrinfo/i.test(raw);
  if (looksRefused) {
    return (
      `Cannot reach Ollama at ${endpoint}. ` +
      `Make sure Ollama is installed and running (\`ollama serve\`), and that you've pulled the model (\`ollama pull llama3.2\`). ` +
      `Change endpoint via the 'animeCompanion.chat.ollamaEndpoint' setting or by re-running 'Configure Chat Provider'.`
    );
  }
  return `Ollama request failed: ${raw}`;
}

async function safeReadError(resp: Response): Promise<string> {
  try {
    const txt = await resp.text();
    const json = JSON.parse(txt);
    return json?.error || txt;
  } catch {
    return '';
  }
}
