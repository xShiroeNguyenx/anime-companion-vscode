import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getAmbientPreset } from './ambient-presets';
import { pullWithFeedback, pushWithFeedback, commitWithFeedback } from './git-ops';
import { log } from './log';
import { getMessageBank } from './messages';
import type { ChatManager } from './chat/chat-manager';
import type { ProviderId } from './chat/secrets';
import { AchievementDef, buildAchievementPanelData, StatsStore } from './stats';
import type { AgentProfileManager } from './agent-profiles/profile-manager';

export interface DispatcherContext {
  postMessage: (msg: any) => void;
  sendBubble: (text: string, options?: { speak?: boolean }) => void;
  refresh: () => void | Promise<void>;
  pendingConfirms: Map<string, (approved: boolean) => void>;
  pendingInputs: Map<string, (value: string | undefined) => void>;
  requestProtectedBranchConfirm: (branch: string) => Promise<boolean>;
  requestStageAllConfirm: (unstagedCount: number) => Promise<boolean>;
  requestCommitMessage: (stagedCount: number) => Promise<string | undefined>;
  onInteraction?: () => void;
  getCustomAmbientTracks: () => any[];
  stats: StatsStore;
  saveCompanionPosition?: (x: number, y: number) => void;
  applyModelSelection: (modelId: string) => Promise<void>;
  nudgeCursorChibi?: (dx: number, dy: number) => Promise<void>;
  nudgeCursorChibiSize?: (delta: number) => Promise<void>;
  resetCursorChibi?: () => Promise<void>;
  saveCapturedChibi?: (modelId: string, dataUrl: string) => Promise<void>;
  chatManager?: ChatManager;
  applyShowcase?: () => void;
  agentProfileManager?: AgentProfileManager;
}

const INTERACTION_COMMANDS = new Set([
  'poke',
  'headpat',
  'spamClick',
  'multiClick',
  'runCommand',
  'setVoiceLanguage',
  'setMessageLanguage',
  'setModel',
  'setMuted',
  'setClickThrough',
  'setFocusFollow',
  'setAmbientPreset',
  'confirmDialogResult',
  'inputDialogResult',
  'setCompanionPosition',
  'cursorChibi:nudge',
  'cursorChibi:size',
  'cursorChibi:reset',
  'runtimeDebug',
  'pet:chat:request',
  'pet:chat:cancel',
  'setShowcaseAchievement',
]);

