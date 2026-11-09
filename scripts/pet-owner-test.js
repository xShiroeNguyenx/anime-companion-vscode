// Tests out/pet-owner.js (which window runs the desktop pet) and
// out/pet-owner-lock.js (the files behind it, in a temporary folder).
// Run after `npm run compile` (npm test does both).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  decide,
  shouldRestart,
  parseOwnerRecord,
  parseTakeover,
  STALE_MS,
  HEARTBEAT_MS,
  WAKE_GRACE_MS,
} = require('../out/pet-owner.js');
const { PetOwnerLock, OWNER_FILE, TAKEOVER_FILE, pidAlive } = require('../out/pet-owner-lock.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const NOW = 1_762_650_000_000;
const ME = 'me';
const OTHER = 'other';
const mine = { ownerId: ME, pid: 1, heartbeatAt: NOW };
const theirs = (heartbeatAt = NOW) => ({ ownerId: OTHER, pid: 2, heartbeatAt });
const ask = (by, at = NOW) => ({ by, at });

// ─── decide ──────────────────────────────────────────────────────────────

test('no file: claim, unless someone else asked first', () => {
  assert.strictEqual(decide({ me: ME, ownerAlive: true, now: NOW }), 'claim');
  assert.strictEqual(decide({ me: ME, ownerAlive: true, takeover: ask(OTHER), now: NOW }), 'follow');
  assert.strictEqual(decide({ me: ME, ownerAlive: true, takeover: ask(ME), now: NOW }), 'claim');
  assert.strictEqual(
    decide({ me: ME, ownerAlive: true, takeover: ask(OTHER, NOW - STALE_MS), now: NOW }),
    'claim'
  );
});

test('my file: own, release only for a fresh request from another window', () => {
  assert.strictEqual(decide({ me: ME, record: mine, ownerAlive: true, now: NOW }), 'own');
  assert.strictEqual(decide({ me: ME, record: mine, ownerAlive: true, takeover: ask(OTHER), now: NOW }), 'release');
  assert.strictEqual(decide({ me: ME, record: mine, ownerAlive: true, takeover: ask(ME), now: NOW }), 'own');
  assert.strictEqual(
    decide({ me: ME, record: mine, ownerAlive: true, takeover: ask(OTHER, NOW - STALE_MS), now: NOW }),
    'own'
  );
});

test("another window's file: follow while it lives and beats", () => {
  assert.strictEqual(decide({ me: ME, record: theirs(), ownerAlive: true, now: NOW }), 'follow');
  assert.strictEqual(decide({ me: ME, record: theirs(NOW - STALE_MS), ownerAlive: true, now: NOW }), 'claim');
  assert.strictEqual(decide({ me: ME, record: theirs(NOW - (STALE_MS - 1)), ownerAlive: true, now: NOW }), 'follow');
  assert.strictEqual(decide({ me: ME, record: theirs(), ownerAlive: false, now: NOW }), 'claim');
});

test('times from the future: a heartbeat is not stale, a request is not fresh', () => {
  assert.strictEqual(decide({ me: ME, record: theirs(NOW + 60_000), ownerAlive: true, now: NOW }), 'follow');
  assert.strictEqual(
    decide({ me: ME, record: mine, ownerAlive: true, takeover: ask(OTHER, NOW + 60_000), now: NOW }),
    'own'
  );
});

test('just woke from sleep: a quiet owner that still runs keeps the pet', () => {
  const old = theirs(NOW - STALE_MS * 10);
  assert.strictEqual(decide({ me: ME, record: old, ownerAlive: true, justWoke: true, now: NOW }), 'follow');
  // A dead owner is gone whether or not we slept.
  assert.strictEqual(decide({ me: ME, record: old, ownerAlive: false, justWoke: true, now: NOW }), 'claim');
});

// ─── shouldRestart ───────────────────────────────────────────────────────

test('shouldRestart: the tray Quit (code 0, no signal) stays quit', () => {
  const base = { disposed: false, wasOurs: true };
  assert.strictEqual(shouldRestart({ ...base, code: 0, signal: null }), false);
  assert.strictEqual(shouldRestart({ ...base, code: 1, signal: null }), true);
  assert.strictEqual(shouldRestart({ ...base, code: 101, signal: null }), true);
  assert.strictEqual(shouldRestart({ ...base, code: null, signal: 'SIGTERM' }), true);
  assert.strictEqual(shouldRestart({ ...base, code: 0, signal: 'SIGKILL' }), true);
  assert.strictEqual(shouldRestart({ disposed: true, wasOurs: true, code: 1, signal: null }), false);
  assert.strictEqual(shouldRestart({ disposed: false, wasOurs: false, code: 1, signal: null }), false);
});

test('parse: only complete records count', () => {
  assert.deepStrictEqual(parseOwnerRecord(JSON.stringify(mine)), mine);
  for (const bad of ['', '{', 'null', '{"ownerId":"","pid":1,"heartbeatAt":1}', '{"ownerId":"a","pid":1.5,"heartbeatAt":1}', '{"ownerId":"a","pid":1}']) {
    assert.strictEqual(parseOwnerRecord(bad), undefined, `owner ${bad}`);
  }
  assert.deepStrictEqual(parseTakeover(JSON.stringify(ask(OTHER))), ask(OTHER));
  for (const bad of ['', '[]', '{"by":"a"}', '{"by":"","at":1}']) {
    assert.strictEqual(parseTakeover(bad), undefined, `takeover ${bad}`);
  }
});

test('pidAlive: this process runs, nonsense ids do not', () => {
  assert.strictEqual(pidAlive(process.pid), true);
  assert.strictEqual(pidAlive(0), false);
  assert.strictEqual(pidAlive(-5), false);
  assert.strictEqual(pidAlive(1.5), false);
});

// ─── PetOwnerLock, over a real temporary folder ──────────────────────────

const dirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-owner-'));
  dirs.push(dir);
  return dir;
}

