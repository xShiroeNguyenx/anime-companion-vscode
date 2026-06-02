import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { AccountBackend, AccountIdentity, SnapshotResult } from './account-backend';
import { readJsonSafe, readJsonSubset, mergeJsonFile, snapshotDir, restoreDir } from '../credential-fs';

const fsp = fs.promises;

// Credential files that live INSIDE ~/.claude. settings(.local).json are kept
// because the original swap design treated them as per-account. The earlier
// `claude.json`/`config.json`/`.config.json` entries were phantoms — no such
// files exist inside ~/.claude, and `claude.json` in particular implied the
// home-level ~/.claude.json was handled here when it wasn't (see below).
const WHITELIST: ReadonlySet<string> = new Set([
  '.credentials.json',
  'settings.json',
  'settings.local.json',
]);

// Claude's account identity is split across two files:
//   • ~/.claude/.credentials.json  — the OAuth tokens (swapped via WHITELIST)
//   • ~/.claude.json               — a large shared config whose `oauthAccount`
//     holds the organizationUuid + account identity, plus a derived `userID`.
// organizationUuid exists ONLY in ~/.claude.json, so swapping just the tokens
// leaves that file advertising the previous account's org against the new
// token — Claude then spins on every API call and logs the user out. We lift
// just these keys into a snapshot sidecar and merge them back on restore,
// preserving the rest of ~/.claude.json (projects, mcpServers, caches).
const ACCOUNT_SIDECAR = '.claude-account.json';
const ACCOUNT_KEYS = ['oauthAccount', 'userID'] as const;

function claudeHome(): string {
  return path.join(os.homedir(), '.claude');
}
function claudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

interface OAuthAccount {
  organizationUuid?: string;
  emailAddress?: string;
}

// Read the account binding relevant to a credential dir. Snapshot dirs carry it
// in the sidecar; the live home dir (~/.claude) doesn't — its binding lives in
// the home-level ~/.claude.json, one level up. Anything else (a stray dir) has
// no binding.
async function readAccountBinding(credentialDir: string): Promise<OAuthAccount | undefined> {
  const sidecar = await readJsonSafe<{ oauthAccount?: OAuthAccount }>(
    path.join(credentialDir, ACCOUNT_SIDECAR),
  );
  if (sidecar?.oauthAccount) return sidecar.oauthAccount;
  if (path.resolve(credentialDir) === path.resolve(claudeHome())) {
    const home = await readJsonSafe<{ oauthAccount?: OAuthAccount }>(claudeJsonPath());
    return home?.oauthAccount;
  }
  return undefined;
}

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
    return claudeHome();
  },

  // Capture the credential files PLUS the home-level account binding. The
  // manager prefers this over the generic file copy because the latter can't
  // reach ~/.claude.json (it lives outside homeDir).
  async snapshot(destDir: string): Promise<SnapshotResult> {
    const res = await snapshotDir(claudeHome(), destDir, WHITELIST);
    const account = await readJsonSubset(claudeJsonPath(), ACCOUNT_KEYS);
    if (account) {
      await fsp.writeFile(
        path.join(destDir, ACCOUNT_SIDECAR),
        JSON.stringify(account, null, 2),
        'utf8',
      );
      res.files.push(ACCOUNT_SIDECAR);
    }
    return res;
  },

  // Restore the credential files, then merge the captured account binding back
  // into ~/.claude.json. Snapshots saved before this fix have no sidecar — we
  // skip the merge for those (best-effort), so they keep working as before but
  // won't repair the org mismatch until re-saved.
  async restore(snapshotPath: string): Promise<string[]> {
    const written = await restoreDir(snapshotPath, claudeHome(), WHITELIST);
    const account = await readJsonSafe<Record<string, unknown>>(
      path.join(snapshotPath, ACCOUNT_SIDECAR),
    );
    if (account && typeof account === 'object') {
      await mergeJsonFile(claudeJsonPath(), account, path.join(claudeHome(), 'backups'));
      written.push(ACCOUNT_SIDECAR);
    }
    return written;
  },

  async readIdentity(credentialDir: string): Promise<AccountIdentity | undefined> {
    const j = await readJsonSafe<ClaudeCredentialJson>(path.join(credentialDir, '.credentials.json'));
    const oauth = j?.claudeAiOauth;
    if (!j || !oauth) return undefined;

    const sub = oauth.subscriptionType;
    // organizationUuid is the only STABLE account id — the access token rotates
    // every refresh and (as we've observed) so does the refresh token, so a
    // signature derived from either drifts and breaks active-detection / the
    // switch-away guard. The org usually isn't in .credentials.json at all; it
    // lives in the account binding — the snapshot sidecar, or the home-level
    // ~/.claude.json for the live account. Reach for it there first, falling
    // back to the (rarer) inline org fields, then to a token hash only when no
    // org exists anywhere (truly org-less team/SSO logins).
    const binding = await readAccountBinding(credentialDir);
    const org = j.organizationUuid ?? oauth.organizationUuid ?? binding?.organizationUuid;
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
    if (binding?.emailAddress) parts.push(binding.emailAddress);
    else if (org) parts.push(`org=${org.slice(0, 8)}`);
    if (typeof exp === 'number') {
      try { parts.push(`exp=${new Date(exp).toLocaleString()}`); } catch { /* ignore */ }
    }
    return {
      signature,
      text: parts.length ? parts.join(' · ') : '(claude account)',
    };
  },
};
