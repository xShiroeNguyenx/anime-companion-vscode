import { state, debugLog } from './core.js';

/**
 * Motion groups discovered from the loaded model.
 *
 * The rest of the webview asks for three group names — `Idle`, `TapBody`,
 * `TapHead` — because that is what the Cubism sample models ship. Models from
 * other pipelines name their groups freely (`待机`, `摸头`, `打哈欠`…), and
 * pixi-live2d-display looks a group up by exact name, so on such a model every
 * request was a silent no-op and, worse, the idle loop never started: the
 * library only auto-plays `groups.idle`, which still said `Idle`. The
 * character stood in the moc's rest pose with its arms hanging, moved only by
 * breathing, blinking and physics.
 *
 * This module reads the real group list once per model, tells the library
 * which group is the idle, and resolves the three conventional names onto
 * whatever the model actually has.
 */

/** Exact names that mean "idle", across the naming conventions seen in the wild. */
const IDLE_NAME =
  /^(idle|stand(by)?|wait(ing)?|loop|default|normal|breath(e|ing)?|常态|待机|待機|站立|默认|通常|アイドル|待ち)$/i;
/** Looser: an idle group whose name carries extra words (`idle_01`, `待机2`). */
const IDLE_HINT = /idle|待机|待機|standby/i;
const HEAD_HINT = /head|hair|\bpat\b|nade|摸头|摸摸|头|頭|なで|撫で/i;
const BODY_HINT = /body|\btap\b|touch|poke|身体|体|触|つつ|タップ/i;
/**
 * Never chosen by a reaction, only from the Motion popup.
 *
 * Some models ship motions their original game gates behind an affection
 * meter (`低好感` / `高好感`) or that are simply not something a file save
 * should trigger. Motions that mention clothing are here too: one that
 * switches the model into a sweater leaves it there, because no idle motion
 * writes costume parameters back. Keeping them one deliberate click away is
 * the safe default; the user can still play any of them by name.
 */
const OPT_IN_ONLY =
  /skirt|breast|chest|seduc|lewd|ecchi|裙|胸|诱惑|誘惑|好感|衣|服|换装|着替|outfit|cloth|dress|costume|wear/i;

/** `{ name, count }` per group, in the model's own order. */
let groups = [];
let idleGroup = null;
let headGroup = null;

/**
 * Reads the loaded model's motion groups and points the library's idle at
 * the right one. Call once per model load, before the first frame renders.
 */
export function initMotions() {
  groups = [];
  idleGroup = null;
  headGroup = null;

  const manager = state.model?.internalModel?.motionManager;
  const definitions = manager?.definitions;
  if (!manager || !definitions || typeof definitions !== 'object') return [];

  groups = Object.entries(definitions)
    .filter(([, list]) => Array.isArray(list) && list.length > 0)
    .map(([name, list]) => ({ name, count: list.length }));
  const names = groups.map((group) => group.name);

  idleGroup = pickIdle(names);
  headGroup = names.find((name) => name !== idleGroup && HEAD_HINT.test(name)) ?? null;

  // The library re-reads `groups.idle` every time its queue empties, so
  // changing it here is enough to start the loop on the next frame.
  if (idleGroup && manager.groups && manager.groups.idle !== idleGroup) {
    manager.groups.idle = idleGroup;
  }

  debugLog(
    'Motion groups: ' + (names.join(', ') || '(none)') +
    ' | idle: ' + (idleGroup ?? '-') + ' | head: ' + (headGroup ?? '-')
  );
  return names;
}

function pickIdle(names) {
  // The library default first, so sample models behave exactly as before.
  if (names.includes('Idle')) return 'Idle';
  return (
    names.find((name) => IDLE_NAME.test(name)) ??
    names.find((name) => IDLE_HINT.test(name)) ??
    null
  );
}

/** The discovered groups, `{ name, count }` each. What the Motion popup lists. */
export function motionGroups() {
  return groups.map((group) => ({ ...group }));
}

/** The group the library loops when nothing else is playing, or null. */
export function idleMotionGroup() {
  return idleGroup;
}

/**
 * The group to actually play for a requested name, or null when the model
 * has nothing suitable.
 *
 * A name the model really has is used as is — this is what keeps the sample
 * models on their exact old behaviour, and what lets the Motion popup play a
 * group by its own name. Only the three conventional names are remapped.
 */
export function resolveMotionGroup(requested) {
  const names = groups.map((group) => group.name);
  if (names.length === 0) return null;
  if (names.includes(requested)) return requested;

  if (requested === 'Idle') return idleGroup;
  if (requested === 'TapHead' && headGroup) return headGroup;
  if (requested === 'TapBody') {
    const body = names.find(
      (name) => name !== idleGroup && name !== headGroup && BODY_HINT.test(name)
    );
    if (body) return body;
  }
  if (requested === 'TapHead' || requested === 'TapBody') {
    return randomFrom(reactionPool(names));
  }
  return null;
}

/** Groups a reaction may fall back to: not the idle, not the headpat, nothing opt-in. */
function reactionPool(names) {
  return names.filter(
    (name) => name !== idleGroup && name !== headGroup && !OPT_IN_ONLY.test(name)
  );
}

function randomFrom(list) {
  return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null;
}

/**
 * Plays a motion by conventional or real group name.
 *
 * `index` is honoured only when the group exists under its own name: a
 * remapped group may have fewer files than the caller assumed.
 */
export function playModelMotion(requested, index) {
  if (!state.model) return false;
  const actual = resolveMotionGroup(requested);
  if (!actual) {
    debugLog('Motion: nothing to play for ' + requested);
    return false;
  }
  try {
    if (actual !== requested) debugLog('Motion: ' + requested + ' -> ' + actual);
    void state.model.motion(actual, actual === requested ? index : undefined);
    return true;
  } catch (error) {
    debugLog('Motion failed: ' + (error && error.message ? error.message : String(error)));
    return false;
  }
}
