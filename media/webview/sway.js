import { state, debugLog } from './core.js';

/**
 * Momentum: the character leans into a drag, and her hair and skirt follow.
 *
 * Dragging the companion around used to slide a rigid picture across the
 * panel. What was missing is not an animation but *inertia*: a body being
 * carried leans against the direction it is pulled, and everything loose on
 * it trails behind. Live2D already simulates the trailing part — every model
 * ships a physics rig whose inputs are the body-angle parameters — so all
 * this module has to do is drive those angles from the drag and let the
 * model's own physics produce the hair.
 *
 * Two rules make it read as weight rather than as a wobble:
 *
 *   - While the hand moves, the lean follows *velocity*: a fast carry leans
 *     harder than a slow one. While it is held still, the lean follows
 *     *displacement* instead, so she stays pulled over for as long as you
 *     keep her there rather than standing up out of your grip.
 *   - Letting go does not snap the lean to zero. It springs back through the
 *     upright position and overshoots, so the character settles with several
 *     diminishing swings, the way a person recovers their balance.
 *
 * WHERE the parameters are written matters as much as what is written. The
 * model's update runs motion → expression → focus → **physics** → draw, and
 * physics reads the body angles as its input. Writing after that (the
 * `beforeModelUpdate` event, or a plain ticker callback) sets the angles for
 * the frame but the physics of that frame has already run on the old values,
 * so the body tilts and the hair stays put — the one thing this feature
 * exists to avoid. Writing on `afterMotionUpdate` puts the values in place
 * just before physics consumes them, and layers them on top of whatever the
 * idle motion is doing rather than fighting it.
 */

/**
 * How much of the cursor's travel the character actually follows.
 *
 * Not 1:1 on purpose. She is being *pulled*, not carried: the further the
 * cursor goes the more she stretches after it, but always less than the full
 * distance, the way something on elastic does. 0.55 keeps her reachable at
 * arm's length without letting a wide drag fling her off the panel.
 */
const PULL_RATIO = 0.55;
/** Never further than this from home, whatever the drag does. */
const MAX_PULL_PX = 90;
/** How fast the body catches up with the pulled position (per frame). */
const PULL_FOLLOW = 0.35;
/** Spring pulling her home after release, and its damping. */
const HOME_SPRING = 0.08;
const HOME_DAMPING = 0.86;
/** Under this many pixels from home, the return is finished. */
const HOME_EPSILON = 0.4;

/** Drag speed (px/frame at 60fps) that maps to a full lean. */
const SPEED_FOR_FULL_LEAN = 15;
/** Degrees of body/head tilt at full lean. The rig's own range is ±10 / ±30. */
const MAX_BODY_TILT = 15;
const MAX_HEAD_TILT = 22;
/** Vertical drags press the body down / stretch it up; a smaller effect. */
const MAX_BODY_PITCH = 9;

/** How fast the lean catches up with the cursor while dragging (per frame). */
const FOLLOW_SPEED = 0.18;
/**
 * A cursor still for longer than this counts as holding rather than moving.
 * Long enough that the gaps between mousemove events during a slow drag do
 * not read as stopping.
 */
const HOLD_LATCH_MS = 110;
/**
 * While held, the lean comes from how far she has been carried from where the
 * drag began, and this is the distance (px) that bends her all the way over.
 *
 * Displacement rather than the last speed, because the two disagree exactly
 * when it matters: almost everyone decelerates before stopping, so latching
 * the final velocity would let a long, hard drag settle at barely a degree of
 * lean the moment the hand slowed down. Distance says the same thing whether
 * the hand stopped abruptly or eased to a halt, and it keeps the physical
 * reading — carried further, pulled over harder, and a short tug barely tilts
 * her at all.
 */
const DIST_FOR_FULL_LEAN = 300;
/**
 * Spring and damping for the release.
 *
 * The frequency matters more than the amplitude here. An earlier tuning swung
 * at nearly 4 Hz, which has the right size but reads as a buzz rather than a
 * body: hair simply does not whip back and forth four times a second. A softer
 * spring drops that to about 2 Hz — a full swing every half second, which is
 * roughly what a person actually does recovering their balance — and the
 * recoil below is cut to match, so the slower swing keeps the same ~10° of
 * overshoot instead of being thrown further by the extra time.
 */
const SPRING = 0.06;
const DAMPING = 0.92;
/** Below this the spring has settled and the module goes quiet. */
const REST_EPSILON = 0.05;

