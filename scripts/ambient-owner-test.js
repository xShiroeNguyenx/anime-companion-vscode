// Tests out/ambient-owner.js: which VS Code window plays the ambient music,
// over a temporary folder. Run after `npm run compile` (npm test does both).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AmbientOwner, AMBIENT_OWNER_FILE, ambientOwnerOf } = require('../out/ambient-owner.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const dirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-owner-'));
  dirs.push(dir);
  return dir;
}
const fileIn = (dir) => path.join(dir, AMBIENT_OWNER_FILE);

test('ambientOwnerOf reads the id and nothing else', () => {
  assert.strictEqual(ambientOwnerOf('{"ownerId":"a","at":1}'), 'a');
  for (const bad of ['', '{', 'null', '[]', '{"ownerId":""}', '{"ownerId":5}']) {
    assert.strictEqual(ambientOwnerOf(bad), undefined, bad);
  }
});

test('the last window to claim plays; the one before hears it on its next check', () => {
  const dir = tempDir();
  const a = new AmbientOwner({ dir, me: 'a' });
  const b = new AmbientOwner({ dir, me: 'b' });
  assert.strictEqual(a.claim(), true);
  assert.strictEqual(a.claim(), false, 'claiming again changes nothing');
  assert.strictEqual(a.check(), false);
  assert.strictEqual(b.claim(), true);
  assert.strictEqual(a.mine, true, 'a has not looked yet');
  assert.strictEqual(a.check(), true);
  assert.strictEqual(a.mine, false);
  assert.strictEqual(a.check(), false, 'a window without the music does not look');
  assert.strictEqual(b.check(), false);
  assert.strictEqual(b.mine, true);
});

test('a window that never claimed never plays, and checking does not change that', () => {
  const dir = tempDir();
  const a = new AmbientOwner({ dir, me: 'a' });
  assert.strictEqual(a.mine, false);
  assert.strictEqual(a.check(), false);
  assert.ok(!fs.existsSync(fileIn(dir)));
});

test('a missing or unreadable file keeps the music where it is', () => {
  const dir = tempDir();
  let fail = false;
  const flakyFs = {
    ...fs,
    readFileSync: (file, enc) => {
      if (fail) throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
      return fs.readFileSync(file, enc);
    },
  };
  const a = new AmbientOwner({ dir, me: 'a', fs: flakyFs });
  a.claim();
  fs.unlinkSync(fileIn(dir));
  assert.strictEqual(a.check(), false);
  assert.strictEqual(a.mine, true);
  fs.writeFileSync(fileIn(dir), 'not json');
  assert.strictEqual(a.check(), false);
  assert.strictEqual(a.mine, true);
  fail = true;
  assert.strictEqual(a.check(), false);
  assert.strictEqual(a.mine, true);
});

test('a failed claim changes nothing', () => {
  const dir = tempDir();
  const brokenFs = {
    ...fs,
    renameSync: () => {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    },
  };
  const a = new AmbientOwner({ dir, me: 'a', fs: brokenFs });
  assert.strictEqual(a.claim(), false);
  assert.strictEqual(a.mine, false);
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')), 'temporary file left behind');
});

test('release removes only a file that still names this window', () => {
  const dir = tempDir();
  const a = new AmbientOwner({ dir, me: 'a' });
  const b = new AmbientOwner({ dir, me: 'b' });
  a.claim();
  b.claim();
  a.release(); // a has not looked: it still thinks it plays
  assert.strictEqual(ambientOwnerOf(fs.readFileSync(fileIn(dir), 'utf8')), 'b');
  b.release();
  assert.ok(!fs.existsSync(fileIn(dir)));
  assert.strictEqual(b.mine, false);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
  } catch (err) {
    failed++;
    console.error(`[ambient-owner-test] FAIL ${name}\n  ${err && err.stack}`);
  }
}
for (const dir of dirs) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // temp folder, the OS cleans it eventually
  }
}
if (failed) {
  console.error(`[ambient-owner-test] ${failed} of ${tests.length} failed`);
  process.exit(1);
}
console.log(`[ambient-owner-test] ${tests.length} passed.`);
