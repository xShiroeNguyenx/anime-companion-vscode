import * as vscode from 'vscode';
import { log } from '../log';
import { getMessageBank } from '../messages';

// Remembered across all markdown editor windows so the dark/light choice sticks.
const THEME_KEY = 'animeCompanion.markdownEditor.theme';
// Optional custom accent (brand) colour (#rrggbb) that recolours the editor
// chrome. Empty string = use the default sakura pink.
const ACCENT_KEY = 'animeCompanion.markdownEditor.accentColor';

function nonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/**
 * A WYSIWYG Markdown editor in its own full-size webview tab (Toast UI Editor).
 * One panel per file URI — opening the same file again just reveals the existing
 * window. Edits are written straight back to the .md file, but ONLY after the
 * user actually changes something, so merely previewing a file never reformats
 * it (the WYSIWYG round-trip normalizes Markdown on save).
 */
export class MarkdownEditorPanel {
  private static readonly _panels = new Map<string, MarkdownEditorPanel>();

  static reveal(context: vscode.ExtensionContext, uri: vscode.Uri): void {
    const key = uri.toString();
    const existing = MarkdownEditorPanel._panels.get(key);
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'animeCompanion.markdownEditor',
      MarkdownEditorPanel._titleFor(uri),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'flower.svg');
    MarkdownEditorPanel._panels.set(key, new MarkdownEditorPanel(panel, context, uri));
  }

  private static _titleFor(uri: vscode.Uri): string {
    const parts = uri.path.split('/');
    return `🌸 ${parts[parts.length - 1] || 'Markdown'}`;
  }

  private readonly _disposables: vscode.Disposable[] = [];
  // True once the user has typed in the webview. We never write the file while
  // this is false, so opening a doc purely to read it leaves it byte-for-byte.
  private _webviewDirty = false;

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext,
    private readonly _uri: vscode.Uri,
  ) {
    this._panel.webview.html = this._renderHtml();
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((m) => this._handleMessage(m), null, this._disposables);

    // Re-localize the panel chrome live when the user switches language.
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('animeCompanion.messageLanguage')) this._sendContent();
      }),
    );

    // If the same file is edited elsewhere (the normal text editor, git, etc.)
    // and the webview has no pending edits, pull the new content in so the two
    // views never silently diverge.
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== this._uri.toString()) return;
        if (this._webviewDirty) return;
        this._panel.webview.postMessage({
          command: 'md:externalChange',
          content: e.document.getText(),
        });
      }),
    );
  }

  private _dispose(): void {
    MarkdownEditorPanel._panels.delete(this._uri.toString());
    while (this._disposables.length) {
      try { this._disposables.pop()?.dispose(); } catch { /* ignore */ }
    }
  }

  private _strings(): Record<string, string> {
    return getMessageBank().getWebviewStrings().markdownEditor ?? {};
  }

  private async _readContent(): Promise<string> {
    try {
      const doc = await vscode.workspace.openTextDocument(this._uri);
      return doc.getText();
    } catch (err) {
      log(`MarkdownEditorPanel: read failed: ${err instanceof Error ? err.message : String(err)}`);
      return '';
    }
  }

  private async _sendContent(): Promise<void> {
    const content = await this._readContent();
    this._panel.webview.postMessage({
      command: 'md:setContent',
      content,
      fileName: MarkdownEditorPanel._titleFor(this._uri).replace(/^🌸 /, ''),
      strings: this._strings(),
      theme: this._context.globalState.get<string>(THEME_KEY, 'dark'),
      accentColor: this._context.globalState.get<string>(ACCENT_KEY, ''),
    });
  }

  private async _handleMessage(msg: any): Promise<void> {
    try {
      switch (msg?.command) {
        case 'md:ready':
          await this._sendContent();
          return;
        case 'md:dirty':
          this._webviewDirty = true;
          return;
        case 'md:save':
          await this._save(String(msg.markdown ?? ''));
          return;
        case 'md:setTheme':
          await this._context.globalState.update(
            THEME_KEY,
            msg.theme === 'light' ? 'light' : 'dark',
          );
          return;
        case 'md:setAccent': {
          // Store only a valid hex colour; anything else (incl. the reset
          // signal) clears the override so the default accent takes over again.
          const color = typeof msg.color === 'string' ? msg.color.trim() : '';
          await this._context.globalState.update(
            ACCENT_KEY,
            /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : '',
          );
          return;
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`MarkdownEditorPanel error: ${detail}`);
      vscode.window.showErrorMessage(`Markdown editor: ${detail}`);
    }
  }

  // Write the new markdown back through the TextDocument so a normal editor tab
  // for the same file stays in sync and VS Code never reports an on-disk
  // conflict. Only runs when the user genuinely edited the document.
  private async _save(markdown: string): Promise<void> {
    if (!this._webviewDirty) return;
    const doc = await vscode.workspace.openTextDocument(this._uri);
    if (doc.getText() === markdown) {
      this._webviewDirty = false;
      this._panel.webview.postMessage({ command: 'md:saved' });
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length),
    );
    edit.replace(this._uri, fullRange, markdown);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showErrorMessage(this._strings().saveFailed || 'Could not apply markdown changes.');
      return;
    }
    await doc.save();
    this._webviewDirty = false;
    this._panel.webview.postMessage({ command: 'md:saved' });
  }

  private _renderHtml(): string {
    const webview = this._panel.webview;
    const n = nonce();
    const bust = `${Date.now()}`;
    const media = (p: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', ...p))
        .with({ query: `v=${bust}` });

    const toastCss = media(['vendor', 'toastui', 'toastui-editor.min.css']);
    const toastDarkCss = media(['vendor', 'toastui', 'toastui-editor-dark.min.css']);
    // Use the fully self-contained "-all" bundle: the plain build externalizes
    // ProseMirror (require("prosemirror-*")), which resolves to undefined in a
    // webview and crashes the editor on init.
    const toastJs = media(['vendor', 'toastui', 'toastui-editor-all.min.js']);
    const appCss = media(['webview', 'markdown-editor.css']);
    const appJs = media(['webview', 'markdown-editor.js']);
    const strings = this._strings();

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: https:`,
      `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src ${webview.cspSource} data: https://fonts.gstatic.com`,
      `script-src 'nonce-${n}'`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link rel="stylesheet" href="${toastCss}" />
<link rel="stylesheet" href="${toastDarkCss}" />
<link rel="stylesheet" href="${appCss}" />
<title>${strings.title || 'Markdown Editor'}</title>
</head>
<body>
<header id="md-header">
  <div class="md-brand">
    <span class="md-flower">🌸</span>
    <span class="md-title">${strings.title || 'Markdown Editor'}</span>
  </div>
  <span id="status" class="status"></span>
  <input id="accentColor" class="accent-color" type="color" value="#ff9ec7"
    title="${strings.accentColor || 'Theme color'}"
    aria-label="${strings.accentColor || 'Theme color'}" />
  <button id="accentResetBtn" class="theme-btn" title="${strings.accentReset || 'Reset theme color'}">↺</button>
  <button id="themeBtn" class="theme-btn" title="${strings.darkMode || 'Toggle theme'}">🌙</button>
  <button id="saveBtn" class="save-btn" disabled>
    <span class="save-ico">✿</span><span class="save-label">${strings.save || 'Save'}</span>
  </button>
</header>
<div id="editor"></div>
<script nonce="${n}">
  window.__MD_STRINGS__ = ${JSON.stringify(strings)};
</script>
<script nonce="${n}" src="${toastJs}"></script>
<script nonce="${n}" src="${appJs}"></script>
</body>
</html>`;
  }
}
