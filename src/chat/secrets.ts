import * as vscode from 'vscode';

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'copilot'
  | 'xai'
  | 'deepseek'
  | 'openrouter'
  | 'ollama';

const KEY_PREFIX = 'animeCompanion.apiKey.';

// Providers that don't take an API key — Copilot routes through vscode.lm,
// Ollama talks to a local server configured via `animeCompanion.chat.ollamaEndpoint`.
const NO_KEY_PROVIDERS = new Set<ProviderId>(['copilot', 'ollama']);

// Providers that actually have a key in SecretStorage (subset of all - NO_KEY).
const BYOK_PROVIDERS: ProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'xai',
  'deepseek',
  'openrouter',
];

export class ChatSecrets {
  constructor(private readonly _secrets: vscode.SecretStorage) {}

  async get(provider: ProviderId): Promise<string | undefined> {
    return this._secrets.get(KEY_PREFIX + provider);
  }

  async set(provider: ProviderId, value: string): Promise<void> {
    await this._secrets.store(KEY_PREFIX + provider, value);
  }

  async clear(provider: ProviderId): Promise<void> {
    await this._secrets.delete(KEY_PREFIX + provider);
  }

  async hasAny(): Promise<boolean> {
    for (const p of BYOK_PROVIDERS) {
      if (await this.get(p)) return true;
    }
    return false;
  }

  needsKey(provider: ProviderId): boolean {
    return !NO_KEY_PROVIDERS.has(provider);
  }
}
