import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './log';

/**
 * The companion leaves her panel and stands in your code for a while.
 *
 * After a stretch of quiet she fades out of the panel, appears at the left
 * margin of the editor beside the line you are working on, stays a few
 * seconds, and goes home. It is a small thing that buys a large amount of
 * character: a companion that only ever exists where you put it is furniture,
 * while one that turns up somewhere else on its own is a presence.
 *
 * Three decisions shape the implementation.
 *
 * **She is a decoration, not a webview.** VS Code gives extensions no way to
 * float arbitrary content over a text editor; the one sanctioned channel is a
 * TextEditorDecoration with `contentIconPath`, which is exactly what the
 * cursor chibi already uses. That means a still image, so a handful of frames
 * captured from her idle animation are cycled slowly to put the breath back.
 *
 * **The panel is never hidden.** Toggling the view's visibility tears the
 * webview down, and coming back would reload the Live2D model with a visible
 * stall. Instead the panel stays exactly where it is and the character inside
 * it fades — free to do, and instant to undo.
 *
 * **She stands still.** An earlier design had her follow the cursor around,
 * which turns out to be the difference between a companion and a distraction:
 * anything that moves in the corner of your eye while you are reading code
 * pulls attention whether you want it to or not. She picks a spot when she
 * arrives and stays there.
 */

/** Frames cycled while she stands in the editor. */
const FRAME_COUNT = 4;
/** Real time between captures, so each frame catches the idle animation elsewhere. */
const CAPTURE_GAP_MS = 260;
/** How long one frame is shown. Slow: this is breathing, not animation. */
const FRAME_HOLD_MS = 420;
/** Fade used when she leaves the panel and when she returns. */
const FADE_MS = 420;
/** Re-check this often when the moment is wrong (no editor, panel busy). */
const RETRY_MS = 20_000;
/**
 * How far left of the text the sprite is pulled, in pixels.
 *
 * Column 0 sits after the line-number gutter, so without this she stands in
 * the middle of the code rather than against the window edge. Roughly the
 * width of a gutter at default settings; overshooting is harmless because the
 * editor clips at its own boundary.
 */
const LEFT_INSET_PX = 62;
/** Lets her feet sit slightly below the anchor line, not exactly on it. */
const BASELINE_DROP_PX = 6;

type Host = {
  postMessage: (message: unknown) => void;
  isReady: () => boolean;
};