/** A window: its own clock and pid, a shared folder, and a count of pets it started. */
function makeWindow(dir, id, opts = {}) {
  const w = { now: opts.now ?? NOW, alive: opts.alive ?? new Set(), changes: [] };
  w.lock = new PetOwnerLock({
    dir,
    me: id,
    pid: opts.pid,
    fs: opts.fs,
    now: () => w.now,
    isAlive: (pid) => w.alive.has(pid),
    onChange: (owned) => w.changes.push(owned),
  });
  return w;
}

const readOwner = (dir) => JSON.parse(fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8'));
const started = (...windows) => windows.filter((w) => w.lock.owned).length;

test('lock: two windows on an empty folder, one pet', () => {
  const dir = tempDir();
  const alive = new Set([11, 22]);
  const a = makeWindow(dir, 'a', { pid: 11, alive });
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  a.lock.tick();
  b.lock.tick();
  // Nobody starts a pet on the first look.
  assert.strictEqual(started(a, b), 0);
  a.lock.tick();
  b.lock.tick();
  assert.strictEqual(started(a, b), 1);
  assert.deepStrictEqual(a.changes, [true]);
  assert.deepStrictEqual(b.changes, []);
  assert.strictEqual(readOwner(dir).ownerId, 'a');
});

test('lock: a race over a stale file still ends with one pet', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, OWNER_FILE), JSON.stringify({ ownerId: 'dead', pid: 99, heartbeatAt: NOW - 60_000 }));
  const alive = new Set([11, 22]);
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  // Window a read the stale file, then window b did all of its claim before
  // a renamed: a ends up moving b's fresh file aside.
  let raced = false;
  const racingFs = {
    ...fs,
    renameSync: (from, to) => {
      if (!raced && from.endsWith(OWNER_FILE)) {
        raced = true;
        b.lock.tick();
      }
      return fs.renameSync(from, to);
    },
  };
  const a = makeWindow(dir, 'a', { pid: 11, alive, fs: racingFs });
  a.lock.tick();
  assert.ok(raced, 'the race did not happen');
  a.lock.tick();
  b.lock.tick();
  a.lock.tick();
  b.lock.tick();
  assert.strictEqual(started(a, b), 1);
  assert.strictEqual(a.changes.length + b.changes.length, 1, 'no pet started and stopped again');
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.stale')), 'stale copies cleaned up');
});

test('lock: a read error keeps what we had, it never claims', () => {
  const dir = tempDir();
  const alive = new Set([11, 22]);
  let failReads = false;
  const flakyFs = {
    ...fs,
    readFileSync: (file, enc) => {
      if (failReads && file.endsWith(OWNER_FILE)) {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      }
      return fs.readFileSync(file, enc);
    },
  };
  const a = makeWindow(dir, 'a', { pid: 11, alive, fs: flakyFs });
  a.lock.tick();
  a.lock.tick();
  assert.strictEqual(a.lock.owned, true);
  failReads = true;
  a.lock.tick();
  assert.strictEqual(a.lock.owned, true, 'owner gave up on a read error');
  assert.deepStrictEqual(a.changes, [true]);

  // A follower that cannot read does not jump into an empty-looking folder.
  const dir2 = tempDir();
  const b = makeWindow(dir2, 'b', { pid: 22, alive, fs: flakyFs });
  b.lock.tick();
  b.lock.tick();
  assert.strictEqual(b.lock.owned, false);
  assert.ok(!fs.existsSync(path.join(dir2, OWNER_FILE)), 'claimed while unable to read');
});

test('lock: a damaged file is claimed once it is STALE_MS old by mtime', () => {
  const dir = tempDir();
  const file = path.join(dir, OWNER_FILE);
  fs.writeFileSync(file, '{"ownerId":');
  const realNow = Date.now();
  const a = makeWindow(dir, 'a', { pid: 11, alive: new Set([11]), now: realNow });
  fs.utimesSync(file, new Date(realNow - STALE_MS + 2000), new Date(realNow - STALE_MS + 2000));
  a.lock.tick();
  a.lock.tick();
  assert.strictEqual(a.lock.owned, false, 'claimed a damaged file that is still recent');
  fs.utimesSync(file, new Date(realNow - STALE_MS - 2000), new Date(realNow - STALE_MS - 2000));
  a.lock.tick();
  a.lock.tick();
  assert.strictEqual(a.lock.owned, true);
});

