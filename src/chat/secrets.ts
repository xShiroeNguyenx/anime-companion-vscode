import * as vscode from 'vscode';

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'copilot';

const KEY_PREFIX = 'animeCompanion.apiKey.';

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
    const providers: ProviderId[] = ['anthropic', 'openai', 'gemini'];
    for (const p of providers) {
      if (await this.get(p)) return true;
    }
    return false;
  }

  // Copilot routes through vscode.lm — VS Code itself handles auth. There is
  // no key for us to store, so calling this for 'copilot' is a no-op.
  needsKey(provider: ProviderId): boolean {
    return provider !== 'copilot';
  }
}
