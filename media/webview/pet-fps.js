// How often the Live2D character is drawn, and whether at all. Pure; used by
// main.js and scripts/pet-fps-test.js.
//
// PIXI draws at the display's refresh rate by default: 120 frames a second on
// many laptops, even while she only stands and breathes. 30 is smooth enough
// for that; while the user moves, clicks or drags around her, 60 for a few
// seconds keeps the response feeling direct. A VS Code window that is open but
// not focused gets 15, and the extension host stops it altogether after a while
// (src/render-gate.ts): with three or four windows open, only one is in use.

export const IDLE_FPS = 30;
export const ACTIVE_FPS = 60;
/** Window open but not focused. */
export const BACKGROUND_FPS = 15;
/** How long after the last pointer / key event the faster pace holds (ms). */
export const ACTIVE_HOLD_MS = 3000;

/** The modes the extension host sends; anything else counts as 'run'. */
export function normalizeMode(mode) {
  return mode === 'slow' || mode === 'paused' ? mode : 'run';
}

/** Whether the last pointer / key event, at `lastActiveAt` (ms), still counts. */
export function isRecentlyActive(now, lastActiveAt) {
  if (!Number.isFinite(lastActiveAt)) return false;
  const since = now - lastActiveAt;
  return since >= 0 && since < ACTIVE_HOLD_MS;
}

/**
 * Frame-rate cap. `mode` comes from the extension host: 'run' (focused window),
 * 'slow' (open but not focused), 'paused' (draw only when the user reaches for her).
 */
export function fpsAt(now, lastActiveAt, mode = 'run') {
  if (isRecentlyActive(now, lastActiveAt)) return ACTIVE_FPS;
  return normalizeMode(mode) === 'slow' ? BACKGROUND_FPS : IDLE_FPS;
}

/**
 * Blend factor for a frame lasting `deltaMS`, chosen so that the result over
 * TIME equals blending `perFrame60` every frame at 60 fps, whatever the rate.
 */
export function blendAlpha(perFrame60, deltaMS) {
  const p = Math.min(1, Math.max(0, Number(perFrame60) || 0));
  const frames = Math.min(30, Math.max(0, Number(deltaMS) || 0) / (1000 / 60));
  return 1 - Math.pow(1 - p, frames);
}

/**
 * Whether the ticker should run. `holds` > 0 forces it on (a frame capture
 * needs the idle animation to move on even while nobody can see the panel).
 * 'paused' gives way to the pointer: a window on a second screen receives
 * pointer events without being focused, so moving the mouse over her is enough.
 */
export function shouldRun({ mode, docHidden, modelHidden, holds, recentlyActive }) {
  if (holds > 0) return true;
  if (docHidden || modelHidden) return false;
  return normalizeMode(mode) !== 'paused' || recentlyActive === true;
}

/** Whether the endless CSS loops (pulse, bob, sweep…) should stand still. */
export function cssPaused({ run, mode, recentlyActive }) {
  if (!run) return true;
  return normalizeMode(mode) !== 'run' && recentlyActive !== true;
}
