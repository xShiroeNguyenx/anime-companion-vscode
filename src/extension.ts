import * as vscode from 'vscode';
import { PomodoroManager, PomodoroState } from './pomodoro';
import { initLogger, log } from './log';
import {
  getSelectedModel,
  setExtensionContext,
  setWorkspaceModel,
  clearWorkspaceModel,
  hasWorkspaceModel,
  listVisibleModels,
} from './models';
import { ModelFileServer } from './model-server';
import { ModelDownloader } from './model-downloader';
import { DesktopPetDownloader } from './desktop-pet-downloader';
import { AnimeCompanionViewProvider } from './companion-view';
import { DesktopPetBridge } from './desktop-pet-bridge';
import { initMessageBank } from './messages';
import { StatsStore, ACHIEVEMENT_DEFS } from './stats';
import { initCompanionPosition, clearPanelPosition } from './companion-position';

// Common shape extension.ts depends on regardless of which UI host is active:
// the in-VS-Code panel webview, or the floating Tauri desktop pet (bridge).
// Both must be able to receive raw messages, pomodoro ticks, and refresh
// requests so pomodoro/config plumbing in here can stay host-agnostic.
interface CompanionHost {
  postMessage(message: any): void;
  updatePomodoroTick(state: PomodoroState, secondsLeft: number, totalSeconds: number): void;
  refreshView(): void | Promise<void>;
}

