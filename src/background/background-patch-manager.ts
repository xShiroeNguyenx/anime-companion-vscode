import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../log';
import {
  MARKER_START,
  SIDECAR_NAME,
  stripPatch,
  isPatched as contentIsPatched,
  PatchTargetSidecar,
} from './patch-constants';
import {
  BackgroundConfig,
  PatchResult,
  REGIONS,
  readBackgroundConfig,
  hasRenderableRegion,
} from './types';
import { buildInjectedBlock, ResolvedRegion } from './patch-generator';
import { encodeImageToDataUri } from './image-encoder';
import { resolveWorkbenchFile, probeWritable, isProtectedInstall } from './workbench-locator';

const fsp = fs.promises;

// Workbench path relative to the install `out` dir — used as the product.json
// checksums map key (always forward slashes).
const WORKBENCH_CHECKSUM_KEY = 'vs/workbench/workbench.desktop.main.js';

const APPLIED_HASH_KEY = 'animeCompanion.background.appliedHash';
const APPLIED_INPUT_KEY = 'animeCompanion.background.appliedInputSig';
const PATCHED_CHECKSUM_KEY = 'animeCompanion.background.patchedChecksum';
const BACKUP_VERSION_KEY = 'animeCompanion.background.backupVersion';

export interface BackgroundStatus {
  enabled: boolean;
  patched: boolean;
  workbenchFound: boolean;
  writable: boolean;
  protectedInstall: boolean;
  vscodeVersion: string;
  lastError?: string;
}

