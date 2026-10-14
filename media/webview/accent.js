/**
 * Re-tints the companion's chrome (bubbles, menus, side columns) to the accent
 * of the active bundled color theme.
 *
 * companion.css keeps every pink it uses as a `--tint*` variable holding the
 * original "r, g, b". Rather than one flat color, each shade is hue-rotated
 * by the angle between the original pink and the theme's accent, and its
 * saturation scaled by the same ratio — lightness is left alone, so the dark
 * bubble stays dark and the pale fill stays pale, just in the new color.
 * Any other theme (one we do not ship) restores the original pinks.
 */

const BASE = '255, 150, 190';
const SHADES = {
  '--tint': BASE,
  '--tint-soft': '255, 183, 213',
  '--tint-pale': '255, 218, 233',
  '--tint-mid': '221, 144, 181',
  '--tint-deep': '206, 109, 154',
  '--tint-strong': '207, 73, 130',
  '--tint-btn': '255, 126, 182',
  '--tint-btn-deep': '255, 74, 144',
  '--tint-text': '255, 209, 227',
  '--tint-text-pale': '255, 230, 241',
  '--tint-dark': '90, 50, 75',
  '--tint-darker': '120, 60, 95',
  '--tint-ink': '90, 26, 58',
  '--tint-night': '36, 22, 34',
};

function parseRgb(text) {
  return text.split(',').map((part) => Number(part.trim()));
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** The `--tint*` values for an accent, or null to keep the original pinks. */
export function tintShades(accentHex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(accentHex || ''))) return null;
  const [baseH, baseS] = rgbToHsl(parseRgb(BASE));
  const [accH, accS] = rgbToHsl(hexToRgb(accentHex));
  const shift = accH - baseH;
  const ratio = baseS > 0 ? accS / baseS : 1;
  const out = {};
  for (const [name, rgb] of Object.entries(SHADES)) {
    const [h, s, l] = rgbToHsl(parseRgb(rgb));
    out[name] = hslToRgb([h + shift, Math.min(1, s * ratio), l]).join(', ');
  }
  return out;
}

/** Applies the accent of the theme labelled `label`, if it is one we ship. */
export function applyThemeAccent(label, themes) {
  const theme = (themes || []).find((entry) => entry.label === label);
  const shades = theme ? tintShades(theme.accent) : null;
  const style = document.documentElement.style;
  for (const name of Object.keys(SHADES)) {
    if (shades) style.setProperty(name, shades[name]);
    else style.removeProperty(name);
  }
}
