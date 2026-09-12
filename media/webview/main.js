import { state, vscode, debugLog } from './core.js';
import { setExpression } from './expression.js';
import { loadOutfits } from './outfit.js';
import { initMotions } from './motions.js';
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
import { announceModelInventory, applyShowcaseBanner, openShareCardPreview, receiveShareCardSaveResult, renderAgentAvailableTools, renderAgentProfileList, setupModel, showAchievementUnlockEffect, showAchievementsPanel, updateAchievementsPanelData } from './interaction.js';

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

    // Before the first frame: this is what points the library's idle loop at
    // the model's own idle group when it isn't called `Idle`.
    initMotions();

    setupModel();

    // Not awaited: the outfit list is a menu the user may never open, and
    // blocking the reveal of a loaded model on a second fetch would show a
    // blank panel for no reason.
    void loadOutfits(modelUrl).then(() => announceModelInventory());

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
      playMotion('TapBody');
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
    case 'captureWanderFrames':
      void handleCaptureWanderFrames(event.data);
      break;
    case 'setModelVisible':
      setModelVisible(event.data.visible !== false, event.data.fadeMs);
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
/**
 * Fades the character out of the panel, or back in.
 *
 * Used by the wander: she leaves the panel for the editor and comes back. The
 * panel itself is deliberately left in place — hiding the view would tear the
 * webview down and rebuild it, which means reloading the model and a visible
 * stall on the way back. Fading the sprite costs nothing and returns instantly.
 */
function setModelVisible(visible, fadeMs) {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;
  const ms = Number.isFinite(fadeMs) ? Math.max(0, fadeMs) : 420;
  wrapper.style.transition = `opacity ${ms}ms ease`;
  wrapper.style.opacity = visible ? '1' : '0';
  // While she is away the panel must not react to clicks aimed at nothing.
  wrapper.style.pointerEvents = visible ? '' : 'none';

  // She shrinks into the floor on the way out, and grows back on the way in.
  //
  // A plain opacity fade reads as a dissolve: she was there, then she was not.
  // Shrinking first says where she went — down and away, out of the panel, on
  // her way to the editor. The scale is put on the canvas rather than the
  // wrapper because the wrapper also holds the drag pads, the speech bubble
  // and the quickchat panel, none of which should ride along. It is a display
  // transform only: `clientWidth` never changes, so the ResizeObserver that
  // drives fitModel() does not fire and the model needs no refit.
  //
  // Eased slowly at first and quickly at the end, so the eye has time to read
  // her getting smaller before she goes.
  //
  // Two elements, two ways of writing the same shrink.
  //
  // The canvas has nothing else on its transform, so it gets a plain one. The
  // static fallback image carries a `float` keyframe animation, and a keyframe's
  // transform beats an inline one — written that way the shrink would silently
  // do nothing there. The standalone `scale` property composes with the
  // animation instead of fighting it, so the fallback uses that.
  const canvas = document.getElementById('live2dCanvas');
  if (canvas) {
    canvas.style.transformOrigin = 'bottom center';
    canvas.style.transition = `transform ${ms}ms cubic-bezier(0.4, 0, 0.7, 1)`;
    canvas.style.transform = visible ? '' : 'scale(0.45)';
  }
  const fallback = wrapper.querySelector('.character-img');
  if (fallback) {
    fallback.style.transformOrigin = 'bottom center';
    fallback.style.transition = `scale ${ms}ms cubic-bezier(0.4, 0, 0.7, 1)`;
    fallback.style.scale = visible ? '' : '0.45';
  }
}

/**
 * Captures several frames of the model a beat apart, for the wander sprite.
 *
 * A decoration in the editor can only hold a still image, so the character
 * standing in the code would be a photograph — and a photograph of someone who
 * breathes reads as wrong. A handful of frames taken across a couple of seconds
 * of her idle animation, cycled slowly, is enough to put the breath back: the
 * eye reads "alive" from very little movement.
 *
 * Captured once and kept, because the capture is the expensive part (a full
 * canvas pixel read per frame) and the result never changes for a given model.
 */
