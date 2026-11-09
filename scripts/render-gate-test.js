// Tests out/render-gate.js: how fast each VS Code window draws its companion.
// Run after `npm run compile` (npm test does both).
const assert = require('assert');
const { renderMode, msUntilNextChange, AWAY_MS, BACKGROUND_PAUSE_MS } = require('../out/render-gate.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const NOW = 10_000_000;
const focused = { viewVisible: true, focused: true, now: NOW };
const blurred = (ago) => ({ viewVisible: true, focused: false, blurredSince: NOW - ago, now: NOW });

test('a hidden view never draws, focused or not', () => {
  assert.strictEqual(renderMode({ ...focused, viewVisible: false }), 'paused');
  assert.strictEqual(renderMode({ ...blurred(0), viewVisible: false }), 'paused');
});

test('the focused window runs until the user has been away AWAY_MS', () => {
  assert.strictEqual(renderMode(focused), 'run');
  assert.strictEqual(renderMode({ ...focused, inactiveSince: NOW - (AWAY_MS - 1) }), 'run');
  assert.strictEqual(renderMode({ ...focused, inactiveSince: NOW - AWAY_MS }), 'paused');
});

test('a window out of focus is slow, then paused after BACKGROUND_PAUSE_MS', () => {
  assert.strictEqual(renderMode({ viewVisible: true, focused: false, now: NOW }), 'slow');
  assert.strictEqual(renderMode(blurred(0)), 'slow');
  assert.strictEqual(renderMode(blurred(BACKGROUND_PAUSE_MS - 1)), 'slow');
  assert.strictEqual(renderMode(blurred(BACKGROUND_PAUSE_MS)), 'paused');
});

test('out of focus, `active` does not matter', () => {
  assert.strictEqual(renderMode({ ...blurred(0), inactiveSince: NOW - AWAY_MS * 2 }), 'slow');
});

test('msUntilNextChange counts down to the next threshold', () => {
  assert.strictEqual(msUntilNextChange(blurred(1000)), BACKGROUND_PAUSE_MS - 1000);
  assert.strictEqual(msUntilNextChange({ ...focused, inactiveSince: NOW - 1000 }), AWAY_MS - 1000);
});

test('msUntilNextChange is undefined when only an event can change the mode', () => {
  assert.strictEqual(msUntilNextChange(focused), undefined);
  assert.strictEqual(msUntilNextChange({ viewVisible: true, focused: false, now: NOW }), undefined);
  assert.strictEqual(msUntilNextChange({ ...blurred(1000), viewVisible: false }), undefined);
  assert.strictEqual(msUntilNextChange(blurred(BACKGROUND_PAUSE_MS)), undefined);
  assert.strictEqual(msUntilNextChange(blurred(BACKGROUND_PAUSE_MS * 3)), undefined);
  assert.strictEqual(msUntilNextChange({ ...focused, inactiveSince: NOW - AWAY_MS }), undefined);
});

test('msUntilNextChange never asks for a wait of zero or less', () => {
  for (let ago = -5000; ago <= BACKGROUND_PAUSE_MS + 5000; ago += 997) {
    const wait = msUntilNextChange(blurred(ago));
    assert.ok(wait === undefined || wait > 0, `blurred ${ago} ms ago: ${wait}`);
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
  } catch (err) {
    failed++;
    console.error(`[render-gate-test] FAIL ${name}\n  ${err && err.message}`);
  }
}
if (failed) {
  console.error(`[render-gate-test] ${failed} of ${tests.length} failed`);
  process.exit(1);
}
console.log(`[render-gate-test] ${tests.length} passed.`);
