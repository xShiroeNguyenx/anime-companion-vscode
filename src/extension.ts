import * as vscode from 'vscode';
import * as path from 'path';
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
import { VoiceAssetDownloader } from './voice-asset-downloader';
import { AnimeCompanionViewProvider } from './companion-view';
import { CursorChibiManager } from './cursor-chibi';
import { DesktopPetBridge } from './desktop-pet-bridge';
import { initMessageBank } from './messages';
import { ACHIEVEMENT_COUNT, AchievementDef, buildAchievementPanelData, buildAchievementQuickPickRows, buildCompanionProfile, buildQuestQuickPickRows, QuestDef, StatsStore } from './stats';
import { initCompanionPosition, clearPanelPosition } from './companion-position';
import { ChatSecrets } from './chat/secrets';
import { ConversationStore } from './chat/conversation-store';
import { ChatManager, runSetApiKeyCommand } from './chat/chat-manager';
import { AgentProfileStore } from './agent-profiles/profile-store';
import { AgentProfileManager } from './agent-profiles/profile-manager';
import { AgentProfilePanel } from './agent-profiles/profile-panel';
import { registerBackend, getBackend } from './agent-profiles/backends/account-backend';
import { claudeBackend } from './agent-profiles/backends/claude-backend';
import { codexBackend } from './agent-profiles/backends/codex-backend';
import { GitHubAccountService } from './github-account-service';
import { BackgroundPatchManager } from './background/background-patch-manager';
import { BackgroundPanel } from './background/background-panel';

registerBackend(claudeBackend);
registerBackend(codexBackend);

// Common shape extension.ts depends on regardless of which UI host is active:
// the in-VS-Code panel webview, or the floating Tauri desktop pet (bridge).
// Both must be able to receive raw messages, pomodoro ticks, and refresh
// requests so pomodoro/config plumbing in here can stay host-agnostic.
interface CompanionHost {
  postMessage(message: any): void;
  updatePomodoroTick(state: PomodoroState, secondsLeft: number, totalSeconds: number): void;
  refreshView(): void | Promise<void>;
  openShareCardPreview?(profile: unknown): void;
}

