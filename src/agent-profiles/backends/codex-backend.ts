import * as os from 'os';
import * as path from 'path';
import { AccountBackend, AccountIdentity } from './account-backend';
import { readJsonSafe } from '../credential-fs';

// Codex CLI keeps its login in ~/.codex/auth.json. Everything else in that
// directory (sessions, sqlite logs, caches) is unrelated to the account, so
// the whitelist is just the credential file — same spirit as Claude's
// .credentials.json swap.
const WHITELIST: ReadonlySet<string> = new Set(['auth.json']);

interface CodexAuthJson {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: {
    id_token?: string;
    account_id?: string;
  };
}

// Decode the payload of a JWT without verifying it — we only read non-secret
// claims (email, plan) for display. Returns undefined on any parse failure.
function decodeJwtPayload(token: string | undefined): any | undefined {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export const codexBackend: AccountBackend = {
  id: 'codex',
  displayName: 'Codex',
  icon: '⚡',
  fileWhitelist: WHITELIST,
  sentinelFile: 'auth.json',

  homeDir(): string {
    return path.join(os.homedir(), '.codex');
  },

  async readIdentity(credentialDir: string): Promise<AccountIdentity | undefined> {
    const j = await readJsonSafe<CodexAuthJson>(path.join(credentialDir, 'auth.json'));
    if (!j) return undefined;

    const accountId = j.tokens?.account_id;
    const apiKey = j.OPENAI_API_KEY;
    // Signature: prefer the stable ChatGPT account id; fall back to API-key mode.
    const signature = accountId
      ? `chatgpt|${accountId}`
      : (apiKey ? `apikey|${apiKey.slice(0, 12)}` : undefined);
    if (!signature) return undefined;

    const claims = decodeJwtPayload(j.tokens?.id_token);
    const email = typeof claims?.email === 'string' ? claims.email : undefined;
    const plan = claims?.['https://api.openai.com/auth']?.chatgpt_plan_type;

    const parts: string[] = [];
    if (j.auth_mode) parts.push(`mode=${j.auth_mode}`);
    if (email) parts.push(email);
    if (plan) parts.push(`plan=${plan}`);
    if (!email && accountId) parts.push(`acct=${accountId.slice(0, 8)}`);

    return {
      signature,
      text: parts.length ? parts.join(' · ') : '(codex account)',
    };
  },
};
