import type { ChatMessage, LLMProvider, SendOptions, StreamResult } from '../llm-provider';
import { parseSSE } from '../sse-parser';
import { log } from '../../log';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini' as const;
  readonly defaultModel = 'gemini-2.5-flash';
  readonly requiresApiKey = true;

  sendStream(opts: SendOptions): { stream: AsyncIterable<string>; result: StreamResult } {
    const result: StreamResult = {};
    const stream = this._stream(opts, result);
    return { stream, result };
  }

  private async *_stream(opts: SendOptions, result: StreamResult): AsyncIterable<string> {
    const model = opts.model || this.defaultModel;
    const url = `${BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

    const { systemPrompt, contents } = toGeminiContents(opts.messages);
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        ...(opts.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      },
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': opts.apiKey,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!resp.ok) {
      const errText = await safeReadError(resp);
      log(`Gemini: HTTP ${resp.status} for model ${model}: ${errText}`);
      throw new Error(errText || `Gemini API error ${resp.status}`);
    }

    let yieldedAnything = false;
    let lastFinishReason: string | undefined;
    let lastPromptFeedback: any;
    let eventCount = 0;

    for await (const data of parseSSE(resp)) {
      eventCount++;
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        log(`Gemini: failed to JSON.parse SSE chunk: ${data.slice(0, 200)}`);
        continue;
      }

      // 2.5-series "thinking" responses can include parts where `thought: true`
      // marks an internal reasoning step. Skip those — they aren't the answer
      // and the API doesn't intend them for end-user display.
      const parts = evt?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p?.thought) continue;
          if (typeof p?.text === 'string' && p.text.length > 0) {
            yieldedAnything = true;
            yield p.text;
          }
        }
      }

      const candFinish = evt?.candidates?.[0]?.finishReason;
      if (typeof candFinish === 'string') lastFinishReason = candFinish;
      if (evt?.promptFeedback) lastPromptFeedback = evt.promptFeedback;

      if (evt?.usageMetadata) {
        result.usage = {
          inputTokens: evt.usageMetadata.promptTokenCount,
          outputTokens: evt.usageMetadata.candidatesTokenCount,
        };
      }
    }

    if (!yieldedAnything) {
      // Build the most actionable error message we can from whatever the API
      // gave us. Common cases: thinking-only response with maxTokens too low,
      // safety block, or the model id is wrong.
      const hints: string[] = [];
      if (lastFinishReason && lastFinishReason !== 'STOP') {
        hints.push(`finishReason=${lastFinishReason}`);
      }
      if (lastPromptFeedback?.blockReason) {
        hints.push(`blockReason=${lastPromptFeedback.blockReason}`);
      }
      log(
        `Gemini: stream ended with no text. model=${model}, events=${eventCount}, ${hints.join(', ') || 'no diagnostic fields'}`
      );
      throw new Error(
        `Gemini returned no text (${hints.join(', ') || 'empty stream'}). ` +
          `Common causes: wrong model id, maxTokens too low for 2.5 "thinking" models (try 2048+), ` +
          `or a safety block. Check the "Anime Companion" output channel for details.`
      );
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

function toGeminiContents(messages: ChatMessage[]): {
  systemPrompt: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
} {
  const sys: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      sys.push(m.content);
      continue;
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  return { systemPrompt: sys.join('\n\n'), contents };
}
