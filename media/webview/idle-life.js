import { state, debugLog } from './core.js';
import { setExpression } from './expression.js';
import { motionGroups, playModelMotion } from './motions.js';

/**
 * Small unprompted things the character does when nobody is touching her.
 *
 * Left alone, a Live2D model loops one idle animation forever. The loop is
 * smooth, and after a minute of watching it you stop seeing a person and
 * start seeing a video: nothing she does is ever a *decision*. This module
 * adds the decisions — every so often she yawns, stretches, looks around the
 * room, tilts her head at something, or glances over at the cursor and looks
 * away again.
 *
 * Three things keep it from becoming noise:
 *
 *   - **It only happens in the gaps.** Any interaction pushes the next beat
 *     back, so she never performs over the top of something the user is
 *     doing, and nothing fires while a panel, the chat or a menu is open.
 *   - **It fits the hour and the mood.** Late at night the yawns and eye-rubs
 *     crowd out the cheerful ones; while the host reports `happy` the bored
 *     fidgets drop away. Weights, not hard rules, so it stays unpredictable.
 *   - **It never repeats immediately.** The last two beats are remembered and
 *     excluded, because the giveaway that something is on a timer is seeing
 *     the same gesture twice in a row.
 *
 * A beat prefers the model's OWN motion where one obviously matches (a group
 * called `打哈欠` really is a yawn, and hand-drawn beats anything we can
 * synthesise from parameters); otherwise it falls back to a mood preset plus
 * a gaze nudge, which every rig can do.
 */

/** Gap between beats, randomised in this range. */
const MIN_GAP_MS = 40_000;
const MAX_GAP_MS = 90_000;
/** After any interaction, wait at least this long before the next beat. */
const AFTER_INTERACTION_MS = 25_000;
/** Retry delay when the moment is wrong (panel open, tab hidden). */
const RETRY_MS = 12_000;
/** Beats remembered as "just did that" and excluded from the next draw. */
const RECENT_MEMORY = 2;

/**
 * The repertoire.
 *
 * `motion` is a regex matched against the model's own motion group names;
 * when it hits, that motion plays and the preset is skipped. `expression` is
 * the fallback every model can perform. `gaze` nudges the focus controller
 * (x, y in -1..1) so the eyes go somewhere, which is most of what sells a
 * glance. `weight` is the base chance, then adjusted by hour and mood.
 */
const BEATS = [
  {
    id: 'yawn',
    motion: /yawn|欠伸|哈欠|あくび/i,
    expression: 'sleepy',
    gaze: [0, -0.35],
    holdMs: 2600,
    weight: 1,
    night: 2.6,
    moods: { sleepy: 2.5, happy: 0.4 },
  },
  {
    id: 'rubEyes',
    motion: /rub|eye.*rub|揉眼|目をこ/i,
    expression: 'sleepy',
    gaze: [0, -0.2],
    holdMs: 2400,
    weight: 0.9,
    night: 2.2,
    moods: { sleepy: 2.2, happy: 0.4 },
  },
  {
    id: 'stretch',
    motion: /stretch|伸び|伸展|伸懒腰/i,
    expression: 'happy',
    gaze: [0, -0.5],
    holdMs: 2200,
    weight: 1,
    moods: { sleepy: 1.6 },
  },
  {
    id: 'lookAround',
    // No motion for this one anywhere; it is pure gaze, and all the better
    // for it — the eyes moving on their own is the cheapest sign of life.
    expression: 'neutral',
    gaze: [0.75, -0.1],
    gazeThen: [-0.7, 0.05],
    holdMs: 2800,
    weight: 1.4,
  },
  {
    id: 'tiltCurious',
    expression: 'surprised',
    gaze: [0.25, 0.15],
    tilt: 11,
    holdMs: 1900,
    weight: 1.1,
    moods: { angry: 0.5 },
  },
  {
    id: 'hum',
    expression: 'happy',
    gaze: [0.15, -0.15],
    tilt: -7,
    holdMs: 2400,
    weight: 1,
    night: 0.4,
    moods: { happy: 1.8, angry: 0.3, sleepy: 0.4 },
  },
  {
    id: 'peek',
    // A glance at the user, then away — the one that most reads as her
    // noticing you rather than performing at you.
    expression: 'shy',
    gaze: [-0.55, 0.1],
    gazeThen: [0.15, -0.05],
    holdMs: 2200,
    weight: 1.2,
    moods: { happy: 1.5, angry: 0.4 },
  },
  {
    id: 'daydream',
    expression: 'neutral',
    gaze: [0.4, -0.45],
    holdMs: 3200,
    weight: 0.9,
    moods: { sleepy: 1.6, happy: 0.7 },
  },
];

