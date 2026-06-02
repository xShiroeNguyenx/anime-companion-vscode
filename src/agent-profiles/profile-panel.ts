import * as vscode from 'vscode';
import { log } from '../log';
import { AgentProfileManager } from './profile-manager';

interface ProfileViewRow {
  id: string;
  name: string;
  tool: string;
  toolDisplayName: string;
  toolIcon: string;
  fileCount: number;
  capturedAt?: number;
  identityText: string;
  active: boolean;
}

export class AgentProfilePanel {
  private static _current: AgentProfilePanel | undefined;

  static reveal(manager: AgentProfileManager): void {
    if (AgentProfilePanel._current) {
      AgentProfilePanel._current._panel.reveal(vscode.ViewColumn.Active);
      AgentProfilePanel._current._broadcast();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'animeCompanion.agentProfiles',
      'Agent Accounts',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    AgentProfilePanel._current = new AgentProfilePanel(panel, manager);
  }

  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _manager: AgentProfileManager,
  ) {
    this._panel.webview.html = this._renderHtml();
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables
    );
    this._disposables.push(this._manager.onDidChange(() => this._broadcast()));
  }

  private _dispose(): void {
    AgentProfilePanel._current = undefined;
    while (this._disposables.length) {
      const d = this._disposables.pop();
      try { d?.dispose(); } catch { /* ignore */ }
    }
  }

  private _broadcast(): void {
    void this._broadcastAsync();
  }

  private async _broadcastAsync(): Promise<void> {
    const views = await this._manager.getViews();
    const rows: ProfileViewRow[] = views.map((v) => ({
      id: v.id,
      name: v.name,
      tool: v.tool,
      toolDisplayName: v.toolDisplayName,
      toolIcon: v.toolIcon,
      fileCount: v.fileCount,
      capturedAt: v.capturedAt,
      identityText: v.identity?.text ?? '(no credential info)',
      active: v.active,
    }));
    const github = await this._manager.getGitHubState();
    this._panel.webview.postMessage({ command: 'profile:state', profiles: rows, github });
  }

  private async _handleMessage(msg: any): Promise<void> {
    try {
      switch (msg?.command) {
        case 'profile:ready':
          this._broadcast();
          return;
        case 'profile:save':
          await this._handleSave();
          return;
        case 'profile:use':
          if (typeof msg.id === 'string') {
            const p = await this._manager.useProfile(msg.id);
            vscode.window.showInformationMessage(
              `Agent profile switched to "${p.name}". Restart any running CLI sessions to pick up the new credentials.`
            );
          }
          return;
        case 'profile:rename':
          if (typeof msg.id === 'string') {
            const current = this._manager.list().find((p) => p.id === msg.id);
            const newName = await vscode.window.showInputBox({
              prompt: 'New profile name',
              value: current?.name ?? '',
              validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
            });
            if (newName) await this._manager.renameProfile(msg.id, newName);
          }
          return;
        case 'profile:delete':
          if (typeof msg.id === 'string') {
            const current = this._manager.list().find((p) => p.id === msg.id);
            if (!current) return;
            const choice = await vscode.window.showWarningMessage(
              `Delete profile "${current.name}"? Snapshot will be removed. The CLI's home directory is NOT touched.`,
              { modal: true },
              'Delete'
            );
            if (choice === 'Delete') await this._manager.deleteProfile(msg.id);
          }
          return;
        case 'github:use':
          if (typeof msg.id === 'string') {
            await this._manager.useGitHubAccount(msg.id);
            vscode.window.showInformationMessage('Switched the GitHub account this extension uses for Copilot.');
          }
          return;
        case 'github:default':
          await this._manager.useGitHubDefault();
          vscode.window.showInformationMessage('Anime Companion will use the VS Code default GitHub account for Copilot.');
          return;
        case 'github:add':
          await this._manager.addGitHubAccount();
          return;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`AgentProfilePanel error: ${detail}`);
      vscode.window.showErrorMessage(`Agent profile action failed: ${detail}`);
    }
  }

  private async _handleSave(): Promise<void> {
    const ok = await this._manager.warnIfNoLoggedInTool();
    if (!ok) return;
    const name = await vscode.window.showInputBox({
      prompt: 'Name for this agent profile (e.g. tk1, work, personal)',
      validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
    });
    if (!name) return;
    try {
      const p = await this._manager.saveProfile(name);
      vscode.window.showInformationMessage(`Saved agent profile "${p.name}".`);
    } catch (err) {
      vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  private _renderHtml(): string {
    const cspSource = this._panel.webview.cspSource;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>Agent Accounts</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 16px; }
  .active-card { padding: 10px 12px; border-radius: 6px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); margin-bottom: 16px; }
  .section-header { display: flex; align-items: center; gap: 6px; padding: 12px 4px 6px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
  .section-header .count { font-weight: normal; opacity: 0.7; font-size: 11px; }
  .row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
  .row.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
  .row .meta { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .name { font-size: 14px; font-weight: 600; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  button { font: inherit; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:hover { filter: brightness(1.1); }
  .footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border); }
  .empty { padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); border: 1px dashed var(--vscode-panel-border); border-radius: 6px; }
  .gh-note { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 2px 4px 10px; line-height: 1.4; }
  .gh-empty { font-size: 12px; color: var(--vscode-descriptionForeground); padding: 8px 4px; }
</style>
</head>
<body>
<h1>🪪 Agent Accounts</h1>
<div class="sub">Save and switch between multiple agent CLI accounts (Claude, Codex) — each profile snapshots that tool's credential files locally — plus the GitHub account this extension uses for Copilot.</div>
<div id="active" class="active-card"></div>
<div id="sections"></div>
<div id="github-wrap"></div>
<div class="footer">
  <button id="save-btn" class="primary">+ Save current as new profile</button>
</div>
<script>
const vscode = acquireVsCodeApi();
const sectionsEl = document.getElementById('sections');
const activeEl = document.getElementById('active');
const githubEl = document.getElementById('github-wrap');
document.getElementById('save-btn').addEventListener('click', () => vscode.postMessage({ command: 'profile:save' }));

function fmtDate(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function rowHtml(p) {
  return '<div class="row ' + (p.active ? 'active' : '') + '">' +
    '<div>' +
      '<div class="name">' + (p.active ? '✓ ' : '') + escapeHtml(p.name) + '</div>' +
      '<div class="meta">' + escapeHtml(p.identityText) + '</div>' +
      '<div class="meta">' + p.fileCount + ' file(s) • captured ' + fmtDate(p.capturedAt) + '</div>' +
    '</div>' +
    '<div class="actions">' +
      (p.active ? '' : '<button class="primary" data-act="use" data-id="' + p.id + '">Use</button>') +
      '<button data-act="rename" data-id="' + p.id + '">Rename</button>' +
      '<button data-act="delete" data-id="' + p.id + '">Delete</button>' +
    '</div>' +
  '</div>';
}

function render(profiles) {
  const actives = profiles.filter((p) => p.active);
  if (actives.length) {
    activeEl.innerHTML = '<strong>Active:</strong>' + actives.map((a) =>
      '<div style="margin-top:4px;">' + escapeHtml(a.toolIcon) + ' ' + escapeHtml(a.name) +
      ' <span class="meta">(' + escapeHtml(a.toolDisplayName) + ')</span>' +
      '<div class="meta">' + escapeHtml(a.identityText) + '</div></div>'
    ).join('');
  } else {
    activeEl.innerHTML = '<em>No matching profile for the credentials currently live on this machine.</em>';
  }

  if (!profiles.length) {
    sectionsEl.innerHTML = '<div class="empty">No profiles yet. Save your current CLI session below.</div>';
    return;
  }

  // Group by tool, preserve insertion order of first occurrence.
  const groups = new Map();
  for (const p of profiles) {
    if (!groups.has(p.tool)) groups.set(p.tool, { tool: p.tool, icon: p.toolIcon, name: p.toolDisplayName, items: [] });
    groups.get(p.tool).items.push(p);
  }

  sectionsEl.innerHTML = Array.from(groups.values()).map((g) => {
    return '<div class="section-header">' + escapeHtml(g.icon) + ' ' + escapeHtml(g.name) +
      ' <span class="count">(' + g.items.length + ')</span></div>' +
      g.items.map(rowHtml).join('');
  }).join('');
}

function renderGitHub(github) {
  const g = github || { available: false, usingDefault: true, accounts: [] };
  const note = 'Global · only changes which GitHub account this extension (Copilot) uses. It does NOT change git commit identity or other extensions.';
  const defaultRow =
    '<div class="row ' + (g.usingDefault ? 'active' : '') + '">' +
      '<div><div class="name">' + (g.usingDefault ? '✓ ' : '') + 'VS Code default account</div>' +
      '<div class="meta">No extension-specific account</div></div>' +
      '<div class="actions">' +
        (g.usingDefault ? '' : '<button class="primary" data-gh="default">Use default</button>') +
      '</div>' +
    '</div>';
  const accountRows = (g.accounts || []).map((a) =>
    '<div class="row ' + (a.active ? 'active' : '') + '">' +
      '<div><div class="name">' + (a.active ? '✓ ' : '🐙 ') + escapeHtml(a.label) + '</div>' +
      '<div class="meta">' + escapeHtml(a.id) + '</div></div>' +
      '<div class="actions">' +
        (a.active ? '' : '<button class="primary" data-gh="use" data-id="' + escapeHtml(a.id) + '">Use</button>') +
      '</div>' +
    '</div>'
  ).join('');
  const body = g.available
    ? accountRows
    : '<div class="gh-empty">No GitHub accounts are signed in to VS Code yet.</div>';
  githubEl.innerHTML =
    '<div class="section-header">🐙 GitHub <span class="count">(extension / Copilot)</span></div>' +
    '<div class="gh-note">' + note + '</div>' +
    defaultRow +
    body +
    '<div style="margin-top:8px;">' +
      '<button data-gh="add">+ Add another GitHub account…</button>' +
    '</div>';
}

sectionsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (!id || !act) return;
  if (act === 'use') vscode.postMessage({ command: 'profile:use', id });
  else if (act === 'rename') vscode.postMessage({ command: 'profile:rename', id });
  else if (act === 'delete') vscode.postMessage({ command: 'profile:delete', id });
});

githubEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const gh = btn.getAttribute('data-gh');
  if (gh === 'use') vscode.postMessage({ command: 'github:use', id: btn.getAttribute('data-id') });
  else if (gh === 'default') vscode.postMessage({ command: 'github:default' });
  else if (gh === 'add') vscode.postMessage({ command: 'github:add' });
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.command === 'profile:state') {
    render(msg.profiles || []);
    renderGitHub(msg.github);
  }
});

vscode.postMessage({ command: 'profile:ready' });
</script>
</body>
</html>`;
  }
}
