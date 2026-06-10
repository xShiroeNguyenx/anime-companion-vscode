import * as vscode from 'vscode';
import { getMessageBank } from '../messages';

function isMarkdown(doc: vscode.TextDocument | undefined): boolean {
  if (!doc) return false;
  return doc.languageId === 'markdown' || doc.uri.path.toLowerCase().endsWith('.md');
}

/**
 * A status-bar item that gently pulses (alternating flower glyphs) whenever the
 * active editor is a Markdown file, inviting the user to open the WYSIWYG
 * editor. It hides — and stops its timer — for non-Markdown editors so it never
 * burns cycles in the background.
 */
export class MarkdownStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;
  private readonly _disposables: vscode.Disposable[] = [];
  private _timer: NodeJS.Timeout | undefined;
  private _phase = false;

  constructor() {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this._item.command = 'animeCompanion.openMarkdownEditor';
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
    );
    this.refresh();
  }

  refresh(): void {
    if (isMarkdown(vscode.window.activeTextEditor?.document)) {
      this._start();
    } else {
      this._stop();
    }
  }

  private _label(): string {
    return getMessageBank().getWebviewStrings().markdownEditor?.statusBar || 'Markdown';
  }

  private _start(): void {
    const label = this._label();
    this._item.tooltip = getMessageBank().getWebviewStrings().markdownEditor?.statusBarTooltip
      || 'Open this Markdown file in the Anime editor';
    this._item.show();
    if (this._timer) return;
    this._timer = setInterval(() => {
      this._phase = !this._phase;
      this._item.text = `${this._phase ? '🌸' : '💮'} ${label}`;
    }, 800);
    // Render the first frame immediately so it appears without a delay.
    this._item.text = `🌸 ${label}`;
  }

  private _stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    this._item.hide();
  }

  dispose(): void {
    this._stop();
    this._item.dispose();
    while (this._disposables.length) {
      try { this._disposables.pop()?.dispose(); } catch { /* ignore */ }
    }
  }
}
