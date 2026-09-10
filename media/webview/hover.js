import { state, debugLog } from './core.js';
import { setExpression } from './expression.js';
import { motionGroups } from './motions.js';

/**
 * Hovering a part of the character.
 *
 * Three things happen when the cursor rests on the model, all keyed to the
 * body part under it:
 *
 *   1. a reaction — the face and pose answer being hovered: a headpat-adjacent
 *      look on the head, a shy turn away at the chest or skirt, a small "hm?"
 *      at the body;
 *   2. a cursor and a label — the pointer becomes that part's own cursor
 *      (comb, dress, barred heart, barred bow, open hand), and a small
 *      caption names the part and the gesture it takes;
 *   3. an outline — the part's box is traced for a moment so it reads as a
 *      thing you can touch rather than a picture.
 *
 * On top of resting, the cursor can DO things to a part: scrub back and forth
 * across the waist to tickle, stroke the head slowly to pet her hair, or take
 * an offered hand. Those live further down under "Gestures".
 *
 * Everything waits for the cursor to STOP. A pointer crossing the model on its
 * way somewhere else fires nothing: only a dwell of DWELL_MS on the same part
 * counts, each part then rests for COOLDOWN_MS, and reactions never interrupt
 * a drag, a rotate, an open panel or a hold in progress. This is the difference
 * between a companion that responds and one that twitches.
 *
 * Regions come from the model's own hit areas when it declares useful ones —
 * most do not: of the four bundled models, one names "Body" and nothing else —
 * so the fallback is the DRAWN figure's box (see modelSilhouette) cut into
 * bands (head, chest, body, skirt) and columns (left arm, right arm). Rough,
 * but it hugs the character instead of the canvas around her.
 */

/** Cursor must rest this long on one part before anything reacts. */
const DWELL_MS = 450;
/** Each part rests this long after reacting, so a hovering cursor is not a loop. */
const COOLDOWN_MS = 9000;
/** How long the outline and the label stay up. */
const LABEL_MS = 2600;
/** Outlines only guide while the model is new; after this many ms they stop. */
const OUTLINE_SESSION_MS = 120_000;
/** Reaction expressions hold this long before easing back to the mood. */
const REACT_MS = 2200;

/**
 * Bands of the model's bounding box, top to bottom, as height fractions.
 * A full-body rig puts the face in the top third; the numbers are the same
 * family as HEAD_RATIO in interaction.js so hover and hold agree on "head".
 */
const BANDS = [
  { region: 'head', to: 0.30 },
  { region: 'chest', to: 0.46 },
  { region: 'body', to: 0.72 },
  { region: 'skirt', to: 1.01 },
];

/** Outside this middle slice of the model's width, arms take over the band. */
const ARM_EDGE = 0.24;
/** Arms only exist beside the torso, not beside the head or the feet. */
const ARM_BAND = { from: 0.30, to: 0.72 };

/**
 * Cursor shown over each region, as a modifier class on the wrapper.
 *
 * Each part has a cursor of its own, drawn in the heart cursor's family —
 * the same pink arrow tip and tail, a different icon in the middle — so the
 * pointer says what the part does before anything else has to: a comb over
 * the hair, a dress over the body, a barred heart and a barred bow over the
 * parts she would rather you left alone, an open hand over hers. The images
 * live in companion.css as --cursor-* variables.
 */
const CURSOR_CLASS = {
  head: 'hover-cursor-head',
  chest: 'hover-cursor-chest',
  body: 'hover-cursor-body',
  skirt: 'hover-cursor-skirt',
  arm: 'hover-cursor-arm',
};
const CURSOR_CLASSES = Object.values(CURSOR_CLASS);

/**
 * What each region does when the cursor rests on it. `expression` is a mood
 * preset from expression.js; `motion` names the kind of motion group to look
 * for, and is skipped when the model declares none.
 */
const REACTIONS = {
  head: { expression: 'shy', labelKey: 'hover.head', labelFallback: 'Anh giữ chỗ này xíu đi~ em làm mặt vui cho anh xem nè 😊' },
  chest: { expression: 'angry', labelKey: 'hover.chest', labelFallback: 'Ơ... anh đừng nhìn chỗ đó mà~ 😳' },
  body: { expression: 'happy', labelKey: 'hover.body', labelFallback: 'Anh giữ chỗ này xíu đi, em thay đồ cho anh xem nha~ 👗' },
  skirt: { expression: 'angry', labelKey: 'hover.skirt', labelFallback: 'Hửm?! Chỗ đó không được đâu nha anh~ 💢' },
  arm: { expression: 'happy', motion: 'hand', labelKey: 'hover.arm', labelFallback: 'Anh nắm tay em đi~ 👋' },
};

