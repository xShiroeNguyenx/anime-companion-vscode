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
} from './ui.js';
import { setupModel } from './interaction.js';

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

debugLog('Webview script loaded');
initAmbientAudio();
initLive2D();
