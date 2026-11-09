// Whether the companion view should draw, and how fast. Pure; used by
// companion-view.ts and scripts/render-gate-test.js.
//
// With three or four VS Code windows open, only one is in use at a time, but
// each draws its own Live2D character. 'slow' keeps a window just left
// breathing (alt-tabbing back and forth should not freeze and restart her);
// 'paused' stops drawing until something changes. The webview side of this is
// media/webview/pet-fps.js.

export type RenderMode = 'run' | 'slow' | 'paused';

/** Focused, but no activity in VS Code for this long: stop drawing. Same as desktop-companion. */
export const AWAY_MS = 5 * 60 * 1000;
/** Not focused for this long: stop drawing (slow until then). */
export const BACKGROUND_PAUSE_MS = 60 * 1000;

export interface RenderInputs {
  viewVisible: boolean;
  focused: boolean;
  /** When the window lost focus (ms); undefined while focused. */
  blurredSince?: number;
  /** When `window.state.active` turned false (ms); undefined while active, or when this VS Code has no `active`. */
  inactiveSince?: number;
  now: number;
}

export function renderMode(s: RenderInputs): RenderMode {
  if (!s.viewVisible) return 'paused';
  if (!s.focused) {
    const long = s.blurredSince !== undefined && s.now - s.blurredSince >= BACKGROUND_PAUSE_MS;
    return long ? 'paused' : 'slow';
  }
  if (s.inactiveSince !== undefined && s.now - s.inactiveSince >= AWAY_MS) return 'paused';
  return 'run';
}

/** Ms until renderMode() changes with no new event; undefined when only an event can change it. */
export function msUntilNextChange(s: RenderInputs): number | undefined {
  if (!s.viewVisible) return undefined;
  const since = s.focused ? s.inactiveSince : s.blurredSince;
  if (since === undefined) return undefined;
  const left = (s.focused ? AWAY_MS : BACKGROUND_PAUSE_MS) - (s.now - since);
  return left > 0 ? left : undefined;
}