/** Regions whose reaction is a refusal — they also nudge the gaze away. */
const BASHFUL = new Set(['chest', 'skirt']);

let translate = (key, fallback) => fallback;
let enabled = true;
let isBusy = () => false;
let root = null;
let outlineEl = null;
let labelEl = null;
let canvasEl = null;

let dwellTimer = null;
let labelTimer = null;
let hoverRegion = null;
let lastPoint = null;
let modelReadyAt = 0;
/** region → timestamp it last reacted, for the per-region cooldown. */
const cooldowns = new Map();

function now() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the character is actually DRAWN, in wrapper pixels.
 *
 * model.getBounds() is the whole Live2D canvas, and a canvas carries generous
 * transparent margins around the figure — on a_001 the "arm" columns derived
 * from it hung in empty air a hand's width from her sleeves. So the box is
 * taken from the meshes themselves: the union of every visible drawable's
 * vertices, pushed through the same two transforms the library inverts for
 * its own hit test (localTransform, then the display object's worldTransform).
 * Refreshed at most a few times a second: the cursor moves more often than
 * the figure does, and a few frames of staleness are invisible.
 */
const SILHOUETTE_TTL_MS = 120;
let silhouetteFor = null;
let silhouetteAt = 0;
let silhouetteBox = null;

export function modelSilhouette() {
  const model = state.model;
  if (!model) return null;
  const t = now();
  if (silhouetteFor === model && t - silhouetteAt < SILHOUETTE_TTL_MS) return silhouetteBox;
  silhouetteFor = model;
  silhouetteAt = t;
  silhouetteBox = null;

  try {
    const internal = model.internalModel;
    const core = internal?.coreModel;
    const local = internal?.localTransform;
    const world = model.worldTransform;
    if (!core || !local || !world) return null;

    const count = core.getDrawableCount();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      if (core.getDrawableOpacity(i) <= 0.01) continue;
      if (typeof core.getDrawableDynamicFlagIsVisible === 'function' && !core.getDrawableDynamicFlagIsVisible(i)) continue;
      const v = core.getDrawableVertexPositions(i);
      for (let k = 0; k + 1 < v.length; k += 2) {
        const x = v[k];
        const y = v[k + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!(minX < maxX && minY < maxY)) return null;

    // Affine transforms map a box's corners to the new box's corners.
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const [x, y] of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]]) {
      const p = world.apply(local.apply({ x, y }));
      if (p.x < left) left = p.x;
      if (p.x > right) right = p.x;
      if (p.y < top) top = p.y;
      if (p.y > bottom) bottom = p.y;
    }
    if (!(right - left > 4 && bottom - top > 4)) return null;
    silhouetteBox = { x: left, y: top, width: right - left, height: bottom - top };
  } catch {
    silhouetteBox = null;
  }
  return silhouetteBox;
}

/** The drawn figure when it can be measured, else the model's own box. */
function figureBounds() {
  const box = modelSilhouette();
  if (box) return box;
  try {
    return state.model?.getBounds() ?? null;
  } catch {
    return null;
  }
}

/**
 * Which part of the character is under this point, or null when the point is
 * off the model. Hit areas win where the model names them usefully; otherwise
 * the bounding box is cut into bands and arm columns.
 */
export function hoverRegionAt(point) {
  const model = state.model;
  if (!point || !model) return null;

  const bounds = figureBounds();
  if (!bounds || bounds.width < 4 || bounds.height < 4) return null;
  if (
    point.x < bounds.x ||
    point.x > bounds.x + bounds.width ||
    point.y < bounds.y ||
    point.y > bounds.y + bounds.height
  ) {
    return null;
  }

  // A named hit area is the model author speaking; trust it over our bands,
  // but only for the two names that are actually common.
  try {
    const hits = model.hitTest?.(point.x, point.y) ?? [];
    if (hits.some((name) => /head|face|头|頭|顔/i.test(name))) return 'head';
  } catch {
    // No hit areas — the box below is the whole answer.
  }

  const ny = (point.y - bounds.y) / bounds.height;
  const nx = (point.x - bounds.x) / bounds.width;

  if (ny >= ARM_BAND.from && ny < ARM_BAND.to && (nx < ARM_EDGE || nx > 1 - ARM_EDGE)) {
    return 'arm';
  }
  for (const band of BANDS) {
    if (ny < band.to) return band.region;
  }
  return 'body';
}

