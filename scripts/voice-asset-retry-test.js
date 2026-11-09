// Tests out/voice-asset-retry.js: when a failed voice asset download is tried
// again. Run after `npm run compile` (npm test does both).
const assert = require('assert');
const {
  shouldTryDownload,
  isMissingStatus,
  parseMarker,
  MISSING_RETRY_MS,
  FAILED_RETRY_MS,
} = require('../out/voice-asset-retry.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const NOW = 1_762_650_000_000;

test('never failed: try', () => {
  assert.strictEqual(shouldTryDownload({ now: NOW }), true);
});

test('missing on the release: wait MISSING_RETRY_MS', () => {
  assert.strictEqual(shouldTryDownload({ missingAt: NOW, now: NOW }), false);
  assert.strictEqual(shouldTryDownload({ missingAt: NOW - (MISSING_RETRY_MS - 1), now: NOW }), false);
  assert.strictEqual(shouldTryDownload({ missingAt: NOW - MISSING_RETRY_MS, now: NOW }), true);
});

test('any other failure: wait FAILED_RETRY_MS', () => {
  assert.strictEqual(shouldTryDownload({ failedAt: NOW - (FAILED_RETRY_MS - 1), now: NOW }), false);
  assert.strictEqual(shouldTryDownload({ failedAt: NOW - FAILED_RETRY_MS, now: NOW }), true);
  assert.ok(FAILED_RETRY_MS < MISSING_RETRY_MS);
});

test('either record alone is enough to wait', () => {
  assert.strictEqual(shouldTryDownload({ missingAt: NOW - MISSING_RETRY_MS * 2, failedAt: NOW - 1, now: NOW }), false);
  assert.strictEqual(shouldTryDownload({ missingAt: NOW - 1, failedAt: NOW - FAILED_RETRY_MS * 2, now: NOW }), false);
});

test('a time in the future (clock changed) does not block', () => {
  assert.strictEqual(shouldTryDownload({ missingAt: NOW + 60_000, now: NOW }), true);
  assert.strictEqual(shouldTryDownload({ failedAt: NOW + 60_000, now: NOW }), true);
  assert.strictEqual(shouldTryDownload({ missingAt: NaN, failedAt: Infinity, now: NOW }), true);
});

test('only 404 and 410 mean "not there"', () => {
  assert.ok(isMissingStatus(404));
  assert.ok(isMissingStatus(410));
  for (const other of [200, 403, 429, 500, 503, 0, undefined, null, '404']) {
    assert.ok(!isMissingStatus(other), `should not treat ${JSON.stringify(other)} as missing`);
  }
});

test('parseMarker reads a plain number of ms and nothing else', () => {
  assert.strictEqual(parseMarker(String(NOW)), NOW);
  assert.strictEqual(parseMarker(` ${NOW}\n`), NOW);
  for (const bad of ['', 'abc', '-5', '1.5', '1e12', '12345678901234567', undefined, null, 42]) {
    assert.strictEqual(parseMarker(bad), undefined, `for ${JSON.stringify(bad)}`);
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
  } catch (err) {
    failed++;
    console.error(`[voice-asset-retry-test] FAIL ${name}\n  ${err && err.message}`);
  }
}
if (failed) {
  console.error(`[voice-asset-retry-test] ${failed} of ${tests.length} failed`);
  process.exit(1);
}
console.log(`[voice-asset-retry-test] ${tests.length} passed.`);
