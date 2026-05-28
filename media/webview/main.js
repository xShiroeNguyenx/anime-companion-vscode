import { state, vscode, debugLog } from './core.js';
import { setExpression } from './expression.js';
import { updateMoodIndicator } from './expression.js';
import { initAmbientAudio, playAudio, setAmbientPreset, setGlobalAudioMuted, speakText } from './audio.js';
import {
  showBubble,
  showError,
  showLoading,
  hideLoading,
  showFallback,
  playMotion,
  createSparkle,
  showProtectedBranchConfirm,
  showStageAllConfirm,
  showCommitMessageInput,
  updatePomodoroRing,
  hidePomodoroRing,
  appendBubbleStream,
  finishBubbleStream,
  errorBubbleStream,
  syncQuickChatConversationHistory,
  appendQuickChatHistoryDelta,
  finishQuickChatHistoryTurn,
  failQuickChatHistoryTurn,
} from './ui.js';
import { applyShowcaseBanner, openShareCardPreview, receiveShareCardSaveResult, renderAgentAvailableTools, renderAgentProfileList, setupModel, showAchievementUnlockEffect, showAchievementsPanel, updateAchievementsPanelData } from './interaction.js';

function disposeCurrentModel() {
  state.isLive2DReady = false;

  if (state.model) {
    try {
      if (typeof state.model.destroy === 'function') {
        state.model.destroy();
      }
    } catch (err) {
      debugLog('Model destroy failed: ' + (err && err.message ? err.message : String(err)));
    }
    state.model = null;
  }

  if (state.app) {
    try {
      if (typeof state.app.destroy === 'function') {
        state.app.destroy(true, { children: true, texture: false, baseTexture: false });
      }
    } catch (err) {
      debugLog('PIXI app destroy failed: ' + (err && err.message ? err.message : String(err)));
    }
    state.app = null;
  }
}

async function initLive2D() {
  try {
    disposeCurrentModel();
    showLoading('Loading Live2D...');
    debugLog('Starting Live2D initialization...');

    if (typeof PIXI === 'undefined') throw new Error('PIXI is not loaded');
    debugLog('PIXI loaded: v' + PIXI.VERSION);

    if (typeof Live2DCubismCore === 'undefined') throw new Error('Live2DCubismCore is not loaded');
    debugLog('Live2DCubismCore loaded');

    if (!PIXI.live2d) throw new Error('PIXI.live2d plugin is not loaded');
    debugLog('PIXI.live2d plugin loaded');

    const Live2DModel = PIXI.live2d.Live2DModel;
    if (!Live2DModel) throw new Error('Live2DModel class not found');

    const wrapper = document.getElementById('characterWrapper');
    const canvas = document.getElementById('live2dCanvas');
    const wrapperWidth = wrapper.clientWidth || 350;
    const wrapperHeight = wrapper.clientHeight || 350;

    debugLog('Canvas size: ' + wrapperWidth + 'x' + wrapperHeight);

    state.app = new PIXI.Application({
      view: canvas,
      width: wrapperWidth,
      height: wrapperHeight,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true,
    });
    debugLog('PIXI Application created');

    const modelUrl = window.__MODEL_URL__;
    debugLog('Model URL: ' + modelUrl);
    if (!modelUrl) throw new Error('Model URL not provided');

    showLoading('Connecting to model server...');
    try {
      const testResp = await fetch(modelUrl);
      if (!testResp.ok) throw new Error('Server returned ' + testResp.status);
      const testJson = await testResp.json();
      debugLog('Model3.json loaded! Version: ' + testJson.Version);
    } catch (fetchErr) {
      throw new Error('Cannot reach model server: ' + fetchErr.message);
    }

    showLoading('Loading model...');
    state.model = await Live2DModel.from(modelUrl, {
      autoInteract: false,
      autoUpdate: true,
    });
    debugLog('Model loaded successfully!');

    setupModel();

    canvas.style.display = 'block';
    hideLoading();
    state.isLive2DReady = true;

    debugLog('Live2D fully initialized!');
    vscode.postMessage({ command: 'live2dReady' });
  } catch (error) {
    const errMsg = error && error.message ? error.message : String(error);
    showError('Live2D Error: ' + errMsg);
    debugLog('FATAL: ' + errMsg);
    debugLog('Stack: ' + (error && error.stack ? error.stack : 'N/A'));
    setTimeout(() => showFallback(), 3000);
  }
}

