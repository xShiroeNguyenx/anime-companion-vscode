import * as vscode from 'vscode';
import { log } from './log';

// GitHub accounts shown in VS Code's account menu are authenticated *into
// VS Code* — their tokens live in the OS keychain / SecretStorage, not in a
// swappable credential file like Claude's .credentials.json or Codex's
// auth.json. So unlike the file-swap AccountBackend system, GitHub cannot be
// snapshotted/restored. The only thing an extension can do is express which
// signed-in account *its own* sessions use, via getSession({ account }).
//
// "Swapping" a GitHub account here therefore means: pick which signed-in
// GitHub account Anime Companion (Copilot) uses. The preference is stored
// GLOBALLY so the choice applies across every workspace, matching how the
// Claude/Codex profiles are global. It does NOT change git's commit identity
// or what other extensions use — VS Code has no global "active account".

const PROVIDER_ID = 'github';
const SCOPES = ['read:user'];

// Global key. The legacy key below was per-workspace (workspaceState); we
// migrate it once so users who already picked a Copilot account keep it.
const PREF_KEY = 'agentProfiles.githubAccountPreference';
const LEGACY_WORKSPACE_KEY = 'chat.copilotAccountPreference';

export interface GitHubAccountPreference {
  id?: string;
  label?: string;
}

export interface GitHubAccountView {
  id: string;
  label: string;
  active: boolean;
}

