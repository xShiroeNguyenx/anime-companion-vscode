import { state, vscode, debugLog } from './core.js';
import { outfitNames } from './outfit.js';
import { faceNames } from './model-expressions.js';
import { motionGroups } from './motions.js';

/**
 * Coach marks for the press-and-hold gestures.
 *
 * A hold on the body opens the wardrobe and a hold on the head opens the
 * model's expressions and motions — but nothing on screen says so, and a
 * gesture nobody discovers might as well not exist. After a stretch with no
 * interaction, a small pill appears beside the character with an arrow to the
 * exact spot to hold, alternating between the two gestures, and keeps coming
 * back while the model is left alone. A hint rests for the rest of the session
 * once the user has performed that hold (or clicked the pill); a reload starts
 * over, and the `hints.enabled` setting turns them off for good. Nothing is
 * persisted: an earlier build remembered "learned" across reloads, and after a
 * round of testing the hints simply never came back.
 */

const FIRST_DELAY_MS = 60_000;
// Gap between one hint fading and the next appearing.
const REPEAT_MS = 60_000;
const RETRY_MS = 30_000;
// Long enough to be noticed from the corner of the eye and read at leisure;
// any touch on the model dismisses it sooner.
const VISIBLE_MS = 40_000;
const KINDS = ['outfit', 'features'];

/** Where on the model each hint points, as a fraction of the model's height. */
const TARGET_Y = { outfit: 0.55, features: 0.18 };
/** Which side of the character the pill prefers; flipped when it would not fit. */
const PREFERRED_SIDE = { outfit: 'left', features: 'right' };

let root = null;
let translate = (key, fallback) => fallback;
let onOpen = null;
let enabled = true;
let showTimer = null;
let hideTimer = null;
let rotation = 0;
let current = null;
/** Gestures already used this session; their hints rest until the next load. */
const learned = new Set();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Drops the counter an earlier build persisted, so it cannot mute anything. */
function forgetPersistedCounters() {
  try {
    const stored = vscode.getState?.();
    if (stored && typeof stored === 'object' && 'hintsSeen' in stored) {
      const { hintsSeen, ...rest } = stored;
      void hintsSeen;
      vscode.setState?.(rest);
    }
  } catch {
    // No webview state on this bridge — nothing to clean.
  }
}

function eligible(kind) {
  if (learned.has(kind)) return false;
  if (kind === 'outfit') return outfitNames().length > 0;
  return faceNames().length > 0 || motionGroups().length > 0;
}

/** Anything already on stage means the hint would only be in the way. */
function busy() {
  return Boolean(
    document.querySelector(
      '.companion-side-panel.show, .companion-radial.show, .companion-context-menu.show, ' +
        '.companion-container.chat-open, .companion-agent-panel.show, ' +
        '.companion-voice-panel.show, .companion-message-panel.show, .companion-ambient-panel.show'
    )
  );
}

function ensureRoot() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;
  document.querySelector('.companion-hint')?.remove();
  root = document.createElement('div');
  root.className = 'companion-hint';
  root.innerHTML =
    '<svg class="companion-hint-arrow" aria-hidden="true">' +
    '<defs><marker id="companion-hint-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">' +
    '<path d="M0,0 L10,5 L0,10 z" class="companion-hint-arrowhead"></path></marker></defs>' +
    // The arrow nudges toward the target and the spot ripples, so the eye
    // lands where the finger should before the text is even read.
    '<g class="companion-hint-arrow-group"><line class="companion-hint-line" x1="0" y1="0" x2="0" y2="0" marker-end="url(#companion-hint-head)"></line></g>' +
    '<circle class="companion-hint-glow" cx="0" cy="0" r="20"></circle>' +
    '<circle class="companion-hint-ring" cx="0" cy="0" r="10"></circle>' +
    '<circle class="companion-hint-ring companion-hint-ring--late" cx="0" cy="0" r="10"></circle>' +
    '<circle class="companion-hint-dot" cx="0" cy="0" r="3.5"></circle>' +
    '</svg>' +
    '<button type="button" class="companion-hint-pill"></button>';
  wrapper.appendChild(root);

  // The pill is a shortcut as well as a sign: clicking it opens what the hold
  // would have, and counts as having learned the gesture.
  root.querySelector('.companion-hint-pill').addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = current;
    hideHint();
    if (kind) {
      markLearned(kind);
      if (typeof onOpen === 'function') onOpen(kind);
    }
  });
  return root;
}

function schedule(ms) {
  clearTimeout(showTimer);
  showTimer = null;
  if (!enabled) return;
  showTimer = setTimeout(tick, ms);
}

function tick() {
  showTimer = null;
  if (!state.isLive2DReady || document.hidden || busy()) {
    schedule(RETRY_MS);
    return;
  }
  const kinds = KINDS.filter(eligible);
  if (kinds.length === 0) return; // Both gestures used this session, or nothing to point at.
  const kind = kinds[rotation % kinds.length];
  rotation++;
  show(kind);
  schedule(VISIBLE_MS + REPEAT_MS);
}