const fallbackImg = document.getElementById('fallbackImg');
if (fallbackImg) {
  fallbackImg.addEventListener('click', () => {
    fallbackImg.classList.add('poked');
    setTimeout(() => fallbackImg.classList.remove('poked'), 400);
    vscode.postMessage({ command: 'poke' });
    createSparkle();
  });
}

window.addEventListener('message', (event) => {
  const { command, text } = event.data;
  switch (command) {
    case 'chat:snapshot':
      if (window.__DESKTOP_PET_MODE__) {
        syncQuickChatConversationHistory(event.data.messages || []);
      }
      break;
    case 'showMessage':
      showBubble(text);
      if (event.data.speakText) {
        void speakText(event.data.speakText);
      }
      break;
    case 'setAmbientPreset':
      setAmbientPreset(event.data.preset);
      break;
    case 'setMutedState':
      setGlobalAudioMuted(event.data.muted);
      break;
    case 'playMotion':
      playMotion(event.data.group, event.data.index);
      break;
    case 'setExpression':
      setExpression(event.data.expression, event.data.duration);
      break;
    case 'pomodoroStart':
      setExpression('focus', null);
      showBubble('🍅 Bắt đầu focus thôi nào~ em ngồi cổ vũ Onii-chan đây!');
      playAudio('poke.mp3');
      break;
    case 'pomodoroBreak':
      setExpression('sleepy', null);
      showBubble('🍅 Xong một phiên rồi nè~ nghỉ tay và uống nước chút nha!');
      // Different sound cue for break vs work ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â break uses headpat (gentler)
      playAudio('headpat.mp3');
      if (state.model) {
        try {
          state.model.motion('TapBody');
        } catch (_) {
          // ignore
        }
      }
      break;
    case 'pomodoroStop':
      setExpression('neutral', null);
      showBubble('🍅 Pomodoro dừng lại rồi nha~ khi nào cần em thì mình bắt đầu tiếp!');
      hidePomodoroRing();
      break;
    case 'pomodoroTick':
      if (event.data.state === 'idle' || !event.data.totalSeconds) {
        hidePomodoroRing();
      } else {
        updatePomodoroRing(event.data.state, event.data.secondsLeft, event.data.totalSeconds);
      }
      break;
    case 'tapBody':
      playMotion('TapBody');
      break;
    case 'setMood': {
      state.currentMood = event.data.mood || 'idle';
      updateMoodIndicator();
      const moodExprMap = { happy: 'happy', angry: 'angry', sleepy: 'sleepy', idle: 'neutral' };
      setExpression(moodExprMap[state.currentMood] || 'neutral', null);
      break;
    }
    case 'setAchievementsData':
      updateAchievementsPanelData(event.data.achievements || []);
      break;
    case 'setShowcase':
      applyShowcaseBanner(event.data.showcase || null);
      break;
    case 'showAchievementsPanel':
      showAchievementsPanel();
      break;
    case 'achievementUnlocked':
      showAchievementUnlockEffect(event.data);
      break;
    case 'openShareCardPreview':
      openShareCardPreview(event.data.profile || {});
      break;
    case 'shareCardSaveResult':
      receiveShareCardSaveResult(event.data);
      break;
    case 'showProtectedBranchConfirm':
      showProtectedBranchConfirm(event.data.requestId, event.data.branch);
      break;
    case 'showStageAllConfirm':
      showStageAllConfirm(event.data.requestId, event.data.unstagedCount);
      break;
    case 'showCommitMessageInput':
      showCommitMessageInput(event.data.requestId, event.data.stagedCount);
      break;
    case 'captureModelChibi':
      void handleCaptureModelChibi(event.data.modelId);
      break;
    case 'agentProfile:list:state':
      renderAgentProfileList(event.data.profiles || []);
      break;
    case 'agentProfile:availableTools:state':
      renderAgentAvailableTools(event.data.tools || []);
      break;
    case 'pet:chat:delta':
      appendQuickChatHistoryDelta(event.data.requestId, event.data.delta || '');
      appendBubbleStream(event.data.delta || '');
      break;
    case 'pet:chat:end':
      finishQuickChatHistoryTurn(event.data.requestId, event.data.text || '');
      finishBubbleStream({ autoDismissMs: 12000 });
      break;
    case 'pet:chat:error':
      failQuickChatHistoryTurn(
        event.data.requestId,
        event.data.aborted
          ? 'Đã hủy.'
          : `Lỗi quick chat: ${event.data.message || 'unknown'}`
      );
      errorBubbleStream(
        event.data.aborted
          ? 'Đã hủy.'
          : `Lỗi quick chat: ${event.data.message || 'unknown'}`
      );
      break;
  }
});

