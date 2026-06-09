import { MARKER_START, MARKER_END, STYLE_ELEMENT_ID } from './patch-constants';
import { BackgroundRegion } from './types';

// One resolved region ready to render: image already encoded to a data-URI.
export interface ResolvedRegion {
  region: BackgroundRegion;
  dataUri: string;
  opacity: number; // 0–100
  blur: number; // px
  size: 'cover' | 'contain' | 'repeat' | 'stretch';
  position: string;
}

// Base CSS selector the image layer is attached to. The per-region ones use the
// stable workbench part ids; 'fullscreen' targets the whole workbench root so a
// single image sits behind every part. If a future VS Code build changes these,
// only this map needs updating.
const BASE_SELECTOR: Record<BackgroundRegion, string> = {
  fullscreen: '.monaco-workbench',
  editor: '#workbench\\.parts\\.editor',
  sidebar: '#workbench\\.parts\\.sidebar',
  panel: '#workbench\\.parts\\.panel',
};

function sizeToCss(size: ResolvedRegion['size']): { backgroundSize: string; backgroundRepeat: string } {
  switch (size) {
    case 'contain':
      return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat' };
    case 'stretch':
      return { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' };
    case 'repeat':
      return { backgroundSize: 'auto', backgroundRepeat: 'repeat' };
    case 'cover':
    default:
      return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat' };
  }
}

// Inner elements (relative to the part) whose opaque theme background must be
// made transparent so the image painted on the part's ::before shows through
// BEHIND the text — rather than as a film on top of it.
// Per-region "behind text" works by transparentizing these inner layers so the
// part's ::before image shows through. Fullscreen does NOT use this — it paints
// an overlay on top of the whole window instead (see regionCss).
const TRANSPARENTIZE: Record<Exclude<BackgroundRegion, 'fullscreen'>, string[]> = {
  editor: [
    '> .content',
    '.editor-group-container',
    '.editor-group-container > .editor-container',
    '.editor-instance',
    '.monaco-editor',
    '.monaco-editor-background',
    '.monaco-editor .margin',
    '.monaco-editor .glyph-margin',
    '.monaco-editor .margin-view-overlays',
  ],
  sidebar: [
    '> .content',
    '.composite',
    '.pane',
    '.pane-body',
    '.monaco-list',
    '.monaco-list-rows',
    '.split-view-view',
  ],
  panel: [
    '> .content',
    '.composite',
    '.pane-body',
    '.monaco-list',
    '.split-view-view',
  ],
};

// CSS for a single region. The image is painted on the part's ::before at
// z-index 0 (BEHIND content), and the part's opaque inner backgrounds are made
// transparent so text sits over the image — matching the "Background" extension
// look rather than tinting over the code.
//
// NOTE: the transparentize selectors track VS Code's workbench DOM and may need
// small tweaks per version/theme — they are the most likely thing to adjust.
function regionCss(r: ResolvedRegion): string {
  const { backgroundSize, backgroundRepeat } = sizeToCss(r.size);
  const opacity = Math.max(0, Math.min(1, r.opacity / 100));
  const blur = Math.max(0, r.blur);
  // Escape the data-URI minimally for a CSS url() — base64 data URIs have no
  // characters that break an unquoted url(), but we double-quote defensively.
  const url = `url("${r.dataUri}")`;

  // Fullscreen: a single overlay ON TOP of the whole window (pointer-events
  // none), at low opacity. This is the proven approach (matches the Background
  // extension) — it reliably shows everywhere, including the editor, without
  // depending on transparentizing per-region backgrounds.
  if (r.region === 'fullscreen') {
    return [
      `body::after {`,
      `  content: "";`,
      `  position: fixed;`,
      `  inset: 0;`,
      `  pointer-events: none;`,
      `  z-index: 1000;`,
      `  background-image: ${url};`,
      `  background-size: ${backgroundSize};`,
      `  background-repeat: ${backgroundRepeat};`,
      `  background-position: ${r.position};`,
      `  opacity: ${opacity};`,
      blur > 0 ? `  filter: blur(${blur}px);` : '',
      `}`,
    ].filter(Boolean).join('\n');
  }

  const sel = BASE_SELECTOR[r.region];
  const imageLayer = [
    `${sel} { position: relative; }`,
    `${sel}::before {`,
    `  content: "";`,
    `  position: absolute;`,
    `  top: 0; left: 0; right: 0; bottom: 0;`,
    `  pointer-events: none;`,
    `  z-index: 0;`,
    `  background-image: ${url};`,
    `  background-size: ${backgroundSize};`,
    `  background-repeat: ${backgroundRepeat};`,
    `  background-position: ${r.position};`,
    `  opacity: ${opacity};`,
    blur > 0 ? `  filter: blur(${blur}px);` : '',
    `}`,
  ].filter(Boolean).join('\n');
  const transparentSelectors = TRANSPARENTIZE[r.region]
    .map((inner) => `${sel} ${inner}`)
    .join(',\n');
  const transparentize = [
    `${transparentSelectors} {`,
    `  background-color: transparent !important;`,
    `  background-image: none !important;`,
    `}`,
  ].join('\n');
  return `${imageLayer}\n${transparentize}`;
}

function buildCss(regions: ResolvedRegion[]): string {
  return regions.map(regionCss).join('\n\n');
}

// Cheap, dependency-free string hash (djb2) used to detect when the rendered
// payload changed (so apply() re-patches after the user edits settings).
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

// Build the full injected block (markers + IIFE that installs a <style>).
// `regions` must already be filtered to enabled regions that have an image.
export function buildInjectedBlock(regions: ResolvedRegion[]): { block: string; hash: string } {
  const css = buildCss(regions);
  const hash = hashString(css);
  // JSON.stringify gives a safe single-line JS string literal for the CSS.
  const cssLiteral = JSON.stringify(css);
  const idLiteral = JSON.stringify(STYLE_ELEMENT_ID);
  const body = [
    `${MARKER_START} ${hash}`,
    `;(function () {`,
    `  try {`,
    `    var css = ${cssLiteral};`,
    `    var id = ${idLiteral};`,
    `    function inject() {`,
    `      try {`,
    `        if (typeof document === "undefined" || !document.head) return false;`,
    `        var old = document.getElementById(id);`,
    `        if (old && old.parentNode) old.parentNode.removeChild(old);`,
    `        var el = document.createElement("style");`,
    `        el.id = id;`,
    `        el.appendChild(document.createTextNode(css));`,
    `        document.head.appendChild(el);`,
    `        return true;`,
    `      } catch (e) { return false; }`,
    `    }`,
    `    if (!inject()) {`,
    `      var n = 0;`,
    `      var t = setInterval(function () {`,
    `        n++;`,
    `        if (inject() || n > 100) clearInterval(t);`,
    `      }, 100);`,
    `    }`,
    `  } catch (e) {}`,
    `})();`,
    MARKER_END,
  ].join('\n');
  return { block: body, hash };
}
