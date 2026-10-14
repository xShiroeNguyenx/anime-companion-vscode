// Tests for the bundled themes and the accent tint: the pure helpers in
// out/theme-colors.js, and that themes/*.json + package.json still match
// src/bundled-themes.ts. Run after `npm run compile` (npm test does both).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');
const {
  isHexColor,
  mix,
  alpha,
  readableOn,
  accentCustomizations,
  reconcileCustomizations,
} = require('../out/theme-colors.js');
const { BUNDLED_THEMES, CHARACTER_THEMES, buildThemeJson, themeForModel, themeByLabel, themeById } = require('../out/bundled-themes.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---- color helpers -----------------------------------------------------------

test('isHexColor accepts only #RRGGBB', () => {
  assert.ok(isHexColor('#ff8fb3'));
  assert.ok(isHexColor('#ABCDEF'));
  for (const bad of ['', 'ff8fb3', '#fff', '#ff8fb3aa', 'red', null, 12]) {
    assert.ok(!isHexColor(bad), `should reject ${JSON.stringify(bad)}`);
  }
});

test('mix and alpha', () => {
  assert.strictEqual(mix('#000000', '#ffffff', 0), '#000000');
  assert.strictEqual(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.strictEqual(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.strictEqual(alpha('#FF8FB3', 0.25), '#ff8fb340');
  assert.strictEqual(alpha('#ff8fb3', 1), '#ff8fb3ff');
});

test('readableOn picks dark text on pastels and white on deep colors', () => {
  assert.notStrictEqual(readableOn('#ffc2d4'), '#ffffff');
  assert.strictEqual(readableOn('#1f1a1e'), '#ffffff');
  assert.strictEqual(readableOn('#3a1060'), '#ffffff');
});

// ---- reconcileCustomizations -------------------------------------------------

const desired = { 'statusBar.background': '#ff8fb3', 'badge.background': '#ff8fb3' };

test('adds the tint to empty customizations and owns every key', () => {
  const r = reconcileCustomizations(undefined, desired, {});
  assert.deepStrictEqual(r.next, desired);
  assert.deepStrictEqual(r.owned, desired);
  assert.ok(r.changed);
});

test('never overwrites a color the user set', () => {
  const current = { 'statusBar.background': '#123456', 'editor.background': '#000000' };
  const r = reconcileCustomizations(current, desired, {});
  assert.strictEqual(r.next['statusBar.background'], '#123456');
  assert.strictEqual(r.next['badge.background'], '#ff8fb3');
  assert.strictEqual(r.next['editor.background'], '#000000');
  assert.deepStrictEqual(r.owned, { 'badge.background': '#ff8fb3' });
});

test('turning off removes exactly what was added', () => {
  const current = { 'editor.background': '#000000', ...desired };
  const r = reconcileCustomizations(current, {}, desired);
  assert.deepStrictEqual(r.next, { 'editor.background': '#000000' });
  assert.deepStrictEqual(r.owned, {});
  assert.ok(r.changed);
});

test('a key the user edited after we wrote it becomes theirs', () => {
  const current = { 'statusBar.background': '#00ff00', 'badge.background': '#ff8fb3' };
  const r = reconcileCustomizations(current, {}, desired);
  assert.deepStrictEqual(r.next, { 'statusBar.background': '#00ff00' });
});

test('switching accent replaces our keys', () => {
  const next = { 'statusBar.background': '#6cc4ff', 'badge.background': '#6cc4ff' };
  const r = reconcileCustomizations({ ...desired }, next, desired);
  assert.deepStrictEqual(r.next, next);
  assert.deepStrictEqual(r.owned, next);
});

test('re-applying the same tint is not a change', () => {
  const r = reconcileCustomizations({ ...desired }, desired, desired);
  assert.ok(!r.changed);
});

test('theme-scoped blocks pass through untouched', () => {
  const scoped = { '[Default Dark Modern]': { 'statusBar.background': '#111111' } };
  const r = reconcileCustomizations(scoped, desired, {});
  assert.strictEqual(r.next['[Default Dark Modern]'], scoped['[Default Dark Modern]']);
  const off = reconcileCustomizations(r.next, {}, r.owned);
  assert.deepStrictEqual(off.next, scoped);
});

test('accentCustomizations returns valid colors only', () => {
  for (const [key, value] of Object.entries(accentCustomizations('#ff8fb3'))) {
    assert.ok(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value), `${key} = ${value}`);
  }
});

// ---- shipped themes ----------------------------------------------------------

test('every bundled theme is contributed in package.json and generated on disk', () => {
  const contributed = packageJson.contributes.themes;
  assert.strictEqual(contributed.length, BUNDLED_THEMES.length);
  for (const theme of BUNDLED_THEMES) {
    const entry = contributed.find((c) => c.label === theme.label);
    assert.ok(entry, `package.json is missing theme "${theme.label}"`);
    assert.strictEqual(entry.id, undefined, 'no id: workbench.colorTheme must equal the label');
    assert.strictEqual(entry.path, `./themes/${theme.file}`);
    assert.strictEqual(entry.uiTheme, theme.type === 'light' ? 'vs' : 'vs-dark', `${theme.label} uiTheme`);
    const file = path.resolve(__dirname, '..', 'themes', theme.file);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(onDisk, buildThemeJson(theme), `${theme.file} is stale — run npm run themes:generate`);
  }
  assert.ok(packageJson.files.includes('themes/**'), 'themes/** must be in package.json "files" or the .vsix ships without them');
});

test('theme lookups', () => {
  assert.strictEqual(themeForModel('mao').name, 'Mao');
  assert.strictEqual(themeById('peach-latte').type, 'light');
  assert.strictEqual(themeById('../../etc'), undefined);
  assert.ok(CHARACTER_THEMES.every((theme) => theme.group === 'character' && theme.modelId));
  assert.strictEqual(new Set(BUNDLED_THEMES.map((theme) => theme.id)).size, BUNDLED_THEMES.length, 'ids are unique');
  assert.strictEqual(themeForModel('my-custom-model'), undefined);
  assert.strictEqual(themeByLabel('Anime Companion: Haru Sky').modelId, 'haru');
  assert.strictEqual(themeByLabel('Default Dark Modern'), undefined);
});

// ---- companion chrome tint (media/webview/accent.js, an ES module) ----------

let accent;

const near = (a, b) => a.split(', ').every((v, i) => Math.abs(Number(v) - Number(b.split(', ')[i])) <= 1);
const lightness = (rgb) => {
  const c = rgb.split(', ').map(Number);
  return (Math.max(...c) + Math.min(...c)) / 2;
};

test('the original pink maps onto itself, and matches companion.css', () => {
  const shades = accent.tintShades('#ff96be');
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'companion.css'), 'utf8');
  for (const [name, rgb] of Object.entries(shades)) {
    const declared = new RegExp(`\\s${name}: ([0-9, ]+);`).exec(css);
    assert.ok(declared, `companion.css does not declare ${name}`);
    assert.ok(near(rgb, declared[1]), `${name}: ${rgb} vs ${declared[1]}`);
  }
});

test('re-tinting keeps each shade as light or dark as it was', () => {
  const base = accent.tintShades('#ff96be');
  for (const theme of BUNDLED_THEMES) {
    const shades = accent.tintShades(theme.palette.accent);
    for (const name of Object.keys(base)) {
      assert.ok(Math.abs(lightness(shades[name]) - lightness(base[name])) <= 2, `${theme.id} ${name}`);
    }
  }
});

test('anything but #RRGGBB keeps the original pinks', () => {
  for (const bad of [undefined, '', 'pink', '#fff', 'url(x)']) assert.strictEqual(accent.tintShades(bad), null);
});

(async () => {
  // Imported as source text: the package is CommonJS, and loading a .js file
  // with `export` through a file URL makes Node warn about reparsing it.
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'webview', 'accent.js'), 'utf8');
  accent = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
    } catch (err) {
      failed++;
      console.error(`[theme-test] FAIL ${name}\n  ${err && err.message}`);
    }
  }
  if (failed) {
    console.error(`[theme-test] ${failed} of ${tests.length} failed`);
    process.exit(1);
  }
  console.log(`[theme-test] ${tests.length} passed.`);
})();
