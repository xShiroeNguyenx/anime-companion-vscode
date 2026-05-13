import * as vscode from 'vscode';
import type { LLMProvider, SendOptions, StreamResult } from '../llm-provider';

// Uses VS Code's built-in Language Model API (vscode.lm) — routes through the
// user's existing GitHub Copilot subscription so no API key handling is needed
// here. VS Code itself prompts the user for permission on first call.
export class CopilotProvider implements LLMProvider {
  readonly id = 'copilot' as const;
  readonly defaultModel = 'gpt-4o';
  readonly requiresApiKey = false;

  sendStream(opts: SendOptions): { stream: AsyncIterable<string>; result: StreamResult } {
    const result: StreamResult = {};
    const stream = this._stream(opts, result);
    return { stream, result };
  }

  private async *_stream(opts: SendOptions, _result: StreamResult): AsyncIterable<string> {
    if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
      throw new Error(
        'VS Code Language Model API not available. Update to VS Code 1.93+ and make sure GitHub Copilot is installed and signed in.'
      );
    }

    const family = (opts.model || this.defaultModel).trim();
    let models: vscode.LanguageModelChat[] = [];
    try {
      models = await vscode.lm.selectChatModels({ vendor: 'copilot', family });
    } catch (err) {
      throw new Error(
        `Copilot model lookup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (models.length === 0) {
      // Fall back to any Copilot model so the user gets *something* rather
      // than a hard failure when the family string doesn't match exactly.
      try {
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      } catch {
        models = [];
      }
      if (models.length === 0) {
        throw new Error(
          'No Copilot models available. Install GitHub Copilot, sign in, and make sure your subscription is active.'
        );
      }
    }
    const model = models[0];

    const lmMessages = toCopilotMessages(opts.messages);

    const cts = new vscode.CancellationTokenSource();
    const onAbort = () => cts.cancel();
    opts.signal?.addEventListener('abort', onAbort);

    try {
      const response = await model.sendRequest(lmMessages, {}, cts.token);
      for await (const fragment of response.text) {
        if (typeof fragment === 'string' && fragment.length > 0) {
          yield fragment;
        }
      }
    } catch (err) {
      // VS Code surfaces consent/quota/network failures as
      // LanguageModelError; the message is already actionable.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Copilot request failed: ${msg}`);
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
      cts.dispose();
    }
  }
}

// vscode.lm only supports User/Assistant roles. System turns get prepended to
// the next user message so the model still sees the persona, wrapped in tags
// to keep it visually separable when the model echoes it.
function toCopilotMessages(messages: SendOptions['messages']): vscode.LanguageModelChatMessage[] {
  const out: vscode.LanguageModelChatMessage[] = [];
  let pendingSystem = '';

  for (const m of messages) {
    if (m.role === 'system') {
      pendingSystem = pendingSystem ? `${pendingSystem}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === 'user') {
      const content = pendingSystem
        ? `<system_instructions>\n${pendingSystem}\n</system_instructions>\n\n${m.content}`
        : m.content;
      pendingSystem = '';
      out.push(vscode.LanguageModelChatMessage.User(content));
    } else if (m.role === 'assistant') {
      out.push(vscode.LanguageModelChatMessage.Assistant(m.content));
    }
  }

  // If the whole history is just a system prompt (no user turn yet), wrap it
  // in a placeholder user message so the API has something to send.
  if (pendingSystem && out.length === 0) {
    out.push(
      vscode.LanguageModelChatMessage.User(
        `<system_instructions>\n${pendingSystem}\n</system_instructions>`
      )
    );
  }

  return out;
}
