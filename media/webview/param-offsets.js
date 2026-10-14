/**
 * Parameter offsets that last exactly one frame.
 *
 * The Cubism update runs, per frame:
 *
 *     beforeMotionUpdate → motion → afterMotionUpdate → saveParameters()
 *       → expression → eye blink → focus → breath → physics → draw
 *       → loadParameters()
 *
 * `afterMotionUpdate` is the right moment to nudge an angle — physics has not
 * run yet, so the hair follows — but it comes BEFORE saveParameters(). A value
 * added there is saved, restored at the end of the frame, and is the starting
 * point of the next one. For any parameter the playing motion animates, the
 * motion overwrites it and nothing shows. For one it does not animate, each
 * frame adds on top of the last: a head tilt held for two seconds compounds
 * a hundred-odd times, hits the parameter's limit, and stays there for good.
 * Whether that shows depends on the model — Hiyori's idle drives ParamAngleZ,
 * plenty of others do not.
 *
 * So every offset added through here is taken back at the start of the next
 * frame, before the motion samples anything. The motion always starts from the
 * value it left, and the offset is visible for exactly the frame it was meant
 * for. Callers that want it held simply add it again each frame, as they do.
 */

/** internalModel -> offsets applied this frame, as [id, before, after]. */
const applied = new WeakMap();
const bound = new WeakSet();

function undo(internal) {
  const list = applied.get(internal);
  if (!list || list.length === 0) return;
  const core = internal.coreModel;
  // Newest first, so two offsets on one parameter unwind in order.
  for (let i = list.length - 1; i >= 0; i--) {
    const [id, before, after] = list[i];
    try {
      // Anything else that moved the value since keeps its share; only ours
      // is removed. With nothing else touching it, this is exactly `before`.
      const current = core.getParameterValueById(id);
      core.setParameterValueById(id, before + (current - after));
    } catch {
      // Model torn down between frames.
    }
  }
  list.length = 0;
}

/** Undo hook for this model; safe to call again, and per model. */
export function bindTransientParameters(internal) {
  if (!internal || bound.has(internal)) return;
  bound.add(internal);
  applied.set(internal, []);
  internal.on('beforeMotionUpdate', () => undo(internal));
}

/** Sets a parameter to `fn(current)` for the current frame only. */
function transformTransientParameter(internal, id, fn) {
  const core = internal?.coreModel;
  if (!core) return;
  bindTransientParameters(internal);
  try {
    const before = core.getParameterValueById(id);
    core.setParameterValueById(id, fn(before));
    const after = core.getParameterValueById(id);
    if (after !== before) applied.get(internal).push([id, before, after]);
  } catch {
    // Not every rig declares every parameter; the ones it has still move.
  }
}

/** Adds `delta` to a parameter for the current frame only. */
export function addTransientParameter(internal, id, delta) {
  if (!delta) return;
  transformTransientParameter(internal, id, (value) => value + delta);
}

/** Multiplies a parameter by `factor` for the current frame only. */
export function multiplyTransientParameter(internal, id, factor) {
  if (factor === 1) return;
  transformTransientParameter(internal, id, (value) => value * factor);
}