function getDesktopCompanionSetting<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  defaultValue: T
): T {
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

async function migrateLegacyDesktopPetSettings(
  config: vscode.WorkspaceConfiguration
): Promise<void> {
  const keys = [
    'enabled',
    'alwaysOnTop',
    'clickThrough',
    'size',
    'position',
    'opacity',
    'downloadBaseUrl',
    'devBinaryPath',
  ];

  for (const key of keys) {
    const currentKey = `desktopCompanion.${key}`;
    const legacyKey = `desktopPet.${key}`;
    const currentInspect = config.inspect(currentKey);
    const legacyInspect = config.inspect(legacyKey);
    if (!legacyInspect) continue;

    if (
      currentInspect?.globalValue === undefined &&
      legacyInspect.globalValue !== undefined
    ) {
      await config.update(currentKey, legacyInspect.globalValue, vscode.ConfigurationTarget.Global);
    }

    if (
      currentInspect?.workspaceValue === undefined &&
      legacyInspect.workspaceValue !== undefined
    ) {
      await config.update(currentKey, legacyInspect.workspaceValue, vscode.ConfigurationTarget.Workspace);
    }
  }
}

async function startDebuggingFromContext(): Promise<void> {
  if (vscode.debug.activeDebugSession) {
    log(`Active debug session detected (${vscode.debug.activeDebugSession.name}) -> restarting`);
    await vscode.commands.executeCommand('workbench.action.debug.restart');
    return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  log(`Workspace folder: ${folder?.uri.fsPath ?? 'NONE'}`);

  if (folder) {
    const launchConfig = vscode.workspace.getConfiguration('launch', folder.uri);
    const configurations = launchConfig.get<Array<{ name: string }>>('configurations') ?? [];
    log(`Found ${configurations.length} launch configuration(s): ${configurations.map((c) => c.name).join(', ')}`);

    if (configurations.length > 0) {
      const targetName = configurations[0].name;
      log(`Calling vscode.debug.startDebugging(folder, "${targetName}")`);
      const started = await vscode.debug.startDebugging(folder, targetName);
      log(`startDebugging returned ${started}`);
      if (started) {
        return;
      }

      throw new Error(`Could not start launch configuration "${targetName}"`);
    }
  }

  log('Fallback -> workbench.action.debug.selectandstart');
  await vscode.commands.executeCommand('workbench.action.debug.selectandstart');
}

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
    this._item.tooltip = `Anime Companion - ${model.description}\nClick to toggle the panel`;
    this._item.command = 'animeCompanion.toggle';
    this._item.backgroundColor = undefined;
  }

  private _renderPomodoro() {
    const mins = Math.floor(this._pomodoroSecs / 60);
    const secs = this._pomodoroSecs % 60;
    const timeLabel = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (this._pomodoroState === 'work') {
      this._item.text = `$(flame) ${timeLabel}`;
      this._item.tooltip = 'Pomodoro: focusing - click to stop';
      this._item.backgroundColor = undefined;
    } else {
      this._item.text = `$(coffee) ${timeLabel}`;
      this._item.tooltip = 'Pomodoro: break - click to stop';
      this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    this._item.command = 'animeCompanion.stopPomodoro';
  }

  dispose() {
    this._item.dispose();
  }
}

let modelServer: ModelFileServer | null = null;
let pomodoroManager: PomodoroManager | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Anime Companion');
  context.subscriptions.push(outputChannel);
  initLogger(outputChannel);

  let config = vscode.workspace.getConfiguration('animeCompanion');
  await migrateLegacyDesktopPetSettings(config);
  config = vscode.workspace.getConfiguration('animeCompanion');
  const legacyVoiceLanguage = config.get<string>('voiceLanguage', 'ja');
  if (legacyVoiceLanguage === 'ja-vi') {
    await config.update('voiceLanguage', 'en', vscode.ConfigurationTarget.Global);
    log('Migrated legacy voiceLanguage "ja-vi" -> "en"');
  }

  const ext = vscode.extensions.getExtension('shiroenguyen.anime-companion-vscode');
  const currentVersion = (ext?.packageJSON?.version as string | undefined) ?? 'unknown';
  log(`Anime Companion activated - version ${currentVersion}`);

  const previousVersionKey = 'animeCompanion.lastActivatedVersion';
  const previousVersion = context.globalState.get<string>(previousVersionKey);
  if (previousVersion !== currentVersion) {
    const action = previousVersion ? `updated ${previousVersion} -> ${currentVersion}` : `first run ${currentVersion}`;
    log(`Version change detected: ${action}`);

    if (context.extensionMode !== vscode.ExtensionMode.Test) {
      vscode.window.showInformationMessage(`Anime Companion ${currentVersion} is active (${action})`);
    }

    await context.globalState.update(previousVersionKey, currentVersion);
  }

  const messageBank = initMessageBank(context.extensionUri);
  context.subscriptions.push({ dispose: () => messageBank.dispose() });

  setExtensionContext(context);
  initCompanionPosition(context);
  const stats = new StatsStore(context);
  const downloader = new ModelDownloader(context);
  const desktopPetDownloader = new DesktopPetDownloader(context);

  // Pre-register the cache root with the file server so already-downloaded
  // models work even if the user never selects them via the UI flow.
  modelServer = new ModelFileServer(context.extensionUri, [downloader.cacheRoot]);
  try {
    await modelServer.start();
    log(`Model file server running on port ${modelServer.port}`);
  } catch (err) {
    log(`Failed to start model server: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Desktop pet mode is mutually exclusive with the panel webview to avoid
  // running two Live2D instances (double GPU + bubble/voice cross-talk).
  // Toggling the setting requires a window reload.
  const desktopPetEnabled = getDesktopCompanionSetting(config, 'enabled', false);

  let provider: AnimeCompanionViewProvider | undefined;
  let bridge: DesktopPetBridge | undefined;
  let host: CompanionHost;

  if (desktopPetEnabled) {
    bridge = new DesktopPetBridge(
      context.extensionUri,
      modelServer,
      stats,
      downloader,
      desktopPetDownloader
    );
    bridge.start();
    context.subscriptions.push(bridge);
    host = bridge;
    // Hide the in-VS-Code panel view; user uses the floating window instead.
    void vscode.commands.executeCommand('setContext', 'animeCompanion.visible', false);
    log(`DesktopPet bridge active. Bootstrap URL: ${bridge.bootstrapUrl}`);

    // v1 ships Windows-only. Surface a one-time warning on Mac/Linux so the
    // user isn't left wondering why nothing pops up. The bridge still runs
    // so they can open the bootstrap URL in Chrome to test the WS protocol.
    if (process.platform !== 'win32') {
      void vscode.window
        .showWarningMessage(
          'Anime Companion: Desktop Companion currently only ships a Windows binary. ' +
            'Mac/Linux support is planned for v1.1+. The WebSocket bridge is still running ' +
            '— check the output channel for the bootstrap URL to test in Chrome.',
          'Disable Desktop Companion',
          'Open Output'
        )
        .then((choice) => {
          if (choice === 'Disable Desktop Companion') {
            void vscode.workspace
              .getConfiguration('animeCompanion')
              .update('desktopCompanion.enabled', false, vscode.ConfigurationTarget.Global);
          } else if (choice === 'Open Output') {
            void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
          }
        });
    }
  } else {
    provider = new AnimeCompanionViewProvider(context.extensionUri, modelServer, stats, downloader);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(AnimeCompanionViewProvider.viewType, provider, {
        webviewOptions: { retainContextWhenHidden: true },
      })
    );
    host = provider;
  }

  const statusBar = new CompanionStatusBar();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('animeCompanion.model')) {
        statusBar.refresh();
      }
      if (
        event.affectsConfiguration('animeCompanion.customModels') ||
        event.affectsConfiguration('animeCompanion.customModelRoots') ||
        event.affectsConfiguration('animeCompanion.customAmbientTracks') ||
        event.affectsConfiguration('animeCompanion.ambientVolume') ||
        event.affectsConfiguration('animeCompanion.ambientPreset') ||
        event.affectsConfiguration('animeCompanion.muted')
      ) {
        statusBar.refresh();
        void host.refreshView();
      }
      if (
        event.affectsConfiguration('animeCompanion.desktopCompanion.enabled') ||
        event.affectsConfiguration('animeCompanion.desktopPet.enabled')
      ) {
        vscode.window
          .showInformationMessage(
            'Anime Companion: Desktop Companion mode changed. Reload window to apply.',
            'Reload Window'
          )
          .then((choice) => {
            if (choice === 'Reload Window') {
              void vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
      }
    })
  );

  pomodoroManager = new PomodoroManager(
    (state) => {
      if (state === 'work') {
        host.postMessage({ command: 'pomodoroStart' });
      } else if (state === 'break') {
        host.postMessage({ command: 'pomodoroBreak' });
      } else {
        host.postMessage({ command: 'pomodoroStop' });
      }
    },
    (state, secondsLeft, totalSeconds) => {
      statusBar.setPomodoro(state, secondsLeft);
      host.updatePomodoroTick(state, secondsLeft, totalSeconds);
    }
  );
  context.subscriptions.push(pomodoroManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('animeCompanion.runProject', async () => {
      log('animeCompanion.runProject invoked');
      try {
        await startDebuggingFromContext();
        log('startDebuggingFromContext finished without throwing');
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        log(`startDebuggingFromContext threw: ${details}`);
        vscode.window.showWarningMessage(`Anime Companion could not run right now: ${details}`);
        throw error;
      }
    }),
    vscode.commands.registerCommand('animeCompanion.show', () => {
      return Promise.all([
        vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true),
        vscode.commands.executeCommand('animeCompanion.live2dView.focus'),
      ]);
    }),
    vscode.commands.registerCommand('animeCompanion.hide', () => {
      return vscode.commands.executeCommand('setContext', 'animeCompanion.visible', false);
    }),
    vscode.commands.registerCommand('animeCompanion.toggle', () => {
      return vscode.commands.executeCommand('animeCompanion.live2dView.toggleVisibility');
    }),
    vscode.commands.registerCommand('animeCompanion.changeModel', async () => {
      const current = getSelectedModel().id;
      const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
      const items = listVisibleModels().map((model) => ({
        label: `$(sparkle) ${model.name}${model.id === current ? '  *' : ''}`,
        description: model.description,
        id: model.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: hasWorkspace
          ? 'Choose your companion model (saved per-workspace)'
          : 'Choose your companion model',
        title: 'Anime Companion: Change Model',
      });

      if (selected && selected.id !== current) {
        if (hasWorkspace) {
          await setWorkspaceModel(selected.id);
        } else {
          await vscode.workspace.getConfiguration('animeCompanion')
            .update('model', selected.id, vscode.ConfigurationTarget.Global);
        }
        void host.refreshView();
        vscode.window.showInformationMessage(`Switched to ${selected.label}`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.resetWorkspaceModel', async () => {
      if (!hasWorkspaceModel()) {
        vscode.window.showInformationMessage('No per-workspace model is set. Falling back to global setting.');
        return;
      }
      await clearWorkspaceModel();
      void host.refreshView();
      vscode.window.showInformationMessage('Workspace model cleared. Using global setting.');
    }),
    vscode.commands.registerCommand('animeCompanion.showStats', async () => {
      const s = stats.getStats();
      const fmtMins = (ms: number) => {
        const m = Math.floor(ms / 60000);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        const r = m % 60;
        return r === 0 ? `${h}h` : `${h}h ${r}m`;
      };
      const unlocked = s.achievements.length;
      const items: vscode.QuickPickItem[] = [
        { label: `$(save) Saves`,           description: `${s.saves}` },
        { label: `$(git-commit) Commits`,   description: `${s.commits}` },
        { label: `$(bug) Errors fixed`,     description: `${s.errorsFixed}` },
        { label: `$(clock) Coding today`,   description: fmtMins(s.codingMillisToday) },
        { label: `$(watch) Coding all-time`,description: fmtMins(s.codingMillisAllTime) },
        { label: `$(trophy) Achievements`,  description: `${unlocked} / ${ACHIEVEMENT_DEFS.length} unlocked` },
      ];
      await vscode.window.showQuickPick(items, {
        title: 'Anime Companion — Stats',
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.showAchievements', async () => {
      const unlocked = new Set(stats.getAchievements());
      const items: vscode.QuickPickItem[] = ACHIEVEMENT_DEFS.map((def) => {
        const got = unlocked.has(def.id);
        return {
          label: `${got ? '$(check) ' : '$(lock) '}${def.title}`,
          description: def.description,
          detail: got ? 'Unlocked' : `Locked — threshold ${def.threshold}`,
        };
      });
      await vscode.window.showQuickPick(items, {
        title: `Anime Companion — Achievements (${unlocked.size}/${ACHIEVEMENT_DEFS.length})`,
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.playMotion', async () => {
      const motions = [
        { id: 'TapBody', label: '$(person) TapBody', description: 'Body tap motion' },
        { id: 'TapHead', label: '$(heart) TapHead', description: 'Head pat motion' },
        { id: 'Idle',    label: '$(sparkle) Idle', description: 'Default idle motion' },
      ];
      const selected = await vscode.window.showQuickPick(motions, {
        placeHolder: 'Pick a motion to play',
        title: 'Anime Companion: Play Motion',
      });
      if (selected) {
        host.postMessage({ command: 'playMotion', group: selected.id });
      }
    }),
    vscode.commands.registerCommand('animeCompanion.changeVoice', async () => {
      const voiceConfig = vscode.workspace.getConfiguration('animeCompanion');
      const current = voiceConfig.get<string>('voiceLanguage', 'ja');
      const voices = [
        { id: 'ja', label: 'Japanese', description: 'Anime-style VoiceVox voice (Shikoku Metan)' },
        { id: 'vi', label: 'Vietnamese', description: 'Google TTS voice' },
        { id: 'en', label: 'English', description: 'Google TTS voice' },
      ];
      const items = voices.map((voice) => ({
        label: `$(unmute) ${voice.label}${voice.id === current ? '  *' : ''}`,
        description: voice.description,
        id: voice.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose voice language',
        title: 'Anime Companion: Change Voice',
      });

      if (selected && selected.id !== current) {
        await voiceConfig.update('voiceLanguage', selected.id, vscode.ConfigurationTarget.Global);
        void host.refreshView();
        vscode.window.showInformationMessage(`Voice switched to ${selected.label}`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.changeMessageLanguage', async () => {
      const cfg = vscode.workspace.getConfiguration('animeCompanion');
      const current = cfg.get<string>('messageLanguage', 'vi');
      const langs = [
        { id: 'vi', label: 'Tiếng Việt', description: 'Vietnamese bubble text' },
        { id: 'en', label: 'English', description: 'English bubble text' },
        { id: 'ja', label: '日本語', description: 'Japanese bubble text' },
      ];
      const items = langs.map((l) => ({
        label: `$(comment) ${l.label}${l.id === current ? '  *' : ''}`,
        description: l.description,
        id: l.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose bubble message language',
        title: 'Anime Companion: Change Message Language',
      });

      if (selected && selected.id !== current) {
        await cfg.update('messageLanguage', selected.id, vscode.ConfigurationTarget.Global);
        void host.refreshView();
        vscode.window.showInformationMessage(`Message language switched to ${selected.label}`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.toggleMute', async () => {
      const muteConfig = vscode.workspace.getConfiguration('animeCompanion');
      const muted = muteConfig.get<boolean>('muted', false);
      await muteConfig.update('muted', !muted, vscode.ConfigurationTarget.Global);
      void host.refreshView();
      vscode.window.showInformationMessage(!muted ? 'Companion muted.' : 'Companion unmuted.');
    }),
    vscode.commands.registerCommand('animeCompanion.startPomodoro', () => {
      pomodoroManager?.start();
    }),
    vscode.commands.registerCommand('animeCompanion.stopPomodoro', () => {
      pomodoroManager?.stop();
    }),
    vscode.commands.registerCommand('animeCompanion.openSettings', () => {
      return vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:shiroenguyen.anime-companion-vscode'
      );
    }),
    vscode.commands.registerCommand('animeCompanion.resetPosition', async () => {
      if (desktopPetEnabled) {
        vscode.window.showInformationMessage(
          'Reset Position currently only applies to panel mode. ' +
            'In Desktop Companion mode, drag the window manually to reposition it.'
        );
        return;
      }
      await clearPanelPosition();
      void host.refreshView();
      vscode.window.showInformationMessage('Companion position reset.');
    }),
    vscode.commands.registerCommand('claude-vscode.terminal.open', async () => {
      await vscode.commands.executeCommand('workbench.action.terminal.focus');

      if (!vscode.window.activeTerminal) {
        await vscode.commands.executeCommand('workbench.action.terminal.new');
        await vscode.commands.executeCommand('workbench.action.terminal.focus');
      }
    })
  );

  if (
    !desktopPetEnabled &&
    context.extensionMode !== vscode.ExtensionMode.Test &&
    config.get<boolean>('showOnStartup', true)
  ) {
    void vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
    setTimeout(() => {
      void vscode.commands.executeCommand('animeCompanion.live2dView.focus');
    }, 2000);
  }
}

export function deactivate() {
  if (modelServer) {
    modelServer.stop();
    modelServer = null;
  }
}
