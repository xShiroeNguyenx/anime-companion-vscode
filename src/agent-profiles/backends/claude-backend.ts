import * as os from 'os';
import * as path from 'path';
import { AccountBackend, AccountIdentity } from './account-backend';
import { readJsonSafe } from '../credential-fs';

const WHITELIST: ReadonlySet<string> = new Set([
  '.credentials.json',
  'settings.json',
  'settings.local.json',
  'claude.json',
  'config.json',
  '.config.json',
]);

interface ClaudeCredentialJson {
  organizationUuid?: string;
  claudeAiOauth?: {
    subscriptionType?: string;
    expiresAt?: number;
  };
}

export const claudeBackend: AccountBackend = {
  id: 'claude',
  displayName: 'Claude',
  icon: '🤖',
  fileWhitelist: WHITELIST,
  sentinelFile: '.credentials.json',

  homeDir(): string {
    return path.join(os.homedir(), '.claude');
  },

  async readIdentity(credentialDir: string): Promise<AccountIdentity | undefined> {
    const j = await readJsonSafe<ClaudeCredentialJson>(path.join(credentialDir, '.credentials.json'));
    if (!j) return undefined;
    const sub = j.claudeAiOauth?.subscriptionType;
    const org = j.organizationUuid;
    const exp = j.claudeAiOauth?.expiresAt;
    if (!org) return undefined;

    const parts: string[] = [];
    if (sub) parts.push(`sub=${sub}`);
    parts.push(`org=${org.slice(0, 8)}`);
    if (typeof exp === 'number') {
      try { parts.push(`exp=${new Date(exp).toLocaleString()}`); } catch { /* ignore */ }
    }
    return {
      signature: `${org}|${sub ?? ''}`,
      text: parts.join(' · '),
    };
  },
};
