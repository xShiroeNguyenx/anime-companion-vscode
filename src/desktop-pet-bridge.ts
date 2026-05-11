import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { ModelFileServer } from './model-server';
import { ModelDownloader } from './model-downloader';
import { DesktopPetDownloader } from './desktop-pet-downloader';
import { ReactiveManager } from './reactive';
import { StatsStore } from './stats';
import { WebSocketTransport } from './companion-transport';
import { dispatchRuntimeMessage } from './companion-message-dispatcher';
import { getSelectedModel, HIYORI, ModelInfo, listVisibleModels } from './models';
import { AmbientPreset, getAmbientPreset, listAmbientPresets, resolveCustomAmbientTracks } from './ambient-presets';
import { getMessageBank, ResolvedPhrase, MessageKey } from './messages';
import { PomodoroState } from './pomodoro';
import { log } from './log';

// Routes the floating desktop pet through the same VS Code-backed reactive
// engine and message protocol the in-panel webview uses, only the transport is
// a WebSocket on top of the existing ModelFileServer instead of postMessage.
//
// Lifecycle:
//   - construct: generates a per-session token, attaches WS upgrade handler
//   - first client connects with ?token=<match>: transport attached, ReactiveManager
//     activates, init payload sent
//   - on disconnect: transport detached; ReactiveManager keeps running (it
//     reflects extension-host state, and a re-connect should pick up where it left off)
//   - dispose: tears down WS server, ReactiveManager, timers
//
// The bridge mirrors the surface of AnimeCompanionViewProvider that
// extension.ts depends on (postMessage, updatePomodoroTick, refreshView, dispose)
// so the rest of activate() can hand off to either without branching.
export class DesktopPetBridge implements vscode.Disposable {
  private _server: ModelFileServer;
  private _stats: StatsStore;
  private _downloader: ModelDownloader;
  private _desktopPetDownloader: DesktopPetDownloader;
  private _extensionUri: vscode.Uri;

  private _wss: WebSocketServer | null = null;
  private _transport = new WebSocketTransport();
  private _reactive?: ReactiveManager;
  private _resolvedModel: ModelInfo = HIYORI;
  private _token: string;
  private _disposed = false;

  // Sidecar process management.
  private _sidecar: child_process.ChildProcess | null = null;
  private _sidecarRestarts: number[] = [];
  private _sidecarRestartGivenUp = false;
  private static readonly RESTART_WINDOW_MS = 60_000;
  private static readonly RESTART_MAX_IN_WINDOW = 3;

  private _confirmCounter = 0;
  private _pendingConfirms = new Map<string, (approved: boolean) => void>();
  private _pendingInputs = new Map<string, (value: string | undefined) => void>();
  private _transportSubscriptions: vscode.Disposable[] = [];
  private _messageTimer?: NodeJS.Timeout;

  constructor(
    extensionUri: vscode.Uri,
    server: ModelFileServer,
    stats: StatsStore,
    downloader: ModelDownloader,
    desktopPetDownloader: DesktopPetDownloader
  ) {
    this._extensionUri = extensionUri;
    this._server = server;
    this._stats = stats;
    this._downloader = downloader;
    this._desktopPetDownloader = desktopPetDownloader;
    this._token = crypto.randomBytes(32).toString('hex');
  }

  get token(): string {
    return this._token;
  }

  private _getDesktopCompanionSetting<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const currentKey = `desktopCompanion.${key}`;
    const legacyKey = `desktopPet.${key}`;
    const currentInspect = config.inspect<T>(currentKey);
    if (
      currentInspect?.globalValue !== undefined ||
      currentInspect?.workspaceValue !== undefined ||
      currentInspect?.workspaceFolderValue !== undefined
    ) {
      return config.get<T>(currentKey, defaultValue);
    }

    const legacyInspect = config.inspect<T>(legacyKey);
    if (
      legacyInspect?.globalValue !== undefined ||
      legacyInspect?.workspaceValue !== undefined ||
      legacyInspect?.workspaceFolderValue !== undefined
    ) {
      return config.get<T>(legacyKey, defaultValue);
    }