function show(kind) {
  if (!root || !state.model) return;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;
  const W = wrapper.clientWidth;
  const H = wrapper.clientHeight;
  if (W < 120 || H < 120) return;

  let bounds;
  try {
    bounds = state.model.getBounds();
  } catch {
    return;
  }
  const target = {
    x: clamp(bounds.x + bounds.width / 2, 12, W - 12),
    y: clamp(bounds.y + bounds.height * TARGET_Y[kind], 12, H - 12),
  };

  const pill = root.querySelector('.companion-hint-pill');
  pill.textContent =
    kind === 'features'
      ? translate('hints.holdHead', 'Giữ nhẹ chỗ này để em đổi biểu cảm & động tác nha~ 😊🎬')
      : translate('hints.holdBody', 'Giữ nhẹ chỗ này để em thay đồ nha~ 👗');
  root.classList.add('measuring');
  const pw = pill.offsetWidth;
  const ph = pill.offsetHeight;
  root.classList.remove('measuring');

  // The pill is measured from the model's EDGE, not from the spot the arrow
  // points at: the target sits on the character's centre line, so a gap taken
  // from there put the pill on top of an arm. Clearing the silhouette is what
  // matters — the arrow is what connects the two, and it can be as long as it
  // needs to be.
  const gap = 12;
  const leftEdge = clamp(bounds.x, 0, W);
  const rightEdge = clamp(bounds.x + bounds.width, 0, W);
  let side = PREFERRED_SIDE[kind];
  const placeLeft = () => leftEdge - gap - pw;
  const placeRight = () => rightEdge + gap;
  let px = side === 'right' ? placeRight() : placeLeft();
  // Flip sides only when the other one can actually hold the pill clear of
  // the model; flipping into a margin that is just as tight would move the
  // pill for nothing and make the two hints point from inconsistent sides.
  const fitsLeft = placeLeft() >= 6;
  const fitsRight = placeRight() + pw <= W - 6;
  if (side === 'left' && !fitsLeft && fitsRight) {
    side = 'right';
    px = placeRight();
  } else if (side === 'right' && !fitsRight && fitsLeft) {
    side = 'left';
    px = placeLeft();
  }

  // The margin beside a bottom-anchored full-body model is usually narrower
  // than the pill, so "outside the silhouette" is often impossible. Second
  // best is as far out as the panel allows: pinned to the panel edge, the
  // pill covers only the outer edge of the hair or a sleeve instead of
  // sitting across the character's face and body.
  const edge = 4;
  if (px < edge || px + pw > W - edge) {
    px = side === 'right' ? W - edge - pw : edge;
  }
  px = clamp(px, edge, Math.max(edge, W - pw - edge));
  const py = clamp(target.y - ph / 2, 6, Math.max(6, H - ph - 6));
  pill.style.left = px + 'px';
  pill.style.top = py + 'px';

  // Arrow from the pill's near edge to just short of the target ring.
  const sx = side === 'right' ? px : px + pw;
  const sy = py + ph / 2;
  const dx = target.x - sx;
  const dy = target.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  const ex = target.x - (dx / len) * 16;
  const ey = target.y - (dy / len) * 16;
  const line = root.querySelector('.companion-hint-line');
  line.setAttribute('x1', String(sx));
  line.setAttribute('y1', String(sy));
  line.setAttribute('x2', String(ex));
  line.setAttribute('y2', String(ey));
  // Direction for the nudge animation, as unit-vector CSS variables.
  root.style.setProperty('--hint-nx', String(dx / len));
  root.style.setProperty('--hint-ny', String(dy / len));
  root.querySelectorAll('.companion-hint-glow, .companion-hint-ring, .companion-hint-dot').forEach((circle) => {
    circle.setAttribute('cx', String(target.x));
    circle.setAttribute('cy', String(target.y));
  });

  current = kind;
  root.classList.add('show');
  debugLog('Hint: ' + kind);

  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideHint, VISIBLE_MS);
}

function markLearned(kind) {
  learned.add(kind);
}

/**
 * Starts the idle timer for the loaded model.
 * @param {{ translate: Function, onOpen?: (kind: 'outfit'|'features') => void }} options
 */
export function initHints(options) {
  translate = options?.translate || translate;
  onOpen = options?.onOpen || null;
  enabled = window.__HINTS_ENABLED__ !== false;
  if (!ensureRoot()) return;
  learned.clear();
  forgetPersistedCounters();
  rotation = 0;
  current = null;
  schedule(FIRST_DELAY_MS);
}

/** Hides the current hint, if any. */
export function hideHint() {
  clearTimeout(hideTimer);
  hideTimer = null;
  current = null;
  root?.classList.remove('show');
}

/** Any touch on the model: hide the hint and push the next one out again. */
export function noteInteraction() {
  hideHint();
  schedule(REPEAT_MS);
}

/** A hold actually opened a panel: that gesture no longer needs teaching. */
export function noteHoldUsed(region) {
  markLearned(region === 'head' ? 'features' : 'outfit');
  hideHint();
}