/** Box of a region in wrapper coordinates, for the outline. */
function regionBox(region) {
  if (!state.model) return null;
  const bounds = figureBounds();
  if (!bounds) return null;

  if (region === 'arm') {
    // Both arms at once would need two boxes; outline the one the cursor is
    // nearest instead, which is the one the user is pointing at.
    const leftSide = !lastPoint || lastPoint.x < bounds.x + bounds.width / 2;
    return {
      x: leftSide ? bounds.x : bounds.x + bounds.width * (1 - ARM_EDGE),
      y: bounds.y + bounds.height * ARM_BAND.from,
      width: bounds.width * ARM_EDGE,
      height: bounds.height * (ARM_BAND.to - ARM_BAND.from),
    };
  }

  let from = 0;
  for (const band of BANDS) {
    if (band.region === region) {
      return {
        x: bounds.x + bounds.width * ARM_EDGE * 0.6,
        y: bounds.y + bounds.height * from,
        width: bounds.width * (1 - ARM_EDGE * 1.2),
        height: bounds.height * (Math.min(band.to, 1) - from),
      };
    }
    from = band.to;
  }
  return null;
}

function ensureRoot() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;
  if (root && root.isConnected) return root;

  document.querySelector('.companion-hover')?.remove();
  root = document.createElement('div');
  root.className = 'companion-hover';
  root.innerHTML =
    '<div class="companion-hover-outline"></div>' +
    '<div class="companion-hover-label"></div>';
  wrapper.appendChild(root);
  outlineEl = root.querySelector('.companion-hover-outline');
  labelEl = root.querySelector('.companion-hover-label');
  return root;
}

/**
 * The wrapper and canvas carry the cursor class, so the shape follows the part
 * underneath. A class rather than an inline style: PIXI writes the heart
 * cursor inline on the canvas, and the CSS rule can win that on its own terms
 * without us having to put it back afterwards.
 */
function applyCursor(region) {
  const wrapper = document.getElementById('characterWrapper');
  if (!canvasEl) canvasEl = document.getElementById('live2dCanvas');
  const wanted = region ? CURSOR_CLASS[region] || null : null;
  for (const el of [wrapper, canvasEl]) {
    if (!el) continue;
    for (const cls of CURSOR_CLASSES) el.classList.toggle(cls, cls === wanted);
  }
}

/**
 * Traces the part for a moment. Only while the model is new: once someone has
 * had the companion open for a couple of minutes, outlining what they already
 * know is noise.
 */
function showOutline(region) {
  if (!outlineEl) return;
  if (modelReadyAt && now() - modelReadyAt > OUTLINE_SESSION_MS) return;
  const box = regionBox(region);
  if (!box) return;
  const wrapper = document.getElementById('characterWrapper');
  const W = wrapper?.clientWidth ?? 0;
  const H = wrapper?.clientHeight ?? 0;
  const x = clamp(box.x, 0, Math.max(0, W - 8));
  const y = clamp(box.y, 0, Math.max(0, H - 8));
  outlineEl.style.left = x + 'px';
  outlineEl.style.top = y + 'px';
  outlineEl.style.width = clamp(box.width, 8, Math.max(8, W - x)) + 'px';
  outlineEl.style.height = clamp(box.height, 8, Math.max(8, H - y)) + 'px';
  outlineEl.classList.add('show');
}

/**
 * Places the caption BESIDE the character, never on top of it.
 *
 * On the character the text was unreadable: a translucent pill over hair and a
 * dress is text on a busy, unpredictable background, and the parts most worth
 * labelling are exactly the ones with the most going on behind them. So the
 * caption goes to whichever side of the model has more free room, level with
 * the part it names, and only falls back to overlapping when the panel is too
 * narrow to have a side at all.
 */
