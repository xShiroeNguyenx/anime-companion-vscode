import * as vscode from 'vscode';
import { getAmbientPreset } from './ambient-presets';
import { pullWithFeedback, pushWithFeedback, commitWithFeedback } from './git-ops';
import { log } from './log';
import { getMessageBank } from './messages';

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
  saveCompanionPosition?: (x: number, y: number) => void;
  applyModelSelection: (modelId: string) => Promise<void>;
  saveCapturedChibi?: (modelId: string, dataUrl: string) => Promise<void>;
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
  'setAmbientPreset',
  'confirmDialogResult',
  'inputDialogResult',
  'setCompanionPosition',
  'runtimeDebug',
]);

export function dispatchRuntimeMessage(message: any, ctx: DispatcherContext): void {
  if (INTERACTION_COMMANDS.has(message.command)) {
    ctx.onInteraction?.();
  }

  switch (message.command) {
    case 'poke':
      break;
    case 'headpat':
      console.log('Head pat!');
      break;
    case 'spamClick':
      console.log(`Spam click: ${message.count}`);
      break;
    case 'multiClick':
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
  }
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