export class WanderManager {
  private _host?: Host;
  private _frameUris: vscode.Uri[] = [];
  private _framesModelId = '';
  private _decorationType?: vscode.TextEditorDecorationType;
  private _decorationFrame = 0;
  private _idleTimer?: NodeJS.Timeout;
  private _stayTimer?: NodeJS.Timeout;
  private _frameTimer?: NodeJS.Timeout;
  private _visitingEditor?: vscode.TextEditor;
  private _anchor?: vscode.Position;
  private _away = false;
  private _capturePending = false;
  private _listeners: vscode.Disposable[] = [];
  /** Cached aspect ratio and the file it was measured from. */
  private _aspect = 0.5;
  private _aspectFor = '';
  private readonly _frameDir: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._frameDir = path.join(_context.globalStorageUri.fsPath, 'wander-frames');
    try {
      fs.mkdirSync(this._frameDir, { recursive: true });
    } catch {
      // Storage unavailable: the feature simply never captures.
    }
  }

  public setHost(host: Host) {
    this._host = host;
  }

  private _cfg() {
    return vscode.workspace.getConfiguration('animeCompanion');
  }

  private _enabled(): boolean {
    return this._cfg().get<boolean>('wander.enabled', true);
  }

  private _idleDelayMs(): number {
    const minutes = this._cfg().get<number>('wander.idleMinutes', 3);
    return Math.max(0.5, minutes) * 60_000;
  }

  private _stayMs(): number {
    return Math.max(2, this._cfg().get<number>('wander.staySeconds', 10)) * 1000;
  }

  private _sizePx(): number {
    return Math.max(16, Math.min(480, this._cfg().get<number>('wander.sizePx', 300)));
  }

  public activate() {
    // Subscribed defensively: each of these is optional in the API surface a
    // host may expose (the smoke-test harness stubs only part of it), and a
    // missing event should cost this feature one signal, not the activation.
    const on = <T>(
      event: ((listener: (e: T) => void) => vscode.Disposable) | undefined,
      listener: (e: T) => void
    ) => {
      if (typeof event !== 'function') return;
      try {
        this._listeners.push(event(listener));
      } catch (err) {
        log(`Wander: could not subscribe — ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    on(vscode.workspace.onDidChangeConfiguration, (e: vscode.ConfigurationChangeEvent) => {
      if (!e.affectsConfiguration('animeCompanion.wander')) return;
      // Growing the size makes frames captured for the old one too small to
      // show without blurring, so drop them and let the next visit recapture.
      if (e.affectsConfiguration('animeCompanion.wander.sizePx')) {
        this._frameUris = [];
        this._framesModelId = '';
      }
      if (this._enabled()) this._scheduleIdle();
      else this._comeHome('setting turned off');
    });
    // Typing, moving the cursor or switching files all mean the user is here:
    // she should not be standing in the way, and the clock restarts.
    on(vscode.workspace.onDidChangeTextDocument, () => this.noteActivity());
    on(vscode.window.onDidChangeTextEditorSelection, () => this.noteActivity());
    on(vscode.window.onDidChangeActiveTextEditor, () => this.noteActivity());
    // Scrolling is not activity — it is reading, and she should stay put in
    // the corner while the text moves under her. Re-anchoring to the new last
    // visible line is what keeps her there instead of sliding off the top.
    on(vscode.window.onDidChangeTextEditorVisibleRanges, (e: vscode.TextEditorVisibleRangesChangeEvent) => {
      if (!this._away || e.textEditor !== this._visitingEditor) return;
      this._anchor = this._cornerAnchor(e.textEditor);
      this._showFrame();
    });
    this._scheduleIdle();
  }

  /** Any sign of life from the user: come home, restart the clock. */
  public noteActivity() {
    if (this._away) this._comeHome('user activity');
    this._scheduleIdle();
  }

  /**
   * Timers here are unref'd so they never hold the process open.
   *
   * The idle wait is minutes long, and in a plain Node host (the smoke test,
   * for one) a pending timer of that length keeps the process alive long after
   * its work is done. unref keeps the timer working while VS Code is running
   * and stops it from being a reason to stay running.
   */
  private _defer(fn: () => void, ms: number): NodeJS.Timeout {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  }

  private _scheduleIdle() {
    clearTimeout(this._idleTimer);
    this._idleTimer = undefined;
    if (!this._enabled()) return;
    this._idleTimer = this._defer(() => void this._leave(), this._idleDelayMs());
  }

  /** Frames arriving back from the webview, one data URL each. */
  public async receiveFrames(modelId: string, frames: string[]): Promise<void> {
    this._capturePending = false;
    const safe = (modelId || 'model').replace(/[^A-Za-z0-9_\-]/g, '_');
    const uris: vscode.Uri[] = [];
    for (let i = 0; i < frames.length; i++) {
      const m = /^data:image\/png;base64,(.+)$/.exec(frames[i]);
      if (!m) continue;
      const file = path.join(this._frameDir, `${safe}-${i}.png`);
      try {
        fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
        uris.push(vscode.Uri.file(file));
      } catch (err) {
        log(`Wander: could not write frame ${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (uris.length === 0) {
      log('Wander: capture produced no usable frames');
      return;
    }
    this._frameUris = uris;
    this._framesModelId = safe;
    log(`Wander: captured ${uris.length} frame(s) for ${safe}`);
    // The capture was requested because she was about to leave; go now.
    void this._leave();
  }

  public captureFailed(reason: string) {
    this._capturePending = false;
    log(`Wander: capture failed — ${reason}`);
  }

  /**
   * Height in pixels of a PNG, read from its header.
   *
   * Used to notice frames captured before the display size grew: a 96px
   * capture shown at 300px is a blurry mess, and without this check the
   * reuse path below would keep serving the stale file forever.
   */
  private _pngHeight(file: string): number {
    try {
      const fd = fs.openSync(file, 'r');
      const head = Buffer.alloc(24);
      fs.readSync(fd, head, 0, 24, 0);
      fs.closeSync(fd);
      // PNG: 8-byte signature, then the IHDR chunk with width at 16, height at 20.
      return head.readUInt32BE(20);
    } catch {
      return 0;
    }
  }

  /**
   * Width-to-height ratio of the current frame, measured from the PNG header.
   *
   * Cached because it is read on every frame swap (a few times a second) and
   * the answer only changes when the model does. Falls back to a portrait-ish
   * guess if the file cannot be read, which is closer to right for a character
   * than a square would be.
   */
  private _frameAspect(): number {
    const uri = this._frameUris[this._decorationFrame] ?? this._frameUris[0];
    if (!uri) return 0.5;
    if (this._aspectFor === uri.fsPath) return this._aspect;
    try {
      const fd = fs.openSync(uri.fsPath, 'r');
      const head = Buffer.alloc(24);
      fs.readSync(fd, head, 0, 24, 0);
      fs.closeSync(fd);
      const w = head.readUInt32BE(16);
      const h = head.readUInt32BE(20);
      this._aspect = w > 0 && h > 0 ? w / h : 0.5;
    } catch {
      this._aspect = 0.5;
    }
    this._aspectFor = uri.fsPath;
    return this._aspect;
  }

  /** True when usable frames for the current model are already on disk. */
  private _haveFrames(): boolean {
    const modelId = this._cfg().get<string>('model', 'hiyori');
    const safe = (modelId || 'model').replace(/[^A-Za-z0-9_\-]/g, '_');
    if (this._framesModelId === safe && this._frameUris.length > 0) return true;
    // A previous session's frames are reusable, but only if they were captured
    // at least as large as she is now drawn — otherwise she would be upscaled.
    const needed = this._sizePx();
    const found: vscode.Uri[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const file = path.join(this._frameDir, `${safe}-${i}.png`);
      if (!fs.existsSync(file)) continue;
      if (this._pngHeight(file) < needed) {
        log(`Wander: stored frames are smaller than ${needed}px — recapturing`);
        return false;
      }
      found.push(vscode.Uri.file(file));
    }
    if (found.length === 0) return false;
    this._frameUris = found;
    this._framesModelId = safe;
    return true;
  }

  /**
   * The bottom-left corner of what the editor is currently showing.
   *
   * A decoration has to hang off a position in the *document*, and there is no
   * API for "pin this to the viewport". The nearest honest equivalent is the
   * last line currently on screen: anchored there at column 0, she stands in
   * the bottom-left corner of the visible text. Scrolling changes which line
   * that is, so `_hookScroll` re-anchors her as the view moves and she appears
   * to stay put in the corner.
   *
   * A few lines up from the very last one, because the last visible line is
   * usually half-clipped by the editor's edge and the sprite is drawn upward
   * from its anchor.
   */
  private _cornerAnchor(editor: vscode.TextEditor): vscode.Position {
    const ranges = editor.visibleRanges;
    const lastVisible = ranges.length > 0
      ? ranges[ranges.length - 1].end.line
      : Math.max(0, editor.document.lineCount - 1);
    const line = Math.max(0, Math.min(lastVisible, editor.document.lineCount - 1));
    return new vscode.Position(line, 0);
  }

  /** A real source editor to stand in, or undefined if there is none. */
  private _targetEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    // Output panels and debug consoles are TextEditors too, and she has no
    // business appearing in them.
    const scheme = editor.document.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled' && scheme !== 'vscode-userdata') return undefined;
    return editor;
  }

  private async _leave() {
    if (!this._enabled() || this._away) return;
    const editor = this._targetEditor();
    if (!editor) {
      // Nowhere to go right now; try again later rather than giving up.
      this._idleTimer = this._defer(() => void this._leave(), RETRY_MS);
      return;
    }
    if (!this._haveFrames()) {
      if (this._capturePending || !this._host?.isReady()) {
        this._idleTimer = this._defer(() => void this._leave(), RETRY_MS);
        return;
      }
      // Ask the panel for frames; receiveFrames() calls back into _leave().
      this._capturePending = true;
      this._host.postMessage({
        command: 'captureWanderFrames',
        modelId: this._cfg().get<string>('model', 'hiyori'),
        count: FRAME_COUNT,
        gapMs: CAPTURE_GAP_MS,
      });
      return;
    }

    this._away = true;
    this._visitingEditor = editor;
    // Bottom-left corner of the visible text, not the cursor line: she should
    // be somewhere you are not reading, and the corner is exactly that.
    this._anchor = this._cornerAnchor(editor);
    this._host?.postMessage({ command: 'setModelVisible', visible: false, fadeMs: FADE_MS });
    log('Wander: leaving the panel');

    // Let the fade finish before she appears in the editor, so she is never
    // visibly in two places at once.
    this._defer(() => {
      if (!this._away) return;
      this._decorationFrame = 0;
      this._showFrame();
      this._frameTimer = setInterval(() => this._advanceFrame(), FRAME_HOLD_MS);
      this._frameTimer.unref?.();
      this._stayTimer = this._defer(() => this._comeHome('visit over'), this._stayMs());
    }, FADE_MS);
  }

  private _advanceFrame() {
    if (!this._away || this._frameUris.length < 2) return;
    this._decorationFrame = (this._decorationFrame + 1) % this._frameUris.length;
    this._showFrame();
  }

  /** Draws the current frame at the anchor, replacing the previous one. */
  private _showFrame() {
    const editor = this._visitingEditor;
    const anchor = this._anchor;
    if (!editor || !anchor) return;
    // Editor closed while she was standing in it.
    if (!vscode.window.visibleTextEditors.includes(editor)) {
      this._comeHome('editor closed');
      return;
    }

    const height = this._sizePx();
    const uri = this._frameUris[this._decorationFrame] ?? this._frameUris[0];
    // The box must match the image's aspect ratio, not be square.
    //
    // `background-size: contain` fits the image inside the box, so a square
    // box around a tall, narrow character sizes her by the box's WIDTH and she
    // comes out a fraction of the height asked for — which is exactly why she
    // looked tiny. Measuring the PNG and giving the box her real proportions
    // makes the height setting mean what it says.
    const ratio = this._frameAspect();
    const width = Math.max(8, Math.round(height * ratio));
    const previous = this._decorationType;
    // A new decoration type per frame: contentIconPath is fixed at creation,
    // so swapping the image means swapping the type. The old one is disposed
    // after the new one is applied, which avoids a flicker between them.
    this._decorationType = vscode.window.createTextEditorDecorationType({
      before: {
        contentIconPath: uri,
        width: `${width}px`,
        height: `${height}px`,
        // Same positioning trick the cursor chibi uses: absolute placement so
        // the sprite floats over the text instead of pushing it aside.
        textDecoration:
          `none; position: absolute; pointer-events: none; ` +
          `display: inline-block !important; overflow: hidden !important; ` +
          `margin: 0 !important; padding: 0 !important; ` +
          `font-size: 0 !important; line-height: 0 !important; ` +
          `width: ${width}px !important; height: ${height}px !important; ` +
          `min-width: 0 !important; min-height: 0 !important; ` +
          `max-width: ${width}px !important; max-height: ${height}px !important; ` +
          `background-size: contain !important; ` +
          `background-repeat: no-repeat !important; ` +
          `background-position: bottom left !important; ` +
          // Anchored at column 0 of the last visible line. Pulled left past the
          // text margin so she stands against the editor's edge, and lifted by
          // her own height minus a line so her feet land on that line rather
          // than her head hanging from it.
          `transform: translate(-${LEFT_INSET_PX}px, -${height - BASELINE_DROP_PX}px); ` +
          `z-index: 10;`,
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    const safeAnchor = this._clampAnchor(editor, anchor);
    editor.setDecorations(this._decorationType, [{ range: new vscode.Range(safeAnchor, safeAnchor) }]);
    previous?.dispose();
  }

  /** The document may have shrunk under her; keep the anchor inside it. */
  private _clampAnchor(editor: vscode.TextEditor, anchor: vscode.Position): vscode.Position {
    const lastLine = Math.max(0, editor.document.lineCount - 1);
    const line = Math.min(anchor.line, lastLine);
    const maxChar = editor.document.lineAt(line).text.length;
    return new vscode.Position(line, Math.min(anchor.character, maxChar));
  }

  private _comeHome(reason: string) {
    if (!this._away) return;
    this._away = false;
    clearTimeout(this._stayTimer);
    this._stayTimer = undefined;
    clearInterval(this._frameTimer);
    this._frameTimer = undefined;
    // Disposing the type clears it from every editor it was applied to.
    this._decorationType?.dispose();
    this._decorationType = undefined;
    this._visitingEditor = undefined;
    this._anchor = undefined;
    this._host?.postMessage({ command: 'setModelVisible', visible: true, fadeMs: FADE_MS });
    log(`Wander: home (${reason})`);
  }

  /** Called when the model changes: old frames no longer show this character. */
  public forgetFrames() {
    this._comeHome('model changed');
    this._frameUris = [];
    this._framesModelId = '';
  }

  public dispose() {
    clearTimeout(this._idleTimer);
    clearTimeout(this._stayTimer);
    clearInterval(this._frameTimer);
    this._decorationType?.dispose();
    this._listeners.forEach((d) => d.dispose());
    this._listeners = [];
  }
}