async function handleCaptureWanderFrames(payload) {
  // Whoever is on this canvas, not whoever the request says. `__MODEL_ID__` is
  // stamped into the page when the view is built, so it describes the model
  // this webview actually loaded — the only honest answer available here.
  const modelId = window.__MODEL_ID__ || payload?.modelId;
  const count = Math.max(1, Math.min(8, payload?.count || 4));
  const gapMs = Math.max(60, Math.min(600, payload?.gapMs || 260));
  try {
    if (!state.isLive2DReady) {
      vscode.postMessage({ command: 'wanderFramesFailed', reason: 'Model not ready yet.' });
      return;
    }
    // The extension names the model it believes is showing, and the capture is
    // filed on disk under that name. If the two disagree the view is mid-reload
    // after a model switch, and photographing the canvas now would file one
    // character's pixels under another's name — in a cache shared by every
    // window on this machine. Refusing costs one retry; agreeing costs a wrong
    // character that persists until something else overwrites it.
    if (payload?.modelId && window.__MODEL_ID__ && payload.modelId !== window.__MODEL_ID__) {
      vscode.postMessage({
        command: 'wanderFramesFailed',
        reason: `Model mismatch: asked for ${payload.modelId}, showing ${window.__MODEL_ID__}.`,
      });
      return;
    }
    const canvas = document.getElementById('live2dCanvas');
    if (!canvas) {
      vscode.postMessage({ command: 'wanderFramesFailed', reason: 'Canvas not found.' });
      return;
    }

    const shots = [];
    for (let i = 0; i < count; i++) {
      // Spread the captures over real time rather than over frames: what makes
      // the cycle read as breathing is the idle animation having moved on, and
      // that is driven by the clock.
      if (i > 0) await new Promise((r) => setTimeout(r, gapMs));
      if (state.app && typeof state.app.render === 'function') {
        try { state.app.render(); } catch (_) { /* ignore */ }
      }
      await new Promise((r) => requestAnimationFrame(() => r()));
      // Kept whole here, and cropped later against a box shared by every shot.
      // Cropping each one to its own bounds is what made her twitch: her
      // silhouette changes as she breathes, so a per-frame box changes size
      // from frame to frame and the decoration re-centres her inside it — a
      // few pixels of jump on every swap, which is far more visible than the
      // breathing it was meant to show.
      const shot = snapshotCanvas(canvas);
      if (shot) shots.push(shot);
    }

    if (shots.length === 0) {
      vscode.postMessage({ command: 'wanderFramesFailed', reason: 'Model is not visible.' });
      return;
    }

    // 450, down from the 560 used when there were only four images to send.
    // The dissolve turned one message of four PNGs into one of sixteen, and a
    // blend compresses worse than a pose does, so the payload grew by rather
    // more than four times. Still comfortably above the ~300px she is drawn at,
    // which is all the cap has to guarantee: the decoration scales down, never
    // up, and anything past that is detail no one sees.
    const keyframes = cropToSharedBox(shots, Math.max(96, payload?.maxDim || 450));
    if (keyframes.length === 0) {
      vscode.postMessage({ command: 'wanderFramesFailed', reason: 'Model is not visible.' });
      return;
    }
    const tweenSteps = Math.max(0, Math.min(6, payload?.tweenSteps ?? 3));
    const frames = crossFadeSequence(keyframes, tweenSteps).map((c) => c.toDataURL('image/png'));
    // The dissolve turned one message of four PNGs into one of sixteen, and a
    // blend compresses worse than a pose, so this is worth being able to see:
    // `maxDim` above is the lever if it ever grows alarming.
    debugLog(
      `Wander capture: ${frames.length} frame(s), ` +
      `${keyframes[0].width}x${keyframes[0].height}, ` +
      `${Math.round(frames.reduce((n, f) => n + f.length, 0) / 1024)} KB`
    );
    vscode.postMessage({ command: 'wanderFramesCaptured', modelId, frames });
  } catch (err) {
    vscode.postMessage({
      command: 'wanderFramesFailed',
      reason: (err && err.message) ? err.message : String(err),
    });
  }
}

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
function autoCropCanvas(src, maxDim) {
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
  // The cap is a parameter, though the cursor chibi is now the only caller:
  // the wander sprite needs every frame cropped to the same box and so crops
  // its own set in `cropToSharedBox`.
  const MAX_DIM = Number.isFinite(maxDim) ? Math.max(16, maxDim) : 96;
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

/**
 * A plain copy of a canvas, pixels and all.
 *
 * The wander capture needs the untouched frame because the crop can only be
 * decided once every frame has been taken — see `cropToSharedBox`.
 */
function snapshotCanvas(src) {
  const w = src.width;
  const h = src.height;
  if (!w || !h) return null;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);
  return out;
}

/**
 * Crops a set of frames to one box that fits them all.
 *
 * The box is the union of every frame's opaque bounds, so the character keeps
 * the same size and the same position within every output image. That is the
 * whole point: a decoration draws its image to fill a fixed box, so any change
 * in the source's proportions between frames shows up as the sprite jumping,
 * and a breathing character's own bounds change by a pixel or two constantly.
 * One box for the whole cycle turns that jump into the stillness it should be.
 */
function cropToSharedBox(canvases, maxDim) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (const c of canvases) {
    const ctx = c.getContext('2d');
    if (!ctx) continue;
    const { width: w, height: h } = c;
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  if (maxX < 0) return [];

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cap = Number.isFinite(maxDim) ? Math.max(16, maxDim) : 560;
  let outW = cw, outH = ch;
  if (Math.max(cw, ch) > cap) {
    const ratio = cap / Math.max(cw, ch);
    outW = Math.max(1, Math.round(cw * ratio));
    outH = Math.max(1, Math.round(ch * ratio));
  }

  const cropped = [];
  for (const c of canvases) {
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) continue;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, minX, minY, cw, ch, 0, 0, outW, outH);
    cropped.push(out);
  }
  return cropped;
}

/**
 * Expands a cycle of frames into one that dissolves between them.
 *
 * The editor sprite is a decoration, and swapping a decoration means swapping
 * the DOM element behind it — a brand-new element renders at its final style,
 * so no CSS transition can ever run on the change. The dissolve therefore has
 * to live in the pixels: between each pair of frames a few in-betweens are
 * drawn with the outgoing frame at falling opacity over the incoming one, and
 * the existing "show each image in turn" loop plays them as a cross-fade.
 *
 * The sequence wraps, so the last frame dissolves back into the first and the
 * cycle has no seam.
 */
function crossFadeSequence(keyframes, steps) {
  if (keyframes.length < 2 || steps <= 0) return keyframes;
  const out = [];
  for (let i = 0; i < keyframes.length; i++) {
    const from = keyframes[i];
    const to = keyframes[(i + 1) % keyframes.length];
    out.push(from);
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      const blend = document.createElement('canvas');
      blend.width = from.width;
      blend.height = from.height;
      const ctx = blend.getContext('2d');
      if (!ctx) continue;
      // Painted incoming-first so the outgoing frame lays over it; either
      // order works, but this one keeps the alpha maths obvious.
      ctx.globalAlpha = 1;
      ctx.drawImage(to, 0, 0);
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(from, 0, 0);
      ctx.globalAlpha = 1;
      out.push(blend);
    }
  }
  return out;
}

debugLog('Webview script loaded');
initAmbientAudio();
initLive2D();