let bound = null;
let enabled = true;
let dragging = false;
/** Current lean, in the -1..1 space the tilts are scaled from. */
let leanX = 0;
let leanY = 0;
/** Where the lean is heading while a drag is in progress. */
let targetX = 0;
let targetY = 0;
/** Velocity of the lean itself, used by the spring after release. */
let velX = 0;
let velY = 0;
/** Where the drag began, so a hold can be measured as displacement. */
let originX = 0;
let originY = 0;
/** Latest cursor position, in the same client coordinates. */
let currentX = 0;
let currentY = 0;
/** Offset of the character from where she normally stands, in pixels. */
let offX = 0;
let offY = 0;
/** Velocity of that offset, used by the spring on the way home. */
let offVelX = 0;
let offVelY = 0;
let lastPoint = null;
let lastMoveAt = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** True while the lean is anything other than flat and still. */
function active() {
  return (
    dragging ||
    Math.abs(leanX) > REST_EPSILON ||
    Math.abs(leanY) > REST_EPSILON ||
    Math.abs(velX) > REST_EPSILON ||
    Math.abs(velY) > REST_EPSILON ||
    Math.abs(offX) > HOME_EPSILON ||
    Math.abs(offY) > HOME_EPSILON ||
    Math.abs(offVelX) > HOME_EPSILON ||
    Math.abs(offVelY) > HOME_EPSILON
  );
}

/**
 * Adds the lean to the body and head angles, just before the model's physics
 * reads them. `addParameterValueById`, not `set`: the idle motion is also
 * driving these, and replacing its value would freeze the breathing sway for
 * as long as a drag lasts.
 */
function applyLean() {
  const core = state.model?.internalModel?.coreModel;
  if (!core) return;
  const add = (id, value) => {
    try {
      core.addParameterValueById(id, value);
    } catch {
      // Not every rig declares every angle; the ones it has still move.
    }
  };
  add('ParamBodyAngleX', leanX * MAX_BODY_TILT);
  add('ParamBodyAngleZ', leanX * MAX_BODY_TILT * 0.6);
  add('ParamBodyAngleY', leanY * MAX_BODY_PITCH);
  // The head lags the body slightly and tilts further, which is what makes
  // the whole figure read as being carried rather than rotated.
  add('ParamAngleX', leanX * MAX_HEAD_TILT);
  add('ParamAngleZ', leanX * MAX_HEAD_TILT * 0.5);
}

/**
 * Moves the character to her pulled position.
 *
 * Through `pivot`, not `x`/`y`: fitModel() owns x/y and rewrites them whenever
 * the panel is resized, so writing there would have the two fighting over the
 * same numbers. pivot is a second, independent offset the layout never
 * touches — and it is negated, since moving the pivot moves what the sprite
 * considers its origin, which shifts the drawing the other way.
 */
function applyOffset() {
  const model = state.model;
  if (!model?.pivot) return;
  const scale = model.scale?.x || 1;
  // pivot is in the model's own space, which the scale then multiplies.
  model.pivot.set(-offX / scale, -offY / scale);
}

/** One step of the pulled position, called alongside the lean. */
function stepOffset() {
  if (dragging) {
    // Where the cursor has dragged her to, as a fraction of its own travel and
    // capped so she cannot be thrown off the panel. This is a *position*, not
    // a speed, so holding the mouse still holds her exactly where she is —
    // which is the whole point of a hold.
    const dx = currentX - originX;
    const dy = currentY - originY;
    const goalX = clamp(dx * PULL_RATIO, -MAX_PULL_PX, MAX_PULL_PX);
    const goalY = clamp(dy * PULL_RATIO, -MAX_PULL_PX, MAX_PULL_PX);
    offX += (goalX - offX) * PULL_FOLLOW;
    offY += (goalY - offY) * PULL_FOLLOW;
    // Carry the speed she is moving at into the spring, so a release mid-throw
    // continues rather than starting from rest.
    offVelX = (goalX - offX) * PULL_FOLLOW;
    offVelY = (goalY - offY) * PULL_FOLLOW;
    return;
  }
  // Released: pulled home by a spring, overshooting slightly so she rebounds
  // into place instead of gliding to a halt.
  offVelX = (offVelX - offX * HOME_SPRING) * HOME_DAMPING;
  offVelY = (offVelY - offY * HOME_SPRING) * HOME_DAMPING;
  offX += offVelX;
  offY += offVelY;
  if (
    Math.abs(offX) <= HOME_EPSILON &&
    Math.abs(offY) <= HOME_EPSILON &&
    Math.abs(offVelX) <= HOME_EPSILON &&
    Math.abs(offVelY) <= HOME_EPSILON
  ) {
    offX = 0;
    offY = 0;
    offVelX = 0;
    offVelY = 0;
  }
}

