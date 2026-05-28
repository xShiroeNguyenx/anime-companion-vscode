import * as vscode from 'vscode';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { log } from '../log';
import { AgentProfileStore } from './profile-store';
import {
  AGENT_PROFILE_DIR,
  AgentProfile,
  DEFAULT_TOOL_ID,
  MAX_BACKUPS,
} from './types';
import {
  backupDir,
  dirExists,
  fileExists,
  pruneOldBackups,
  removeSnapshotDir,
  restoreDir,
  snapshotDir,
} from './credential-fs';
import { AccountBackend, AccountIdentity, getBackend, listBackends } from './backends/account-backend';

export interface ProfileView {
  id: string;
  name: string;
  tool: string;
  toolDisplayName: string;
  toolIcon: string;
  fileCount: number;
  capturedAt?: number;
  identity?: AccountIdentity;
  active: boolean;
}

export class AgentProfileManager {
  private readonly _emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this._emitter.event;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _store: AgentProfileStore,
  ) {}

  dispose(): void {
    this._emitter.dispose();
  }

  list(): AgentProfile[] {
    return this._store.list();
  }

  // ───────────────────────── paths ─────────────────────────
  private _profileRoot(): string {
    return path.join(this._context.globalStorageUri.fsPath, AGENT_PROFILE_DIR);
  }

  private _profileDir(id: string): string {
    return path.join(this._profileRoot(), id);
  }

  private _snapshotDir(id: string): string {
    return path.join(this._profileDir(id), 'snapshot');
  }

  private _backendFor(profile: AgentProfile): AccountBackend | undefined {
    return getBackend(profile.tool);
  }

  async readSnapshotIdentity(profile: AgentProfile): Promise<AccountIdentity | undefined> {
    const backend = this._backendFor(profile);
    if (!backend) return undefined;
    return backend.readIdentity(this._snapshotDir(profile.id));
  }

  // Each tool has its own live credential, so each tool has its own active
  // profile. Returns a map of toolId → matching profileId. When several
  // profiles of one tool share a signature (duplicate saves), prefer the one
  // the extension last activated; otherwise the first match.
  async detectActiveIds(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const stored = this._store.getActiveId();
    for (const backend of listBackends()) {
      const liveId = await backend.readIdentity(backend.homeDir());
      if (!liveId) continue;
      const matches: string[] = [];
      for (const p of this._store.list()) {
        if (p.tool !== backend.id) continue;
        const snapId = await backend.readIdentity(this._snapshotDir(p.id));
        if (snapId && snapId.signature === liveId.signature) matches.push(p.id);
      }
      if (matches.length === 0) continue;
      result.set(backend.id, stored && matches.includes(stored) ? stored : matches[0]);
    }
    return result;
  }

  async getViews(): Promise<ProfileView[]> {
    const activeIds = await this.detectActiveIds();
    const rows: ProfileView[] = [];
    for (const p of this._store.list()) {
      const backend = this._backendFor(p);
      rows.push({
        id: p.id,
        name: p.name,
        tool: p.tool,
        toolDisplayName: backend?.displayName ?? p.tool,
        toolIcon: backend?.icon ?? '🪪',
        fileCount: p.claudeSnapshot?.files.length ?? 0,
        capturedAt: p.claudeSnapshot?.capturedAt,
        identity: backend ? await backend.readIdentity(this._snapshotDir(p.id)) : undefined,
        active: activeIds.get(p.tool) === p.id,
      });
    }
    return rows;
  }

  // ───────────────────────── save / create ─────────────────────────

  // Returns backends whose homeDir has a usable sentinel right now.
  async detectAvailableBackends(): Promise<AccountBackend[]> {
    const out: AccountBackend[] = [];
    for (const b of listBackends()) {
      if (await fileExists(path.join(b.homeDir(), b.sentinelFile))) {
        out.push(b);
      }
    }
    return out;
  }

  async pickBackendForSave(): Promise<AccountBackend | undefined> {
    const available = await this.detectAvailableBackends();
    if (available.length === 1) return available[0];
    if (available.length === 0) {
      // Fall back to any registered backend so the user gets a clear error
      // message about missing credentials, rather than silent nothing.
      const fallback = getBackend(DEFAULT_TOOL_ID) ?? listBackends()[0];
      return fallback;
    }
    const picked = await vscode.window.showQuickPick(
      available.map((b) => ({ label: `${b.icon} ${b.displayName}`, id: b.id })),
      { title: 'Save Agent Profile — pick a tool', placeHolder: 'Multiple CLI tools detected' }
    );
    if (!picked) return undefined;
    return available.find((b) => b.id === picked.id);
  }

  async saveProfile(name: string, opts?: { toolId?: string }): Promise<AgentProfile> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Profile name cannot be empty');
    if (this._store.nameExists(trimmed)) {
      throw new Error(`A profile named "${trimmed}" already exists`);
    }

    const backend = opts?.toolId ? getBackend(opts.toolId) : await this.pickBackendForSave();
    if (!backend) throw new Error('No agent CLI backend available to save');

    if (!(await dirExists(backend.homeDir()))) {
      throw new Error(`${backend.displayName} CLI home directory not found at ${backend.homeDir()}. Log in first.`);
    }

    const id = randomUUID();
    const snapDir = this._snapshotDir(id);
    const snap = await snapshotDir(backend.homeDir(), snapDir, backend.fileWhitelist);

    if (snap.files.length === 0) {
      await removeSnapshotDir(this._profileDir(id));
      throw new Error(`No ${backend.displayName} credential files found in ${backend.homeDir()}.`);
    }

    const now = Date.now();
    const profile: AgentProfile = {
      id,
      name: trimmed,
      tool: backend.id,
      claudeSnapshot: {
        dir: path.relative(this._context.globalStorageUri.fsPath, snapDir),
        files: snap.files,
        capturedAt: snap.capturedAt,
      },
      createdAt: now,
      updatedAt: now,
    };
    await this._store.upsert(profile);
    if (!this._store.getActiveId()) {
      await this._store.setActive(id);
    }
    log(`AgentProfile saved: ${trimmed} (tool=${backend.id}, ${snap.files.length} files)`);
    this._emitter.fire();
    return profile;
  }

  // ───────────────────────── use / switch ─────────────────────────
  async useProfile(id: string): Promise<AgentProfile> {
    const profile = this._store.get(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);
    const backend = this._backendFor(profile);
    if (!backend) throw new Error(`No backend registered for tool "${profile.tool}"`);

    const snapDir = this._snapshotDir(id);
    try {
      await backupDir(backend.homeDir(), this._profileRoot(), backend.fileWhitelist, backend.id);
      await pruneOldBackups(this._profileRoot(), backend.id, MAX_BACKUPS);
    } catch (err) {
      log(`AgentProfile backup warning: ${err instanceof Error ? err.message : String(err)}`);
    }

    const written = await restoreDir(snapDir, backend.homeDir(), backend.fileWhitelist);
    await this._store.setActive(id);
    log(`AgentProfile activated: ${profile.name} (tool=${backend.id}, restored ${written.length} files)`);
    this._emitter.fire();
    return profile;
  }

  // ───────────────────────── rename / delete ─────────────────────────
  async renameProfile(id: string, newName: string): Promise<void> {
    const profile = this._store.get(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Profile name cannot be empty');
    if (this._store.nameExists(trimmed, id)) {
      throw new Error(`A profile named "${trimmed}" already exists`);
    }
    profile.name = trimmed;
    profile.updatedAt = Date.now();
    await this._store.upsert(profile);
    this._emitter.fire();
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = this._store.get(id);
    if (!profile) return;
    try {
      await removeSnapshotDir(this._profileDir(id));
    } catch (err) {
      log(`AgentProfile snapshot cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this._store.remove(id);
    log(`AgentProfile deleted: ${profile.name} (${id})`);
    this._emitter.fire();
  }

  // ───────────────────────── interactive helpers ─────────────────────────
  async quickPickAndUse(): Promise<AgentProfile | undefined> {
    const views = await this.getViews();
    if (views.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        'No agent profiles saved yet. Save the current CLI session as a profile?',
        'Save current'
      );
      if (choice === 'Save current') {
        await vscode.commands.executeCommand('animeCompanion.agentProfile.save');
      }
      return undefined;
    }
    const activeIds = new Set(views.filter((v) => v.active).map((v) => v.id));
    const items = views.map<vscode.QuickPickItem & { id: string }>((v) => ({
      id: v.id,
      label: `${v.active ? '$(check) ' : `${v.toolIcon} `}${v.name}`,
      description: `${v.toolDisplayName}${v.identity ? ' · ' + v.identity.text : ''}`,
      detail: v.capturedAt
        ? `${v.fileCount} file(s) • captured ${new Date(v.capturedAt).toLocaleString()}`
        : 'No snapshot',
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Agent Profile — Switch',
      placeHolder: 'Select a profile to activate',
    });
    if (!picked) return undefined;
    if (activeIds.has(picked.id)) return this._store.get(picked.id);
    const profile = await this.useProfile(picked.id);
    const backend = this._backendFor(profile);
    vscode.window.showInformationMessage(
      `Agent profile switched to "${profile.name}" (${backend?.displayName ?? profile.tool}). Restart any running CLI sessions to pick up the new credentials.`
    );
    return profile;
  }

  async warnIfNoLoggedInTool(): Promise<boolean> {
    const available = await this.detectAvailableBackends();
    if (available.length > 0) return true;
    const known = listBackends().map((b) => b.displayName).join(', ');
    const choice = await vscode.window.showWarningMessage(
      `No logged-in CLI detected (checked: ${known || 'none registered'}). Save anyway?`,
      { modal: true },
      'Save anyway'
    );
    return choice === 'Save anyway';
  }
}