    return config.get<T>(currentKey, defaultValue);
  }

  // Full WS URL the sidecar (or Chrome dev test) should connect to. Only valid
  // after `start()` resolves.
  get connectUrl(): string {
    return `ws://127.0.0.1:${this._server.port}/ws?token=${this._token}`;
  }

  // Bootstrap URL — open this in Chrome to verify the bridge end-to-end
  // without needing a Tauri build (Phase B test gate).
  get bootstrapUrl(): string {
    return `http://127.0.0.1:${this._server.port}/desktop-pet/index.html?token=${this._token}`;
  }

  start(): void {
    if (this._wss) return;
    const httpServer = this._server.httpServer;
    if (!httpServer) {
      throw new Error('ModelFileServer must be started before DesktopPetBridge');
    }

    this._wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      const url = req.url || '';
      // Only handle our endpoint; let other upgrades fail closed.
      if (!url.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      const params = new URL(url, 'http://127.0.0.1').searchParams;
      if (params.get('token') !== this._token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this._wss!.handleUpgrade(req, socket as any, head, (ws) => {
        this._onClientConnected(ws);
      });
    });

    log(`DesktopPetBridge listening at ${this.connectUrl}`);

    // Spawn the Tauri sidecar. If the binary isn't available, leave the WS
    // server running so the user can open the bootstrap URL in Chrome
    // instead — useful for dev / Phase B verification.
    void this._spawnSidecar();
  }

  private _onClientConnected(ws: WebSocket) {
    log('DesktopPetBridge: client connected');

    // One-at-a-time policy. If a stale client is still attached, drop it so
    // a refresh/reload always wins.
    this._transport.attach(ws);

    this._disposeTransportSubscriptions();
    this._transportSubscriptions.push(this._transport.onMessage((message) => {
      dispatchRuntimeMessage(message, {
        postMessage: (msg) => this.postMessage(msg),
        sendBubble: (text, options) => this._sendMessage(text, options),
        refresh: () => this.refreshView(),
        pendingConfirms: this._pendingConfirms,
        pendingInputs: this._pendingInputs,
        requestProtectedBranchConfirm: (branch) => this._requestProtectedBranchConfirm(branch),
        requestStageAllConfirm: (count) => this._requestStageAllConfirm(count),
        requestCommitMessage: (count) => this._requestCommitMessage(count),
        onInteraction: () => this._startMessageTimer(10000),
        getCustomAmbientTracks: () => this._getCustomAmbientTracks(),
        // Bridge mode: drag inside the floating window calls Tauri's
        // startDragging which moves the OS window. The runtime won't fire
        // setCompanionPosition in that path, but if it ever does we just
        // ignore it — the source of truth here is the OS window position.
        saveCompanionPosition: undefined,
        applyModelSelection: async (modelId) => {
          await vscode.workspace
            .getConfiguration('animeCompanion')
            .update('desktopCompanion.model', modelId, vscode.ConfigurationTarget.Global);
        },
      });
    }));

    this._transportSubscriptions.push(this._transport.onVisibilityChange((visible) => {
      if (visible) {
        this._startMessageTimer();
      } else {
        this._stopMessageTimer();
        this._pendingConfirms.clear();
        this._pendingInputs.clear();
      }
    }));

    // Start reactive once. It listens to VS Code events that fire whether or
    // not the sidecar is connected; messages are simply dropped by the
    // transport while disconnected. Recreating per-connect would risk
    // duplicate event handlers.
    if (!this._reactive) {
      this._reactive = new ReactiveManager(
        (phrase, motion) => {
          this._sendResolvedPhrase(phrase);
          if (motion) {
            this.postMessage({ command: 'playMotion', group: motion });
          }
        },
        (mood) => {
          this.postMessage({ command: 'setMood', mood });
        },
        this._stats
      );
      this._reactive.activate();
    }

    // Send init payload so the runtime can render. Resolve model first
    // (downloading if needed) so PIXI's loader doesn't 404.
    void this.refreshView().then(() => {
      setTimeout(() => {
        this._sendMessage(getMessageBank().pick('greeting'));
      }, 4000);
    });

    this._startMessageTimer();
  }

  // Public API mirroring AnimeCompanionViewProvider so extension.ts can hand
  // off pomodoro broadcasts to whichever host is active.

  public postMessage(message: any): void {
    this._transport.post(message);
  }

  public updatePomodoroTick(state: PomodoroState, secondsLeft: number, totalSeconds: number) {
    this.postMessage({ command: 'pomodoroTick', state, secondsLeft, totalSeconds });
  }

  // Re-resolve model + ambient registrations and broadcast a fresh init
  // payload. Called on initial connect and on config changes that would
  // otherwise require a webview HTML re-render.
  public async refreshView(): Promise<void> {
    this._resolvedModel = await this._resolveModel();
    const initPayload = this._buildInitPayload();
    this.postMessage({ command: 'init', state: initPayload });
  }

  // Kill the current sidecar process and spawn a fresh one. Used when settings
  // that the sidecar reads only at startup (env vars like ANIME_PET_CLICK_THROUGH)
  // change — avoids a full VS Code window reload. The previous restart-rate
  // counter is reset so a manual restart never trips the rapid-crash guard.
  public restartSidecar(): void {
    if (this._disposed) return;
    log('DesktopPet: restarting sidecar to apply config change');
    this._sidecarRestarts = [];
    this._sidecarRestartGivenUp = false;
    this._killSidecar();
    // Give the OS a beat to release the window/binary handle before respawn.
    setTimeout(() => void this._spawnSidecar(), 200);
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._killSidecar();
    this._stopMessageTimer();
    this._reactive?.dispose();
    this._reactive = undefined;
    this._disposeTransportSubscriptions();
    this._transport.dispose();
    if (this._wss) {
      this._wss.close();
      this._wss = null;
    }
    this._pendingConfirms.clear();
    this._pendingInputs.clear();
    this._server.clearAmbientTracks();
  }

  // ─── Sidecar process ───────────────────────────────────────────────────

  // Resolve which binary to spawn. Order:
  //   1. animeCompanion.desktopCompanion.devBinaryPath (if set + exists)
  //   2. {globalStorage}/desktop-pet/<version>/<platform>/<exeName> (download cache)
  //   3. {extensionUri}/desktop-pet/target/release/<exeName> (local build fallback)
  // Returns null if none exist; caller logs a fallback hint.
  private _resolveSidecarBinary(platformId: string): string | null {
    const exeName = process.platform === 'win32' ? 'anime-companion-pet.exe' : 'anime-companion-pet';

    const devPath = this._getDesktopCompanionSetting('devBinaryPath', '').trim();
    if (devPath && this._isFile(devPath)) {
      return devPath;
    }

    const cached = this._desktopPetDownloader.getCachedBinaryPath(platformId);
    if (this._isFile(cached)) {
      return cached;
    }

    const localBuild = path.join(
      this._extensionUri.fsPath,
      'desktop-pet',
      'target',
      'release',
      exeName
    );
    if (this._isFile(localBuild)) {
      return localBuild;
    }

    return null;
  }

  private _isFile(p: string): boolean {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  // Returns the cache subdir name we'll use in Phase D, or null if the
  // current platform isn't supported.
  private _platformId(): string | null {
    if (process.platform === 'win32' && process.arch === 'x64') return 'win-x64';
    return null;
  }

  private async _spawnSidecar(): Promise<void> {
    if (this._disposed || this._sidecar || this._sidecarRestartGivenUp) return;

    const platformId = this._platformId();
    if (!platformId) {
      log(
        `DesktopPet: platform ${process.platform}/${process.arch} not supported in v1 — ` +
          `Windows-only. Use the bootstrap URL in Chrome to test: ${this.bootstrapUrl}`
      );
      return;
    }

    let binary = this._resolveSidecarBinary(platformId);
    if (!binary) {
      try {
        binary = await this._desktopPetDownloader.ensureSidecar(platformId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`DesktopPet: sidecar download failed — ${msg}`);
        void vscode.window.showErrorMessage(
          `Anime Companion couldn't download Desktop Companion (${msg}).`
        );
        return;
      }
    }

    if (!binary) {
      log(
        `DesktopPet: sidecar binary still not found after cache + local fallback. ` +
          `Set animeCompanion.desktopCompanion.devBinaryPath or verify the published zip. ` +
          `Open this URL in Chrome to test the bridge in the meantime: ${this.bootstrapUrl}`
      );
      return;
    }

    log(`DesktopPet: spawning sidecar ${binary}`);
    try {
      const proc = child_process.spawn(binary, [], {
        env: {
          ...process.env,
          ANIME_PET_PORT: String(this._server.port),
          ANIME_PET_TOKEN: this._token,
          ANIME_PET_CLICK_THROUGH: String(
            this._getDesktopCompanionSetting('clickThrough', false)
          ),
        },
        // detached:false so the OS reaps the child if extension crashes;
        // stdio piped so we can surface panics/logs to our output channel.
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this._sidecar = proc;

      proc.stdout?.on('data', (chunk: Buffer) => {
        log(`[sidecar stdout] ${chunk.toString().trimEnd()}`);
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        log(`[sidecar stderr] ${chunk.toString().trimEnd()}`);
      });

      proc.on('exit', (code, signal) => {
        const wasOurs = this._sidecar === proc;
        if (wasOurs) {
          this._sidecar = null;
        }
        log(`DesktopPet: sidecar exited code=${code} signal=${signal}`);

        if (this._disposed || !wasOurs) return;

        // Auto-restart on unexpected exit, capped to avoid crash loops.
        const now = Date.now();
        this._sidecarRestarts = this._sidecarRestarts.filter(
          (t) => now - t < DesktopPetBridge.RESTART_WINDOW_MS
        );
        this._sidecarRestarts.push(now);

        if (this._sidecarRestarts.length > DesktopPetBridge.RESTART_MAX_IN_WINDOW) {
          this._sidecarRestartGivenUp = true;
          log('DesktopPet: too many restarts, giving up. Disable + re-enable the setting to retry.');
          void vscode.window
            .showErrorMessage(
              'Anime Companion: Desktop Companion keeps crashing. Disabled auto-restart for this session.',
              'Disable Desktop Companion'
            )
            .then((choice) => {
              if (choice === 'Disable Desktop Companion') {
                void vscode.workspace
                  .getConfiguration('animeCompanion')
                  .update('desktopCompanion.enabled', false, vscode.ConfigurationTarget.Global);
              }
            });
          return;
        }

        // Brief backoff so we don't hammer if the binary fails immediately.
        setTimeout(() => void this._spawnSidecar(), 1000);
      });

      proc.on('error', (err) => {
        log(`DesktopPet: spawn error ${err instanceof Error ? err.message : String(err)}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`DesktopPet: failed to spawn sidecar — ${msg}`);
    }
  }

  private _killSidecar(): void {
    if (!this._sidecar) return;
    const proc = this._sidecar;
    this._sidecar = null;
    try {
      proc.kill();
    } catch {
      // process may already be gone
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private async _resolveModel(): Promise<ModelInfo> {
    const requested = getSelectedModel('desktop');
    if (requested.customRoot) {
      this._server.addRoot(requested.customRoot);
      return requested;
    }
    if (requested.bundled || this._downloader.isModelCached(requested.folder, requested.file)) {
      if (!requested.bundled) {
        this._server.addRoot(this._downloader.cacheRoot);
      }
      return requested;
    }

    try {
      await this._downloader.ensureModel(requested);
      this._server.addRoot(this._downloader.cacheRoot);
      return requested;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`ModelDownloader: ensure failed for "${requested.id}": ${msg}`);
      vscode.window.showWarningMessage(
        `Couldn't download model "${requested.name}" — falling back to Hiyori. (${msg})`
      );
      return HIYORI;
    }
  }

  // Build the same `window.__*__` bag of state the panel injects via its HTML
  // template, packaged as a flat init payload over WS.
  private _buildInitPayload(): Record<string, unknown> {
    const port = this._server.port;
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const configuredVoiceLanguage = config.get<string>('voiceLanguage') || 'ja';
    const voiceLanguage = configuredVoiceLanguage === 'ja-vi' ? 'en' : configuredVoiceLanguage;
    const messageLanguage = config.get<string>('messageLanguage', 'vi');
    const muted = config.get<boolean>('muted', false);

    const customAmbientTracks = this._getCustomAmbientTracks();
    const ambientPreset = getAmbientPreset(config.get<string>('ambientPreset', 'off'), customAmbientTracks);
    const ambientVolume = config.get<number>('ambientVolume', 30);

    // Re-register ambient tracks each refresh so URLs stay stable across
    // config changes. /ambient/<id> resolves through the bridge's registry.
    this._server.clearAmbientTracks();
    const builtinAmbientDir = path.join(this._extensionUri.fsPath, 'media', 'ambient');
    const ambientTracks = listAmbientPresets(customAmbientTracks).map((preset) => ({
      ...preset,
      url: this._registerAmbientUrl(preset, builtinAmbientDir, port),
    }));

    const visibleModels = listVisibleModels().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    }));

    return {
      modelUrl: `http://127.0.0.1:${port}/${this._resolvedModel.folder}/${this._resolvedModel.file}`,
      modelId: this._resolvedModel.id,
      audioBaseUrl: `http://127.0.0.1:${port}/audio/${voiceLanguage}`,
      voiceLanguage,
      messageLanguage,
      muted,
      clickThrough: this._getDesktopCompanionSetting('clickThrough', false),
      ambientPreset: ambientPreset.id,
      ambientVolume,
      ambientTracks,
      visibleModels,
      webviewStrings: getMessageBank().getWebviewStrings(),
    };
  }

  // Resolve a track to a URL the runtime can fetch over HTTP.
  // - remoteUrl: pass through (Tauri can fetch external URLs).
  // - filename: register file under media/ambient as /ambient/<id>.
  // - localPath: register the absolute path as /ambient/<id>.
  // Returns undefined if the file isn't valid (matches existing panel behavior).
  private _registerAmbientUrl(preset: AmbientPreset, builtinDir: string, port: number): string | undefined {
    if (preset.remoteUrl) {
      return preset.remoteUrl;
    }
    if (preset.filename) {
      const abs = path.join(builtinDir, preset.filename);
      if (fs.existsSync(abs)) {
        this._server.registerAmbientTrack(preset.id, abs);
        return `http://127.0.0.1:${port}/ambient/${encodeURIComponent(preset.id)}`;
      }
      return undefined;
    }
    if (preset.localPath) {
      this._server.registerAmbientTrack(preset.id, preset.localPath);
      return `http://127.0.0.1:${port}/ambient/${encodeURIComponent(preset.id)}`;
    }
    return undefined;
  }

  private _getCustomAmbientTracks(): AmbientPreset[] {
    const rawTracks = vscode.workspace.getConfiguration('animeCompanion').get<unknown>('customAmbientTracks', []);
    return resolveCustomAmbientTracks(rawTracks).filter((track) => {
      if (!track.localPath) {
        return false;
      }
      try {
        return fs.existsSync(track.localPath) && fs.statSync(track.localPath).isFile();
      } catch {
        return false;
      }
    });
  }

  private _sendMessage(text: string, options?: { speak?: boolean }) {
    this.postMessage({
      command: 'showMessage',
      text,
      speakText: options?.speak ? text : undefined,
    });
  }

  private _sendResolvedPhrase(phrase: ResolvedPhrase) {
    if (!phrase.text) return;
    const shouldSpeak =
      phrase.fromCustom ||
      phrase.hasPlaceholders ||
      Object.keys(phrase.vars ?? {}).length > 0;

    this.postMessage({
      command: 'showMessage',
      text: phrase.text,
      speakText: shouldSpeak ? phrase.text : undefined,
      phraseKey: phrase.key,
      phraseTemplate: phrase.template,
      phraseVars: phrase.vars,
    });
  }

  private _requestProtectedBranchConfirm(branch: string): Promise<boolean> {
    return this._requestConfirmDialog('showProtectedBranchConfirm', { branch });
  }

  private _requestStageAllConfirm(unstagedCount: number): Promise<boolean> {
    return this._requestConfirmDialog('showStageAllConfirm', { unstagedCount });
  }

  private _requestCommitMessage(stagedCount: number): Promise<string | undefined> {
    const requestId = `input-${++this._confirmCounter}`;
    return new Promise<string | undefined>((resolve) => {
      this._pendingInputs.set(requestId, resolve);
      this.postMessage({
        command: 'showCommitMessageInput',
        requestId,
        stagedCount,
      });
    });
  }

  private _requestConfirmDialog(command: string, payload: Record<string, unknown>): Promise<boolean> {
    const requestId = `confirm-${++this._confirmCounter}`;
    return new Promise<boolean>((resolve) => {
      this._pendingConfirms.set(requestId, resolve);
      this.postMessage({
        command,
        requestId,
        ...payload,
      });
    });
  }

  private _startMessageTimer(forceDelayMs?: number) {
    this._stopMessageTimer();
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const minInterval = config.get<number>('messageIntervalMin', 10);
    const maxInterval = config.get<number>('messageIntervalMax', 20);

    const scheduleNext = () => {
      const delay = (minInterval + Math.random() * (maxInterval - minInterval)) * 1000;
      this._messageTimer = setTimeout(() => {
        this._sendMessage(this._pickIdle());
        scheduleNext();
      }, delay);
    };

    if (forceDelayMs) {
      this._messageTimer = setTimeout(() => {
        this._sendMessage(this._pickIdle());
        scheduleNext();
      }, forceDelayMs);
    } else {
      scheduleNext();
    }
  }

  private _stopMessageTimer() {
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
      this._messageTimer = undefined;
    }
  }

  private _pickIdle(): string {
    const key: MessageKey = 'idle';
    return getMessageBank().pick(key);
  }

  private _disposeTransportSubscriptions() {
    while (this._transportSubscriptions.length) {
      this._transportSubscriptions.pop()?.dispose();
    }
  }
}
