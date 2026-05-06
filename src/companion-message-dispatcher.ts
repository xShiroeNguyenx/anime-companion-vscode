import * as vscode from 'vscode';
import { log } from './log';
import { setWorkspaceModel } from './models';
import { getMessageBank } from './messages';
import { getAmbientPreset } from './ambient-presets';
import { pullWithFeedback, pushWithFeedback, commitWithFeedback } from './git-ops';

export interface DispatcherContext {
  // Send arbitrary message to the runtime.
  postMessage: (msg: any) => void;

  // Send a bubble text (and optionally voice) to the runtime.
  sendBubble: (text: string, options?: { speak?: boolean }) => void;

  // Re-render / re-initialize the runtime state after a config change
  // (e.g. voice/model/ambient). Panel re-renders HTML; bridge sends a fresh
  // init payload over WS.
  refresh: () => void | Promise<void>;

  // Per-host state for confirm/input dialog round-trips.
  pendingConfirms: Map<string, (approved: boolean) => void>;
  pendingInputs: Map<string, (value: string | undefined) => void>;

  // Dialog initiators — open a dialog in the runtime and resolve the promise
  // when the runtime posts back the result. Each impl owns a counter for
  // unique requestIds and pushes into the pending maps above.
  requestProtectedBranchConfirm: (branch: string) => Promise<boolean>;
  requestStageAllConfirm: (unstagedCount: number) => Promise<boolean>;
  requestCommitMessage: (stagedCount: number) => Promise<string | undefined>;

  // Called when an interactive event is received so callers can reset their
  // idle timer. Optional — not all hosts have one.
  onInteraction?: () => void;

  // Custom ambient tracks accessor (used when applying setAmbientPreset).
  // Returns the same shape resolveCustomAmbientTracks does.
  getCustomAmbientTracks: () => any[];

  // Persist the user's last drag position. Panel mode stores in globalState
  // and reads on next render. Desktop pet mode currently relies on Tauri's
  // OS window position (untracked here).
  saveCompanionPosition?: (x: number, y: number) => void;
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
  'setAmbientPreset',
  'confirmDialogResult',
  'inputDialogResult',
  'setCompanionPosition',
  'runtimeDebug',
]);

// Routes incoming messages from the runtime (webview or WS-connected sidecar)
// into VS Code-side actions. Pure dispatcher — owns no state of its own; all
// state lives on `ctx` so panel and bridge can each provide their own.
export function dispatchRuntimeMessage(message: any, ctx: DispatcherContext): void {
  if (INTERACTION_COMMANDS.has(message.command)) {
    ctx.onInteraction?.();
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
      _handleRunCommand(message, ctx);
      break;

    case 'setVoiceLanguage':
      if (typeof message.voiceLanguage === 'string' && ['ja', 'vi', 'en'].includes(message.voiceLanguage)) {
        vscode.workspace.getConfiguration('animeCompanion')
          .update('voiceLanguage', message.voiceLanguage, vscode.ConfigurationTarget.Global)
          .then(() => {
            void ctx.refresh();
            // Known issue: in bridge mode `refresh()` triggers a window reload,
            // so this bubble can be lost between teardown and the new connect.
            // Acceptable for v1; fix would be a runtime "ready" ack from the
            // host that gates the bubble until reconnect completes.
            ctx.sendBubble(`Giọng ${message.voiceLanguage.toUpperCase()} sẵn sàng rồi nha~ nghe dễ thương chứ?`);
          });
      }
      break;

    case 'setMessageLanguage':
      if (typeof message.messageLanguage === 'string' && ['vi', 'en', 'ja'].includes(message.messageLanguage)) {
        vscode.workspace.getConfiguration('animeCompanion')
          .update('messageLanguage', message.messageLanguage, vscode.ConfigurationTarget.Global)
          .then(() => {
            void ctx.refresh();
            ctx.sendBubble(getMessageBank().pick('greeting'));
          });
      }
      break;

    case 'setModel':
      if (typeof message.modelId === 'string') {
        const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
        const persist = hasWorkspace
          ? setWorkspaceModel(message.modelId)
          : vscode.workspace.getConfiguration('animeCompanion')
              .update('model', message.modelId, vscode.ConfigurationTarget.Global);
        Promise.resolve(persist).then(() => {
          void ctx.refresh();
          ctx.sendBubble(`Em đổi sang model ${message.modelId} rồi nè~ hợp gu Onii-chan không?`);
        });
      }
      break;

    case 'setMuted':
      if (typeof message.muted === 'boolean') {
        vscode.workspace.getConfiguration('animeCompanion')
          .update('muted', message.muted, vscode.ConfigurationTarget.Global)
          .then(() => {
            ctx.postMessage({ command: 'setMutedState', muted: message.muted });
            ctx.sendBubble(message.muted ? 'Em sẽ ngoan ngoãn im lặng một chút nha~' : 'Yay~ em có thể ríu rít với Onii-chan lại rồi nè!');
          });
      }
      break;

    case 'setAmbientPreset':
      if (typeof message.preset === 'string') {
        const preset = getAmbientPreset(message.preset, ctx.getCustomAmbientTracks());
        vscode.workspace.getConfiguration('animeCompanion')
          .update('ambientPreset', preset.id, vscode.ConfigurationTarget.Global)
          .then(() => {
            ctx.postMessage({ command: 'setAmbientPreset', preset: preset.id });
            ctx.sendBubble(
              preset.id === 'off'
                ? 'Em tắt ambient rồi nha~ mình nghe yên tĩnh một chút nè.'
                : `Em bật ${preset.label} cho Onii-chan rồi nha~`
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

    case 'runtimeDebug':
      if (typeof message.message === 'string') {
        const source = typeof message.source === 'string' ? message.source : 'runtime';
        log(`[${source}] ${message.message}`);
      }
      break;
  }
}

function _handleRunCommand(message: any, ctx: DispatcherContext): void {
  log(`runCommand received: action="${message.action}"`);

  // Git pull/push need true async + before/after diff to give the user a
  // real "succeeded / nothing to do / failed" signal. Route to our helpers
  // which use the Git extension API directly instead of fire-and-forget
  // executeCommand('git.pull').
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
    ctx.sendBubble('Em gọi server dậy cho Onii-chan liền đây~ chờ em xíu nha!');
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
      console.error(`🌸 Failed to execute command "${message.action}":`, error);
      vscode.window.showErrorMessage(`Anime Companion: ${message.action} loi - ${details}`);
      ctx.sendBubble(`Khong chay duoc lenh: ${details}`);
    }
  );
}
