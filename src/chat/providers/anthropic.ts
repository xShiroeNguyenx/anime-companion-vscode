import type { ChatMessage, LLMProvider, SendOptions, StreamResult } from '../llm-provider';
import { parseSSE } from '../sse-parser';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  readonly defaultModel = 'claude-haiku-4-5-20251001';
  readonly requiresApiKey = true;

  sendStream(opts: SendOptions): { stream: AsyncIterable<string>; result: StreamResult } {
    const result: StreamResult = {};
    const stream = this._stream(opts, result);
    return { stream, result };
  }

  private async *_stream(opts: SendOptions, result: StreamResult): AsyncIterable<string> {
    const { systemPrompt, dialog } = splitSystem(opts.messages);

    const body = {
      model: opts.model || this.defaultModel,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature,
      system: systemPrompt || undefined,
      stream: true,
      messages: dialog.map((m) => ({ role: m.role, content: m.content })),
    };

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': API_VERSION,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!resp.ok) {
      const errText = await safeReadError(resp);
      throw new Error(errText || `Anthropic API error ${resp.status}`);
    }

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const data of parseSSE(resp)) {
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
        yield evt.delta.text;
      } else if (evt.type === 'message_start' && evt.message?.usage?.input_tokens !== undefined) {
        inputTokens = evt.message.usage.input_tokens;
      } else if (evt.type === 'message_delta' && evt.usage?.output_tokens !== undefined) {
        outputTokens = evt.usage.output_tokens;
      }
    }

    if (inputTokens !== undefined || outputTokens !== undefined) {
      result.usage = { inputTokens, outputTokens };
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

function splitSystem(messages: ChatMessage[]): { systemPrompt: string; dialog: ChatMessage[] } {
  const sys: string[] = [];
  const dialog: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') sys.push(m.content);
    else dialog.push(m);
  }
  return { systemPrompt: sys.join('\n\n'), dialog };
}