function showLabel(text) {
  if (!labelEl) return;
  const wrapper = document.getElementById('characterWrapper');
  const W = wrapper?.clientWidth ?? 0;
  const H = wrapper?.clientHeight ?? 0;
  labelEl.textContent = text;
  labelEl.classList.add('measuring');
  const lw = labelEl.offsetWidth;
  const lh = labelEl.offsetHeight;
  labelEl.classList.remove('measuring');

  const bounds = figureBounds();

  const gap = 8;
  let x;
  let y;
  if (bounds) {
    // Whichever margin actually fits the pill; the wider one when both do.
    const roomLeft = bounds.x;
    const roomRight = W - (bounds.x + bounds.width);
    const needed = lw + gap * 2;
    const useRight = roomRight >= roomLeft ? roomRight >= needed : roomLeft < needed;
    x = useRight ? bounds.x + bounds.width + gap : bounds.x - gap - lw;
    // Level with the part, so the caption still points at what it names.
    y = (lastPoint?.y ?? bounds.y + bounds.height / 2) - lh / 2;
    // Neither side has room (a narrow panel): sit under the model instead,
    // where the background is the panel rather than the character.
    if (x < 2 || x + lw > W - 2) {
      x = clamp(bounds.x + bounds.width / 2 - lw / 2, 4, Math.max(4, W - lw - 4));
      y = bounds.y + bounds.height + gap;
      if (y + lh > H - 2) y = Math.max(4, bounds.y - gap - lh);
    }
  } else {
    x = clamp((lastPoint?.x ?? W / 2) - lw / 2, 4, Math.max(4, W - lw - 4));
    y = clamp((lastPoint?.y ?? H / 2) - lh - 14, 4, Math.max(4, H - lh - 4));
  }

  labelEl.style.left = clamp(x, 2, Math.max(2, W - lw - 2)) + 'px';
  labelEl.style.top = clamp(y, 2, Math.max(2, H - lh - 2)) + 'px';
  labelEl.classList.add('show');
}

/** Hides the outline and the caption; the cursor shape is left alone. */
function clearVisuals() {
  clearTimeout(labelTimer);
  labelTimer = null;
  outlineEl?.classList.remove('show');
  labelEl?.classList.remove('show');
}

/** The gaze flicks away from a region the character would rather you not hover. */
function glanceAway() {
  const fc = state.model?.internalModel?.focusController;
  if (!fc) return;
  const away = lastPoint && state.model
    ? (() => {
        const bounds = figureBounds();
        if (!bounds) return 0.7;
        return lastPoint.x < bounds.x + bounds.width / 2 ? 0.7 : -0.7;
      })()
    : 0.7;
  fc.focus(away, 0.2);
  // Back to neutral once the reaction has passed; follow-cursor mode, if on,
  // simply overwrites this on the next mouse move.
  setTimeout(() => {
    try {
      fc.focus(0, 0);
    } catch {
      // Model swapped out from under the timer.
    }
  }, REACT_MS);
}

/** A hand-ish motion group, when the model has one, for the arm reaction. */
function handMotionGroup() {
  const groups = motionGroups();
  return groups.find((group) => /hand|arm|wave|tap|touch|手|腕/i.test(group)) || null;
}

let onReact = null;
let onGesture = null;

// ─── Gestures: tickling, stroking hair, taking a hand ──────────────────────
//
// Three things the cursor can DO to a part, as opposed to merely resting on
// one. All three are read from the same mousemove stream as the dwell, and all
// three are deliberately hard to trigger by accident: a gesture that fires
// while someone is reaching for the scrollbar is a bug, not a feature.
//
//   tickle    — the cursor scrubbed back and forth fast across the waist or
//               body: direction reversals, not distance, so a straight sweep
//               never counts;
//   hair pet  — slow, repeated strokes down the head, the way an actual pat
//               moves; counted, persisted, and carrying an achievement chain;
//   handshake — a dwell on a hand, then a small deliberate move while still
//               on it, so a cursor merely parked over an arm does nothing.

/** Reversals this close together count as one continuous scrub. */
const TICKLE_GAP_MS = 420;
/** Reversals in a row before it reads as tickling rather than pointing. */
const TICKLE_REVERSALS = 5;
/** Below this, a move is jitter and says nothing about direction. */
const TICKLE_MIN_PX = 5;
/** Tickling rests this long afterwards; the laugh should stay a surprise. */
const TICKLE_COOLDOWN_MS = 12_000;
/** Regions that are ticklish. The head is a pat, not a tickle. */
const TICKLISH = new Set(['body', 'chest']);

/** A stroke has to travel at least this far across the head to count. */
const PET_STROKE_PX = 26;
/** …and no faster than this, or it is a flick past rather than a stroke. */
const PET_MAX_SPEED_PX_MS = 2.2;
/** Strokes are only a pat while they keep coming this close together. */
const PET_LINK_MS = 1400;
/** Bubble and heart at most this often, however long the petting goes on. */
const PET_FEEDBACK_MS = 4000;

