import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../log';
import { getMessageBank } from '../messages';
import { BackgroundPatchManager } from './background-patch-manager';
import {
  BackgroundRegion,
  REGIONS,
  readBackgroundConfig,
  RegionConfig,
} from './types';
import { encodeImageToDataUri } from './image-encoder';
import { downloadImage } from './image-url';

const fsp = fs.promises;

const APPLIED_SIGNATURE_KEY = 'animeCompanion.background.appliedSignature';
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];

function nonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

interface RegionState extends RegionConfig {
  imageUri: string | null;
  imageName: string | null;
}

export class BackgroundPanel {
  private static _current: BackgroundPanel | undefined;

  static reveal(context: vscode.ExtensionContext, manager: BackgroundPatchManager): void {
    if (BackgroundPanel._current) {
      BackgroundPanel._current._panel.reveal(vscode.ViewColumn.Active);
      BackgroundPanel._current._broadcast();
      return;
    }
    const strings = getMessageBank().getWebviewStrings().backgroundPanel ?? {};
    const title = strings.title || 'Background Image';
    const panel = vscode.window.createWebviewPanel(
      'animeCompanion.backgroundSettings',
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          context.globalStorageUri,
        ],
      },
    );
    BackgroundPanel._current = new BackgroundPanel(panel, context, manager);
  }

  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _imageDir: string;
  // Cache of encoded preview data-URIs, keyed by "path|mtimeMs", so dragging a
  // slider (which re-broadcasts) doesn't re-encode the image every time.
  private readonly _thumbCache = new Map<string, string>();

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext,
    private readonly _manager: BackgroundPatchManager,
  ) {
    this._imageDir = path.join(_context.globalStorageUri.fsPath, 'background', 'images');
    try { fs.mkdirSync(this._imageDir, { recursive: true }); } catch { /* ignore */ }

    this._panel.webview.html = this._renderHtml();
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((m) => this._handleMessage(m), null, this._disposables);
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('animeCompanion.background') ||
          e.affectsConfiguration('animeCompanion.messageLanguage')
        ) {
          this._broadcast();
        }
      }),
    );
  }

  private _dispose(): void {
    BackgroundPanel._current = undefined;
    while (this._disposables.length) {
      try { this._disposables.pop()?.dispose(); } catch { /* ignore */ }
    }
  }

  // ---- state ---------------------------------------------------------------

  private _signature(): string {
    const c = readBackgroundConfig();
    return JSON.stringify({
      enabled: c.enabled,
      patchChecksums: c.patchChecksums,
      regions: REGIONS.map((r) => c[r]),
    });
  }

  private _broadcast(): void {
    void this._broadcastAsync();
  }

  // Encode an image to a data-URI for the in-panel preview (cached by mtime).
  // We use a data-URI rather than asWebviewUri because globalStorage may not be
  // a registered resource root on first use, which silently blanks the image.
  private async _previewDataUri(imagePath: string): Promise<string | null> {
    try {
      const st = fs.statSync(imagePath);
      const key = `${imagePath}|${st.mtimeMs}`;
      const cached = this._thumbCache.get(key);
      if (cached) return cached;
      const enc = await encodeImageToDataUri(imagePath);
      if (enc.ok && enc.dataUri) {
        if (this._thumbCache.size > 8) this._thumbCache.clear();
        this._thumbCache.set(key, enc.dataUri);
        return enc.dataUri;
      }
    } catch { /* ignore */ }
    return null;
  }

  private async _broadcastAsync(): Promise<void> {
    const config = readBackgroundConfig();
    const regions: Record<string, RegionState> = {};
    for (const r of REGIONS) {
      const rc = config[r];
      const hasImg = !!rc.image.trim() && fs.existsSync(rc.image);
      regions[r] = {
        ...rc,
        imageUri: hasImg ? await this._previewDataUri(rc.image) : null,
        imageName: hasImg ? path.basename(rc.image) : null,
      };
    }
    const status = await this._manager.getStatus();
    const applied = this._context.globalState.get<string>(APPLIED_SIGNATURE_KEY);
    const dirty = applied !== this._signature();

    let platformNote: string | undefined;
    if (!status.workbenchFound) {
      platformNote = 'Could not find the VS Code workbench file — background images need desktop VS Code.';
    } else if (!status.writable) {
      platformNote = status.protectedInstall
        ? 'This VS Code is in a protected folder (e.g. Program Files). Applying may need running VS Code as Administrator.'
        : "Can't write to the VS Code workbench file — check file permissions.";
    }

    this._panel.webview.postMessage({
      command: 'background:state',
      // Strings travel with every broadcast so the panel re-localizes live when
      // the user changes animeCompanion.messageLanguage (no reopen needed).
      strings: getMessageBank().getWebviewStrings().backgroundPanel ?? {},
      state: {
        enabled: config.enabled,
        patchChecksums: config.patchChecksums,
        regions,
        dirty,
        status,
        platformNote,
      },
    });
  }

  // ---- messages ------------------------------------------------------------

  private async _handleMessage(msg: any): Promise<void> {
    try {
      switch (msg?.command) {
        case 'background:ready':
          this._broadcast();
          return;
        case 'background:pickImage':
          await this._pickImage(msg.region);
          return;
        case 'background:addUrl':
          await this._addImageFromUrl(msg.region, msg.url);
          return;
        case 'background:clearImage':
          await this._setConfig(`background.${this._region(msg.region)}.image`, '');
          return;
        case 'background:set':
          await this._handleSet(msg.region, msg.key, msg.value);
          return;
        case 'background:setRegionEnabled':
          await this._setConfig(`background.${this._region(msg.region)}.enabled`, !!msg.value);
          return;
        case 'background:setEnabled':
          await this._setConfig('background.enabled', !!msg.value);
          return;
        case 'background:setPatchChecksums':
          await this._setConfig('background.patchChecksums', !!msg.value);
          return;
        case 'background:apply': {
          const result = await this._manager.apply();
          if (result.ok) {
            await this._context.globalState.update(APPLIED_SIGNATURE_KEY, this._signature());
            this._broadcast();
          }
          return;
        }
        case 'background:disable':
          await this._manager.disableAndRestore();
          await this._context.globalState.update(APPLIED_SIGNATURE_KEY, this._signature());
          this._broadcast();
          return;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`BackgroundPanel error: ${detail}`);
      vscode.window.showErrorMessage(`Background action failed: ${detail}`);
    }
  }

  private _region(r: any): BackgroundRegion {
    return (REGIONS as string[]).includes(r) ? (r as BackgroundRegion) : 'editor';
  }

  private async _handleSet(region: any, key: any, value: any): Promise<void> {
    const r = this._region(region);
    if (key === 'opacity' || key === 'blur') {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      await this._setConfig(`background.${r}.${key}`, Math.round(n));
    } else if (key === 'size') {
      if (['cover', 'contain', 'repeat', 'stretch'].includes(value)) {
        await this._setConfig(`background.${r}.size`, value);
      }
    } else if (key === 'position') {
      if (typeof value === 'string') await this._setConfig(`background.${r}.position`, value);
    }
  }

  private async _setConfig(key: string, value: unknown): Promise<void> {
    await vscode.workspace
      .getConfiguration('animeCompanion')
      .update(key, value, vscode.ConfigurationTarget.Global);
    // onDidChangeConfiguration triggers _broadcast(); broadcast here too so the
    // UI feels instant even if the event is debounced.
    this._broadcast();
  }

  private async _pickImage(region: any): Promise<void> {
    const r = this._region(region);
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Use as background',
      filters: { Images: IMAGE_EXTS },
    });
    if (!picked || !picked.length) return;
    const src = picked[0].fsPath;
    const ext = path.extname(src).toLowerCase() || '.png';
    const dest = path.join(this._imageDir, `${r}-${Date.now()}${ext}`);
    try {
      await fsp.copyFile(src, dest);
    } catch (err) {
      vscode.window.showErrorMessage(`Could not copy image: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await this._setConfig(`background.${r}.image`, dest);
  }

  // Download an image from a URL (Google Drive / Dropbox share links are
  // normalized to direct-download links) and save it like a picked file, so the
  // rest of the apply/encode pipeline is unchanged. Always reports back to the
  // webview so its per-region "loading" state clears on success or failure.
  private async _addImageFromUrl(region: any, url: any): Promise<void> {
    const r = this._region(region);
    const raw = typeof url === 'string' ? url.trim() : '';
    if (!raw) {
      this._postUrlResult(r, false, 'URL trống.');
      return;
    }
    try {
      const img = await downloadImage(raw);
      const dest = path.join(this._imageDir, `${r}-${Date.now()}${img.ext}`);
      await fsp.writeFile(dest, img.buf);
      await this._setConfig(`background.${r}.image`, dest);
      this._postUrlResult(r, true);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`BackgroundPanel addUrl failed: ${detail}`);
      this._postUrlResult(r, false, detail);
    }
  }

  private _postUrlResult(region: BackgroundRegion, ok: boolean, error?: string): void {
    this._panel.webview.postMessage({ command: 'background:urlResult', region, ok, error });
  }

  // ---- html ----------------------------------------------------------------

  private _renderHtml(): string {
    const webview = this._panel.webview;
    const n = nonce();
    // Cache-bust the webview assets — VS Code can serve a stale cached copy of
    // these files after an extension update, leaving the panel running old JS.
    const bust = `${Date.now()}`;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'webview', 'background-panel.css'),
    ).with({ query: `v=${bust}` });
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'webview', 'background-panel.js'),
    ).with({ query: `v=${bust}` });
    const strings = getMessageBank().getWebviewStrings().backgroundPanel ?? {};
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${n}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link rel="stylesheet" href="${cssUri}" />
<title>${strings.title || 'Background Image'}</title>
</head>
<body>
<div id="root"></div>
<script nonce="${n}">
  window.__BG_STRINGS__ = ${JSON.stringify(strings)};
</script>
<script nonce="${n}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
