// Region cursors for hover.js, in the family of the heart cursor: the same
// pink arrow tip at the top-left (the hotspot) and tail at the bottom-right,
// a different icon in the middle — comb (head), dress (body), barred heart
// (chest), barred bow (skirt), open hand (arm).
//
//   node scripts/gen-cursors.js
//
// writes out/cursor-preview/{preview.html, *.svg, uris.json}. Open the preview
// to check the drawings at native 32 px, then paste the values from uris.json
// into the --cursor-* variables in media/companion.css (they are inlined there
// so the webview needs no extra files). The frame paths are HEART_CURSOR_SVG
// from interaction.js; keep them identical so the family stays a family.
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'out', 'cursor-preview');
fs.mkdirSync(out, { recursive: true });

const PINK = '#ff8cbc';
const DEEP = '#cf3f79';
const LIGHT = '#ffa4c7';
const STICK = '#d45583';
const TIP_STROKE = '#c23d73';
const HI = '#ffdbe9';
const HI2 = '#fff7fb';

// The frame every cursor shares — lifted verbatim from HEART_CURSOR_SVG.
const TIP =
  `<path d='M9 7 24.5 21.8' stroke='${STICK}' stroke-width='4.2'/>` +
  `<path d='M4.4 4.5 14.7 7.2 8.9 12.4 4.4 4.5Z' fill='${LIGHT}' stroke='${TIP_STROKE}' stroke-width='2'/>`;
const TAIL =
  `<path d='M27.7 21.6 38.5 34.7' stroke='${STICK}' stroke-width='4.2'/>` +
  `<path d='M35.8 31 44 42.4 31.4 38.6 35.8 31Z' fill='${LIGHT}' stroke='${TIP_STROKE}' stroke-width='2'/>`;

const HEART_PATH =
  'M24 38.8c-8.7-5.9-14.4-11-14.4-18 0-5.2 4.1-9.3 9.4-9.3 2.6 0 5.1 1.1 7 3.1 1.9-2 4.4-3.1 7-3.1 5.3 0 9.4 4.1 9.4 9.3 0 7-5.7 12.1-14.4 18Z';

function svg(inner) {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 48 48'>` +
    `<g fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    TIP + TAIL + inner +
    `</g></svg>`
  );
}

/** A shape drawn twice: a white halo underneath, then the coloured shape. */
function haloed(d, { fill = PINK, stroke = DEEP, width = 2.2, halo = 6 } = {}) {
  return (
    `<path d='${d}' fill='${fill === 'none' ? 'none' : '#ffffff'}' stroke='#ffffff' stroke-width='${halo}'/>` +
    `<path d='${d}' fill='${fill}' stroke='${stroke}' stroke-width='${width}'/>`
  );
}

// ── the original, for comparison ─────────────────────────────────────────
const heart = svg(
  `<path d='${HEART_PATH}' fill='#ff73ab' stroke='#ffffff' stroke-width='6'/>` +
  `<path d='${HEART_PATH}' fill='${PINK}' stroke='${DEEP}' stroke-width='2.2'/>` +
  `<path d='M16.2 17.2c0 0 2.3-3 5.8-3.8' stroke='${HI}' stroke-width='2.2'/>` +
  `<path d='m29.4 14.5 2.1 1.8' stroke='${HI2}' stroke-width='2.1'/>` +
  `<path d='m34.9 17.8.7 1.3' stroke='${HI2}' stroke-width='1.8'/>` +
  `<circle cx='27.3' cy='21.2' r='1.2' fill='${HI2}' stroke='none'/>`
);

// ── head: a comb, for stroking hair ───────────────────────────────────────
// Spine along the top, five teeth hanging down, a glint on the spine.
const COMB_SPINE = 'M12 13.5h24a3.5 3.5 0 0 1 3.5 3.5v0.5a3.5 3.5 0 0 1 -3.5 3.5H12a3.5 3.5 0 0 1 -3.5 -3.5v-0.5a3.5 3.5 0 0 1 3.5 -3.5Z';
const COMB_TEETH = [13.5, 18.75, 24, 29.25, 34.5].map((x) => `M${x} 21v13`).join('');
const head = svg(
  `<path d='${COMB_TEETH}' stroke='#ffffff' stroke-width='7.5'/>` +
  `<path d='${COMB_SPINE}' fill='#ffffff' stroke='#ffffff' stroke-width='6'/>` +
  `<path d='${COMB_TEETH}' stroke='${DEEP}' stroke-width='4.6'/>` +
  `<path d='${COMB_TEETH}' stroke='${PINK}' stroke-width='2.4'/>` +
  `<path d='${COMB_SPINE}' fill='${PINK}' stroke='${DEEP}' stroke-width='2.2'/>` +
  `<path d='M13 16.5h9' stroke='${HI}' stroke-width='2'/>` +
  `<path d='m36 27.5 1.4 2.4M39.5 24.5l1.2 2' stroke='${HI2}' stroke-width='1.8'/>`
);

// ── body: a dress, for the wardrobe ───────────────────────────────────────
const DRESS =
  'M17.5 11.5h13l1.5 3.5 1.5 7.5 7 15.5H7.5l7-15.5 1.5-7.5Z';
const body = svg(
  haloed(DRESS) +
  `<path d='M16 22.5h16' stroke='${DEEP}' stroke-width='2'/>` +      // waist seam
  `<path d='M20 11.5 24 16.5 28 11.5' stroke='${DEEP}' stroke-width='2' fill='#ffd2e4'/>` + // neckline
  `<path d='M13.5 34 15 28.5' stroke='${HI}' stroke-width='2'/>` +   // skirt fold glint
  `<circle cx='24' cy='22.5' r='2' fill='${HI2}' stroke='${DEEP}' stroke-width='1.4'/>` // belt button
);