/** One step of the lean, called once per model update. */
function step() {
  if (dragging) {
    // A drag that has stopped moving is a HOLD, and a hold keeps the pose.
    //
    // While the hand is moving the lean comes from its speed, which is what
    // makes a fast carry lean harder than a slow one. The moment it stops,
    // speed is zero and she would quietly stand up while still being held —
    // reading as her slipping out of your grip. So a hold switches to
    // displacement: how far she has been carried from where the drag started.
    // She stays pulled over for as long as you keep her there, and moving
    // again hands control back to the speed.
    const moving = Date.now() - lastMoveAt <= HOLD_LATCH_MS;
    const goalX = moving ? targetX : clamp(-(currentX - originX) / DIST_FOR_FULL_LEAN, -1, 1);
    const goalY = moving ? targetY : clamp(-(currentY - originY) / DIST_FOR_FULL_LEAN, -1, 1);
    leanX += (goalX - leanX) * FOLLOW_SPEED;
    leanY += (goalY - leanY) * FOLLOW_SPEED;
    // Keep the spring primed with the motion it would have to undo, so the
    // release continues from the speed the lean already had.
    velX = (goalX - leanX) * FOLLOW_SPEED;
    velY = (goalY - leanY) * FOLLOW_SPEED;
    return;
  }
  // Released: a damped spring back through upright, so it overshoots once or
  // twice instead of sliding to a stop.
  velX = (velX - leanX * SPRING) * DAMPING;
  velY = (velY - leanY * SPRING) * DAMPING;
  leanX += velX;
  leanY += velY;
  if (!active()) {
    leanX = 0;
    leanY = 0;
    velX = 0;
    velY = 0;
  }
}

/** Runs before physics each frame; cheap and silent while at rest. */
function onAfterMotionUpdate() {
  if (!active()) return;
  step();
  applyLean();
  stepOffset();
  applyOffset();
}

/** A drag has begun at this point (client coordinates). */
export function startSway(clientX, clientY) {
  if (!enabled) return;
  dragging = true;
  originX = clientX;
  originY = clientY;
  currentX = clientX;
  currentY = clientY;
  lastPoint = { x: clientX, y: clientY };
  lastMoveAt = Date.now();
}

/** The drag has moved; lean by how fast, in which direction. */
export function updateSway(clientX, clientY) {
  if (!dragging) return;
  if (lastPoint) {
    const dx = clientX - lastPoint.x;
    const dy = clientY - lastPoint.y;
    // Dragging right means the body is left behind, so it leans left: the
    // sign is inverted, the way a passenger sways against the turn.
    targetX = clamp(-dx / SPEED_FOR_FULL_LEAN, -1, 1);
    targetY = clamp(-dy / SPEED_FOR_FULL_LEAN, -1, 1);
    if (dx !== 0 || dy !== 0) lastMoveAt = Date.now();
  }
  currentX = clientX;
  currentY = clientY;
  lastPoint = { x: clientX, y: clientY };
}

/** Let go: the spring takes over and settles the character. */
export function endSway() {
  if (!dragging) return;
  dragging = false;
  lastPoint = null;
  targetX = 0;
  targetY = 0;
  // Nudge the homeward spring so a release from a moving drag rebounds
  // rather than easing back from a standstill.
  offVelX += offX * 0.05;
  offVelY += offY * 0.05;
  // A release from a fast drag should recoil, so the lean it had becomes the
  // energy the spring works off.
  velX += leanX * 0.06;
  velY += leanY * 0.06;
}

/**
 * Hooks the loaded model. Called from setupModel; safe to call again on a
 * model switch, which rebinds to the new internal model.
 */
export function initSway() {
  enabled = window.__DRAG_MOMENTUM__ !== false;
  const internal = state.model?.internalModel;
  if (!internal) return;
  if (bound && bound !== internal) {
    try {
      bound.off('afterMotionUpdate', onAfterMotionUpdate);
    } catch {
      // The old model is being torn down anyway.
    }
  }
  dragging = false;
  leanX = 0;
  leanY = 0;
  targetX = 0;
  targetY = 0;
  originX = 0;
  originY = 0;
  currentX = 0;
  currentY = 0;
  offX = 0;
  offY = 0;
  offVelX = 0;
  offVelY = 0;
  try {
    state.model?.pivot?.set(0, 0);
  } catch {
    // A model without a pivot simply never moves.
  }
  velX = 0;
  velY = 0;
  lastPoint = null;
  if (bound === internal) return;
  internal.on('afterMotionUpdate', onAfterMotionUpdate);
  bound = internal;
  debugLog('Sway (drag momentum) ready');
}
