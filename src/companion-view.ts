import * as vscode from 'vscode';
import * as path from 'path';
import { ReactiveManager } from './reactive';
import { log } from './log';
import { getSelectedModel, setWorkspaceModel, HIYORI, ModelInfo, listVisibleModels } from './models';
import { ModelFileServer } from './model-server';
import { ModelDownloader } from './model-downloader';
import { pullWithFeedback, pushWithFeedback, commitWithFeedback } from './git-ops';
import { getMessageBank, MessageKey } from './messages';
import { StatsStore } from './stats';
import { PomodoroState } from './pomodoro';

export class AnimeCompanionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'animeCompanion.live2dView';

  private _view?: vscode.WebviewView;
  private _messageTimer?: NodeJS.Timeout;
  private _extensionUri: vscode.Uri;
  private _server: ModelFileServer;
  private _stats: StatsStore;
  private _downloader: ModelDownloader;
  private _resolvedModel: ModelInfo = HIYORI;
  private _reactive?: ReactiveManager;
  private _confirmCounter = 0;
  private _pendingConfirms = new Map<string, (approved: boolean) => void>();
  private _pendingInputs = new Map<string, (value: string | undefined) => void>();

  constructor(extensionUri: vscode.Uri, server: ModelFileServer, stats: StatsStore, downloader: ModelDownloader) {
    this._extensionUri = extensionUri;
    this._server = server;
    this._stats = stats;
    this._downloader = downloader;
  }

  // Returns immediately for bundled models. For lazy models, downloads + extracts
  // on first call, then registers the cache root with the file server. On error,
  // falls back to the bundled Hiyori so the view always renders something.
  private async _resolveModel(): Promise<ModelInfo> {
    const requested = getSelectedModel();
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
    if (this._view) {
      this._view.webview.postMessage(message);
    }
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
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    setTimeout(() => {
      this._sendMessage(this._pickMessage('greeting'));
    }, 4000);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    void context;
    void token;
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    };

    void this._renderWith(webviewView);

    this._startMessageTimer();

    this._reactive?.dispose();
    this._reactive = new ReactiveManager(
      (text, motion) => {
        this._sendMessage(text);
        if (motion && this._view) {
          this._view.webview.postMessage({ command: 'playMotion', group: motion });
        }
      },
      (mood) => {
        if (this._view) {
          this._view.webview.postMessage({ command: 'setMood', mood });
        }
      },
      this._stats
    );
    this._reactive.activate();

    webviewView.webview.onDidReceiveMessage((message) => {
      // Pause idle timer when the user interacts
      if (['poke', 'headpat', 'spamClick', 'multiClick', 'runCommand', 'setVoiceLanguage', 'setMessageLanguage', 'setModel', 'setMuted', 'confirmDialogResult', 'inputDialogResult'].includes(message.command)) {
        this._startMessageTimer(10000);
      }

      switch (message.command) {
        case 'poke':
          break;
        case 'headpat':
          console.log('🌸 Head pat!');
          break;
        case 'spamClick':
          console.log('🌸 Spam click: ' + message.count);
          break;
        case 'multiClick':
          console.log('🌸 Multi click: ' + message.count);
          break;
        case 'live2dReady':
          console.log('🌸 Live2D model loaded!');
          break;
        case 'runCommand':
          log(`runCommand received: action="${message.action}"`);

          // Git pull/push need true async + before/after diff to give the user
          // a real "succeeded / nothing to do / failed" signal. Route to our
          // helpers which use the Git extension API directly instead of the
          // fire-and-forget executeCommand('git.pull').
          if (message.action === 'git.pull') {
            pullWithFeedback((text) => this._sendMessage(text));
            return;
          }
          if (message.action === 'git.push') {
            pushWithFeedback((text) => this._sendMessage(text));
            return;
          }
          if (message.action === 'git.commit') {
            commitWithFeedback(
              (text) => this._sendMessage(text),
              (branch) => this._requestProtectedBranchConfirm(branch),
              (unstagedCount) => this._requestStageAllConfirm(unstagedCount),
              (stagedCount) => this._requestCommitMessage(stagedCount)
            );
            return;
          }

          if (message.action === 'animeCompanion.runProject') {
            this._sendMessage('Em gọi server dậy cho Onii-chan liền đây~ chờ em xíu nha!');
            if (this._view) {
              this._view.webview.postMessage({ command: 'setExpression', expression: 'happy', duration: 3000 });
              this._view.webview.postMessage({ command: 'playMotion', group: 'TapBody' });
            }
          }

          vscode.commands.executeCommand(message.action).then(
            (result) => {
              log(`Command "${message.action}" resolved with: ${JSON.stringify(result)}`);
            },
            (error) => {
              const details = error instanceof Error ? error.message : String(error);
              log(`Command "${message.action}" FAILED: ${details}`);
              console.error(`🌸 Failed to execute command "${message.action}":`, error);
              vscode.window.showErrorMessage(`Anime Companion: ${message.action} loi - ${details}`);
              this._sendMessage(`Khong chay duoc lenh: ${details}`);
            }
          );
          break;
        case 'setVoiceLanguage':
          if (typeof message.voiceLanguage === 'string' && ['ja', 'vi', 'en'].includes(message.voiceLanguage)) {
            vscode.workspace.getConfiguration('animeCompanion')
              .update('voiceLanguage', message.voiceLanguage, vscode.ConfigurationTarget.Global)
              .then(() => {
                this.refreshView();
                this._sendMessage(`Giọng ${message.voiceLanguage.toUpperCase()} sẵn sàng rồi nha~ nghe dễ thương chứ?`);
              });
          }
          break;
        case 'setMessageLanguage':
          if (typeof message.messageLanguage === 'string' && ['vi', 'en', 'ja'].includes(message.messageLanguage)) {
            vscode.workspace.getConfiguration('animeCompanion')
              .update('messageLanguage', message.messageLanguage, vscode.ConfigurationTarget.Global)
              .then(() => {
                this.refreshView();
                this._sendMessage(getMessageBank().pick('greeting'));
              });
          }
          break;
        case 'setModel':
          if (typeof message.modelId === 'string') {
            // Save in workspaceState if a workspace is open (per-project waifu),
            // else fall through to global config so the choice still sticks.
            const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
            const persist = hasWorkspace
              ? setWorkspaceModel(message.modelId)
              : vscode.workspace.getConfiguration('animeCompanion')
                  .update('model', message.modelId, vscode.ConfigurationTarget.Global);
            Promise.resolve(persist).then(() => {
              this.refreshView();
              this._sendMessage(`Em đổi sang model ${message.modelId} rồi nè~ hợp gu Onii-chan không?`);
            });
          }
          break;
        case 'setMuted':
          if (typeof message.muted === 'boolean') {
            vscode.workspace.getConfiguration('animeCompanion')
              .update('muted', message.muted, vscode.ConfigurationTarget.Global)
              .then(() => {
                this.refreshView();
                this._sendMessage(message.muted ? 'Em sẽ ngoan ngoãn im lặng một chút nha~' : 'Yay~ em có thể ríu rít với Onii-chan lại rồi nè!');
              });
          }
          break;
        case 'confirmDialogResult':
          if (typeof message.requestId === 'string') {
            const resolver = this._pendingConfirms.get(message.requestId);
            if (resolver) {
              this._pendingConfirms.delete(message.requestId);
              resolver(Boolean(message.approved));
            }
          }
          break;
        case 'inputDialogResult':
          if (typeof message.requestId === 'string') {
            const resolver = this._pendingInputs.get(message.requestId);
            if (resolver) {
              this._pendingInputs.delete(message.requestId);
              resolver(typeof message.value === 'string' ? message.value : undefined);
            }
          }
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._startMessageTimer();
      } else {
        this._stopMessageTimer();
      }
    });

    webviewView.onDidDispose(() => {
      this._stopMessageTimer();
      this._reactive?.dispose();
      this._pendingConfirms.clear();
      this._pendingInputs.clear();
      this._view = undefined;
    });

    // Random reaction when active editor changes - comments on file type
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && this._view?.visible && Math.random() < 0.15) {
        const fileName = path.basename(editor.document.fileName);
        const ext = path.extname(fileName);
        this._sendMessage(getMessageBank().pickFileMessage(ext, fileName));
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

  private _sendMessage(text: string) {
    if (this._view) {
      this._view.webview.postMessage({ command: 'showMessage', text });
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
    if (!this._view) {
      return Promise.resolve(undefined);
    }

    const requestId = `input-${++this._confirmCounter}`;
    return new Promise<string | undefined>((resolve) => {
      this._pendingInputs.set(requestId, resolve);
      this._view?.webview.postMessage({
        command: 'showCommitMessageInput',
        requestId,
        stagedCount,
      });
    });
  }

  private _requestConfirmDialog(command: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this._view) {
      return Promise.resolve(false);
    }

    const requestId = `confirm-${++this._confirmCounter}`;
    return new Promise<boolean>((resolve) => {
      this._pendingConfirms.set(requestId, resolve);
      this._view?.webview.postMessage({
        command,
        requestId,
        ...payload,
      });
    });
  }

  private _pickMessage(key: MessageKey): string {
    return getMessageBank().pick(key);
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
    const messageLanguage = config.get<string>('messageLanguage', 'vi');
    const muted = config.get<boolean>('muted', false);
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
    media-src ${webview.cspSource};
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
    window.__AUDIO_BASE_URL__ = "${mediaUri('audio', voiceLanguage)}";
    window.__VOICE_LANGUAGE__ = "${voiceLanguage}";
    window.__MESSAGE_LANGUAGE__ = "${messageLanguage}";
    window.__AUDIO_MUTED__ = ${muted ? 'true' : 'false'};
    window.__VISIBLE_MODELS__ = ${JSON.stringify(visibleModels)};
  </script>

  <script src="${cubismCoreUri}"></script>
  <script src="${pixiUri}"></script>
  <script src="${cubism4Uri}"></script>
  <script type="module" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }
}
