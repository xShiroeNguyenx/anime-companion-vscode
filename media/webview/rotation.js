import { state, debugLog } from './core.js';

// ─── Drag-to-rotate (Plan 1: pseudo-3D head/body turn) ───────────────────────
//
// Alt + left-drag turns the model's head/body by steering pixi-live2d-display's
// built-in focus controller instead of writing Cubism params ourselves.
//
// Why the focus controller (and not setParameterValueById on app.ticker): the
// model applies the focus angles inside its OWN update loop, right after the
// motion manager and expression manager run —
//     …afterMotionUpdate → saveParameters → expression → eyeBlink → updateFocus()…
// updateFocus() does `addParameterValueById(ParamAngleX, 30*focus.x)` etc., so
// the turn is layered ON TOP of the idle head-sway motion and is NOT overwritten
// by it. A raw setParameterValueById on app.ticker runs at a different time than
// this update, so the idle motion clobbered it (head/body wouldn't turn).
//
// focusController.focus(x, y, instant) takes x,y ∈ [-1,1]; the controller drives
// ParamAngleX/Y/Z (±30°), ParamBodyAngleX (±10°) and ParamEyeBallX/Y (±1). It's a
// bounded 2.5D turn — not a true 360° spin (Live2D has no back face).

// Drag distance (px) that maps to full deflection. Smaller = more sensitive.
const DRAG_RANGE_PX = 140;

let active = false;
let startX = 0;
let startY = 0;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function getFocusController() {
  return state.model?.internalModel?.focusController || null;
}

export function isModelRotating() { return active; }

export function startModelRotation(clientX, clientY) {
  if (!getFocusController()) {
    debugLog('Rotate: model has no focusController — gesture ignored');
    return;
  }
  active = true;
  startX = clientX;
  startY = clientY;
  debugLog('Rotate start: x=' + clientX + ', y=' + clientY);
}

export function updateModelRotation(clientX, clientY) {
  if (!active) return;
  const fc = getFocusController();
  if (!fc) return;
  // Direct manipulation: drag right → look right, drag down → look down. (ParamAngleY
  // positive = look up, so dragging down — positive screen dy — must give a negative
  // focus.y, hence the negate.) instant=true makes the head track the cursor 1:1
  // while held, so it feels like grabbing and turning rather than a laggy follow.
  const nx = clamp((clientX - startX) / DRAG_RANGE_PX, -1, 1);
  const ny = clamp((clientY - startY) / DRAG_RANGE_PX, -1, 1);
  fc.focus(nx, -ny, true);
}

export function endModelRotation() {
  if (!active) return;
  active = false;
  const fc = getFocusController();
  // Re-target center WITHOUT instant so the controller's own per-frame update
  // eases the head smoothly back to neutral, then the idle motion takes over.
  if (fc) fc.focus(0, 0);
  debugLog('Rotate end → ease back to center');
}

// ─── Follow-cursor mode (toggleable from the right-click menu) ────────────────
//
// When enabled, the head/eyes smoothly track the mouse while it hovers over the
// companion — same focus controller, but eased (no `instant`) and driven by
// hover rather than Alt-drag. Alt-drag still wins while it's held.

let followEnabled = false;

// Eye-line height as a ratio of canvas height. Bottom-anchored full-body models
// put the face well above centre, so look-at should pivot around ~30% down.
const FOLLOW_HEAD_Y_RATIO = 0.30;

// "Dizzy" reaction: whipping the cursor back and forth fast (many quick
// horizontal direction reversals) makes the model complain and hold its gaze
// forward for a beat — so following feels like a two-way interaction. Browser
// clock is fine here (webview code, not a workflow script).
const DIZZY_MIN_MOVE_PX = 4;     // ignore sub-pixel jitter when reading direction
const DIZZY_RAPID_GAP_MS = 450;  // reversals closer than this count as "rapid"
const DIZZY_RAPID_COUNT = 4;     // this many rapid reversals in a row → dizzy
const DIZZY_COOLDOWN_MS = 6000;  // min spacing between dizzy reactions
const DIZZY_PAUSE_MS = 900;      // hold gaze forward while dizzy

let dizzyHandler = null;
let lastFollowX = 0;
let lastFollowDir = 0;       // -1 / 0 / 1
let rapidReversals = 0;
let lastReversalAt = 0;
let dizzyCooldownUntil = 0;
let followPausedUntil = 0;

export function isFollowEnabled() { return followEnabled; }

// interaction.js registers what a dizzy spell actually does (bubble + expression
// + sound). Keeping the reaction out of here leaves rotation.js focused on the
// cursor-motion mechanics.
export function setDizzyHandler(fn) { dizzyHandler = fn; }

export function setFollowCursor(enabled) {
  followEnabled = !!enabled;
  if (!followEnabled) {
    recenterFollow();
    lastFollowDir = 0;
    rapidReversals = 0;
    followPausedUntil = 0;
  }
  debugLog('Focus follow: ' + followEnabled);
}

// Map an absolute cursor position to a focus target relative to the model's
// (approximate) head and steer the controller. No-op while Alt-dragging.
export function applyFollowFocus(clientX, clientY) {
  if (!followEnabled || active) return;
  const fc = getFocusController();
  if (!fc) return;
  const canvas = document.getElementById('live2dCanvas');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;

  const now = Date.now();

  // While dizzy, hold the gaze forward instead of chasing the cursor.
  if (now < followPausedUntil) {
    fc.focus(0, 0);
    lastFollowX = clientX;
    return;
  }

  detectDizzyWiggle(clientX, now);

  // detectDizzyWiggle may have just started a pause — honour it immediately.
  if (now < followPausedUntil) {
    fc.focus(0, 0);
    return;
  }

  const refX = r.left + r.width / 2;
  const refY = r.top + r.height * FOLLOW_HEAD_Y_RATIO;
  const nx = clamp((clientX - refX) / (r.width / 2), -1, 1);
  const ny = clamp((clientY - refY) / (r.height / 2), -1, 1);
  fc.focus(nx, -ny); // eased (no instant) → natural follow
}

// Count rapid horizontal direction reversals; trip the dizzy reaction once they
// pile up fast enough. Resets the run whenever a reversal comes in too slowly.
function detectDizzyWiggle(clientX, now) {
  const dx = clientX - lastFollowX;
  if (Math.abs(dx) < DIZZY_MIN_MOVE_PX) return;
  const dir = dx > 0 ? 1 : -1;
  const reversed = lastFollowDir !== 0 && dir !== lastFollowDir;
  lastFollowDir = dir;
  lastFollowX = clientX;
  if (!reversed) return;

  rapidReversals = (now - lastReversalAt <= DIZZY_RAPID_GAP_MS) ? rapidReversals + 1 : 1;
  lastReversalAt = now;
  if (rapidReversals >= DIZZY_RAPID_COUNT && now >= dizzyCooldownUntil) triggerDizzy(now);
}

function triggerDizzy(now) {
  rapidReversals = 0;
  dizzyCooldownUntil = now + DIZZY_COOLDOWN_MS;
  followPausedUntil = now + DIZZY_PAUSE_MS;
  debugLog('Follow: dizzy from rapid cursor wiggling');
  if (!dizzyHandler) return;
  try {
    dizzyHandler();
  } catch (err) {
    debugLog('Dizzy handler failed: ' + (err && err.message ? err.message : String(err)));
  }
}

export function recenterFollow() {
  const fc = getFocusController();
  if (fc) fc.focus(0, 0);
}
