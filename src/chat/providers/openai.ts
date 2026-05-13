import type { LLMProvider, SendOptions, StreamResult } from '../llm-provider';
import { parseSSE } from '../sse-parser';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  readonly defaultModel = 'gpt-4o-mini';
  readonly requiresApiKey = true;

  sendStream(opts: SendOptions): { stream: AsyncIterable<string>; result: StreamResult } {
    const result: StreamResult = {};
    const stream = this._stream(opts, result);
    return { stream, result };
  }

  private async *_stream(opts: SendOptions, result: StreamResult): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: opts.model || this.defaultModel,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!resp.ok) {
      const errText = await safeReadError(resp);
      throw new Error(errText || `OpenAI API error ${resp.status}`);
    }

    for await (const data of parseSSE(resp)) {
      if (data === '[DONE]') break;
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = evt?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield delta;
      }
      // OpenAI streams usage in the final chunk when stream_options.include_usage is set.
      if (evt?.usage) {
        result.usage = {
          inputTokens: evt.usage.prompt_tokens,
          outputTokens: evt.usage.completion_tokens,
        };
      }
    }
  }
}

async function safeReadError(resp: Response): Promise<string> {
  try {
    const txt = await resp.text();
    const json = JSON.parse(txt);
    return json?.error?.message || txt;
  } catch {
    return '';
  }
}