// Snapshot the live2D canvas into a PNG, auto-crop the fully-transparent
// borders so the chibi has zero padding, then post the dataURL back to the
// extension which writes it to disk and tells cursor-chibi to reload.
async function handleCaptureModelChibi(modelId) {
  try {
    if (!state.isLive2DReady) {
      vscode.postMessage({
        command: 'modelChibiCaptureFailed',
        reason: 'Live2D model is not ready yet — wait for it to finish loading.',
      });
      return;
    }
    const canvas = document.getElementById('live2dCanvas');
    if (!canvas) {
      vscode.postMessage({ command: 'modelChibiCaptureFailed', reason: 'Canvas element not found.' });
      return;
    }

    // PIXI uses requestAnimationFrame for rendering. Force one extra frame so
    // the canvas pixels we read are the most recent state of the model.
    if (state.app && typeof state.app.render === 'function') {
      try { state.app.render(); } catch (_) { /* ignore */ }
    }
    await new Promise((r) => requestAnimationFrame(() => r()));

    const cropped = autoCropCanvas(canvas);
    if (!cropped) {
      vscode.postMessage({ command: 'modelChibiCaptureFailed', reason: 'Canvas is fully transparent — model not visible.' });
      return;
    }

    const dataUrl = cropped.toDataURL('image/png');
    vscode.postMessage({
      command: 'modelChibiCaptured',
      modelId: modelId || window.__MODEL_ID__,
      dataUrl,
      width: cropped.width,
      height: cropped.height,
    });
  } catch (err) {
    vscode.postMessage({
      command: 'modelChibiCaptureFailed',
      reason: (err && err.message) ? err.message : String(err),
    });
  }
}

// Returns a NEW canvas containing only the non-transparent pixel region of
// `src`. Returns null if the canvas is fully transparent. Reads pixels via a
// 2D context backed by the PIXI WebGL canvas — copying into a 2D canvas first
// because getImageData on a WebGL context isn't always available across browsers.
function autoCropCanvas(src) {
  const w = src.width;
  const h = src.height;
  if (!w || !h) return null;

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  if (!tctx) return null;
  tctx.drawImage(src, 0, 0);

  const data = tctx.getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  // Cap the output image. VS Code's icon decoration honors sizePx more
  // reliably when the source PNG is already small — large source images
  // sometimes render at natural size and ignore the sizePx CSS, which made
  // captured chibis impossible to shrink via the Tune command.
  const MAX_DIM = 96;
  let outW = cw, outH = ch;
  if (Math.max(cw, ch) > MAX_DIM) {
    const ratio = MAX_DIM / Math.max(cw, ch);
    outW = Math.max(1, Math.round(cw * ratio));
    outH = Math.max(1, Math.round(ch * ratio));
  }

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(tmp, minX, minY, cw, ch, 0, 0, outW, outH);
  return out;
}

debugLog('Webview script loaded');
initAmbientAudio();
initLive2D();