export class GitHubAccountService {
  private readonly _emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this._emitter.event;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {
    // Repaint our surfaces when GitHub sessions change anywhere in VS Code
    // (the user signs in/out from the native account menu, for example).
    this._disposables.push(
      vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === PROVIDER_ID) this._emitter.fire();
      })
    );
    void this._migrateLegacyPreference();
  }

  dispose(): void {
    this._emitter.dispose();
    while (this._disposables.length) {
      try { this._disposables.pop()?.dispose(); } catch { /* ignore */ }
    }
  }

  // Best-effort: lift a per-workspace Copilot account preference up to global
  // so the existing choice survives the move to a global swap.
  private async _migrateLegacyPreference(): Promise<void> {
    const existing = this._context.globalState.get<GitHubAccountPreference>(PREF_KEY);
    if (existing && existing.id) return;
    const legacy = this._context.workspaceState.get<GitHubAccountPreference>(LEGACY_WORKSPACE_KEY);
    if (legacy && legacy.id) {
      await this._context.globalState.update(PREF_KEY, legacy);
      log(`GitHubAccountService: migrated per-workspace account preference to global (${legacy.label ?? legacy.id}).`);
    }
  }

  // ───────────────────────── preference (global) ─────────────────────────
  getPreference(): GitHubAccountPreference {
    return this._context.globalState.get<GitHubAccountPreference>(PREF_KEY, {});
  }

  isUsingDefault(): boolean {
    return !this.getPreference().id;
  }

  private async _setPreference(value: GitHubAccountPreference | undefined): Promise<void> {
    await this._context.globalState.update(PREF_KEY, value);
    this._emitter.fire();
  }

  // ───────────────────────── accounts ─────────────────────────
  async listAccounts(): Promise<readonly vscode.AuthenticationSessionAccountInformation[]> {
    try {
      return await vscode.authentication.getAccounts(PROVIDER_ID);
    } catch {
      return [];
    }
  }

  async getViews(): Promise<GitHubAccountView[]> {
    const accounts = await this.listAccounts();
    const pref = this.getPreference();
    return accounts.map((a) => ({
      id: a.id,
      label: a.label,
      active: !!pref.id && a.id === pref.id,
    }));
  }

  // ───────────────────────── switch actions ─────────────────────────

  // Make Anime Companion (Copilot) use this signed-in GitHub account. Stores
  // the choice globally and warms a session so the next Copilot call uses it.
  async useAccount(account: vscode.AuthenticationSessionAccountInformation): Promise<void> {
    await this._setPreference({ id: account.id, label: account.label });
    try {
      await vscode.authentication.getSession(PROVIDER_ID, SCOPES, {
        account,
        createIfNone: { detail: `Anime Companion will use ${account.label} for GitHub Copilot.` },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(`Saved the account choice, but GitHub auth permission failed: ${msg}`);
    }
    log(`GitHubAccountService: switched to ${account.label} (${account.id}).`);
  }

  async useAccountById(id: string): Promise<void> {
    const account = (await this.listAccounts()).find((a) => a.id === id);
    if (!account) throw new Error('That GitHub account is no longer signed in to VS Code.');
    await this.useAccount(account);
  }

  // Drop the extension-specific choice and fall back to VS Code's default.
  async useDefault(): Promise<void> {
    await this._setPreference(undefined);
    try {
      await vscode.authentication.getSession(PROVIDER_ID, SCOPES, { clearSessionPreference: true });
    } catch {
      // Clearing our stored preference is the part that matters.
    }
    log('GitHubAccountService: cleared account preference (using VS Code default).');
  }

  // Kick off VS Code's GitHub sign-in so a new account joins the menu.
  async addAccount(): Promise<vscode.AuthenticationSessionAccountInformation | undefined> {
    try {
      const session = await vscode.authentication.getSession(PROVIDER_ID, SCOPES, {
        createIfNone: { detail: 'Sign in to GitHub to add an account Anime Companion can use.' },
      });
      this._emitter.fire();
      return session?.account;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(`Couldn't sign in to GitHub: ${msg}`);
      return undefined;
    }
  }

  // Re-apply the stored preference so the extension's Copilot session targets
  // the chosen account. Self-heals if that account is no longer signed in.
  async ensureAccess(): Promise<void> {
    const pref = this.getPreference();
    if (!pref.id) return;
    const account = (await this.listAccounts()).find((a) => a.id === pref.id);
    if (!account) {
      await this._setPreference(undefined);
      return;
    }
    await vscode.authentication.getSession(PROVIDER_ID, SCOPES, {
      account,
      createIfNone: { detail: `Anime Companion will use ${account.label} for GitHub Copilot.` },
    });
  }

  // ───────────────────────── interactive picker ─────────────────────────
  // Shared by the command palette and the in-chat "pick account" button.
  async pickAccountInteractive(): Promise<void> {
    let accounts = await this.listAccounts();
    if (accounts.length === 0) {
      const added = await this.addAccount();
      if (!added) return;
      accounts = await this.listAccounts();
      if (accounts.length === 0) {
        vscode.window.showWarningMessage('No GitHub accounts are signed in inside VS Code yet.');
        return;
      }
    }

    const pref = this.getPreference();
    type Pick = vscode.QuickPickItem & {
      account?: vscode.AuthenticationSessionAccountInformation;
      reset?: boolean;
      add?: boolean;
    };
    const picks: Pick[] = [
      {
        label: 'Use VS Code default account',
        description: !pref.id ? 'Current' : undefined,
        detail: 'Clear the Anime Companion-specific GitHub account.',
        reset: true,
      },
      ...accounts.map<Pick>((account) => ({
        label: account.label,
        description: account.id === pref.id ? 'Current' : undefined,
        detail: account.id,
        account,
      })),
      { label: '$(add) Add another GitHub account…', add: true },
    ];

    const pick = await vscode.window.showQuickPick(picks, {
      title: 'Anime Companion: Switch GitHub Account (global)',
      placeHolder: 'Which GitHub account should this extension use for Copilot?',
      ignoreFocusOut: true,
    });
    if (!pick) return;

    if (pick.reset) {
      await this.useDefault();
      vscode.window.showInformationMessage('Anime Companion will use the VS Code default GitHub account for Copilot.');
      return;
    }
    if (pick.add) {
      const account = await this.addAccount();
      if (account) await this.useAccount(account);
      return;
    }
    if (pick.account) {
      await this.useAccount(pick.account);
    }
  }
}