export function dispatchRuntimeMessage(message: any, ctx: DispatcherContext): void {
  if (INTERACTION_COMMANDS.has(message.command)) {
    ctx.onInteraction?.();
  }

  switch (message.command) {
    case 'poke':
      void _recordInteraction(ctx, 'poke');
      break;
    case 'headpat':
      void _recordInteraction(ctx, 'headpat');
      console.log('Head pat!');
      break;
    case 'spamClick':
      void _recordInteraction(ctx, 'spamClick');
      console.log(`Spam click: ${message.count}`);
      break;
    case 'multiClick':
      void _recordInteraction(ctx, 'multiClick');
      console.log(`Multi click: ${message.count}`);
      break;
    case 'live2dReady':
      console.log('Live2D model loaded!');
      break;
    case 'runCommand':
      _handleRunCommand(message, ctx);
      break;
    case 'setVoiceLanguage':
      if (typeof message.voiceLanguage === 'string' && ['ja', 'vi', 'en'].includes(message.voiceLanguage)) {
        vscode.workspace
          .getConfiguration('animeCompanion')
          .update('voiceLanguage', message.voiceLanguage, vscode.ConfigurationTarget.Global)
          .then(() => {
            void ctx.refresh();
            ctx.sendBubble(`Voice ${message.voiceLanguage.toUpperCase()} is ready now.`);
          });
      }
      break;
    case 'setMessageLanguage':
      if (typeof message.messageLanguage === 'string' && ['vi', 'en', 'ja'].includes(message.messageLanguage)) {
        vscode.workspace
          .getConfiguration('animeCompanion')
          .update('messageLanguage', message.messageLanguage, vscode.ConfigurationTarget.Global)
          .then(() => {
            void ctx.refresh();
            ctx.sendBubble(getMessageBank().pick('greeting'));
          });
      }
      break;
    case 'setModel':
      if (typeof message.modelId === 'string') {
        Promise.resolve(ctx.applyModelSelection(message.modelId)).then(() => {
          void ctx.refresh();
          ctx.sendBubble(`Switched to model ${message.modelId}.`);
        });
      }
      break;
    case 'setMuted':
      if (typeof message.muted === 'boolean') {
        vscode.workspace
          .getConfiguration('animeCompanion')
          .update('muted', message.muted, vscode.ConfigurationTarget.Global)
          .then(() => {
            ctx.postMessage({ command: 'setMutedState', muted: message.muted });
            ctx.sendBubble(message.muted ? 'Muted for a bit.' : 'Audio is back on.');
          });
      }
      break;
    case 'setClickThrough':
      // Only meaningful in Desktop Companion mode. Persisting the setting
      // triggers extension.ts onDidChangeConfiguration → bridge.restartSidecar()
      // automatically — no need to call sidecar APIs from here.
      if (typeof message.value === 'boolean') {
        vscode.workspace
          .getConfiguration('animeCompanion')
          .update('desktopCompanion.clickThrough', message.value, vscode.ConfigurationTarget.Global);
      }
      break;
    case 'setFocusFollow':
      // Persist the auto look-at toggle. Webview applies it live; this just
      // makes the choice survive reloads (re-injected as window.__FOCUS_FOLLOW__).
      if (typeof message.value === 'boolean') {
        vscode.workspace
          .getConfiguration('animeCompanion')
          .update('focusFollow.enabled', message.value, vscode.ConfigurationTarget.Global);
      }
      break;
    case 'setAmbientPreset':
      if (typeof message.preset === 'string') {
        const preset = getAmbientPreset(message.preset, ctx.getCustomAmbientTracks());
        vscode.workspace
          .getConfiguration('animeCompanion')
          .update('ambientPreset', preset.id, vscode.ConfigurationTarget.Global)
          .then(() => {
            ctx.postMessage({ command: 'setAmbientPreset', preset: preset.id });
            ctx.sendBubble(
              preset.id === 'off'
                ? 'Ambient turned off.'
                : `Ambient ${preset.label} is on now.`
            );
          });
      }
      break;
    case 'confirmDialogResult':
      if (typeof message.requestId === 'string') {
        const resolver = ctx.pendingConfirms.get(message.requestId);
        if (resolver) {
          ctx.pendingConfirms.delete(message.requestId);
          resolver(Boolean(message.approved));
        }
      }
      break;
    case 'inputDialogResult':
      if (typeof message.requestId === 'string') {
        const resolver = ctx.pendingInputs.get(message.requestId);
        if (resolver) {
          ctx.pendingInputs.delete(message.requestId);
          resolver(typeof message.value === 'string' ? message.value : undefined);
        }
      }
      break;
    case 'setCompanionPosition':
      if (
        typeof message.x === 'number' &&
        typeof message.y === 'number' &&
        ctx.saveCompanionPosition
      ) {
        ctx.saveCompanionPosition(message.x, message.y);
      }
      break;
    case 'cursorChibi:nudge':
      if (
        typeof message.dx === 'number' &&
        typeof message.dy === 'number' &&
        ctx.nudgeCursorChibi
      ) {
        void ctx.nudgeCursorChibi(message.dx, message.dy);
      }
      break;
    case 'cursorChibi:size':
      if (typeof message.delta === 'number' && ctx.nudgeCursorChibiSize) {
        void ctx.nudgeCursorChibiSize(message.delta);
      }
      break;
    case 'cursorChibi:reset':
      if (ctx.resetCursorChibi) {
        void ctx.resetCursorChibi();
      }
      break;
    case 'runtimeDebug':
      if (typeof message.message === 'string') {
        const source = typeof message.source === 'string' ? message.source : 'runtime';
        log(`[${source}] ${message.message}`);
      }
      break;
    case 'modelChibiCaptured':
      if (
        typeof message.modelId === 'string' &&
        typeof message.dataUrl === 'string' &&
        ctx.saveCapturedChibi
      ) {
        void ctx.saveCapturedChibi(message.modelId, message.dataUrl);
      }
      break;
    case 'modelChibiCaptureFailed':
      vscode.window.showWarningMessage(
        `Couldn't capture chibi from the model: ${message.reason ?? 'unknown reason'}.`
      );
      break;
    case 'chat:send':
      if (typeof message.prompt === 'string' && ctx.chatManager) {
        const includeSelection = Boolean(message.includeSelection);
        const includeActiveFile = Boolean(message.includeActiveFile);
        const fileMentions = Array.isArray(message.fileMentions)
          ? (message.fileMentions as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        void ctx.chatManager.sendUserMessage(message.prompt, {
          includeSelection,
          includeActiveFile,
          fileMentions,
        });
      }
      break;
    case 'chat:clearStagedSelection':
      ctx.chatManager?.clearStagedSelection();
      break;
    case 'chat:searchFiles':
      if (typeof message.query === 'string' && ctx.chatManager) {
        void ctx.chatManager.searchFiles(message.query);
      }
      break;
    case 'chat:cancel':
      ctx.chatManager?.cancel();
      break;
    case 'chat:clearAll':
      void ctx.chatManager?.clearAll();
      break;
    case 'chat:newConversation':
      void ctx.chatManager?.newConversation();
      break;
    case 'chat:loadConversation':
      if (typeof message.id === 'string' && ctx.chatManager) {
        void ctx.chatManager.loadConversation(message.id);
      }
      break;
    case 'chat:deleteConversation':
      if (typeof message.id === 'string' && ctx.chatManager) {
        void ctx.chatManager.deleteConversation(message.id);
      }
      break;
    case 'chat:renameConversation':
      if (typeof message.id === 'string' && typeof message.title === 'string' && ctx.chatManager) {
        void ctx.chatManager.renameConversation(message.id, message.title);
      }
      break;
    case 'chat:requestRename':
      if (typeof message.id === 'string' && typeof message.currentTitle === 'string' && ctx.chatManager) {
        void ctx.chatManager.requestRename(message.id, message.currentTitle);
      }
      break;
    case 'chat:requestDelete':
      if (typeof message.id === 'string' && typeof message.title === 'string' && ctx.chatManager) {
        void ctx.chatManager.requestDelete(message.id, message.title);
      }
      break;
    case 'chat:snapshot':
      void ctx.chatManager?.sendSnapshot();
      break;
    case 'chat:setProvider':
      if (typeof message.providerId === 'string' && ctx.chatManager) {
        void ctx.chatManager.setProvider(message.providerId as ProviderId);
      }
      break;
    case 'chat:setModel':
      if (typeof message.model === 'string' && ctx.chatManager) {
        void ctx.chatManager.setModel(message.model);
      }
      break;
    case 'chat:setApiKey':
      void vscode.commands.executeCommand('animeCompanion.chat.setApiKey');
      break;
    case 'chat:pickCopilotAccount':
      void ctx.chatManager?.pickCopilotAccount();
      break;
    case 'pet:chat:request':
      if (typeof message.prompt === 'string') {
        const requestId = typeof message.requestId === 'string' ? message.requestId : '';
        if (!ctx.chatManager) {
          ctx.postMessage({
            command: 'pet:chat:error',
            requestId,
            message: 'Chat manager not initialized. Try reloading the window.',
            aborted: false,
          });
          break;
        }
        const maxTokens =
          typeof message.maxTokens === 'number' && message.maxTokens > 0
            ? Math.min(message.maxTokens, 1024)
            : 200;
        void ctx.chatManager.sendQuickChat(message.prompt, {
          maxTokens,
          onDelta: (chunk) => ctx.postMessage({ command: 'pet:chat:delta', requestId, delta: chunk }),
          onEnd: (full) => ctx.postMessage({ command: 'pet:chat:end', requestId, text: full }),
          onError: (errMsg, aborted) =>
            ctx.postMessage({ command: 'pet:chat:error', requestId, message: errMsg, aborted }),
        });
      }
      break;
    case 'pet:chat:cancel':
      ctx.chatManager?.cancelQuickChat();
      break;
    case 'shareCardRequestSave':
      void _handleShareCardSave(message, ctx);
      break;
    case 'shareCardCopied':
      vscode.window.showInformationMessage('Share card copied to clipboard.');
      break;
    case 'shareCardCopyFailed':
      vscode.window.showWarningMessage(
        `Couldn't copy share card: ${String(message.reason || 'clipboard unavailable')}`
      );
      break;
    case 'setShowcaseAchievement': {
      const rawId = typeof message.id === 'string' && message.id.length > 0 ? message.id : null;
      void (async () => {
        await ctx.stats.setShowcase(rawId);
        ctx.applyShowcase?.();
        ctx.postMessage({
          command: 'setAchievementsData',
          achievements: buildAchievementPanelData(ctx.stats.getStats()),
        });
      })();
      break;
    }
    case 'agentProfile:list:request':
      _handleAgentProfileListRequest(ctx);
      break;
    case 'agentProfile:use':
      if (typeof message.id === 'string') _handleAgentProfileUse(message.id, ctx);
      break;
    case 'agentProfile:save':
      if (typeof message.name === 'string') {
        const toolId = typeof message.toolId === 'string' ? message.toolId : undefined;
        _handleAgentProfileSave(message.name, toolId, ctx);
      }
      break;
    case 'agentProfile:availableTools:request':
      _handleAgentProfileAvailableToolsRequest(ctx);
      break;
  }
}

function _handleAgentProfileListRequest(ctx: DispatcherContext): void {
  if (!ctx.agentProfileManager) {
    ctx.postMessage({ command: 'agentProfile:list:state', profiles: [] });
    return;
  }
  void (async () => {
    const views = await ctx.agentProfileManager!.getViews();
    ctx.postMessage({
      command: 'agentProfile:list:state',
      profiles: views.map((v) => ({
        id: v.id,
        name: v.name,
        tool: v.tool,
        toolDisplayName: v.toolDisplayName,
        toolIcon: v.toolIcon,
        identityText: v.identity?.text ?? '',
        active: v.active,
      })),
    });
  })();
}

function _handleAgentProfileUse(id: string, ctx: DispatcherContext): void {
  if (!ctx.agentProfileManager) return;
  void (async () => {
    try {
      const p = await ctx.agentProfileManager!.useProfile(id);
      vscode.window.showInformationMessage(
        `Agent profile switched to "${p.name}". Restart any running CLI sessions to pick up the new credentials.`
      );
      _handleAgentProfileListRequest(ctx);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Agent profile switch failed: ${detail}`);
    }
  })();
}

function _handleAgentProfileSave(name: string, toolId: string | undefined, ctx: DispatcherContext): void {
  if (!ctx.agentProfileManager) return;
  void (async () => {
    try {
      const ok = await ctx.agentProfileManager!.warnIfNoLoggedInTool();
      if (!ok) return;
      const p = await ctx.agentProfileManager!.saveProfile(name, toolId ? { toolId } : undefined);
      vscode.window.showInformationMessage(`Saved agent profile "${p.name}".`);
      _handleAgentProfileListRequest(ctx);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Save agent profile failed: ${detail}`);
    }
  })();
}