export class BackgroundPatchManager {
  private readonly _disposables: vscode.Disposable[] = [];
  private _lastError?: string;
  private _permissionWarned = false;
  // Tracks the master switch's last seen value so we only auto-restore on a
  // genuine true→false transition (not on every slider tweak).
  private _lastEnabled: boolean;
  // Set during an explicit apply/disable so the config listener doesn't also
  // fire a second restore for the same write (double reload prompt).
  private _busy = false;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._lastEnabled = readBackgroundConfig().enabled;
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('animeCompanion.background')) return;
        void this._onConfigChanged();
      }),
    );
  }

  dispose(): void {
    while (this._disposables.length) {
      try { this._disposables.pop()?.dispose(); } catch { /* ignore */ }
    }
  }

  // ---- activate entry (deferred, must never throw) -------------------------

  // Called on activate. Re-applies after a VS Code update (marker gone) or a
  // settings change (hash differs); cleans up if disabled. Wrapped so a slow
  // or failing Program Files write never delays/breaks activation.
  async applyIfNeeded(): Promise<void> {
    try {
      const config = readBackgroundConfig();
      if (!hasRenderableRegion(config)) {
        // Disabled or nothing to show — ensure the workbench is clean.
        await this._ensureClean(/*silent*/ true);
        return;
      }
      const file = resolveWorkbenchFile();
      if (!file) return;
      const content = await this._readFile(file);
      if (content === null) return;
      const patched = contentIsPatched(content);
      // Cheap pre-check BEFORE encoding images: if the file is already patched
      // and the resolved inputs (paths + mtimes + tuning) are unchanged, skip
      // the expensive base64 encode entirely.
      if (patched && this._context.globalState.get<string>(APPLIED_INPUT_KEY) === this._inputSignature(config)) {
        return;
      }
      const desired = await this._buildBlock(config);
      if (!desired) return;
      const reason = patched ? 'settings' : 'vscode-update';
      const result = await this._writePatch(file, content, config, desired);
      if (result.ok && result.changed) {
        this._promptReload(
          reason === 'vscode-update'
            ? 'Anime Companion re-applied your background after a VS Code change. Reload to see it.'
            : 'Background settings updated. Reload to apply.',
        );
      }
    } catch (err) {
      log(`Background.applyIfNeeded error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- explicit actions (panel / commands) ---------------------------------

  // Apply current settings now and prompt for reload. Used by the panel's
  // Apply button and the background.apply command.
  async apply(): Promise<PatchResult> {
    this._busy = true;
    try {
      return await this._applyInner();
    } finally {
      this._busy = false;
    }
  }

  private async _applyInner(): Promise<PatchResult> {
    const config = readBackgroundConfig();
    if (!hasRenderableRegion(config)) {
      // Nothing to render — treat Apply as "make sure it's off".
      await this._ensureClean(false);
      vscode.window.showInformationMessage(
        'No background image is set (or the master toggle is off). Nothing to apply.',
      );
      return { ok: true, changed: false };
    }
    const file = resolveWorkbenchFile();
    if (!file) {
      const msg = 'Could not locate the VS Code workbench file. Background images need desktop VS Code.';
      this._lastError = msg;
      vscode.window.showErrorMessage(msg);
      return { ok: false, changed: false, reason: msg };
    }
    const content = await this._readFile(file);
    if (content === null) {
      return { ok: false, changed: false, reason: this._lastError };
    }
    const desired = await this._buildBlock(config);
    if (!desired) {
      return { ok: false, changed: false, reason: this._lastError };
    }
    const result = await this._writePatch(file, content, config, desired);
    if (result.ok) {
      if (result.changed) {
        this._promptReload('Background applied. Reload the window to see it.');
      } else {
        vscode.window.showInformationMessage('Background is already up to date.');
      }
    } else if (result.permissionDenied) {
      this._warnPermission(file);
    } else if (result.reason) {
      vscode.window.showErrorMessage(result.reason);
    }
    return result;
  }

  // Flip the master switch off, restore the workbench, prompt reload.
  async disableAndRestore(): Promise<void> {
    this._busy = true;
    try {
      await vscode.workspace
        .getConfiguration('animeCompanion')
        .update('background.enabled', false, vscode.ConfigurationTarget.Global);
      this._lastEnabled = false;
      const result = await this._restore();
      if (result.ok && result.changed) {
        this._promptReload('Background removed. Reload the window to restore the original look.');
      } else if (result.ok) {
        vscode.window.showInformationMessage('Background is already disabled.');
      } else if (result.permissionDenied) {
        this._warnPermission(resolveWorkbenchFile() ?? '');
      }
    } finally {
      this._busy = false;
    }
  }

  async isPatched(): Promise<boolean> {
    const file = resolveWorkbenchFile();
    if (!file) return false;
    const content = await this._readFile(file);
    return content !== null && contentIsPatched(content);
  }

  async getStatus(): Promise<BackgroundStatus> {
    const config = readBackgroundConfig();
    const file = resolveWorkbenchFile();
    let patched = false;
    let writable = false;
    if (file) {
      const content = await this._readFile(file);
      patched = content !== null && contentIsPatched(content);
      writable = (await probeWritable(file)).writable;
    }
    return {
      enabled: config.enabled,
      patched,
      workbenchFound: !!file,
      writable,
      protectedInstall: file ? isProtectedInstall(file) : false,
      vscodeVersion: vscode.version,
      lastError: this._lastError,
    };
  }

  // ---- internals -----------------------------------------------------------

  private async _onConfigChanged(): Promise<void> {
    const config = readBackgroundConfig();
    const was = this._lastEnabled;
    this._lastEnabled = config.enabled;
    // An explicit apply()/disableAndRestore() is in flight — it owns the
    // restore + reload prompt, so don't duplicate it here.
    if (this._busy) return;
    // Only react to the master switch going true→false (e.g. the user edited
    // settings.json or flipped the master toggle). Turning on / tuning sliders
    // must NOT touch the workbench — that needs an explicit Apply + reload.
    if (was && !config.enabled) {
      const result = await this._restore();
      if (result.ok && result.changed) {
        this._promptReload('Background disabled. Reload the window to restore the original look.');
      }
    }
  }

  // Resolve enabled+image regions into ResolvedRegions (images → data URIs).
  private async _buildBlock(config: BackgroundConfig): Promise<{ block: string; hash: string } | null> {
    const resolved: ResolvedRegion[] = [];
    for (const region of REGIONS) {
      const rc = config[region];
      if (!rc.enabled || !rc.image.trim()) continue;
      const enc = await encodeImageToDataUri(rc.image.trim());
      if (!enc.ok || !enc.dataUri) {
        this._lastError = enc.reason;
        log(`Background: skip ${region} — ${enc.reason}`);
        continue;
      }
      if (enc.warn) log(`Background: ${region} — ${enc.warn}`);
      resolved.push({
        region,
        dataUri: enc.dataUri,
        opacity: rc.opacity,
        blur: rc.blur,
        size: rc.size,
        position: rc.position,
      });
    }
    if (!resolved.length) {
      this._lastError = this._lastError ?? 'No usable images for any enabled region.';
      return null;
    }
    return buildInjectedBlock(resolved);
  }

  // Cheap signature of the rendering inputs (no image bytes read — only stat
  // mtime), so applyIfNeeded can skip the expensive encode when nothing changed.
  private _inputSignature(config: BackgroundConfig): string {
    const parts = REGIONS.map((r) => {
      const rc = config[r];
      let mtime = 0;
      if (rc.enabled && rc.image.trim()) {
        try { mtime = fs.statSync(rc.image).mtimeMs; } catch { /* ignore */ }
      }
      return { r, e: rc.enabled, img: rc.image, mtime, o: rc.opacity, b: rc.blur, s: rc.size, p: rc.position };
    });
    return JSON.stringify({ parts, checksums: config.patchChecksums });
  }

  // Core: strip any old block, append the new one, write atomically, optionally
  // patch checksums, write the uninstall sidecar, and remember the applied hash.
  private async _writePatch(
    file: string,
    currentContent: string,
    config: BackgroundConfig,
    desired: { block: string; hash: string },
  ): Promise<PatchResult> {
    const probe = await probeWritable(file);
    if (!probe.writable) {
      return { ok: false, changed: false, permissionDenied: true, reason: `Write denied (${probe.code}).` };
    }
    await this._backupPristine(file, currentContent);

    const pristine = stripPatch(currentContent);
    const newContent = `${pristine}\n${desired.block}\n`;
    let workbenchChanged = false;
    if (newContent !== currentContent) {
      try {
        await this._atomicWrite(file, newContent);
      } catch (err: any) {
        const code = err?.code ? String(err.code) : '';
        const denied = ['EACCES', 'EPERM', 'EROFS', 'EBUSY'].includes(code);
        const msg = `Failed to write workbench file (${code || (err instanceof Error ? err.message : String(err))}).`;
        this._lastError = msg;
        log(`Background: ${msg}`);
        return { ok: false, changed: false, permissionDenied: denied, reason: msg };
      }
      workbenchChanged = true;
    }

    await this._context.globalState.update(APPLIED_HASH_KEY, desired.hash);
    await this._context.globalState.update(APPLIED_INPUT_KEY, this._inputSignature(config));
    await this._writeSidecar(file);

    // The checksum step ALWAYS runs — toggling patchChecksums without changing
    // the image leaves the workbench identical, but product.json must still be
    // (un)patched, and that change needs a reload to take effect.
    let checksumChanged = false;
    if (config.patchChecksums) {
      checksumChanged = await this._patchChecksum(newContent);
    } else {
      checksumChanged = await this._maybeRevertChecksum(pristine);
    }
    this._lastError = undefined;
    return { ok: true, changed: workbenchChanged || checksumChanged };
  }

  // Remove our block, write back, fix checksums, drop the sidecar.
  private async _restore(): Promise<PatchResult> {
    const file = resolveWorkbenchFile();
    if (!file) return { ok: true, changed: false };
    const content = await this._readFile(file);
    if (content === null) return { ok: false, changed: false, reason: this._lastError };
    if (!contentIsPatched(content)) {
      await this._removeSidecar();
      return { ok: true, changed: false };
    }
    const probe = await probeWritable(file);
    if (!probe.writable) {
      return { ok: false, changed: false, permissionDenied: true, reason: `Write denied (${probe.code}).` };
    }
    const cleaned = stripPatch(content).replace(/\s+$/, '\n');
    try {
      await this._atomicWrite(file, cleaned);
    } catch (err: any) {
      const code = err?.code ? String(err.code) : '';
      const denied = ['EACCES', 'EPERM', 'EROFS', 'EBUSY'].includes(code);
      const msg = `Failed to restore workbench file (${code || (err instanceof Error ? err.message : String(err))}).`;
      this._lastError = msg;
      return { ok: false, changed: false, permissionDenied: denied, reason: msg };
    }
    await this._context.globalState.update(APPLIED_HASH_KEY, undefined);
    await this._context.globalState.update(APPLIED_INPUT_KEY, undefined);
    await this._removeSidecar();
    await this._maybeRevertChecksum(cleaned);
    return { ok: true, changed: true };
  }

  private async _ensureClean(silent: boolean): Promise<void> {
    const result = await this._restore();
    if (!silent && result.ok && result.changed) {
      this._promptReload('Background removed. Reload the window to restore the original look.');
    }
  }

  private async _atomicWrite(file: string, content: string): Promise<void> {
    const tmp = `${file}.anime-bg.tmp`;
    await fsp.writeFile(tmp, content, 'utf8');
    await fsp.rename(tmp, file);
  }

  private async _readFile(file: string): Promise<string | null> {
    try {
      return await fsp.readFile(file, 'utf8');
    } catch (err) {
      this._lastError = `Could not read workbench file: ${err instanceof Error ? err.message : String(err)}`;
      log(`Background: ${this._lastError}`);
      return null;
    }
  }

  // Store the pristine (un-patched) workbench content once per VS Code version,
  // for disaster recovery. Best-effort — never blocks the patch.
  private async _backupPristine(file: string, currentContent: string): Promise<void> {
    try {
      const pristine = stripPatch(currentContent);
      const version = vscode.version;
      const dir = path.join(this._context.globalStorageUri.fsPath, 'background', 'backup', version);
      const dest = path.join(dir, 'workbench.desktop.main.js');
      if (this._context.globalState.get<string>(BACKUP_VERSION_KEY) === version && fs.existsSync(dest)) {
        return;
      }
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(dest, pristine, 'utf8');
      await this._context.globalState.update(BACKUP_VERSION_KEY, version);
    } catch (err) {
      log(`Background: pristine backup skipped — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private _sidecarPath(): string {
    return path.join(this._context.extensionUri.fsPath, 'out', 'background', SIDECAR_NAME);
  }

  private async _writeSidecar(workbenchPath: string): Promise<void> {
    try {
      const payload: PatchTargetSidecar = { workbenchPath, vscodeVersion: vscode.version };
      const p = this._sidecarPath();
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, JSON.stringify(payload), 'utf8');
    } catch (err) {
      log(`Background: sidecar write skipped — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async _removeSidecar(): Promise<void> {
    try { await fsp.rm(this._sidecarPath(), { force: true }); } catch { /* ignore */ }
  }

  // ---- checksum (opt-in, best-effort) --------------------------------------

  // VS Code stores base64(sha256) (trailing '=' stripped) per file in
  // product.json's `checksums` map and warns when the on-disk hash differs.
  // Updating that entry to match our patched file silences the warning. This
  // is exactly what checksum-fixer extensions do.
  private static _vscodeChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('base64').replace(/=+$/, '');
  }

  private _productJsonPath(): string | null {
    try {
      if (!vscode.env.appRoot) return null;
      const p = path.join(vscode.env.appRoot, 'product.json');
      return fs.existsSync(p) ? p : null;
    } catch {
      return null;
    }
  }

  // Returns true if product.json was actually changed (→ a reload is needed).
  private async _patchChecksum(workbenchContent: string): Promise<boolean> {
    const productPath = this._productJsonPath();
    if (!productPath) {
      log('Background: checksum patch skipped — product.json not found.');
      return false;
    }
    try {
      const raw = await fsp.readFile(productPath, 'utf8');
      const product = JSON.parse(raw);
      if (!product || typeof product !== 'object' || !product.checksums) {
        log('Background: checksum patch skipped — no checksums map in product.json.');
        return false;
      }
      const sum = BackgroundPatchManager._vscodeChecksum(workbenchContent);
      if (product.checksums[WORKBENCH_CHECKSUM_KEY] === sum) {
        await this._context.globalState.update(PATCHED_CHECKSUM_KEY, true);
        return false; // already correct
      }
      product.checksums[WORKBENCH_CHECKSUM_KEY] = sum;
      const tmp = `${productPath}.anime-bg.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(product, null, '\t'), 'utf8');
      await fsp.rename(tmp, productPath);
      await this._context.globalState.update(PATCHED_CHECKSUM_KEY, true);
      log('Background: patched product.json checksum to silence corrupt warning.');
      return true;
    } catch (err) {
      // Non-fatal: the background still works; only the warning remains.
      log(`Background: checksum patch failed (non-fatal) — ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // When checksum patching was previously on and is now off (or we restored the
  // file), recompute the checksum from the current content so product.json
  // matches again. Only acts if we ever touched it.
  // Restore product.json's checksum to match the PRISTINE (un-patched) file —
  // i.e. the value the editor shipped with. Only acts if we previously patched
  // it. Returns true if product.json changed. Pass the pristine content.
  private async _maybeRevertChecksum(pristineContent: string): Promise<boolean> {
    if (!this._context.globalState.get<boolean>(PATCHED_CHECKSUM_KEY)) return false;
    const productPath = this._productJsonPath();
    if (!productPath) return false;
    try {
      const raw = await fsp.readFile(productPath, 'utf8');
      const product = JSON.parse(raw);
      if (!product?.checksums) return false;
      const sum = BackgroundPatchManager._vscodeChecksum(pristineContent);
      let changed = false;
      if (product.checksums[WORKBENCH_CHECKSUM_KEY] !== sum) {
        product.checksums[WORKBENCH_CHECKSUM_KEY] = sum;
        const tmp = `${productPath}.anime-bg.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(product, null, '\t'), 'utf8');
        await fsp.rename(tmp, productPath);
        changed = true;
      }
      await this._context.globalState.update(PATCHED_CHECKSUM_KEY, false);
      return changed;
    } catch (err) {
      log(`Background: checksum revert failed (non-fatal) — ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---- ui helpers ----------------------------------------------------------

  private _promptReload(message: string): void {
    void vscode.window.showInformationMessage(message, 'Reload Window').then((choice) => {
      if (choice === 'Reload Window') {
        void vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
  }

  private _warnPermission(file: string): void {
    if (this._permissionWarned) return;
    this._permissionWarned = true;
    const protectedInstall = file && isProtectedInstall(file);
    const msg = protectedInstall
      ? "Can't write to this VS Code install (it's in a protected folder like Program Files). Run VS Code as Administrator once, or use the User-scope install, then try again."
      : "Can't write to the VS Code workbench file. Check file permissions, then try again.";
    void vscode.window.showErrorMessage(msg, 'Open Logs').then((c) => {
      if (c === 'Open Logs') void vscode.commands.executeCommand('workbench.action.toggleDevTools');
    });
  }
}

// Marker re-export so other modules don't reach into patch-constants directly.
export { MARKER_START };
