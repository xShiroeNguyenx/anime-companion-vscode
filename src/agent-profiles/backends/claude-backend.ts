import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
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
    // Some logins persist the org id inside the oauth blob instead of at the
    // top level; team/SSO accounts may omit it entirely.
    organizationUuid?: string;
    subscriptionType?: string;
    expiresAt?: number;
    accessToken?: string;
    refreshToken?: string;
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
    const oauth = j?.claudeAiOauth;
    if (!j || !oauth) return undefined;

    const sub = oauth.subscriptionType;
    // organizationUuid usually lives at the top level, but some logins nest it
    // in the oauth blob and team/SSO accounts may omit it entirely — so never
    // treat a missing org as "no account", just as a missing label/signature.
    const org = j.organizationUuid ?? oauth.organizationUuid;
    const exp = oauth.expiresAt;

    // Signature identifies the account so the manager can flag the live one as
    // "active". Prefer the stable org id; when it's absent, fall back to a hash
    // of the refresh token (more stable than the access token, which rotates on
    // every refresh). This keeps org-less team accounts identifiable instead of
    // dropping them. The fallback only drifts if Claude rotates the refresh
    // token between save and detection — acceptable for the minority case.
    let signature: string | undefined;
    if (org) {
      signature = `${org}|${sub ?? ''}`;
    } else {
      const stable = oauth.refreshToken ?? oauth.accessToken;
      if (stable) {
        const h = createHash('sha256').update(stable).digest('hex').slice(0, 16);
        signature = `tok:${h}|${sub ?? ''}`;
      } else if (sub) {
        signature = `sub:${sub}`;
      }
    }
    if (!signature) return undefined;

    const parts: string[] = [];
    if (sub) parts.push(`sub=${sub}`);
    if (org) parts.push(`org=${org.slice(0, 8)}`);
    if (typeof exp === 'number') {
      try { parts.push(`exp=${new Date(exp).toLocaleString()}`); } catch { /* ignore */ }
    }
    return {
      signature,
      text: parts.length ? parts.join(' · ') : '(claude account)',
    };
  },
};