function _handleAgentProfileAvailableToolsRequest(ctx: DispatcherContext): void {
  if (!ctx.agentProfileManager) {
    ctx.postMessage({ command: 'agentProfile:availableTools:state', tools: [] });
    return;
  }
  void (async () => {
    const backends = await ctx.agentProfileManager!.detectAvailableBackends();
    ctx.postMessage({
      command: 'agentProfile:availableTools:state',
      tools: backends.map((b) => ({ id: b.id, displayName: b.displayName, icon: b.icon })),
    });
  })();
}

async function _handleShareCardSave(message: any, ctx: DispatcherContext): Promise<void> {
  const requestId = typeof message.requestId === 'string' ? message.requestId : '';
  if (typeof message.dataUrl !== 'string') {
    ctx.postMessage({ command: 'shareCardSaveResult', requestId, ok: false, error: 'Missing image payload.' });
    return;
  }
  const match = /^data:image\/png;base64,(.+)$/.exec(message.dataUrl);
  if (!match) {
    ctx.postMessage({ command: 'shareCardSaveResult', requestId, ok: false, error: 'Invalid PNG payload.' });
    return;
  }

  const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    ?? process.env.USERPROFILE
    ?? process.env.HOME
    ?? process.cwd();
  const targetUri = await vscode.window.showSaveDialog({
    title: 'Save share card',
    filters: { PNG: ['png'] },
    defaultUri: vscode.Uri.file(path.join(baseDir, 'anime-companion-share-card.png')),
  });
  if (!targetUri) {
    ctx.postMessage({ command: 'shareCardSaveResult', requestId, ok: false, cancelled: true });
    return;
  }

  try {
    await fs.promises.mkdir(path.dirname(targetUri.fsPath), { recursive: true });
    await fs.promises.writeFile(targetUri.fsPath, Buffer.from(match[1], 'base64'));
    vscode.window.showInformationMessage(`Share card exported to ${targetUri.fsPath}`);
    ctx.postMessage({ command: 'shareCardSaveResult', requestId, ok: true, path: targetUri.fsPath });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Couldn't export share card: ${msg}`);
    ctx.postMessage({ command: 'shareCardSaveResult', requestId, ok: false, error: msg });
  }
}