/** After the dwell on a hand, a move at least this far takes it. */
const SHAKE_MIN_PX = 14;
const SHAKE_COOLDOWN_MS = 15_000;

let tickleDir = 0;
let tickleReversals = 0;
let tickleLastAt = 0;
let tickleLastX = 0;
let tickleAt = 0;

let petAnchor = null;
let petLastAt = 0;
let petFeedbackAt = 0;

let shakeReadyAt = 0;
let shakeAnchor = null;
let shakeAt = 0;

function resetGestureTracking() {
  tickleDir = 0;
  tickleReversals = 0;
  tickleLastAt = 0;
  tickleAt = 0;
  petAnchor = null;
  petLastAt = 0;
  petFeedbackAt = 0;
  shakeReadyAt = 0;
  shakeAnchor = null;
  shakeAt = 0;
}

function emit(kind, detail) {
  debugLog('Hover gesture: ' + kind);
  if (typeof onGesture === 'function') onGesture(kind, detail || {});
}

/**
 * Scrubbing the cursor back and forth over a ticklish part.
 *
 * Counts direction reversals rather than distance: a straight drag across the
 * model, however fast, is someone going somewhere, while five quick reversals
 * in the same place is unmistakably deliberate. Same shape as the "dizzy"
 * detector in rotation.js, which reads reversals over the whole model.
 */
function trackTickle(region, point) {
  if (!TICKLISH.has(region)) {
    tickleReversals = 0;
    tickleDir = 0;
    return;
  }
  const t = now();
  const dx = point.x - tickleLastX;
  if (Math.abs(dx) < TICKLE_MIN_PX) return;
  const dir = dx > 0 ? 1 : -1;
  tickleLastX = point.x;

  // A pause long enough breaks the scrub: the reversals have to be one motion.
  if (t - tickleLastAt > TICKLE_GAP_MS) tickleReversals = 0;
  if (tickleDir !== 0 && dir !== tickleDir) tickleReversals++;
  tickleDir = dir;
  tickleLastAt = t;

  if (tickleReversals < TICKLE_REVERSALS) return;
  tickleReversals = 0;
  if (t - tickleAt < TICKLE_COOLDOWN_MS) return;
  tickleAt = t;
  emit('tickle', { region });
}

/**
 * Stroking the head, the way a hand actually moves when it pats someone.
 *
 * A stroke is a slow-ish travel of at least PET_STROKE_PX while staying on the
 * head; strokes that keep coming inside PET_LINK_MS are one session of
 * petting. Speed is capped so a cursor thrown across the panel does not
 * register as a hundred pats.
 */
function trackPet(region, point) {
  if (region !== 'head') {
    petAnchor = null;
    return;
  }
  const t = now();
  if (!petAnchor || t - petLastAt > PET_LINK_MS) {
    petAnchor = { x: point.x, y: point.y, at: t };
    petLastAt = t;
    return;
  }

  const dx = point.x - petAnchor.x;
  const dy = point.y - petAnchor.y;
  const travelled = Math.hypot(dx, dy);
  petLastAt = t;
  if (travelled < PET_STROKE_PX) return;

  const elapsed = Math.max(1, t - petAnchor.at);
  const speed = travelled / elapsed;
  petAnchor = { x: point.x, y: point.y, at: t };
  if (speed > PET_MAX_SPEED_PX_MS) return; // A flick past, not a stroke.

  // Every stroke counts toward the chain; only the visible reaction is rate
  // limited, so a minute of petting is not a minute of bubbles.
  const loud = t - petFeedbackAt >= PET_FEEDBACK_MS;
  if (loud) petFeedbackAt = t;
  emit('hairPet', { loud });
}

/**
 * Taking the offered hand: the cursor has dwelt on an arm (so the character
 * has already noticed it) and then moves deliberately while still on it.
 */
function trackHandshake(region, point) {
  if (region !== 'arm') {
    shakeAnchor = null;
    return;
  }
  const t = now();
  if (!shakeReadyAt || t < shakeReadyAt) return;
  if (!shakeAnchor) {
    shakeAnchor = { x: point.x, y: point.y };
    return;
  }
  if (Math.hypot(point.x - shakeAnchor.x, point.y - shakeAnchor.y) < SHAKE_MIN_PX) return;
  shakeAnchor = { x: point.x, y: point.y };
  if (t - shakeAt < SHAKE_COOLDOWN_MS) return;
  shakeAt = t;
  emit('handshake', { motionGroup: handMotionGroup() });
}

