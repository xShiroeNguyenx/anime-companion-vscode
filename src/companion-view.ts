import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReactiveManager } from './reactive';
import { log } from './log';
import { getSelectedModel, HIYORI, ModelInfo, listVisibleModels } from './models';
import { ModelFileServer } from './model-server';
import { ModelDownloader } from './model-downloader';
import { VoiceAssetDownloader, VoiceAssetLang } from './voice-asset-downloader';
import { getMessageBank, MessageKey, ResolvedPhrase } from './messages';
import { StatsStore } from './stats';
import { PomodoroState } from './pomodoro';
import { AmbientPreset, getAmbientPreset, listAmbientPresets, resolveCustomAmbientTracks } from './ambient-presets';
import { WebviewTransport } from './companion-transport';
import { dispatchRuntimeMessage } from './companion-message-dispatcher';
import { getStoredPanelPosition, savePanelPosition } from './companion-position';
import { setWorkspaceModel } from './models';

export class AnimeCompanionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'animeCompanion.live2dView';

  private _view?: vscode.WebviewView;
  private _transport = new WebviewTransport();
  private _messageTimer?: NodeJS.Timeout;
  private _extensionUri: vscode.Uri;
  private _server: ModelFileServer;
  private _stats: StatsStore;
  private _downloader: ModelDownloader;
  private _voiceAssets: VoiceAssetDownloader;
  private _resolvedModel: ModelInfo = HIYORI;
  private _resolvedVoiceAssetDir: string | null = null;
  private _reactive?: ReactiveManager;
  private _confirmCounter = 0;
  private _pendingConfirms = new Map<string, (approved: boolean) => void>();
  private _pendingInputs = new Map<string, (value: string | undefined) => void>();
  private _transportSubscriptions: vscode.Disposable[] = [];

  private _saveCapturedChibi?: (modelId: string, dataUrl: string) => Promise<void>;

  constructor(
    extensionUri: vscode.Uri,
    server: ModelFileServer,
    stats: StatsStore,
    downloader: ModelDownloader,
    voiceAssets: VoiceAssetDownloader,
    saveCapturedChibi?: (modelId: string, dataUrl: string) => Promise<void>
  ) {
    this._extensionUri = extensionUri;
    this._server = server;
    this._stats = stats;
    this._downloader = downloader;
    this._voiceAssets = voiceAssets;
    this._saveCapturedChibi = saveCapturedChibi;
  }

  // Returns immediately for bundled models. For lazy models, downloads + extracts
  // on first call, then registers the cache root with the file server. On error,
  // falls back to the bundled Hiyori so the view always renders something.
  private async _resolveModel(): Promise<ModelInfo> {
    const requested = getSelectedModel('panel');
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
        `Couldn't download model "${requested.name}" — falling back to Hiyori. (${msg})`,
        'Retry'
      ).then((choice) => {
        if (choice === 'Retry') {
          this.refreshView();
        }
      });
      return HIYORI;
    }
  }

  public updatePomodoroTick(state: PomodoroState, secondsLeft: number, totalSeconds: number) {
    this.postMessage({ command: 'pomodoroTick', state, secondsLeft, totalSeconds });
  }

  public postMessage(message: any) {
    this._transport.post(message);
  }

  public refreshView() {
    if (!this._view) return;
    void this._renderWith(this._view);
  }

  // Resolves (downloading if needed) the requested model, then writes HTML.
  // Webview renders nothing until the model is on disk, so the local server
  // never serves a 404 to PIXI's loader.
  private async _renderWith(webviewView: vscode.WebviewView) {
    this._resolvedModel = await this._resolveModel();
    this._resolvedVoiceAssetDir = await this._resolveVoiceAssetDir();
    const customAmbientTracks = this._getCustomAmbientTracks();
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: this._getWebviewResourceRoots(customAmbientTracks),
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    setTimeout(() => {
      this._sendMessage(this._pickMessage('greeting'));
    }, 4000);
  }

  // Lazy-downloads ElevenLabs-generated MP3s for en/vi the first time they're
  // requested. Returns null on failure or when not applicable; callers fall
  // back to the bundled media/audio/{lang}/ directory.
  private async _resolveVoiceAssetDir(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('animeCompanion');
    if (!config.get<boolean>('voiceAssets.enableExtended', true)) return null;

    const raw = config.get<string>('voiceLanguage') || 'ja';
    const lang = raw === 'ja-vi' ? 'en' : raw;
    if (lang !== 'en' && lang !== 'vi') return null;

    return this._voiceAssets.ensureLanguageAudio(lang as VoiceAssetLang);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    void context;
    void token;
    this._view = webviewView;
    this._transport.attach(webviewView);

    void this._renderWith(webviewView);

    this._startMessageTimer();

    this._reactive?.dispose();
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
        saveCompanionPosition: (x, y) => { void savePanelPosition(x, y); },
        applyModelSelection: async (modelId) => {
          const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
          if (hasWorkspace) {
            await setWorkspaceModel(modelId);
            return;
          }
          await vscode.workspace
            .getConfiguration('animeCompanion')
            .update('model', modelId, vscode.ConfigurationTarget.Global);
        },
        saveCapturedChibi: this._saveCapturedChibi,
      });
    }));

    this._transportSubscriptions.push(this._transport.onVisibilityChange((visible) => {
      if (visible) {
        this._startMessageTimer();
      } else {
        this._stopMessageTimer();
      }
    }));

    webviewView.onDidDispose(() => {
      this._stopMessageTimer();
      this._reactive?.dispose();
      this._pendingConfirms.clear();
      this._pendingInputs.clear();
      this._disposeTransportSubscriptions();
      this._view = undefined;
    });

    // Random reaction when active editor changes - comments on file type
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && this._view?.visible && Math.random() < 0.15) {
        const fileName = path.basename(editor.document.fileName);
        const ext = path.extname(fileName);
        this._sendMessage(getMessageBank().pickFileMessage(ext, fileName), {
          speak: true,
        });
      }
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
        this._sendMessage(this._pickMessage('idle'));
        scheduleNext();
      }, delay);
    };

    if (forceDelayMs) {
      this._messageTimer = setTimeout(() => {
        this._sendMessage(this._pickMessage('idle'));
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

  private _sendMessage(text: string, options?: { speak?: boolean }) {
    this.postMessage({
      command: 'showMessage',
      text,
      speakText: options?.speak ? text : undefined,
    });
  }

  private _sendResolvedPhrase(phrase: ResolvedPhrase) {
    if (!phrase.text) {
      return;
    }

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

  private _disposeTransportSubscriptions() {
    while (this._transportSubscriptions.length) {
      this._transportSubscriptions.pop()?.dispose();
    }
  }

  private _requestProtectedBranchConfirm(branch: string): Promise<boolean> {
    return this._requestConfirmDialog(
      'showProtectedBranchConfirm',
      {
        branch,
      }
    );
  }

  private _requestStageAllConfirm(unstagedCount: number): Promise<boolean> {
    return this._requestConfirmDialog(
      'showStageAllConfirm',
      {
        unstagedCount,
      }
    );
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

  private _pickMessage(key: MessageKey): string {
    return getMessageBank().pick(key);
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

  private _getWebviewResourceRoots(customAmbientTracks: AmbientPreset[]): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this._extensionUri, 'media')];
    const seen = new Set(roots.map((root) => root.fsPath.toLowerCase()));

    const voiceCacheRoot = this._voiceAssets.cacheRoot;
    if (voiceCacheRoot) {
      const key = voiceCacheRoot.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        roots.push(vscode.Uri.file(voiceCacheRoot));
      }
    }

    for (const track of customAmbientTracks) {
      if (!track.localPath) continue;
      const dir = path.dirname(track.localPath);
      if (!dir) continue;
      const key = dir.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push(vscode.Uri.file(dir));
    }

    return roots;
  }

  private _ambientTrackUrl(webview: vscode.Webview, preset: AmbientPreset): string | undefined {
    if (preset.remoteUrl) {
      return preset.remoteUrl;
    }

    if (preset.filename) {
      return webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'ambient', preset.filename)).toString();
    }

    if (preset.localPath) {
      return webview.asWebviewUri(vscode.Uri.file(preset.localPath)).toString();
    }

    return undefined;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const mediaUri = (...segments: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', ...segments));

    const cssUri = mediaUri('companion.css');
    const characterUri = mediaUri('character.png');
    const pixiUri = mediaUri('lib', 'pixi.min.js');
    const cubismCoreUri = mediaUri('lib', 'live2dcubismcore.min.js');
    const cubism4Uri = mediaUri('lib', 'cubism4.min.js');
    const webviewScriptUri = mediaUri('webview', 'main.js');

    const selectedModel = this._resolvedModel;
    const modelUrl = `http://127.0.0.1:${this._server.port}/${selectedModel.folder}/${selectedModel.file}`;
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const configuredVoiceLanguage = config.get<string>('voiceLanguage') || 'ja';
    const voiceLanguage = configuredVoiceLanguage === 'ja-vi' ? 'en' : configuredVoiceLanguage;
    const audioBaseUri = this._resolvedVoiceAssetDir
      ? webview.asWebviewUri(vscode.Uri.file(this._resolvedVoiceAssetDir))
      : mediaUri('audio', voiceLanguage);
    const messageLanguage = config.get<string>('messageLanguage', 'vi');
    const muted = config.get<boolean>('muted', false);
    const customAmbientTracks = this._getCustomAmbientTracks();
    const ambientPreset = getAmbientPreset(config.get<string>('ambientPreset', 'off'), customAmbientTracks);
    const ambientVolume = config.get<number>('ambientVolume', 30);
    const ambientTracks = listAmbientPresets(customAmbientTracks).map((preset) => ({
      ...preset,
      url: this._ambientTrackUrl(webview, preset),
    }));
    const webviewStrings = getMessageBank().getWebviewStrings();
    // Slim down to only what the picker UI needs.
    const visibleModels = listVisibleModels().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    }));

    return /*html*/ `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} data: blob: http://127.0.0.1:${this._server.port};
    script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline';
    style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
    connect-src ${webview.cspSource} http://127.0.0.1:${this._server.port};
    media-src ${webview.cspSource} https:;
    worker-src ${webview.cspSource} blob:;
    font-src ${webview.cspSource} https://fonts.gstatic.com;
  ">
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div class="companion-container">
    <div class="chat-bubble" id="chatBubble">
      <span class="bubble-text" id="bubbleText">Loading...</span>
      <div class="bubble-tail"></div>
    </div>

    <div class="character-wrapper" id="characterWrapper">
      <canvas id="live2dCanvas" style="display: none;"></canvas>

      <img
        id="fallbackImg"
        src="${characterUri}"
        alt="Anime Companion"
        class="character-img"
        draggable="false"
        style="display: none;"
      />

      <div class="loading" id="loading">
        <div class="loading-spinner"></div>
        <span class="loading-text">Loading Live2D...</span>
      </div>

      <div class="particles" id="particles"></div>
    </div>

    <div class="status-bar">
      <span class="status-dot"></span>
      <span class="status-text">Live2D</span>
    </div>
  </div>

  <script>
    window.__MODEL_URL__ = "${modelUrl}";
    window.__MODEL_ID__ = "${selectedModel.id}";
    window.__AUDIO_BASE_URL__ = "${audioBaseUri}";
    window.__VOICE_LANGUAGE__ = "${voiceLanguage}";
    window.__MESSAGE_LANGUAGE__ = "${messageLanguage}";
    window.__AUDIO_MUTED__ = ${muted ? 'true' : 'false'};
    window.__AMBIENT_PRESET__ = "${ambientPreset.id}";
    window.__AMBIENT_VOLUME__ = ${ambientVolume};
    window.__AMBIENT_TRACKS__ = ${JSON.stringify(ambientTracks)};
    window.__VISIBLE_MODELS__ = ${JSON.stringify(visibleModels)};
    window.__WEBVIEW_STRINGS__ = ${JSON.stringify(webviewStrings)};
    window.__COMPANION_POSITION__ = ${JSON.stringify(getStoredPanelPosition() ?? null)};
  </script>

  <script src="${cubismCoreUri}"></script>
  <script src="${pixiUri}"></script>
  <script src="${cubism4Uri}"></script>
  <script type="module" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }
}