test('lock: "bring her here" moves the pet, a third window stays out', () => {
  const dir = tempDir();
  const alive = new Set([11, 22, 33]);
  const a = makeWindow(dir, 'a', { pid: 11, alive });
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  const c = makeWindow(dir, 'c', { pid: 33, alive });
  a.lock.tick();
  a.lock.tick();
  assert.strictEqual(a.lock.owned, true);

  assert.strictEqual(b.lock.requestTakeover(), true);
  a.lock.tick(); // releases
  assert.deepStrictEqual(a.changes, [true, false]);
  c.lock.tick(); // the spot is free, but b asked for it
  b.lock.tick(); // claims
  c.lock.tick();
  b.lock.tick(); // confirms
  a.lock.tick();
  c.lock.tick();
  assert.strictEqual(b.lock.owned, true);
  assert.strictEqual(started(a, b, c), 1);
  assert.ok(!fs.existsSync(path.join(dir, TAKEOVER_FILE)), 'request left behind');
});

test('lock: the owner beats every HEARTBEAT_MS, a follower takes over STALE_MS after it stops', () => {
  const dir = tempDir();
  const alive = new Set([11, 22]);
  const a = makeWindow(dir, 'a', { pid: 11, alive });
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  a.lock.tick();
  a.lock.tick();
  a.now += HEARTBEAT_MS;
  a.lock.tick();
  assert.strictEqual(readOwner(dir).heartbeatAt, a.now);

  // a hangs: b keeps polling every second and claims once the beat is stale.
  const lastBeat = a.now;
  b.now = lastBeat;
  while (b.now - lastBeat < STALE_MS) {
    b.lock.tick();
    assert.strictEqual(b.lock.owned, false);
    b.now += 1000;
  }
  b.lock.tick();
  b.now += 1000;
  b.lock.tick();
  assert.strictEqual(b.lock.owned, true);
  // a wakes up, sees the file is b's, and stops its pet.
  a.now = b.now;
  a.lock.tick();
  assert.deepStrictEqual(a.changes, [true, false]);
});

test('lock: after sleep, a follower gives the living owner time to beat', () => {
  const dir = tempDir();
  const alive = new Set([11, 22]);
  const a = makeWindow(dir, 'a', { pid: 11, alive });
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  a.lock.tick();
  a.lock.tick();
  b.lock.tick();
  // The machine sleeps an hour. b wakes first.
  b.now += 3_600_000;
  b.lock.tick();
  b.now += 1000;
  b.lock.tick();
  assert.strictEqual(b.lock.owned, false, 'took the pet from an owner that only slept');
  // a beats, all is as before.
  a.now = b.now;
  a.lock.tick();
  assert.strictEqual(readOwner(dir).heartbeatAt, a.now);
  // Had a really gone quiet after that beat, b (polling every second) takes
  // over once it is STALE_MS old: the grace only covers the wake-up itself.
  const lastBeat = a.now;
  for (let i = 0; i < 60 && !b.lock.owned; i++) {
    b.now += 1000;
    b.lock.tick();
  }
  assert.strictEqual(b.lock.owned, true);
  assert.ok(b.now - lastBeat >= STALE_MS, 'took over before the beat was stale');
  assert.ok(b.now - lastBeat <= STALE_MS + WAKE_GRACE_MS, 'waited too long');
});

test('lock: dispose removes my file, never another window\'s', () => {
  const dir = tempDir();
  const alive = new Set([11, 22]);
  const a = makeWindow(dir, 'a', { pid: 11, alive });
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  a.lock.tick();
  a.lock.tick();
  b.lock.tick();
  b.lock.dispose();
  assert.strictEqual(readOwner(dir).ownerId, 'a');
  a.lock.dispose();
  assert.ok(!fs.existsSync(path.join(dir, OWNER_FILE)));
  // Disposed locks do nothing more.
  a.lock.tick();
  assert.ok(!fs.existsSync(path.join(dir, OWNER_FILE)));
});

test('lock: a dead owner is replaced at once, no STALE_MS wait', () => {
  const dir = tempDir();
  const alive = new Set([11, 22]);
  const a = makeWindow(dir, 'a', { pid: 11, alive });
  const b = makeWindow(dir, 'b', { pid: 22, alive });
  a.lock.tick();
  a.lock.tick();
  alive.delete(11); // a's window crashed without cleaning up
  b.lock.tick();
  b.lock.tick();
  assert.strictEqual(b.lock.owned, true);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
  } catch (err) {
    failed++;
    console.error(`[pet-owner-test] FAIL ${name}\n  ${err && err.stack}`);
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
  console.error(`[pet-owner-test] ${failed} of ${tests.length} failed`);
  process.exit(1);
}
console.log(`[pet-owner-test] ${tests.length} passed.`);
