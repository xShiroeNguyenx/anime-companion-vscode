// How fast the character's head turns toward what she looks at.
//
// pixi-live2d-display's focus controller chases its target at a fixed top
// speed with a fixed acceleration: a model turns its head to the cursor in a
// quarter of a second or so, which reads as twitchy rather than as someone
// looking up. Every caller (cursor follow, drag-to-rotate, hover, idle glances)
// goes through that one controller, so it is slowed there, once: its update
// runs on a shorter clock. Speed and acceleration both scale with that clock,
// so the turn keeps its ease in and out, only longer.

/** Share of the library's own pace the head turns at. 0.4 settles in about two thirds of a second. */
export const FOCUS_PACE = 0.4;

/**
 * Slows `model`'s focus controller to `pace` of its speed. Safe to call again
 * (on a reload) and on a model without one; returns whether it was applied.
 */
export function paceFocus(model, pace = FOCUS_PACE) {
  const fc = model?.internalModel?.focusController;
  if (!fc || typeof fc.update !== 'function') return false;
  if (fc.__pacedUpdate) {
    fc.__pace = pace;
    return true;
  }
  const original = fc.update.bind(fc);
  fc.__pace = pace;
  fc.__pacedUpdate = true;
  fc.update = (dt) => original(dt * fc.__pace);
  return true;
}
