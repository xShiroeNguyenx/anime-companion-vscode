// Tests media/webview/pet-fps.js: the frame-rate cap, the time-based blend,
// and when the Live2D ticker and the CSS loops run. Run by `npm test`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let m;

test('normalizeMode keeps the three modes and turns anything else into run', () => {
  for (const mode of ['run', 'slow', 'paused']) assert.strictEqual(m.normalizeMode(mode), mode);
  for (const odd of [undefined, null, '', 'fast', 'PAUSED', 42, {}]) {
    assert.strictEqual(m.normalizeMode(odd), 'run', `for ${JSON.stringify(odd)}`);
  }
});

test('isRecentlyActive holds for ACTIVE_HOLD_MS after the last event', () => {
  assert.strictEqual(m.isRecentlyActive(1000, NaN), false);
  assert.strictEqual(m.isRecentlyActive(1000, undefined), false);
  assert.strictEqual(m.isRecentlyActive(1000, 1000), true);
  assert.strictEqual(m.isRecentlyActive(1000 + m.ACTIVE_HOLD_MS - 1, 1000), true);
  assert.strictEqual(m.isRecentlyActive(1000 + m.ACTIVE_HOLD_MS, 1000), false);
  // A clock that went backwards is not activity.
  assert.strictEqual(m.isRecentlyActive(500, 1000), false);
});

test('fpsAt: idle, background and active paces', () => {
  assert.strictEqual(m.fpsAt(1000, NaN), m.IDLE_FPS);
  assert.strictEqual(m.fpsAt(1000, NaN, 'run'), m.IDLE_FPS);
  assert.strictEqual(m.fpsAt(1000, NaN, 'slow'), m.BACKGROUND_FPS);
  assert.strictEqual(m.fpsAt(1000, NaN, 'paused'), m.IDLE_FPS);
  assert.strictEqual(m.fpsAt(1000, NaN, 'warp'), m.IDLE_FPS);
  for (const mode of ['run', 'slow', 'paused', undefined]) {
    assert.strictEqual(m.fpsAt(1000, 900, mode), m.ACTIVE_FPS, `active in ${mode}`);
  }
  assert.ok(m.BACKGROUND_FPS < m.IDLE_FPS && m.IDLE_FPS <= 30 && m.IDLE_FPS < m.ACTIVE_FPS);
});

test('blendAlpha gives the same result over time at any frame rate', () => {
  const p = 0.08;
  const blendFor = (fps, ms) => {
    let value = 0;
    const frames = Math.round((ms / 1000) * fps);
    for (let i = 0; i < frames; i++) value += (1 - value) * m.blendAlpha(p, 1000 / fps);
    return value;
  };
  // One second: a whole number of frames at every rate tried (half a second is
  // 7.5 frames at 15 fps, and the extra half frame would be the difference).
  const at60 = blendFor(60, 1000);
  for (const fps of [15, 30, 120, 144]) {
    const value = blendFor(fps, 1000);
    assert.ok(Math.abs(value - at60) < 1e-9, `${fps} fps: ${value} vs ${at60}`);
  }
  assert.ok(Math.abs(m.blendAlpha(p, 1000 / 60) - p) < 1e-12, 'at 60 fps it is the old per-frame factor');
});

test('blendAlpha stays within [0, 1] for odd inputs', () => {
  for (const factor of [0.08, 2, -1, NaN]) {
    for (const delta of [-5, 0, 16, 1e9, NaN]) {
      const a = m.blendAlpha(factor, delta);
      assert.ok(a >= 0 && a <= 1, `blendAlpha(${factor}, ${delta}) = ${a}`);
    }
  }
});

test('shouldRun: holds win, hidden stops, paused gives way to the pointer', () => {
  const base = { mode: 'run', docHidden: false, modelHidden: false, holds: 0, recentlyActive: false };
  assert.strictEqual(m.shouldRun(base), true);
  assert.strictEqual(m.shouldRun({ ...base, mode: 'slow' }), true);
  assert.strictEqual(m.shouldRun({ ...base, mode: 'paused' }), false);
  assert.strictEqual(m.shouldRun({ ...base, mode: 'paused', recentlyActive: true }), true);
  assert.strictEqual(m.shouldRun({ ...base, docHidden: true, recentlyActive: true }), false);
  assert.strictEqual(m.shouldRun({ ...base, modelHidden: true, recentlyActive: true }), false);
  assert.strictEqual(
    m.shouldRun({ mode: 'paused', docHidden: true, modelHidden: true, holds: 1, recentlyActive: false }),
    true
  );
  assert.strictEqual(m.shouldRun({ ...base, mode: undefined }), true);
});

test('cssPaused: loops run only in run, or while the user is at her', () => {
  for (const mode of ['run', 'slow', 'paused']) {
    assert.strictEqual(m.cssPaused({ run: false, mode, recentlyActive: true }), true, `stopped, ${mode}`);
  }
  assert.strictEqual(m.cssPaused({ run: true, mode: 'run', recentlyActive: false }), false);
  assert.strictEqual(m.cssPaused({ run: true, mode: undefined, recentlyActive: false }), false);
  assert.strictEqual(m.cssPaused({ run: true, mode: 'slow', recentlyActive: false }), true);
  assert.strictEqual(m.cssPaused({ run: true, mode: 'slow', recentlyActive: true }), false);
  assert.strictEqual(m.cssPaused({ run: true, mode: 'paused', recentlyActive: true }), false);
});

(async () => {
  // Imported as source text: the package is CommonJS, and loading a .js file
  // with `export` through a file URL makes Node warn about reparsing it.
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'webview', 'pet-fps.js'), 'utf8');
  m = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
    } catch (err) {
      failed++;
      console.error(`[pet-fps-test] FAIL ${name}\n  ${err && err.message}`);
    }
  }
  if (failed) {
    console.error(`[pet-fps-test] ${failed} of ${tests.length} failed`);
    process.exit(1);
  }
  console.log(`[pet-fps-test] ${tests.length} passed.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
