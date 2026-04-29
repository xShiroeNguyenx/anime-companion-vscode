import * as vscode from 'vscode';
import { PomodoroManager, PomodoroState } from './pomodoro';
import { initLogger, log } from './log';
import { MODEL_MAP, getSelectedModel } from './models';
import { ModelFileServer } from './model-server';
import { AnimeCompanionViewProvider } from './companion-view';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function startDebuggingFromContext(): Promise<void> {
  if (vscode.debug.activeDebugSession) {
    log(`Active debug session detected (${vscode.debug.activeDebugSession.name}) → restarting`);
    await vscode.commands.executeCommand('workbench.action.debug.restart');
    return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  log(`Workspace folder: ${folder?.uri.fsPath ?? 'NONE'}`);

  if (folder) {
    const launchConfig = vscode.workspace.getConfiguration('launch', folder.uri);
    const configurations = launchConfig.get<Array<{ name: string }>>('configurations') ?? [];
    log(`Found ${configurations.length} launch configuration(s): ${configurations.map(c => c.name).join(', ')}`);

    if (configurations.length > 0) {
      const targetName = configurations[0].name;
      log(`Calling vscode.debug.startDebugging(folder, "${targetName}")`);
      const started = await vscode.debug.startDebugging(folder, targetName);
      log(`startDebugging returned ${started}`);
      if (started) return;
      throw new Error(`Khong start duoc cau hinh "${targetName}"`);
    }
  }

  log('Fallback → workbench.action.debug.selectandstart');
  await vscode.commands.executeCommand('workbench.action.debug.selectandstart');
}

// ─── Status Bar ──────────────────────────────────────────────────────────────
// Single status bar slot. Default: model name + click-to-toggle. When Pomodoro
// is running, swaps to countdown + click-to-stop.

class CompanionStatusBar {
  private _item: vscode.StatusBarItem;
  private _pomodoroState: PomodoroState = 'idle';
  private _pomodoroSecs = 0;

  constructor() {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.refresh();
    this._item.show();
  }

  refresh() {
    if (this._pomodoroState !== 'idle') {
      this._renderPomodoro();
    } else {
      this._renderIdle();
    }
  }

  setPomodoro(state: PomodoroState, secondsLeft: number) {
    this._pomodoroState = state;
    this._pomodoroSecs = secondsLeft;
    this.refresh();
  }

  private _renderIdle() {
    const model = getSelectedModel();
    this._item.text = `$(heart) ${model.name}`;
    this._item.tooltip = `Anime Companion — ${model.description}\nClick to toggle the panel`;
    this._item.command = 'animeCompanion.toggle';
    this._item.backgroundColor = undefined;
  }

  private _renderPomodoro() {
    const mins = Math.floor(this._pomodoroSecs / 60);
    const secs = this._pomodoroSecs % 60;
    const t = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (this._pomodoroState === 'work') {
      this._item.text = `🍅 ${t}`;
      this._item.tooltip = 'Pomodoro: focusing — click to stop';
      this._item.backgroundColor = undefined;
    } else {
      this._item.text = `☕ ${t}`;
      this._item.tooltip = 'Pomodoro: break — click to stop';
      this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    this._item.command = 'animeCompanion.stopPomodoro';
  }

  dispose() {
    this._item.dispose();
  }
}

// ─── Activation ──────────────────────────────────────────────────────────────

let modelServer: ModelFileServer | null = null;
let pomodoroManager: PomodoroManager | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Anime Companion');
  context.subscriptions.push(outputChannel);
  initLogger(outputChannel);

  const config = vscode.workspace.getConfiguration('animeCompanion');
  const legacyVoiceLanguage = config.get<string>('voiceLanguage', 'ja');
  if (legacyVoiceLanguage === 'ja-vi') {
    await config.update('voiceLanguage', 'en', vscode.ConfigurationTarget.Global);
    log('Migrated legacy voiceLanguage "ja-vi" -> "en"');
  }

  // VS Code lowercases the publisher portion when computing extension IDs
  const ext = vscode.extensions.getExtension('shiroenguyen.anime-companion-vscode');
  const currentVersion = (ext?.packageJSON?.version as string | undefined) ?? 'unknown';
  log(`Anime Companion activated — version ${currentVersion}`);

  // Surface a one-time toast when version changes after install/upgrade so the
  // user knows the new code is actually running (vs. waiting for window reload).
  const PREV_VERSION_KEY = 'animeCompanion.lastActivatedVersion';
  const prevVersion = context.globalState.get<string>(PREV_VERSION_KEY);
  if (prevVersion !== currentVersion) {
    const action = prevVersion ? `cập nhật ${prevVersion} → ${currentVersion}` : `lần đầu chạy ${currentVersion}`;
    log(`Version change detected: ${action}`);
    vscode.window.showInformationMessage(`🌸 Anime Companion ${currentVersion} đang chạy (${action})`);
    context.globalState.update(PREV_VERSION_KEY, currentVersion);
  }

  // Local file server for Live2D model assets
  modelServer = new ModelFileServer(context.extensionUri);
  try {
    await modelServer.start();
    log(`Model file server running on port ${modelServer.port}`);
  } catch (err) {
    log(`Failed to start model server: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Webview view provider
  const provider = new AnimeCompanionViewProvider(context.extensionUri, modelServer);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AnimeCompanionViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Status bar — model name by default, swaps to Pomodoro countdown while active
  const statusBar = new CompanionStatusBar();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('animeCompanion.model')) {
        statusBar.refresh();
      }
    })
  );

  // Pomodoro — wire tick into status bar
  pomodoroManager = new PomodoroManager(
    (state) => {
      if (state === 'work') {
        provider.postMessage({ command: 'pomodoroStart' });
      } else if (state === 'break') {
        provider.postMessage({ command: 'pomodoroBreak' });
      } else {
        provider.postMessage({ command: 'pomodoroStop' });
      }
    },
    (state, secondsLeft) => statusBar.setPomodoro(state, secondsLeft)
  );
  context.subscriptions.push(pomodoroManager);

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('animeCompanion.runProject', async () => {
      log('animeCompanion.runProject invoked');
      try {
        await startDebuggingFromContext();
        log('startDebuggingFromContext finished without throwing');
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        log(`startDebuggingFromContext threw: ${details}`);
        vscode.window.showWarningMessage(`Anime Companion khong the chay Run luc nay: ${details}`);
        throw error;
      }
    }),
    vscode.commands.registerCommand('animeCompanion.show', () => {
      vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
      vscode.commands.executeCommand('animeCompanion.live2dView.focus');
    }),
    vscode.commands.registerCommand('animeCompanion.hide', () => {
      vscode.commands.executeCommand('setContext', 'animeCompanion.visible', false);
    }),
    vscode.commands.registerCommand('animeCompanion.toggle', () => {
      vscode.commands.executeCommand('animeCompanion.live2dView.toggleVisibility');
    }),
    vscode.commands.registerCommand('animeCompanion.changeModel', async () => {
      const config = vscode.workspace.getConfiguration('animeCompanion');
      const current = config.get<string>('model', 'hiyori');
      const items = Object.values(MODEL_MAP).map(m => ({
        label: `$(sparkle) ${m.name}${m.id === current ? '  ✓' : ''}`,
        description: m.description,
        id: m.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '🌸 Choose your companion model',
        title: 'Anime Companion: Change Model',
      });

      if (selected && selected.id !== current) {
        await config.update('model', selected.id, vscode.ConfigurationTarget.Global);
        provider.refreshView();
        vscode.window.showInformationMessage(`🌸 Switched to ${selected.label}!`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.changeVoice', async () => {
      const config = vscode.workspace.getConfiguration('animeCompanion');
      const current = config.get<string>('voiceLanguage', 'ja');
      const voices = [
        { id: 'ja', label: 'Japanese', description: 'Anime-style VoiceVox voice (Shikoku Metan)' },
        { id: 'vi', label: 'Tiếng Việt', description: 'Giọng nữ Google TTS' },
        { id: 'en', label: 'English', description: 'English audio generated with Google TTS' },
      ];
      const items = voices.map(v => ({
        label: `$(unmute) ${v.label}${v.id === current ? '  ✓' : ''}`,
        description: v.description,
        id: v.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '🌸 Choose voice language',
        title: 'Anime Companion: Change Voice',
      });

      if (selected && selected.id !== current) {
        await config.update('voiceLanguage', selected.id, vscode.ConfigurationTarget.Global);
        provider.refreshView();
        vscode.window.showInformationMessage(`🌸 Voice switched to ${selected.label}!`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.toggleMute', async () => {
      const config = vscode.workspace.getConfiguration('animeCompanion');
      const muted = config.get<boolean>('muted', false);
      await config.update('muted', !muted, vscode.ConfigurationTarget.Global);
      provider.refreshView();
      vscode.window.showInformationMessage(!muted ? '🌸 Companion muted!' : '🌸 Companion unmuted!');
    }),
    vscode.commands.registerCommand('animeCompanion.startPomodoro', () => {
      pomodoroManager?.start();
    }),
    vscode.commands.registerCommand('animeCompanion.stopPomodoro', () => {
      pomodoroManager?.stop();
    }),
    vscode.commands.registerCommand('animeCompanion.openSettings', () => {
      // Filter Settings UI to this extension's properties
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:shiroenguyen.anime-companion-vscode'
      );
    })
  );

  // Auto-show on startup
  if (config.get<boolean>('showOnStartup', true)) {
    vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
    setTimeout(() => {
      vscode.commands.executeCommand('animeCompanion.live2dView.focus');
    }, 2000);
  }
}

export function deactivate() {
  if (modelServer) {
    modelServer.stop();
    modelServer = null;
  }
}