let enabled = true;
let isBusy = () => false;
let timer = null;
let tiltTimer = null;
/** Extra head tilt this beat asked for, applied until the beat ends. */
let tiltDegrees = 0;
let tiltUntil = 0;
let bound = null;
const recent = [];

function random(min, max) {
  return min + Math.random() * (max - min);
}

/** Night hours get the sleepy beats; 22:00–05:00. */
function isNight() {
  const h = new Date().getHours();
  return h >= 22 || h < 5;
}

function weightOf(beat) {
  let w = beat.weight ?? 1;
  if (isNight() && beat.night) w *= beat.night;
  const mood = state.currentMood || 'idle';
  if (beat.moods && beat.moods[mood] !== undefined) w *= beat.moods[mood];
  return Math.max(0, w);
}

/** Weighted draw, excluding whatever was performed most recently. */
function pickBeat() {
  const pool = BEATS.filter((b) => !recent.includes(b.id));
  const candidates = pool.length > 0 ? pool : BEATS;
  const weights = candidates.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** The model's own motion for this beat, when it ships one. */
function motionFor(beat) {
  if (!beat.motion) return null;
  return motionGroups().find((group) => beat.motion.test(group)) || null;
}

function gaze(x, y) {
  const fc = state.model?.internalModel?.focusController;
  if (!fc) return;
  try {
    fc.focus(x, y);
  } catch {
    // Model swapped out mid-beat.
  }
}

/**
 * A head tilt the presets cannot express, added before physics so the hair
 * follows it. Cleared when the beat's hold expires.
 */
function onAfterMotionUpdate() {
  if (!tiltDegrees || Date.now() > tiltUntil) return;
  const core = state.model?.internalModel?.coreModel;
  if (!core) return;
  try {
    core.addParameterValueById('ParamAngleZ', tiltDegrees);
  } catch {
    // Rig without that parameter: the rest of the beat still plays.
  }
}

function perform(beat) {
  recent.push(beat.id);
  while (recent.length > RECENT_MEMORY) recent.shift();

  const group = motionFor(beat);
  if (group) {
    // Hand-drawn beats whatever we could fake: play it and leave the face to
    // the motion, only steering the eyes.
    playModelMotion(group);
  } else if (beat.expression) {
    setExpression(beat.expression, beat.holdMs);
  }

  if (beat.gaze) gaze(beat.gaze[0], beat.gaze[1]);
  if (beat.gazeThen) {
    setTimeout(() => {
      // Only if nothing has interrupted in the meantime.
      if (!isBusy()) gaze(beat.gazeThen[0], beat.gazeThen[1]);
    }, Math.round(beat.holdMs * 0.5));
  }

  if (beat.tilt) {
    tiltDegrees = beat.tilt;
    tiltUntil = Date.now() + beat.holdMs;
  }

  clearTimeout(tiltTimer);
  tiltTimer = setTimeout(() => {
    tiltDegrees = 0;
    // Back to looking ahead; follow-cursor mode overwrites this on the next
    // mouse move, which is exactly right.
    gaze(0, 0);
  }, beat.holdMs);

  debugLog('Idle life: ' + beat.id + (group ? ' (motion ' + group + ')' : ''));
}

function schedule(ms) {
  clearTimeout(timer);
  timer = null;
  if (!enabled) return;
  timer = setTimeout(tick, ms);
}

function tick() {
  timer = null;
  if (!enabled) return;
  if (!state.isLive2DReady || document.hidden || isBusy()) {
    schedule(RETRY_MS);
    return;
  }
  const beat = pickBeat();
  if (beat) perform(beat);
  schedule(random(MIN_GAP_MS, MAX_GAP_MS));
}

/** Any interaction resets the clock: she performs in the gaps, not over you. */
export function noteIdleInteraction() {
  if (!enabled) return;
  tiltDegrees = 0;
  schedule(AFTER_INTERACTION_MS + random(0, 15_000));
}

/**
 * Starts the idle repertoire for the loaded model.
 * @param {{ isBusy?: () => boolean }} options
 */
export function initIdleLife(options) {
  isBusy = options?.isBusy || isBusy;
  enabled = window.__IDLE_LIFE__ !== false;
  recent.length = 0;
  tiltDegrees = 0;
  clearTimeout(tiltTimer);
  tiltTimer = null;

  const internal = state.model?.internalModel;
  if (internal && bound !== internal) {
    if (bound) {
      try {
        bound.off('afterMotionUpdate', onAfterMotionUpdate);
      } catch {
        // Old model going away.
      }
    }
    internal.on('afterMotionUpdate', onAfterMotionUpdate);
    bound = internal;
  }

  if (!enabled) {
    clearTimeout(timer);
    timer = null;
    return;
  }
  schedule(random(MIN_GAP_MS, MAX_GAP_MS));
  debugLog('Idle life ready');
}
