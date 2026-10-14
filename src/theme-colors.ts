/**
 * Pure color and color-customization helpers for the character themes.
 *
 * No `vscode` import on purpose: everything here is plain data in, plain data
 * out, so scripts/theme-test.js can exercise it without an extension host.
 */

export type ColorMap = Record<string, string>;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** True for `#RRGGBB` — the only form the accent setting accepts. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

/** `amount` of the way from `a` to `b` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount]);
}

/** `#RRGGBB` plus an alpha byte, e.g. alpha(c, 0.25) → `#RRGGBB40`. */
export function alpha(hex: string, opacity: number): string {
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return hex.slice(0, 7).toLowerCase() + a.toString(16).padStart(2, '0');
}

function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Dark or white text, whichever reads better on `background`. */
export function readableOn(background: string): string {
  const dark = '#1b1418';
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const bg = luminance(background);
  return contrast(bg, luminance(dark)) >= contrast(bg, 1) ? dark : '#ffffff';
}

/**
 * The colors laid over whatever theme is active when the accent tint is on.
 *
 * Kept to borders, badges, buttons, the status bar and the cursor — places
 * that carry a solid fill or a thin line, so the tint reads on light and dark
 * themes alike. Text colors are left alone: a pastel on a light theme would
 * be unreadable.
 */
export function accentCustomizations(accent: string): ColorMap {
  const on = readableOn(accent);
  const hover = mix(accent, on === '#ffffff' ? '#000000' : '#ffffff', 0.15);
  return {
    'statusBar.background': accent,
    'statusBar.foreground': on,
    'statusBar.noFolderBackground': accent,
    'statusBar.noFolderForeground': on,
    'statusBarItem.remoteBackground': mix(accent, '#000000', 0.2),
    'statusBarItem.remoteForeground': readableOn(mix(accent, '#000000', 0.2)),
    'activityBar.activeBorder': accent,
    'activityBarBadge.background': accent,
    'activityBarBadge.foreground': on,
    'badge.background': accent,
    'badge.foreground': on,
    'tab.activeBorderTop': accent,
    'panelTitle.activeBorder': accent,
    'focusBorder': alpha(accent, 0.6),
    'progressBar.background': accent,
    'button.background': accent,
    'button.foreground': on,
    'button.hoverBackground': hover,
    'inputOption.activeBorder': accent,
    'editorCursor.foreground': accent,
    'scrollbarSlider.activeBackground': alpha(accent, 0.55),
  };
}

export interface ReconcileResult {
  /** The new `workbench.colorCustomizations` object. */
  next: Record<string, unknown>;
  /** Keys this extension now owns, with the value it wrote. */
  owned: ColorMap;
  /** Whether `next` differs from what was passed in. */
  changed: boolean;
}

/**
 * Lays `desired` over the user's `workbench.colorCustomizations` without ever
 * touching a color they set themselves.
 *
 * `owned` records what this extension wrote last time. A key still holding
 * exactly that value is ours and may be replaced or removed; a key the user
 * has since edited is theirs and is dropped from ownership. A key the user
 * already had is never overwritten — the tint simply skips it. Pass an empty
 * `desired` to remove the tint, which takes out exactly what was added.
 * Theme-scoped blocks (`"[Theme Name]": {…}`) pass through untouched.
 */
export function reconcileCustomizations(
  current: Record<string, unknown> | undefined,
  desired: ColorMap,
  owned: ColorMap
): ReconcileResult {
  const before = current && typeof current === 'object' ? current : {};
  const next: Record<string, unknown> = { ...before };
  for (const [key, value] of Object.entries(owned)) {
    if (next[key] === value) delete next[key];
  }
  const nextOwned: ColorMap = {};
  for (const [key, value] of Object.entries(desired)) {
    if (Object.prototype.hasOwnProperty.call(next, key)) continue;
    next[key] = value;
    nextOwned[key] = value;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(next)]);
  let changed = false;
  for (const key of keys) {
    if (before[key] !== next[key]) {
      changed = true;
      break;
    }
  }
  return { next, owned: nextOwned, changed };
}