type ModelSelectionTarget = 'panel' | 'desktop' | 'auto';

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
    let migratedGlobal = false;
    let migratedWorkspace = false;

    if (
      currentInspect?.globalValue === undefined &&
      legacyInspect.globalValue !== undefined
    ) {
      await config.update(currentKey, legacyInspect.globalValue, vscode.ConfigurationTarget.Global);
      migratedGlobal = true;
    }

    if (
      currentInspect?.workspaceValue === undefined &&
      legacyInspect.workspaceValue !== undefined
    ) {
      await config.update(currentKey, legacyInspect.workspaceValue, vscode.ConfigurationTarget.Workspace);
      migratedWorkspace = true;
    }

    // Clear legacy keys after migration so VS Code doesn't keep resurrecting
    // the old value when the user toggles the new setting back to its default.
    if (migratedGlobal || currentInspect?.globalValue !== undefined) {
      await config.update(legacyKey, undefined, vscode.ConfigurationTarget.Global);
    }

    if (migratedWorkspace || currentInspect?.workspaceValue !== undefined) {
      await config.update(legacyKey, undefined, vscode.ConfigurationTarget.Workspace);
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

async function promptForModelSelection(target: ModelSelectionTarget): Promise<string | undefined> {
  const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
  const current = getSelectedModel(target === 'auto' ? undefined : target).id;
  const items = listVisibleModels().map((model) => ({
    label: `$(sparkle) ${model.name}${model.id === current ? '  *' : ''}`,
    description: model.description,
    id: model.id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder:
      target === 'desktop'
        ? 'Choose the Desktop Companion model'
        : target === 'panel'
        ? hasWorkspace
          ? 'Choose your panel companion model (saved per-workspace)'
          : 'Choose your panel companion model'
        : hasWorkspace
        ? 'Choose your companion model (saved per-workspace)'
        : 'Choose your companion model',
    title:
      target === 'desktop'
        ? 'Anime Companion: Change Desktop Model'
        : target === 'panel'
        ? 'Anime Companion: Change Panel Model'
        : 'Anime Companion: Change Model',
  });

  return selected && selected.id !== current ? selected.id : undefined;
}

async function applyModelSelection(target: ModelSelectionTarget, modelId: string): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('animeCompanion');
  const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
  const effectiveTarget =
    target === 'auto'
      ? config.get<boolean>('desktopCompanion.enabled', false)
        ? 'desktop'
        : 'panel'
      : target;

  if (effectiveTarget === 'desktop') {
    await config.update('desktopCompanion.model', modelId, vscode.ConfigurationTarget.Global);
    return true;
  }

  if (hasWorkspace) {
    await setWorkspaceModel(modelId);
    return true;
  }

  await config.update('model', modelId, vscode.ConfigurationTarget.Global);
  return true;
}

async function setDesktopCompanionEnabled(enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('animeCompanion');
  await config.update('desktopCompanion.enabled', enabled, vscode.ConfigurationTarget.Global);
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

class AgentProfileStatusBar {
  private _item: vscode.StatusBarItem;

  constructor(private readonly _manager: AgentProfileManager) {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this._item.command = 'animeCompanion.agentProfile.use';
    this.refresh();
    this._item.show();
  }

  refresh(): void {
    void this._refreshAsync();
  }

  private async _refreshAsync(): Promise<void> {
    const activeIds = await this._manager.detectActiveIds();
    const profiles = this._manager.list();
    const github = await this._manager.getGitHubState();
    const actives = Array.from(activeIds.entries())
      .map(([tool, id]) => ({ tool, profile: profiles.find((p) => p.id === id) }))
      .filter((x): x is { tool: string; profile: typeof profiles[number] } => !!x.profile);

    const lines = actives.map((a) => {
      const label = getBackend(a.tool)?.displayName ?? a.tool;
      return `${label}: ${a.profile.name}`;
    });
    const githubActive = github.accounts.find((a) => a.active);
    if (github.available) {
      lines.push(`GitHub: ${githubActive ? githubActive.label : 'VS Code default'}`);
    }

    if (actives.length === 0 && !githubActive) {
      this._item.text = '$(person) Accounts';
      this._item.tooltip = lines.length
        ? `Active accounts:\n${lines.join('\n')}\nClick to switch`
        : 'No agent profile matches the live CLI credentials — click to switch';
      return;
    }

    if (actives.length === 1) {
      this._item.text = `$(person) ${actives[0].profile.name}`;
    } else if (actives.length > 1) {
      this._item.text = `$(person) ${actives.length} accounts`;
    } else if (githubActive) {
      this._item.text = `$(github) ${githubActive.label}`;
    } else {
      this._item.text = '$(person) Accounts';
    }
    this._item.tooltip = `Active accounts:\n${lines.join('\n')}\nClick to switch`;
  }

  dispose(): void {
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

    // One-time migration to Copilot default: anyone upgrading from a 0.2.x
    // pre-release where the active provider got auto-switched during BYOK
    // testing should land back on Copilot, since that's the no-key default
    // every VS Code user can use out of the box. We only nudge users who
    // never explicitly customized the provider in their own settings.json.
    const migrationKey = 'animeCompanion.chat.providerMigratedTo026';
    if (!context.globalState.get<boolean>(migrationKey)) {
      const chatCfg = vscode.workspace.getConfiguration('animeCompanion');
      const inspect = chatCfg.inspect<string>('chat.provider');
      const hasUserSetting =
        inspect?.workspaceFolderValue !== undefined ||
        inspect?.workspaceValue !== undefined;
      // We only clear the global override (which is what the previous
      // auto-switch wrote). Workspace-level settings are user-explicit.
      if (!hasUserSetting && inspect?.globalValue !== undefined) {
        try {
          await chatCfg.update('chat.provider', undefined, vscode.ConfigurationTarget.Global);
          log('Migration: cleared global chat.provider override → now falls back to default (copilot)');
        } catch (err) {
          log(`Migration: failed to reset chat.provider: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await context.globalState.update(migrationKey, true);
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
  const voiceAssetDownloader = new VoiceAssetDownloader(context);
  // CursorChibiManager built up here so we can pass its saveCapturedChibi
  // method into AnimeCompanionViewProvider's dispatcher context below.
  const cursorChibi = new CursorChibiManager(context.extensionUri, context.globalStorageUri);

  // Workbench background-image feature: patches workbench.desktop.main.js to
  // render an image behind the editor/sidebar/panel, driven by a dedicated
  // control panel. Settings live under animeCompanion.background.*.
  const backgroundManager = new BackgroundPatchManager(context);
  context.subscriptions.push(
    backgroundManager,
    vscode.commands.registerCommand('animeCompanion.openBackgroundSettings', () => {
      BackgroundPanel.reveal(context, backgroundManager);
    }),
    vscode.commands.registerCommand('animeCompanion.background.apply', () => backgroundManager.apply()),
    vscode.commands.registerCommand('animeCompanion.background.remove', () => backgroundManager.disableAndRestore()),
  );

  // BYOK chat — secret-storage-backed key store, workspace-scoped single
  // conversation history, and a manager that routes user messages through
  // the active LLM provider and re-emits results to the active companion host.
  const chatSecrets = new ChatSecrets(context.secrets);
  const chatStore = new ConversationStore(context);
  let chatHostRef: CompanionHost | undefined;
  // Owns which signed-in GitHub account the extension/Copilot uses (global).
  // Shared by the chat manager, the Agent Accounts surfaces, and the command.
  const githubAccountService = new GitHubAccountService(context);
  context.subscriptions.push(githubAccountService);
  void githubAccountService.ensureAccess();
  const chatManager = new ChatManager(context, chatSecrets, chatStore, () => chatHostRef, stats, githubAccountService);
  // Any GitHub switch (panel, status bar, pet, command) should refresh the
  // chat panel's account display too, so every surface stays in sync.
  context.subscriptions.push(githubAccountService.onDidChange(() => void chatManager.sendSnapshot()));

  const announceAchievementUnlocks = (unlocked: AchievementDef[]) => {
    if (!unlocked.length || !chatHostRef) return;
    for (const def of unlocked) {
      const template = messageBank.pickAchievement(def.id) ?? `🏆 ${def.title}`;
      chatHostRef.postMessage({
        command: 'showMessage',
        text: template,
        speakText: template,
      });
      chatHostRef.postMessage({
        command: 'achievementUnlocked',
        achievement: { id: def.id, title: def.title, rarity: def.rarity, secret: def.secret },
      });
    }
    chatHostRef.postMessage({
      command: 'setAchievementsData',
      achievements: buildAchievementPanelData(stats.getStats()),
    });
  };

  const announceQuestCompletions = (quests: QuestDef[]) => {
    if (!quests.length || !chatHostRef) return;
    for (const quest of quests) {
      const text = `✅ ${quest.period === 'daily' ? 'Daily' : 'Weekly'} quest cleared: ${quest.title}`;
      chatHostRef.postMessage({ command: 'showMessage', text, speakText: text });
      chatHostRef.postMessage({
        command: 'achievementUnlocked',
        quest: { id: quest.id, title: quest.title, period: quest.period, rarity: quest.period === 'daily' ? 'rare' : 'epic' },
      });
    }
    chatHostRef.postMessage({
      command: 'setAchievementsData',
      achievements: buildAchievementPanelData(stats.getStats()),
    });
  };

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
    // Wire chat manager so the pet's right-click Quick Chat works through
    // the WS bridge. Must happen before bridge.start() so the dispatcher
    // context sees it on the very first attached client.
    bridge.setChatManager(chatManager);
    bridge.start();
    context.subscriptions.push(bridge);
    host = bridge;
    chatHostRef = host;
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
    provider = new AnimeCompanionViewProvider(
      context.extensionUri,
      modelServer,
      stats,
      downloader,
      voiceAssetDownloader,
      (modelId, dataUrl) => cursorChibi.saveCapturedChibi(modelId, dataUrl),
      chatManager,
      path.join(context.globalStorageUri.fsPath, 'cursor-chibi'),
      () => cursorChibi.getTuningState(),
      async (dx, dy) => {
        await cursorChibi.ensureEnabled();
        await cursorChibi.nudge(dx, dy);
      },
      async (delta) => {
        await cursorChibi.ensureEnabled();
        await cursorChibi.nudgeSize(delta);
      },
      async () => {
        await cursorChibi.ensureEnabled();
        await cursorChibi.resetOffset();
      }
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(AnimeCompanionViewProvider.viewType, provider, {
        webviewOptions: { retainContextWhenHidden: true },
      })
    );
    host = provider;
    chatHostRef = host;

    // The view's `when: animeCompanion.visible` clause hides it from the
    // panel container until this context flag is true. The flag does NOT
    // persist across reloads, so set it synchronously here (before VS Code
    // evaluates the panel's view list) — otherwise the view item is missing
    // from the container and any later focus/show command has nothing to
    // attach to. The deferred focus call further down still handles the
    // tab-switch + panel-open part.
    if (config.get<boolean>('showOnStartup', true)) {
      await vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
    }
  }

  const statusBar = new CompanionStatusBar();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('animeCompanion.model') ||
        event.affectsConfiguration('animeCompanion.desktopCompanion.model')
      ) {
        statusBar.refresh();
        void host.refreshView();
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
      // Click-through is read by the Tauri sidecar from an env var only at
      // spawn time. Restart just the sidecar process — no need to reload the
      // whole VS Code window for this single setting.
      if (
        event.affectsConfiguration('animeCompanion.desktopCompanion.clickThrough') &&
        bridge
      ) {
        const enabled = vscode.workspace
          .getConfiguration('animeCompanion')
          .get<boolean>('desktopCompanion.clickThrough', false);
        bridge.restartSidecar();
        vscode.window.setStatusBarMessage(
          enabled
            ? '$(check) Click-through enabled — restarting Desktop Companion...'
            : '$(check) Click-through disabled — restarting Desktop Companion...',
          3000
        );
      }
      // Mode toggles (panel ↔ desktop) still need a full window reload because
      // they swap which host (provider vs bridge) is active.
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

  let previousPomodoroState: PomodoroState = 'idle';
  pomodoroManager = new PomodoroManager(
    (state) => {
      if (state === 'work') {
        void stats.recordPomodoroStart();
        void stats.tryUnlockNightOwl().then((def) => announceAchievementUnlocks(def ? [def] : []));
      } else if (state === 'break' && previousPomodoroState === 'work') {
        void stats.recordPomodoroCompleted()
          .then(async () => {
            const defs = await stats.tryUnlockByMetric('pomodoro_completed');
            const quests = await stats.tryCompleteQuestsByMetric('pomodoro_completed');
            announceAchievementUnlocks(defs);
            announceQuestCompletions(quests);
          });
      }
      if (state === 'work') {
        host.postMessage({ command: 'pomodoroStart' });
      } else if (state === 'break') {
        host.postMessage({ command: 'pomodoroBreak' });
      } else {
        host.postMessage({ command: 'pomodoroStop' });
      }
      previousPomodoroState = state;
    },
    (state, secondsLeft, totalSeconds) => {
      statusBar.setPomodoro(state, secondsLeft);
      host.updatePomodoroTick(state, secondsLeft, totalSeconds);
    }
  );
  context.subscriptions.push(pomodoroManager);

  cursorChibi.activate();
  context.subscriptions.push(cursorChibi);

  const agentProfileStore = new AgentProfileStore(context);
  const agentProfileManager = new AgentProfileManager(context, agentProfileStore, githubAccountService);
  const agentProfileStatusBar = new AgentProfileStatusBar(agentProfileManager);
  // Inject the manager into whichever companion host is active so the
  // in-webview right-click "Đổi nhanh" / "Lưu hồ sơ" popups can dispatch
  // through the runtime message dispatcher.
  bridge?.setAgentProfileManager(agentProfileManager);
  provider?.setAgentProfileManager(agentProfileManager);
  context.subscriptions.push(
    agentProfileStatusBar,
    agentProfileManager,
    agentProfileManager.onDidChange(() => agentProfileStatusBar.refresh()),
    vscode.commands.registerCommand('animeCompanion.agentProfile.showPanel', () => {
      AgentProfilePanel.reveal(agentProfileManager);
    }),
    vscode.commands.registerCommand('animeCompanion.agentProfile.save', async () => {
      const ok = await agentProfileManager.warnIfNoLoggedInTool();
      if (!ok) return;
      const name = await vscode.window.showInputBox({
        prompt: 'Name for this agent profile (e.g. tk1, work, personal)',
        validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
      });
      if (!name) return;
      try {
        const p = await agentProfileManager.saveProfile(name);
        vscode.window.showInformationMessage(`Saved agent profile "${p.name}".`);
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }),
    vscode.commands.registerCommand('animeCompanion.agentProfile.list', async () => {
      const views = await agentProfileManager.getViews();
      if (!views.length) {
        vscode.window.showInformationMessage('No agent profiles saved yet.');
        return;
      }
      const items: vscode.QuickPickItem[] = views.map((v) => ({
        label: `${v.active ? '$(check) ' : `${v.toolIcon} `}${v.name}`,
        description: `${v.toolDisplayName}${v.identity ? ' · ' + v.identity.text : ''}`,
        detail: v.capturedAt
          ? `${v.fileCount} file(s) • captured ${new Date(v.capturedAt).toLocaleString()}`
          : 'No snapshot',
      }));
      await vscode.window.showQuickPick(items, {
        title: 'Anime Companion — Agent Accounts',
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.agentProfile.use', () => {
      return agentProfileManager.quickPickAndUse();
    }),
    // Dedicated GitHub-only picker. Routes through the chat manager so the
    // chat panel's account display refreshes alongside the global switch.
    vscode.commands.registerCommand('animeCompanion.githubAccount.switch', () => {
      return chatManager.pickCopilotAccount();
    }),
    vscode.commands.registerCommand('animeCompanion.agentProfile.delete', async () => {
      const profiles = agentProfileManager.list();
      if (!profiles.length) {
        vscode.window.showInformationMessage('No agent profiles to delete.');
        return;
      }
      const views = await agentProfileManager.getViews();
      const items = views.map<vscode.QuickPickItem & { id: string }>((v) => ({
        id: v.id,
        label: `${v.toolIcon} ${v.name}`,
        description: `${v.toolDisplayName}${v.identity ? ' · ' + v.identity.text : ''}`,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        title: 'Delete Agent Profile',
        placeHolder: 'Select a profile to delete',
      });
      if (!picked) return;
      const choice = await vscode.window.showWarningMessage(
        `Delete profile "${picked.label}"? Snapshot will be removed. The CLI's home directory is NOT touched.`,
        { modal: true },
        'Delete'
      );
      if (choice !== 'Delete') return;
      await agentProfileManager.deleteProfile(picked.id);
      vscode.window.showInformationMessage(`Deleted agent profile "${picked.label}".`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('animeCompanion.toggleCursorChase', () => {
      return cursorChibi.toggle();
    }),
    vscode.commands.registerCommand('animeCompanion.tuneCursorChibi', async () => {
      if (!desktopPetEnabled) {
        await vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
        try {
          await vscode.commands.executeCommand('animeCompanion.live2dView.focus');
        } catch (err) {
          log(`tuneCursorChibi: focus failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      host.postMessage({ command: 'chat:focusCursorOrb' });
    }),
    vscode.commands.registerCommand('animeCompanion.captureModelToChibi', () => {
      if (desktopPetEnabled) {
        vscode.window.showWarningMessage(
          'Capture only works in panel mode. Disable Desktop Companion first to use the in-panel Live2D for capture.'
        );
        return;
      }
      const modelId = vscode.workspace.getConfiguration('animeCompanion').get<string>('model', 'hiyori');
      vscode.window.showInformationMessage(`Capturing chibi from model "${modelId}"...`);
      host.postMessage({ command: 'captureModelChibi', modelId });
    }),
    vscode.commands.registerCommand('animeCompanion.resetCapturedChibi', () => {
      return cursorChibi.resetCapturedChibi();
    }),
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
    vscode.commands.registerCommand('animeCompanion.toggle', async () => {
      // toggleVisibility is unreliable for views with `when` clauses — it
      // throws on some VS Code builds. Mirror the show/hide pattern instead:
      // flip the context and either focus the view or rely on the when-clause
      // to hide it.
      const cfg = vscode.workspace.getConfiguration('animeCompanion');
      const currentlyVisible = await new Promise<boolean>((resolve) => {
        // We don't have direct read-access to the context value, so use the
        // last-known value from the provider's view state when available,
        // falling back to assuming it's visible if showOnStartup is on.
        const guess = (provider as any)?._view?.visible ?? cfg.get<boolean>('showOnStartup', true);
        resolve(Boolean(guess));
      });
      if (currentlyVisible) {
        await vscode.commands.executeCommand('setContext', 'animeCompanion.visible', false);
      } else {
        await vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
        try {
          await vscode.commands.executeCommand('animeCompanion.live2dView.focus');
        } catch (err) {
          log(`toggle: focus failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
    vscode.commands.registerCommand('animeCompanion.changeModel', async () => {
      const modelId = await promptForModelSelection(desktopPetEnabled ? 'desktop' : 'panel');
      if (modelId) {
        await applyModelSelection(desktopPetEnabled ? 'desktop' : 'panel', modelId);
        void host.refreshView();
        vscode.window.showInformationMessage(`Switched companion model to "${modelId}".`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.changePanelModel', async () => {
      const modelId = await promptForModelSelection('panel');
      if (modelId) {
        await applyModelSelection('panel', modelId);
        void host.refreshView();
        vscode.window.showInformationMessage(`Switched panel model to "${modelId}".`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.changeDesktopModel', async () => {
      const modelId = await promptForModelSelection('desktop');
      if (modelId) {
        await applyModelSelection('desktop', modelId);
        void host.refreshView();
        vscode.window.showInformationMessage(`Switched Desktop Companion model to "${modelId}".`);
      }
    }),
    vscode.commands.registerCommand('animeCompanion.switchToDesktop', async () => {
      await setDesktopCompanionEnabled(true);
    }),
    vscode.commands.registerCommand('animeCompanion.switchToPanel', async () => {
      await setDesktopCompanionEnabled(false);
    }),
    vscode.commands.registerCommand('animeCompanion.toggleDesktopClickThrough', async () => {
      const cfg = vscode.workspace.getConfiguration('animeCompanion');
      if (!cfg.get<boolean>('desktopCompanion.enabled', false)) {
        vscode.window.showInformationMessage(
          'Click-through only applies to Desktop Companion mode. Enable Desktop mode first.'
        );
        return;
      }
      const next = !cfg.get<boolean>('desktopCompanion.clickThrough', false);
      await cfg.update('desktopCompanion.clickThrough', next, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        next
          ? 'Desktop click-through ON — clicks pass through to apps behind.'
          : 'Desktop click-through OFF — companion is interactive again.'
      );
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
      const dailyQuests = stats.getQuestViews('daily');
      const weeklyQuests = stats.getQuestViews('weekly');
      const recentMemories = stats.getRecentMemories(3);
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
        { label: `$(trophy) Achievements`,  description: `${unlocked} / ${ACHIEVEMENT_COUNT} unlocked` },
        { label: `$(symbol-color) Gems`, description: `${s.gems}` },
        { label: `$(star-full) Tickets`, description: `${s.tickets}` },
        { label: `$(comment-discussion) AI prompts`, description: `${s.chatPrompts}` },
        { label: `$(zap) Quick chats`, description: `${s.quickChatPrompts}` },
        { label: `$(calendar) Pomodoro started`, description: `${s.pomodoroStarts}` },
        { label: `$(pass-filled) Pomodoro completed`, description: `${s.pomodoroCompleted}` },
        { label: `$(paintcan) Cosmetics`, description: `${s.unlockedCosmetics.length} unlocked`, detail: s.unlockedCosmetics.join(', ') || 'None yet' },
        { label: `$(unmute) Voice packs`, description: `${s.unlockedVoicePacks.length} unlocked`, detail: s.unlockedVoicePacks.join(', ') || 'None yet' },
        ...dailyQuests.map((quest) => ({
          label: `$(checklist) Daily: ${quest.title}`,
          description: quest.description,
          detail: quest.statusText,
        })),
        ...weeklyQuests.map((quest) => ({
          label: `$(checklist) Weekly: ${quest.title}`,
          description: quest.description,
          detail: quest.statusText,
        })),
        ...recentMemories.map((memory) => ({
          label: `$(history) Memory`,
          description: memory.text,
          detail: new Date(memory.createdAt).toLocaleString(),
        })),
      ];
      await vscode.window.showQuickPick(items, {
        title: 'Anime Companion — Stats',
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.showAchievements', async () => {
      if (provider?.showAchievementsPanel()) {
        return;
      }

      const s = stats.getStats();
      const unlocked = new Set(s.achievements);
      const items: vscode.QuickPickItem[] = buildAchievementQuickPickRows(s).map((row) => ({
        label: row.label,
        description: row.description,
        detail: row.detail,
      }));
      await vscode.window.showQuickPick(items, {
        title: `Anime Companion — Achievements (${unlocked.size}/${ACHIEVEMENT_COUNT})`,
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.showQuests', async () => {
      const items: vscode.QuickPickItem[] = buildQuestQuickPickRows(stats.getStats()).map((row) => ({
        label: row.label,
        description: row.description,
        detail: row.detail,
      }));
      await vscode.window.showQuickPick(items, {
        title: 'Anime Companion â€” Quests',
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.showProfile', async () => {
      const profile = buildCompanionProfile(stats.getStats());
      const topRarity = profile.topAchievementRarity ? profile.topAchievementRarity.toUpperCase() : 'NONE';
      const cosmetics = profile.inventory.cosmetics.length ? profile.inventory.cosmetics.join(', ') : 'None yet';
      const voicePacks = profile.inventory.voicePacks.length ? profile.inventory.voicePacks.join(', ') : 'None yet';
      const items: vscode.QuickPickItem[] = [
        { label: `$(account) ${profile.title}`, description: profile.badgeLine },
        { label: `$(symbol-color) Gems`, description: `${profile.inventory.gems}` },
        { label: `$(star-full) Tickets`, description: `${profile.inventory.tickets}` },
        { label: `$(trophy) Top achievement`, description: profile.topAchievementTitle, detail: `Rarity: ${topRarity}` },
        { label: `$(pulse) Affinity`, description: `${profile.affinityPercent}%` },
        { label: `$(graph) Progress`, description: `${profile.achievementUnlocked}/${profile.achievementTotal} achievements • ${profile.dailyQuestCompleted} daily • ${profile.weeklyQuestCompleted} weekly` },
        { label: `$(paintcan) Cosmetics`, description: cosmetics },
        { label: `$(unmute) Voice packs`, description: voicePacks },
      ];
      await vscode.window.showQuickPick(items, {
        title: `Anime Companion â€” Profile (Lv.${profile.level})`,
        placeHolder: 'Press Esc to close',
      });
    }),
    vscode.commands.registerCommand('animeCompanion.exportShareCard', async () => {
      if (!host.openShareCardPreview) {
        vscode.window.showWarningMessage('Share-card preview is not available for the current companion host.');
        return;
      }

      if (!desktopPetEnabled) {
        await vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
        try {
          await vscode.commands.executeCommand('animeCompanion.live2dView.focus');
        } catch {
          // Ignore focus errors; preview will surface a clearer error if needed.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const profile = {
        ...buildCompanionProfile(stats.getStats()),
        companionName: getSelectedModel(desktopPetEnabled ? 'desktop' : 'panel').name,
        exportedAt: new Date().toISOString(),
      };

      try {
        host.openShareCardPreview(profile);
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Couldn't open share card preview: ${details}`);
      }
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
        { id: 'vi', label: 'Vietnamese', description: 'Bundled audio + extended ElevenLabs voice assets' },
        { id: 'en', label: 'English', description: 'Bundled audio + extended ElevenLabs voice assets' },
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
    vscode.commands.registerCommand('animeCompanion.chat.setApiKey', async () => {
      await runSetApiKeyCommand(chatSecrets);
      await chatManager.sendSnapshot();
    }),
    vscode.commands.registerCommand('animeCompanion.chat.newConversation', async () => {
      await chatManager.newConversation();
      await vscode.commands.executeCommand('animeCompanion.chat.open');
    }),
    vscode.commands.registerCommand('animeCompanion.chat.clearHistory', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Delete all chat conversations? This cannot be undone.',
        { modal: true },
        'Delete all'
      );
      if (confirm !== 'Delete all') return;
      await chatManager.clearAll();
      vscode.window.showInformationMessage('All chat conversations deleted.');
    }),
    vscode.commands.registerCommand('animeCompanion.chat.askSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage(
          'Select some code first, then run "Ask Companion About Selection".'
        );
        return;
      }
      const text = editor.document.getText(editor.selection);
      chatManager.stageSelection(
        editor.document.uri.fsPath,
        text,
        editor.document.languageId
      );
      await vscode.commands.executeCommand('animeCompanion.chat.open');
    }),
    vscode.commands.registerCommand('animeCompanion.chat.open', async () => {
      // Bring the panel forward so the user actually sees the chat tab. The
      // panel view has a `when` clause guarded by animeCompanion.visible, so
      // we must set that flag first or focus has nothing to attach to.
      await vscode.commands.executeCommand('setContext', 'animeCompanion.visible', true);
      try {
        await vscode.commands.executeCommand('animeCompanion.live2dView.focus');
      } catch (err) {
        log(`chat.open: focus failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      chatHostRef?.postMessage({ command: 'chat:focus' });
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
    // Reuse the same `animeCompanion.show` command the user can run manually —
    // it works there, so it should work here. The 1.5s delay lets VS Code
    // finish its panel/tab restoration so our call doesn't get clobbered.
    setTimeout(() => {
      log('showOnStartup: invoking animeCompanion.show');
      void vscode.commands.executeCommand('animeCompanion.show').then(
        () => log('showOnStartup: animeCompanion.show invoked successfully'),
        (err) => log(`showOnStartup: animeCompanion.show failed: ${err instanceof Error ? err.message : String(err)}`)
      );
    }, 1500);
  }

  // Re-apply (or clean up) the workbench background after VS Code restarted or
  // updated. Deferred and fully self-contained so a slow/failing Program Files
  // write can never delay or break activation.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    setTimeout(() => { void backgroundManager.applyIfNeeded(); }, 2500);
  }
}

export function deactivate() {
  if (modelServer) {
    modelServer.stop();
    modelServer = null;
  }
}