async function _recordInteraction(
  ctx: DispatcherContext,
  kind: 'poke' | 'headpat' | 'multiClick' | 'spamClick'
): Promise<void> {
  await ctx.stats.recordInteraction(kind);

  const unlocked: AchievementDef[] = [];
  const nightOwl = await ctx.stats.tryUnlockNightOwl();
  if (nightOwl) unlocked.push(nightOwl);
  if (kind === 'spamClick') {
    const petChaos = await ctx.stats.unlockById('pet_chaos');
    if (petChaos) unlocked.push(petChaos);
  }

  if (unlocked.length > 0) {
    for (const def of unlocked) {
      const template = getMessageBank().pickAchievement(def.id) ?? `🏆 ${def.title}`;
      ctx.sendBubble(template, { speak: true });
      ctx.postMessage({ command: 'achievementUnlocked', achievement: { id: def.id, title: def.title, rarity: def.rarity, secret: def.secret } });
    }
  }

  ctx.postMessage({
    command: 'setAchievementsData',
    achievements: buildAchievementPanelData(ctx.stats.getStats()),
  });
}

function _handleRunCommand(message: any, ctx: DispatcherContext): void {
  log(`runCommand received: action="${message.action}"`);

  if (message.action === 'git.pull') {
    pullWithFeedback((text) => ctx.sendBubble(text));
    return;
  }
  if (message.action === 'git.push') {
    pushWithFeedback((text) => ctx.sendBubble(text));
    return;
  }
  if (message.action === 'git.commit') {
    commitWithFeedback(
      (text) => ctx.sendBubble(text),
      (branch) => ctx.requestProtectedBranchConfirm(branch),
      (unstagedCount) => ctx.requestStageAllConfirm(unstagedCount),
      (stagedCount) => ctx.requestCommitMessage(stagedCount)
    );
    return;
  }

  if (message.action === 'animeCompanion.runProject') {
    ctx.sendBubble('Starting the project for you.');
    ctx.postMessage({ command: 'setExpression', expression: 'happy', duration: 3000 });
    ctx.postMessage({ command: 'playMotion', group: 'TapBody' });
  }

  vscode.commands.executeCommand(message.action).then(
    (result) => {
      log(`Command "${message.action}" resolved with: ${JSON.stringify(result)}`);
    },
    (error) => {
      const details = error instanceof Error ? error.message : String(error);
      log(`Command "${message.action}" FAILED: ${details}`);
      console.error(`Failed to execute command "${message.action}":`, error);
      vscode.window.showErrorMessage(`Anime Companion: ${message.action} failed - ${details}`);
      ctx.sendBubble(`Could not run command: ${details}`);
    }
  );
}
