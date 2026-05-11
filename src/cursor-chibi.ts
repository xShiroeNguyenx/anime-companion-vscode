import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './log';

type SizeKey = 'small' | 'medium' | 'large';

const SIZE_MAP: Record<SizeKey, number> = {
  small: 12,
  medium: 16,
  large: 20,
};

const THROTTLE_MS = 50;

// Renders a small chibi sprite at the active editor's cursor position via a
// TextEditorDecoration. The decoration is absolutely positioned over the text
// (width/height = 0 in the decoration field, real size injected via the
// textDecoration CSS hatch) so it floats on top of code without shifting it.
//
// The animation itself comes from the GIF/APNG renderer — VS Code paints
// `before.contentIconPath` through a DOM <img>, which animates natively.
export class CursorChibiManager {
  private _extensionUri: vscode.Uri;
  private _capturedChibiDir: string;
  private _decorationType?: vscode.TextEditorDecorationType;
  private _activeListeners: vscode.Disposable[] = [];
  private _configListener: vscode.Disposable;
  private _throttle?: NodeJS.Timeout;
  private _lastEditor?: vscode.TextEditor;

  constructor(extensionUri: vscode.Uri, globalStorageUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._capturedChibiDir = path.join(globalStorageUri.fsPath, 'cursor-chibi');
    try { fs.mkdirSync(this._capturedChibiDir, { recursive: true }); } catch { /* ignore */ }

    // Always listen to config changes so toggling the setting (via command or
    // settings.json) re-applies without a window reload. We also watch the
    // selected model so a new capture or model swap updates the chibi icon.
    this._configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('animeCompanion.cursorChase') ||
        e.affectsConfiguration('animeCompanion.model')
      ) {
        this._reapply();
      }
    });
  }

  // Resolve the icon URI: prefer a captured PNG for the current model, fall
  // back to the bundled icon. Captures live in
  // globalStorage/cursor-chibi/{modelId}.png.
  private _resolveIconUri(): vscode.Uri {
    try {
      const modelId = vscode.workspace.getConfiguration('animeCompanion').get<string>('model', 'hiyori');
      const safe = modelId.replace(/[^A-Za-z0-9_\-]/g, '_');
      const candidate = path.join(this._capturedChibiDir, `${safe}.png`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return vscode.Uri.file(candidate);
      }
    } catch (err) {
      log(`CursorChibi: resolve captured icon failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png');
  }

  // Decode a `data:image/png;base64,...` payload from the webview and persist
  // it as the captured chibi for the given model. Triggers a reapply so the
  // new icon shows up immediately.
  public async saveCapturedChibi(modelId: string, dataUrl: string): Promise<void> {
    const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!m) {
      vscode.window.showWarningMessage('Captured chibi: unexpected dataUrl format.');
      return;
    }
    const safe = modelId.replace(/[^A-Za-z0-9_\-]/g, '_') || 'model';
    const filePath = path.join(this._capturedChibiDir, `${safe}.png`);
    try {
      fs.writeFileSync(filePath, Buffer.from(m[1], 'base64'));
      log(`CursorChibi: captured chibi saved -> ${filePath}`);
      this._reapply();
      vscode.window.showInformationMessage(`Captured chibi for "${modelId}" — cursor sprite updated.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`CursorChibi: save captured failed: ${msg}`);
      vscode.window.showErrorMessage(`Couldn't save captured chibi: ${msg}`);
    }
  }

  // Wipe the captured PNG for the current model — the next decoration will
  // fall back to the bundled icon.
  public async resetCapturedChibi(): Promise<void> {
    const modelId = vscode.workspace.getConfiguration('animeCompanion').get<string>('model', 'hiyori');
    const safe = modelId.replace(/[^A-Za-z0-9_\-]/g, '_') || 'model';
    const filePath = path.join(this._capturedChibiDir, `${safe}.png`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log(`CursorChibi: removed captured chibi -> ${filePath}`);
      }
      this._reapply();
      vscode.window.showInformationMessage(`Captured chibi for "${modelId}" cleared — using bundled icon.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Couldn't reset captured chibi: ${msg}`);
    }
  }

  public activate() {
    if (this._isEnabled()) {
      this._enable();
    }
  }

  public dispose() {
    this._disable();
    this._configListener.dispose();
  }

  // Bump the saved offset by (dx, dy). The config listener already wired up
  // for `animeCompanion.cursorChase` will re-render the decoration with the
  // new transform, so the chibi visibly shifts on the next tick.
  public async nudge(dx: number, dy: number): Promise<{ x: number; y: number }> {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const x = cfg.get<number>('cursorChase.offsetX', 0) + dx;
    const y = cfg.get<number>('cursorChase.offsetY', 0) + dy;
    await cfg.update('cursorChase.offsetX', x, vscode.ConfigurationTarget.Global);
    await cfg.update('cursorChase.offsetY', y, vscode.ConfigurationTarget.Global);
    return { x, y };
  }

  public async resetOffset(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    await cfg.update('cursorChase.offsetX', 0, vscode.ConfigurationTarget.Global);
    await cfg.update('cursorChase.offsetY', 0, vscode.ConfigurationTarget.Global);
    await cfg.update('cursorChase.sizePx', 0, vscode.ConfigurationTarget.Global);
  }

  // Bump the chibi's pixel size. The first nudge promotes the preset value
  // into a numeric override so further tweaks stay live without forcing the
  // user to fiddle with the small/medium/large enum first.
  public async nudgeSize(delta: number): Promise<number> {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const current = cfg.get<number>('cursorChase.sizePx', 0) || this._getSizePx();
    const next = Math.max(1, Math.min(64, current + delta));
    await cfg.update('cursorChase.sizePx', next, vscode.ConfigurationTarget.Global);
    return next;
  }

  // Interactive tuner: opens a quick-pick that loops until the user picks
  // Done. Each arrow nudges the chibi 4px in that direction. The chibi
  // re-renders immediately because nudge() persists to settings and the
  // config listener calls _reapply().
  public async tunePosition(): Promise<void> {
    if (!this._isEnabled()) {
      const choice = await vscode.window.showWarningMessage(
        'Cursor Chibi is disabled. Enable it first?',
        'Enable',
        'Cancel'
      );
      if (choice !== 'Enable') return;
      await this.toggle();
    }

    const POS_STEP = 4;
    const SIZE_STEP = 2;
    while (true) {
      const cfg = vscode.workspace.getConfiguration('animeCompanion');
      const x = cfg.get<number>('cursorChase.offsetX', 0);
      const y = cfg.get<number>('cursorChase.offsetY', 0);
      const size = this._getSizePx();
      type Action = 'up' | 'down' | 'left' | 'right' | 'bigger' | 'smaller' | 'reset' | 'done';
      const choice = await vscode.window.showQuickPick<vscode.QuickPickItem & { action: Action }>(
        [
          { label: '$(arrow-up)    Up',      description: `y -= ${POS_STEP}`,  action: 'up' },
          { label: '$(arrow-down)  Down',    description: `y += ${POS_STEP}`,  action: 'down' },
          { label: '$(arrow-left)  Left',    description: `x -= ${POS_STEP}`,  action: 'left' },
          { label: '$(arrow-right) Right',   description: `x += ${POS_STEP}`,  action: 'right' },
          { label: '$(add)         Bigger',  description: `size += ${SIZE_STEP}px`, action: 'bigger' },
          { label: '$(dash)        Smaller', description: `size -= ${SIZE_STEP}px`, action: 'smaller' },
          { label: '$(refresh)     Reset all',                                       action: 'reset' },
          { label: '$(check)       Done',                                            action: 'done' },
        ],
        {
          placeHolder: `offset x=${x}, y=${y}  —  size=${size}px  —  pick an action, Done to finish`,
          ignoreFocusOut: true,
        }
      );
      if (!choice || choice.action === 'done') return;
      switch (choice.action) {
        case 'up':      await this.nudge(0, -POS_STEP);      break;
        case 'down':    await this.nudge(0,  POS_STEP);      break;
        case 'left':    await this.nudge(-POS_STEP, 0);      break;
        case 'right':   await this.nudge( POS_STEP, 0);      break;
        case 'bigger':  await this.nudgeSize( SIZE_STEP);    break;
        case 'smaller': await this.nudgeSize(-SIZE_STEP);    break;
        case 'reset':   await this.resetOffset();            break;
      }
    }
  }

  // Flip the enabled setting; the config listener will then drive enable/disable.
  public async toggle() {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const next = !cfg.get<boolean>('cursorChase.enabled', false);
    await cfg.update('cursorChase.enabled', next, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      next ? 'Cursor chibi enabled.' : 'Cursor chibi disabled.'
    );
  }

  private _isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('animeCompanion')
      .get<boolean>('cursorChase.enabled', false);
  }

  private _getSizePx(): number {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    // Numeric override wins. 0 (the default) means "fall back to the
    // small/medium/large preset" so existing users aren't affected.
    const override = cfg.get<number>('cursorChase.sizePx', 0);
    if (override > 0) {
      return Math.max(1, Math.min(64, Math.round(override)));
    }
    const key = cfg.get<string>('cursorChase.size', 'small') as SizeKey;
    return SIZE_MAP[key] ?? SIZE_MAP.small;
  }

  private _reapply() {
    this._disable();
    if (this._isEnabled()) this._enable();
  }

  private _enable() {
    this._createDecoration();
    this._hookSelection();
    // Place chibi immediately at the current cursor so the user gets visual
    // confirmation the toggle worked.
    const editor = vscode.window.activeTextEditor;
    if (editor) this._applyTo(editor);
    log('CursorChibi: enabled');
  }

  private _disable() {
    if (this._throttle) {
      clearTimeout(this._throttle);
      this._throttle = undefined;
    }
    this._activeListeners.forEach((d) => d.dispose());
    this._activeListeners = [];
    if (this._decorationType) {
      // Decoration disposal automatically clears it from every editor.
      this._decorationType.dispose();
      this._decorationType = undefined;
    }
    this._lastEditor = undefined;
  }

  private _createDecoration() {
    const iconUri = this._resolveIconUri();
    const sizePx = this._getSizePx();
    // contentIconPath is the only sandbox-safe way to embed an image in a
    // decoration (background-image: url(...) gets stripped). width/height in
    // the decoration field are honored and force the icon to that size.
    // textDecoration is just used for positioning (absolute + transform) so
    // the sprite floats over text without pushing it.
    // Place chibi above the cursor line, then add user-tuned offsets on top
    // so themes / zoom levels with unusual line-heights can be corrected via
    // the `Tune Cursor Chibi Position` command without code edits.
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const userOffsetX = cfg.get<number>('cursorChase.offsetX', 0);
    const userOffsetY = cfg.get<number>('cursorChase.offsetY', 0);
    const offsetX = -Math.floor(sizePx / 2) + userOffsetX;
    const offsetY = -(sizePx + 24) + userOffsetY;
    // The `width`/`height` API fields alone aren't enough at very small sizes —
    // VS Code's built-in CSS for decoration `before` elements applies a
    // min-width/min-height (~icon-baseline) that prevents them from going
    // below ~24px. Re-asserting size with !important plus zeroing the mins
    // overrides that and lets the chibi shrink down to a single pixel.
    this._decorationType = vscode.window.createTextEditorDecorationType({
      before: {
        contentIconPath: iconUri,
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        textDecoration:
          `none; position: absolute; pointer-events: none; ` +
          `width: ${sizePx}px !important; height: ${sizePx}px !important; ` +
          `min-width: 0 !important; min-height: 0 !important; ` +
          `max-width: ${sizePx}px !important; max-height: ${sizePx}px !important; ` +
          // `contain` preserves aspect ratio when the source PNG isn't square
          // (captured chibis are usually portrait). Without this, non-square
          // images either get stretched or render at natural size.
          `background-size: contain !important; ` +
          `background-repeat: no-repeat !important; ` +
          `background-position: center !important; ` +
          `transform: translate(${offsetX}px, ${offsetY}px); ` +
          `z-index: 10;`,
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  private _hookSelection() {
    this._activeListeners.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this._scheduleUpdate(e.textEditor);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        // Editor switched — clear decoration on the previous editor (decoration
        // is per-editor, so we just re-apply to the new one).
        if (editor) {
          this._applyTo(editor);
        }
      })
    );
  }

  private _scheduleUpdate(editor: vscode.TextEditor) {
    this._lastEditor = editor;
    if (this._throttle) return;
    this._throttle = setTimeout(() => {
      this._throttle = undefined;
      if (this._lastEditor) this._applyTo(this._lastEditor);
    }, THROTTLE_MS);
  }

  private _applyTo(editor: vscode.TextEditor) {
    if (!this._decorationType) return;

    // VS Code treats OUTPUT panels, debug consoles, and similar surfaces as
    // TextEditors too. Selection events from those leak the chibi into the
    // bottom panel, so restrict to real source files.
    const scheme = editor.document.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled' && scheme !== 'vscode-userdata') {
      editor.setDecorations(this._decorationType, []);
      return;
    }

    // Decorations don't auto-clear when the active editor changes — without
    // this loop, splitting/switching panes can leave stale chibis behind.
    for (const other of vscode.window.visibleTextEditors) {
      if (other !== editor) {
        other.setDecorations(this._decorationType, []);
      }
    }

    const pos = editor.selections[0]?.active;
    if (!pos) {
      editor.setDecorations(this._decorationType, []);
      return;
    }
    editor.setDecorations(this._decorationType, [
      { range: new vscode.Range(pos, pos) },
    ]);
  }
}
