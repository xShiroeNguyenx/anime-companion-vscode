import type { LLMProvider, SendOptions, StreamResult } from '../llm-provider';
import type { ProviderId } from '../secrets';
import { parseSSE } from '../sse-parser';

export interface OpenAICompatConfig {
  id: ProviderId;
  // Root of the API, WITHOUT a trailing slash and WITHOUT `/chat/completions`.
  // Example: 'https://api.openai.com/v1'.
  baseUrl: string;
  defaultModel: string;
  // Producer of extra request headers, evaluated per-request. Used by OpenRouter
  // to attach HTTP-Referer + X-Title for attribution.
  extraHeaders?: () => Record<string, string>;
  // Optional label for error messages (defaults to id).
  displayName?: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: ProviderId;
  readonly defaultModel: string;
  readonly requiresApiKey = true;

  constructor(private readonly _cfg: OpenAICompatConfig) {
    this.id = _cfg.id;
    this.defaultModel = _cfg.defaultModel;
  }

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: 'text/event-stream',
    };
    if (this._cfg.extraHeaders) {
      Object.assign(headers, this._cfg.extraHeaders());
    }

    const url = `${this._cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const label = this._cfg.displayName ?? this._cfg.id;

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!resp.ok) {
      const errText = await safeReadError(resp);
      throw new Error(errText || `${label} API error ${resp.status}`);
    }

    for await (const data of parseSSE(resp)) {
      if (data === '[DONE]') break;
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      // Standard OpenAI-format delta. DeepSeek's reasoner adds `reasoning_content`
      // separately — we deliberately only yield the user-visible `content` so the
      // chat bubble doesn't fill with chain-of-thought.
      const delta = evt?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield delta;
      }
      // Final chunk carries usage when stream_options.include_usage is set.
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
