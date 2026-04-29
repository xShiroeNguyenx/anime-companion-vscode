import * as vscode from 'vscode';
import * as path from 'path';
import { ReactiveManager } from './reactive';
import { log } from './log';
import { getSelectedModel } from './models';
import { ModelFileServer } from './model-server';
import { pullWithFeedback, pushWithFeedback, commitWithFeedback } from './git-ops';

// ─── Message Collections (for the idle bubble timer + greetings) ────────────

const IDLE_MESSAGES = [
  "Code tiếp đi bạn ơi~ 💻",
  "Bug hôm nay hơi lì nhỉ? 🐛",
  "Nhớ save file nha! 💾",
  "Bạn code giỏi lắm! ✨",
  "Nghỉ tay uống nước đi~ 🍵",
  "Commit code thường xuyên nha! 📦",
  "Hôm nay code vui không? 🌸",
  "Đừng quên push code lên remote! 🚀",
  "Clean code = Happy life~ 🧹",
  "Bạn là dev tuyệt nhất! 🌟",
  "Refactor một chút cho đẹp nha~ 🎨",
  "Remember: KISS principle! 💋",
  "Đặt tên biến rõ ràng nha~ 📝",
  "Test trước khi deploy nha! 🧪",
  "Code xong nhớ review lại~ 👀",
  "Hít thở sâu... rồi debug tiếp! 🧘",
  "Cố lên! Sắp xong rồi~ 💪",
  "Console.log là bạn thân! 😂",
  "Bạn có nhớ uống nước chưa? 💧",
  "Mỗi dòng code đều có ý nghĩa~ ✍️",
  "Hôm nay học được gì mới không? 📚",
  "Stack Overflow cũng từng newbie! 😄",
  "Đừng copy paste mù quáng nha~ 🙈",
  "Comment code cho người sau đọc nha! 📖",
  "Ơ, bạn vẫn ở đây à? Chăm quá! 🥰",
];

const GREETING_MESSAGES = [
  "Ohayo~ Hôm nay code gì nè? 🌅",
  "Chào bạn! Sẵn sàng code chưa? 🎉",
  "Yay! Mình đây~ Cùng code nào! 🌸",
  "Hello world! 👋 Bắt đầu thôi~",
];

// ─── View Provider ──────────────────────────────────────────────────────────

export class AnimeCompanionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'animeCompanion.live2dView';

  private _view?: vscode.WebviewView;
  private _messageTimer?: NodeJS.Timeout;
  private _extensionUri: vscode.Uri;
  private _server: ModelFileServer;
  private _reactive?: ReactiveManager;
  private _confirmCounter = 0;
  private _pendingConfirms = new Map<string, (approved: boolean) => void>();
  private _pendingInputs = new Map<string, (value: string | undefined) => void>();

  constructor(extensionUri: vscode.Uri, server: ModelFileServer) {
    this._extensionUri = extensionUri;
    this._server = server;
  }

  public postMessage(message: any) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  public refreshView() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
      setTimeout(() => {
        this._sendMessage(this._randomFrom(GREETING_MESSAGES));
      }, 4000);
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    setTimeout(() => {
      this._sendMessage(this._randomFrom(GREETING_MESSAGES));
    }, 4000);

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
      }
    );
    this._reactive.activate();

    webviewView.webview.onDidReceiveMessage((message) => {
      // Pause idle timer when the user interacts
      if (['poke', 'headpat', 'spamClick', 'multiClick', 'runCommand', 'setVoiceLanguage', 'setModel', 'setMuted', 'confirmDialogResult', 'inputDialogResult'].includes(message.command)) {
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
            this._sendMessage('Đang start server cho bạn nè~ 🚀');
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
                this._sendMessage(`Voice switched to ${message.voiceLanguage.toUpperCase()}~`);
              });
          }
          break;
        case 'setModel':
          if (typeof message.modelId === 'string') {
            vscode.workspace.getConfiguration('animeCompanion')
              .update('model', message.modelId, vscode.ConfigurationTarget.Global)
              .then(() => {
                this.refreshView();
                this._sendMessage(`Switched to ${message.modelId}~`);
              });
          }
          break;
        case 'setMuted':
          if (typeof message.muted === 'boolean') {
            vscode.workspace.getConfiguration('animeCompanion')
              .update('muted', message.muted, vscode.ConfigurationTarget.Global)
              .then(() => {
                this.refreshView();
                this._sendMessage(message.muted ? 'Companion da mute roi nha~' : 'Companion co tieng lai roi~');
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

    // Random reaction when active editor changes — comments on file type
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && this._view?.visible && Math.random() < 0.15) {
        const fileName = path.basename(editor.document.fileName);
        const ext = path.extname(fileName);
        const fileMessages: Record<string, string> = {
          '.ts': `TypeScript à? Bạn fancy quá~ 💎`,
          '.js': `JavaScript! Classic choice~ ☕`,
          '.py': `Python nè! 🐍 Code sạch đẹp nha~`,
          '.html': `HTML! Xây giao diện đẹp nha~ 🎨`,
          '.css': `CSS! Làm cho nó lung linh lên~ ✨`,
          '.json': `JSON config... cẩn thận dấu phẩy nha! 😅`,
          '.md': `Viết docs à? Tốt lắm! 📝`,
          '.vue': `Vue.js! Progressive framework~ 💚`,
          '.jsx': `React nè! Component đẹp nha~ ⚛️`,
          '.tsx': `React + TypeScript! Pro quá! 🔥`,
        };
        const msg = fileMessages[ext] || `Đang mở ${fileName} nè~ 📂`;
        this._sendMessage(msg);
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
        this._sendMessage(this._randomFrom(IDLE_MESSAGES));
        scheduleNext();
      }, delay);
    };

    if (forceDelayMs) {
      this._messageTimer = setTimeout(() => {
        this._sendMessage(this._randomFrom(IDLE_MESSAGES));
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

  private _randomFrom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
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

    const selectedModel = getSelectedModel();
    const modelUrl = `http://127.0.0.1:${this._server.port}/${selectedModel.folder}/${selectedModel.file}`;
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const configuredVoiceLanguage = config.get<string>('voiceLanguage') || 'ja';
    const voiceLanguage = configuredVoiceLanguage === 'ja-vi' ? 'en' : configuredVoiceLanguage;
    const muted = config.get<boolean>('muted', false);

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
    window.__AUDIO_MUTED__ = ${muted ? 'true' : 'false'};
  </script>

  <script src="${cubismCoreUri}"></script>
  <script src="${pixiUri}"></script>
  <script src="${cubism4Uri}"></script>
  <script type="module" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }
}