/** The cursor has rested on `region` long enough — react to it. */
function react(region) {
  const recipe = REACTIONS[region];
  if (!recipe) return;
  const last = cooldowns.get(region) || 0;
  const fresh = now() - last >= COOLDOWN_MS;

  // The caption and the outline are guidance, not a performance: they show
  // every dwell (until the outline's window closes), so pointing at a part
  // always names it. Only the reaction itself respects the cooldown.
  showOutline(region);
  showLabel(translate(recipe.labelKey, recipe.labelFallback));
  clearTimeout(labelTimer);
  labelTimer = setTimeout(clearVisuals, LABEL_MS);

  if (!fresh) return;
  cooldowns.set(region, now());
  debugLog('Hover reaction: ' + region);

  setExpression(recipe.expression, REACT_MS);
  if (BASHFUL.has(region)) glanceAway();
  if (recipe.motion === 'hand') {
    const group = handMotionGroup();
    if (group && typeof onReact === 'function') onReact({ region, motionGroup: group });
    return;
  }
  if (typeof onReact === 'function') onReact({ region, motionGroup: null });
}

/**
 * Called from the window mousemove watcher with wrapper-relative coordinates.
 * Restarts the dwell timer whenever the part under the cursor changes, and
 * cancels everything when the cursor leaves the model.
 */
export function noteHoverMove(point) {
  if (!enabled || !state.isLive2DReady) return;
  lastPoint = point;
  const region = point ? hoverRegionAt(point) : null;

  // Gestures read EVERY move, not only the ones that change region: tickling
  // and petting are motion within one part, so an early return on "same
  // region as last time" would mean they never see anything at all. They are
  // silenced while a panel is up, same as the dwell reactions.
  if (region && !isBusy()) {
    trackTickle(region, point);
    trackPet(region, point);
    trackHandshake(region, point);
  } else {
    resetGestureTracking();
  }

  if (region === hoverRegion) return;
  hoverRegion = region;
  clearTimeout(dwellTimer);
  dwellTimer = null;
  clearVisuals();
  applyCursor(region);
  // Leaving a part abandons any gesture that was building on it.
  petAnchor = null;
  shakeAnchor = null;
  shakeReadyAt = 0;
  tickleReversals = 0;
  tickleDir = 0;
  tickleLastX = point ? point.x : 0;
  if (!region) return;

  dwellTimer = setTimeout(() => {
    dwellTimer = null;
    // Re-checked at fire time: a panel may have opened during the dwell, and
    // a drag or rotate makes any reaction a distraction.
    if (!enabled || isBusy() || !state.isLive2DReady) return;
    if (hoverRegion !== region) return;
    react(region);
    // The hand is only offered once the character has noticed the cursor on
    // it, so the handshake becomes available at the end of this dwell.
    if (region === 'arm') {
      shakeReadyAt = now();
      shakeAnchor = lastPoint ? { x: lastPoint.x, y: lastPoint.y } : null;
    }
  }, DWELL_MS);
}

/** Cursor left the model (or the window) — drop everything in flight. */
export function clearHover() {
  clearTimeout(dwellTimer);
  dwellTimer = null;
  hoverRegion = null;
  lastPoint = null;
  resetGestureTracking();
  clearVisuals();
  applyCursor(null);
}

/**
 * Starts hover reactions for the loaded model.
 * @param {{
 *   translate?: Function,
 *   isBusy?: () => boolean,
 *   onReact?: (info: { region: string, motionGroup: string|null }) => void,
 *   onGesture?: (kind: 'tickle'|'hairPet'|'handshake', detail: object) => void,
 * }} options
 */
export function initHover(options) {
  translate = options?.translate || translate;
  isBusy = options?.isBusy || isBusy;
  onReact = options?.onReact || null;
  onGesture = options?.onGesture || null;
  enabled = window.__HOVER_REACTIONS__ !== false;
  modelReadyAt = now();
  cooldowns.clear();
  canvasEl = null;
  hoverRegion = null;
  lastPoint = null;
  clearTimeout(dwellTimer);
  dwellTimer = null;
  resetGestureTracking();
  // A model switch reuses the wrapper, so a cursor class left over from the
  // previous model would stick to the new one.
  applyCursor(null);
  if (!enabled) {
    document.querySelector('.companion-hover')?.remove();
    root = null;
    return;
  }
  ensureRoot();
  debugLog('Hover reactions ready');
}