// ── chest / skirt: a "no" ring with a slash; a heart or a bow inside ──────
function forbidden(innerIcon) {
  const ring = `M24 12.5a12.5 12.5 0 1 1 -0.01 0Z`;
  return (
    `<circle cx='24' cy='25' r='12.5' fill='#ffffff' stroke='#ffffff' stroke-width='7'/>` +
    `<circle cx='24' cy='25' r='12.5' fill='#ffe4ef' stroke='${DEEP}' stroke-width='3'/>` +
    innerIcon +
    `<path d='M32.8 16.2 15.2 33.8' stroke='#ffffff' stroke-width='6.5'/>` +
    `<path d='M32.8 16.2 15.2 33.8' stroke='${DEEP}' stroke-width='3.2'/>`
  );
}
// Small heart centred at (24,25): the big heart scaled to ~0.42.
const SMALL_HEART =
  'M24 31.2c-4-2.7-6.6-5-6.6-8.2 0-2.4 1.9-4.3 4.3-4.3 1.2 0 2.3.5 3.2 1.4.9-.9 2-1.4 3.2-1.4 2.4 0 4.3 1.9 4.3 4.3 0 3.2-2.6 5.5-6.6 8.2Z';
const chest = svg(forbidden(`<path d='${SMALL_HEART}' fill='${PINK}' stroke='${DEEP}' stroke-width='1.8'/>`));

// A bow: two loops meeting at a knot.
const BOW =
  'M23 25 16.5 20.5a1.8 1.8 0 0 0 -2.6 2.2l1.6 4.6-1.6 4.6a1.8 1.8 0 0 0 2.6 2.2L23 25Z' +
  'M25 25l6.5-4.5a1.8 1.8 0 0 1 2.6 2.2l-1.6 4.6 1.6 4.6a1.8 1.8 0 0 1 -2.6 2.2L25 25Z';
const skirt = svg(
  forbidden(
    `<path d='${BOW}' fill='${PINK}' stroke='${DEEP}' stroke-width='1.8'/>` +
    `<circle cx='24' cy='25' r='2.4' fill='${LIGHT}' stroke='${DEEP}' stroke-width='1.6'/>`
  )
);

// ── arm: an open hand saying hi ───────────────────────────────────────────
const FINGERS = 'M17.5 26.5v-9M22 25v-12M26.5 25v-11.5M31 26.5v-8.5';
const THUMB = 'M17 31 11.5 27';
const PALM = 'M15.5 24.5h17.5v6.5a8.75 8.75 0 0 1 -8.75 8.75 8.75 8.75 0 0 1 -8.75 -8.75Z';
const arm = svg(
  `<path d='${FINGERS}${THUMB}' stroke='#ffffff' stroke-width='8.5'/>` +
  `<path d='${PALM}' fill='#ffffff' stroke='#ffffff' stroke-width='6'/>` +
  `<path d='${FINGERS}${THUMB}' stroke='${DEEP}' stroke-width='5.6'/>` +
  `<path d='${PALM}' fill='${PINK}' stroke='${DEEP}' stroke-width='2.2'/>` +
  `<path d='${FINGERS}${THUMB}' stroke='${PINK}' stroke-width='3.2'/>` +
  `<path d='M19 32.5c1.5 2 3.5 3 5 3' stroke='${HI}' stroke-width='1.8'/>` +
  `<path d='m37.5 13.5 1.2 2.2M40.5 17.5l-2.3 1M36 17.8l-1.6 1.6' stroke='${HI2}' stroke-width='1.8'/>`
);

const cursors = { heart, head, body, chest, skirt, arm };

// Same encoding the existing --model-heart-cursor uses.
function encode(s) {
  return s.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');
}

const uris = {};
for (const [name, s] of Object.entries(cursors)) {
  fs.writeFileSync(path.join(out, `${name}.svg`), s);
  uris[name] = `url("data:image/svg+xml;utf8,${encode(s)}") 4 4`;
}
fs.writeFileSync(path.join(out, 'uris.json'), JSON.stringify(uris, null, 2));

// Preview: native 32px and zoomed, on the dark editor ground and on light.
const rows = Object.entries(cursors)
  .map(
    ([name, s]) => `
  <div class="row">
    <div class="name">${name}</div>
    <img class="big" src="${name}.svg" alt="${name}">
    <div class="native"><img src="${name}.svg" width="32" height="32"></div>
    <div class="native light"><img src="${name}.svg" width="32" height="32"></div>
    <div class="native mid"><img src="${name}.svg" width="32" height="32"></div>
  </div>`
  )
  .join('');
fs.writeFileSync(
  path.join(out, 'preview.html'),
  `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#1e1e1e;color:#ddd;font:12px Segoe UI,sans-serif;padding:12px}
  .row{display:flex;align-items:center;gap:18px;margin-bottom:6px}
  .name{width:52px;color:#ffb3d1;font-weight:700}
  .big{width:144px;height:144px;image-rendering:auto;background:#2a2a2a;border-radius:8px}
  .native{width:64px;height:64px;display:flex;align-items:center;justify-content:center;background:#1e1e1e;border:1px solid #333}
  .native.light{background:#f5f0f3}
  .native.mid{background:#ffb6d0}
  </style>${rows}`
);
console.log('written', Object.keys(cursors).join(', '));
