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
import { AchievementRarity, buildAchievementPanelData, ShowcaseView, StatsStore } from './stats';

const SHOWCASE_RARITY_EMOJI: Record<AchievementRarity, string> = {
  common: '✨',
  rare: '💎',
  epic: '🌟',
  legendary: '👑',
  mythic: '🔥',
};
import { PomodoroState } from './pomodoro';
import { AmbientPreset, getAmbientPreset, listAmbientPresets, resolveCustomAmbientTracks } from './ambient-presets';
import { WebviewTransport } from './companion-transport';
import { dispatchRuntimeMessage } from './companion-message-dispatcher';
import { getStoredPanelPosition, savePanelPosition } from './companion-position';
import { setWorkspaceModel } from './models';
import { ChatManager } from './chat/chat-manager';
import type { CursorChibiTuningState } from './cursor-chibi';

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
  private _chatManager?: ChatManager;
  private _agentProfileManager?: import('./agent-profiles/profile-manager').AgentProfileManager;

  public setAgentProfileManager(manager: import('./agent-profiles/profile-manager').AgentProfileManager): void {
    this._agentProfileManager = manager;
  }
  private _chibiRoot?: string;
  private _getCursorChibiState?: () => CursorChibiTuningState;
  private _nudgeCursorChibi?: (dx: number, dy: number) => Promise<void>;
  private _nudgeCursorChibiSize?: (delta: number) => Promise<void>;
  private _resetCursorChibi?: () => Promise<void>;

  constructor(
    extensionUri: vscode.Uri,
    server: ModelFileServer,
    stats: StatsStore,
    downloader: ModelDownloader,
    voiceAssets: VoiceAssetDownloader,
    saveCapturedChibi?: (modelId: string, dataUrl: string) => Promise<void>,
    chatManager?: ChatManager,
    chibiRoot?: string,
    getCursorChibiState?: () => CursorChibiTuningState,
    nudgeCursorChibi?: (dx: number, dy: number) => Promise<void>,
    nudgeCursorChibiSize?: (delta: number) => Promise<void>,
    resetCursorChibi?: () => Promise<void>
  ) {
    this._extensionUri = extensionUri;
    this._server = server;
    this._stats = stats;
    this._downloader = downloader;
    this._voiceAssets = voiceAssets;
    this._saveCapturedChibi = saveCapturedChibi;
    this._chatManager = chatManager;
    this._chibiRoot = chibiRoot;
    this._getCursorChibiState = getCursorChibiState;
    this._nudgeCursorChibi = nudgeCursorChibi;
    this._nudgeCursorChibiSize = nudgeCursorChibiSize;
    this._resetCursorChibi = resetCursorChibi;
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

  private _applyShowcaseToNativeTitle(): ShowcaseView | null {
    const showcase = this._stats.getShowcase();
    if (!this._view) return showcase;
    if (showcase) {
      const emoji = SHOWCASE_RARITY_EMOJI[showcase.rarity];
      // Replace the view title outright with the showcased achievement.
      this._view.title = `${emoji} ${showcase.title}`;
    } else {
      // Restore the default contributed title ("Anime Companion").
      this._view.title = undefined;
    }
    this._view.description = undefined;
    return showcase;
  }

  private _broadcastShowcase(showcase: ShowcaseView | null): void {
    this.postMessage({ command: 'setShowcase', showcase });
  }

  public applyShowcase(): void {
    const showcase = this._applyShowcaseToNativeTitle();
    this._broadcastShowcase(showcase);
  }

  public showAchievementsPanel(): boolean {
    if (!this._view || !this._view.visible) return false;

    this.postMessage({
      command: 'setAchievementsData',
      achievements: this._getAchievementPanelData(),
    });
    this.postMessage({ command: 'showAchievementsPanel' });
    return true;
  }

  public openShareCardPreview(profile: unknown): void {
    if (!this._view) {
      throw new Error('Companion panel is not ready. Open Anime Companion first.');
    }
    this.postMessage({ command: 'openShareCardPreview', profile });
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
    this._applyShowcaseToNativeTitle();

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
      this._stats,
      (payload) => {
        for (const def of payload.achievements ?? []) {
          this.postMessage({ command: 'achievementUnlocked', achievement: { id: def.id, title: def.title, rarity: def.rarity, secret: def.secret } });
        }
        for (const quest of payload.quests ?? []) {
          this.postMessage({ command: 'achievementUnlocked', quest: { id: quest.id, title: quest.title, period: quest.period, rarity: quest.period === 'daily' ? 'rare' : 'epic' } });
        }
        this.postMessage({
          command: 'setAchievementsData',
          achievements: this._getAchievementPanelData(),
        });
      }
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
        stats: this._stats,
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
        nudgeCursorChibi: (dx, dy) => this._nudgeCursorChibi?.(dx, dy) ?? Promise.resolve(),
        nudgeCursorChibiSize: (delta) => this._nudgeCursorChibiSize?.(delta) ?? Promise.resolve(),
        resetCursorChibi: () => this._resetCursorChibi?.() ?? Promise.resolve(),
        saveCapturedChibi: this._saveCapturedChibi,
        chatManager: this._chatManager,
        applyShowcase: () => this.applyShowcase(),
        agentProfileManager: this._agentProfileManager,
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

  private _pickIdle(): string {
    const memory = Math.random() < 0.28 ? this._stats.pickMemoryLine() : null;
    return memory || this._pickMessage('idle');
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

    // Captured chibi PNGs (per-model) live under globalStorageUri/cursor-chibi.
    // Adding this dir as a resource root lets the chat panel render the chibi
    // as the assistant avatar.
    if (this._chibiRoot) {
      const key = this._chibiRoot.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        roots.push(vscode.Uri.file(this._chibiRoot));
      }
    }

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

  // Returns the webview URL for the captured chibi PNG for the given model,
  // or undefined if the user hasn't captured one yet. Falls back to the
  // bundled character.png on the JS side.
  private _resolveChibiAvatarUrl(webview: vscode.Webview, modelId: string): string | undefined {
    if (!this._chibiRoot) return undefined;
    const filePath = path.join(this._chibiRoot, `${modelId}.png`);
    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined;
    } catch {
      return undefined;
    }
    return webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
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

  private _getAchievementPanelData() {
    return buildAchievementPanelData(this._stats.getStats());
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const mediaUri = (...segments: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', ...segments));

    const cssUri = mediaUri('companion.css');
    const chatCssUri = mediaUri('webview', 'chat.css');
    const chibiCssUri = mediaUri('webview', 'cursor-chibi.css');
    const characterUri = mediaUri('character.png');
    const pixiUri = mediaUri('lib', 'pixi.min.js');
    const cubismCoreUri = mediaUri('lib', 'live2dcubismcore.min.js');
    const cubism4Uri = mediaUri('lib', 'cubism4.min.js');
    const webviewScriptUri = mediaUri('webview', 'main.js');
    const chatScriptUri = mediaUri('webview', 'chat.js');

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
    const focusFollow = config.get<boolean>('focusFollow.enabled', false);
    const customAmbientTracks = this._getCustomAmbientTracks();
    const ambientPreset = getAmbientPreset(config.get<string>('ambientPreset', 'off'), customAmbientTracks);
    const ambientVolume = config.get<number>('ambientVolume', 30);
    const ambientTracks = listAmbientPresets(customAmbientTracks).map((preset) => ({
      ...preset,
      url: this._ambientTrackUrl(webview, preset),
    }));
    const webviewStrings = getMessageBank().getWebviewStrings();
    const cursorChibiState = this._getCursorChibiState?.() ?? {
      enabled: config.get<boolean>('cursorChase.enabled', false),
      offsetX: config.get<number>('cursorChase.offsetX', 0),
      offsetY: config.get<number>('cursorChase.offsetY', 0),
      sizePx: config.get<number>('cursorChase.sizePx', 0),
    };
    // Slim down to only what the picker UI needs.
    const visibleModels = listVisibleModels().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    }));
    const achievements = this._getAchievementPanelData();

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
  <link rel="stylesheet" href="${chatCssUri}">
  <link rel="stylesheet" href="${chibiCssUri}">
</head>
<body>
  <div class="companion-container">
    <div id="companion-showcase-banner" class="companion-showcase hidden" aria-live="polite"></div>

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

    <button id="chatToggleBtn" class="chat-toggle-btn" title="Open chat" aria-label="Open chat">💬</button>

    <!-- Cursor chibi position tuning UI. Owns its own class prefix (chibi-orb-)
         and its own stylesheet (media/webview/cursor-chibi.css) so it never
         shares CSS rules with the chat panel. Touching chat.css must NEVER
         affect these elements. -->
    <div class="chibi-orb-shell chibi-orb-shell-floating" id="cursorOrbShell" hidden>
      <button
        id="cursorModelOrb"
        class="chibi-orb-trigger"
        title="Cursor chibi position controls"
        aria-label="Cursor chibi position controls"
        aria-expanded="false"
      >
        <span class="chibi-orb-kicker">Model</span>
        <span class="chibi-orb-name" id="cursorModelOrbName">default</span>
        <span class="chibi-orb-summary" id="cursorOrbSummary">x 0 · y 0</span>
      </button>
      <div id="cursorOrbPanel" class="chibi-orb-panel" hidden>
        <button type="button" class="chibi-orb-node up" data-cursor-action="up" title="Move up">&uarr;</button>
        <button type="button" class="chibi-orb-node right" data-cursor-action="right" title="Move right">&rarr;</button>
        <button type="button" class="chibi-orb-node down" data-cursor-action="down" title="Move down">&darr;</button>
        <button type="button" class="chibi-orb-node left" data-cursor-action="left" title="Move left">&larr;</button>
        <button type="button" class="chibi-orb-node center" data-cursor-action="reset" title="Reset cursor chibi tuning">&#8634;</button>
        <div class="chibi-orb-card">
          <div class="chibi-orb-stats" id="cursorOrbStats">x 0 · y 0 · 12px</div>
          <div class="chibi-orb-size">
            <button type="button" class="chibi-orb-size-btn" data-cursor-action="size-down" title="Smaller">&#8722;</button>
            <span class="chibi-orb-size-label">Size</span>
            <button type="button" class="chibi-orb-size-btn" data-cursor-action="size-up" title="Bigger">+</button>
          </div>
          <button type="button" class="chibi-orb-done-btn" data-cursor-action="done">Done</button>
        </div>
      </div>
    </div>

    <div id="chatPanel" class="chat-panel" hidden>
      <header class="chat-panel-header">
        <div class="chat-panel-header-row chat-panel-header-main">
          <button id="chatListToggleBtn" class="chat-icon-btn" title="Conversations">☰</button>
          <div class="chat-panel-title" id="chatPanelTitle">Chat</div>
          <button id="chatSettingsBtn" class="chat-icon-btn" title="Provider & model" aria-label="Toggle provider & model" aria-expanded="false">⚙</button>
          <button id="chatSetKeyBtn" class="chat-icon-btn chat-icon-btn-key" title="Set API key" aria-label="Set API key">🔑</button>
          <button id="chatCloseBtn" class="chat-icon-btn" title="Close chat" aria-label="Close chat">✕</button>
        </div>
        <div class="chat-panel-header-row chat-panel-header-meta" hidden>
          <select
            id="chatProvider"
            class="chat-select"
            title="LLM provider — the AI service that answers your messages (separate from the Live2D character)"
          ></select>
          <div class="chat-model-combo" id="chatModelCombo">
            <input
              id="chatModel"
              class="chat-input-model"
              placeholder="AI model id"
              spellcheck="false"
              autocomplete="off"
              title="AI model id for the current provider. Click to pick from suggestions or type a custom id. This is the language model — NOT the Live2D anime character."
            />
            <button
              type="button"
              id="chatModelComboBtn"
              class="chat-model-combo-btn"
              tabindex="-1"
              title="Show available models"
              aria-label="Show available models"
            >▾</button>
            <ul
              id="chatModelComboList"
              class="chat-model-combo-list"
              role="listbox"
              hidden
            ></ul>
          </div>
        </div>
        <div class="chat-panel-header-row chat-panel-header-account">
          <button
            type="button"
            id="chatCopilotAccountBtn"
            class="chat-account-btn"
            title="Choose which GitHub account Anime Companion should use for Copilot"
            hidden
          >GitHub account</button>
        </div>
      </header>

      <div class="chat-panel-body">
        <div id="chatSidebar" class="chat-sidebar" hidden>
          <div class="chat-sidebar-header">
            <button id="chatNewBtn" class="chat-btn-primary" style="flex:1">＋ New chat</button>
            <button id="chatSidebarCloseBtn" class="chat-icon-btn" title="Close conversation list" aria-label="Close conversation list">✕</button>
          </div>
          <div id="chatConvList" class="chat-conv-list" role="listbox"></div>
        </div>

        <div id="chatLog" class="chat-log" aria-live="polite"></div>
        <div id="chatStatus" class="chat-status" hidden></div>
        <form id="chatForm" class="chat-form">
        <div id="chatInfoRow" class="chat-info-row">
          <span id="chatStagedSelection" class="chat-chip-staged" hidden>
            <span class="chat-chip-staged-label"></span>
            <button type="button" class="chat-chip-staged-clear" title="Clear staged selection">×</button>
          </span>
          <span id="chatTokenTotal" class="chat-token-total" hidden></span>
        </div>
        <div class="chat-input-wrap">
          <textarea id="chatTextarea" rows="2" placeholder="Ask the companion… (Enter to send, Shift+Enter for newline, # for file)" spellcheck="false"></textarea>
          <div id="chatMentionPicker" class="chat-mention-picker" hidden role="listbox"></div>
        </div>
        <div class="chat-form-actions">
          <button
            type="button"
            id="chatChipSelection"
            class="chat-icon-toggle"
            title="Attach editor selection to your next message"
            aria-pressed="false"
            aria-label="Include editor selection"
          >📌</button>
          <button
            type="button"
            id="chatChipActiveFile"
            class="chat-icon-toggle"
            title="Attach the whole active file to your next message"
            aria-pressed="false"
            aria-label="Include active file"
          >📄</button>
          <span class="chat-actions-spacer"></span>
          <button type="button" id="chatCancelBtn" class="chat-btn-secondary" hidden>Stop</button>
          <button type="submit" id="chatSendBtn" class="chat-btn-primary">Send</button>
        </div>
      </form>
      </div>
    </div>
  </div>

  <script>
    window.__MODEL_URL__ = "${modelUrl}";
    window.__MODEL_ID__ = "${selectedModel.id}";
    window.__AUDIO_BASE_URL__ = "${audioBaseUri}";
    window.__VOICE_LANGUAGE__ = "${voiceLanguage}";
    window.__MESSAGE_LANGUAGE__ = "${messageLanguage}";
    window.__AUDIO_MUTED__ = ${muted ? 'true' : 'false'};
    window.__FOCUS_FOLLOW__ = ${focusFollow ? 'true' : 'false'};
    window.__AMBIENT_PRESET__ = "${ambientPreset.id}";
    window.__AMBIENT_VOLUME__ = ${ambientVolume};
    window.__AMBIENT_TRACKS__ = ${JSON.stringify(ambientTracks)};
    window.__VISIBLE_MODELS__ = ${JSON.stringify(visibleModels)};
    window.__ACHIEVEMENTS__ = ${JSON.stringify(achievements)};
    window.__SHOWCASE__ = ${JSON.stringify(achievements.showcase)};
    window.__WEBVIEW_STRINGS__ = ${JSON.stringify(webviewStrings)};
    window.__COMPANION_POSITION__ = ${JSON.stringify(getStoredPanelPosition() ?? null)};
    window.__COMPANION_AVATAR_DEFAULT__ = "${characterUri}";
    window.__COMPANION_AVATAR_CHIBI__ = ${JSON.stringify(this._resolveChibiAvatarUrl(webview, selectedModel.id))};
    window.__COMPANION_AVATAR__ = window.__COMPANION_AVATAR_CHIBI__ || window.__COMPANION_AVATAR_DEFAULT__;
    window.__COMPANION_DISPLAY_NAME__ = ${JSON.stringify(selectedModel.name)};
    window.__CURSOR_CHIBI_STATE__ = ${JSON.stringify(cursorChibiState)};
  </script>

  <script src="${cubismCoreUri}"></script>
  <script src="${pixiUri}"></script>
  <script src="${cubism4Uri}"></script>
  <script type="module" src="${webviewScriptUri}"></script>
  <script type="module" src="${chatScriptUri}"></script>
</body>
</html>`;
  }
}
