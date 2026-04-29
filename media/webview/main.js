// ───────────────────────────────────────────────────────────────────────────
// 🌸 Anime Companion — Live2D Webview Entry Point
// ───────────────────────────────────────────────────────────────────────────

import { state, vscode, debugLog } from './core.js';
import { setExpression } from './expression.js';
import { updateMoodIndicator } from './expression.js';
import { playAudio } from './audio.js';
import { showBubble, showError, showLoading, hideLoading, showFallback, playMotion, createSparkle, showProtectedBranchConfirm, showStageAllConfirm, showCommitMessageInput } from './ui.js';
import { setupModel } from './interaction.js';

// ─── Initialize Live2D ──────────────────────────────────────────────────
async function initLive2D() {
  try {
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

// ─── Fallback PNG click → still poke ────────────────────────────────────
const fallbackImg = document.getElementById('fallbackImg');
if (fallbackImg) {
  fallbackImg.addEventListener('click', () => {
    fallbackImg.classList.add('poked');
    setTimeout(() => fallbackImg.classList.remove('poked'), 400);
    vscode.postMessage({ command: 'poke' });
    createSparkle();
  });
}

// ─── Messages from extension host ──────────────────────────────────────
window.addEventListener('message', (event) => {
  const { command, text } = event.data;
  switch (command) {
    case 'showMessage':
      showBubble(text);
      break;
    case 'playMotion':
      playMotion(event.data.group, event.data.index);
      break;
    case 'setExpression':
      // duration optional — when undefined, expression sticks until next call
      setExpression(event.data.expression, event.data.duration);
      break;
    case 'pomodoroStart':
      setExpression('focus', null);
      showBubble("🍅 Bắt đầu làm việc thôi! Cố lên nha~");
      playAudio('poke.mp3');
      break;
    case 'pomodoroBreak':
      setExpression('sleepy', null);
      showBubble("🍅 Hết 25 phút rồi! Nghỉ tay, uống nước đi~");
      if (state.model) { try { state.model.motion('TapBody'); } catch (_) { /* ignore */ } }
      break;
    case 'pomodoroStop':
      setExpression('neutral', null);
      showBubble("🍅 Đã dừng Pomodoro!");
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
    case 'showProtectedBranchConfirm':
      showProtectedBranchConfirm(event.data.requestId, event.data.branch);
      break;
    case 'showStageAllConfirm':
      showStageAllConfirm(event.data.requestId, event.data.unstagedCount);
      break;
    case 'showCommitMessageInput':
      showCommitMessageInput(event.data.requestId, event.data.stagedCount);
      break;
  }
});

// ─── Start ──────────────────────────────────────────────────────────────
debugLog('Webview script loaded');
initLive2D();
