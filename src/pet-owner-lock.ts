// The files behind pet-owner.ts: which VS Code window runs the desktop pet.
// Thin on purpose, it decides nothing itself. No `vscode` import, so the
// tests can run it in plain Node over a temporary folder and a fake `fs`.
//
//   <dir>/desktop-pet-owner.json     { ownerId, pid, heartbeatAt }
//   <dir>/desktop-pet-takeover.json  { by, at }   "bring the pet here"
//
// <dir> is the extension's globalStorageUri, shared by every window.

import * as nodeFs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  decide,
  HEARTBEAT_MS,
  OwnerRecord,
  parseOwnerRecord,
  parseTakeover,
  POLL_MS,
  TakeoverRequest,
  WAKE_GAP_MS,
  WAKE_GRACE_MS,
} from './pet-owner';

export const OWNER_FILE = 'desktop-pet-owner.json';
export const TAKEOVER_FILE = 'desktop-pet-takeover.json';

export type LockFs = Pick<
  typeof nodeFs,
  'readFileSync' | 'writeFileSync' | 'renameSync' | 'unlinkSync' | 'statSync' | 'mkdirSync'
>;

/** Whether a process with this id runs. EPERM means it does, we just may not signal it. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errCode(err) === 'EPERM';
  }
}

function errCode(err: unknown): string | undefined {
  return err && typeof err === 'object' ? (err as NodeJS.ErrnoException).code : undefined;
}

type Read<T> = { kind: 'none' } | { kind: 'ok'; value: T } | { kind: 'error'; error: unknown };

export interface PetOwnerLockOptions {
  /** The folder every window shares. Created when missing. */
  dir: string;
  me?: string;
  pid?: number;
  fs?: LockFs;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
  /** Told when this window starts (true) or stops (false) running the pet. */
  onChange?: (owned: boolean) => void;
  log?: (line: string) => void;
}

export class PetOwnerLock {
  readonly me: string;
  private readonly _dir: string;
  private readonly _file: string;
  private readonly _takeoverFile: string;
  private readonly _pid: number;
  private readonly _fs: LockFs;
  private readonly _isAlive: (pid: number) => boolean;
  private readonly _now: () => number;
  private readonly _onChange?: (owned: boolean) => void;
  private readonly _log?: (line: string) => void;

  /** The file carried my id the last time I looked. */
  private _held = false;
  /**
   * Held for a whole poll, so the pet may start. Two windows that claim a
   * stale file at the same instant can both think they won; the loser sees
   * the winner's file on its next look, before it ever started a pet.
   */
  private _confirmed = false;
  private _lastBeat = 0;
  private _lastTick = 0;
  private _graceUntil = 0;
  private _timer?: NodeJS.Timeout;
  private _disposed = false;
  private _lastProblem = '';
  private _problemThisTick = false;

  constructor(o: PetOwnerLockOptions) {
    this.me = o.me ?? crypto.randomUUID();
    this._dir = o.dir;
    this._file = path.join(o.dir, OWNER_FILE);
    this._takeoverFile = path.join(o.dir, TAKEOVER_FILE);
    this._pid = o.pid ?? process.pid;
    this._fs = o.fs ?? nodeFs;
    this._isAlive = o.isAlive ?? pidAlive;
    this._now = o.now ?? Date.now;
    this._onChange = o.onChange;
    this._log = o.log;
  }

  /** This window runs the pet. */
  get owned(): boolean {
    return this._confirmed;
  }

  start(): void {
    if (this._timer || this._disposed) return;
    this._ensureDir();
    this.tick();
    this._timer = setInterval(() => this.tick(), POLL_MS);
    this._timer.unref?.();
  }

  /** One look at the files, and whatever follows from it. Public for the tests. */
  tick(): void {
    if (this._disposed) return;
    this._problemThisTick = false;
    const now = this._now();
    if (this._lastTick && now - this._lastTick >= WAKE_GAP_MS) {
      this._graceUntil = now + WAKE_GRACE_MS;
    }
    this._lastTick = now;

    const read = this._readRecord();
    if (read.kind === 'error') {
      // Antivirus or a writer holding the file. Reading that as "nobody owns
      // it" is how two pets start: keep what we had and look again.
      this._problem('read', read.error);
      return;
    }
    const record = read.kind === 'ok' ? read.value : undefined;
    const takeover = this._readTakeover();
    // An unreadable record has no pid to ask about: only its age counts.
    const ownerAlive = !record || record.ownerId === this.me || record.pid <= 0 || this._isAlive(record.pid);

    const action = decide({
      me: this.me,
      record,
      ownerAlive,
      takeover,
      justWoke: now < this._graceUntil,
      now,
    });

    switch (action) {
      case 'own':
        this._held = true;
        if (now - this._lastBeat >= HEARTBEAT_MS) this._beat(now);
        // My own "bring her here" has been honoured; it should not linger.
        if (takeover?.by === this.me) this._unlink(this._takeoverFile);
        if (!this._confirmed) {
          this._confirmed = true;
          this._log?.('Desktop pet: this window runs the pet');
          this._onChange?.(true);
        }
        break;
      case 'release':
        this._log?.('Desktop pet: another window asked for the pet, handing her over');
        this._unlinkIfMine();
        this._lose();
        break;
      case 'follow':
        this._lose();
        break;
      case 'claim':
        // Confirmed (and the pet started) on the next look, if the file is still mine.
        // A window that already runs her keeps doing so while it claims again.
        if (this._claim(record, now)) {
          this._held = true;
          this._lastBeat = now;
        } else {
          this._lose();
        }
        break;
    }
    if (!this._problemThisTick) this._lastProblem = '';
  }

  /** Asks the window that has the pet to hand her over. False when the request could not be written. */
  requestTakeover(): boolean {
    if (this._disposed) return false;
    this._ensureDir();
    const request: TakeoverRequest = { by: this.me, at: this._now() };
    if (!this._writeReplacing(this._takeoverFile, JSON.stringify(request), 'takeover')) return false;
    this.tick();
    return true;
  }

  /** Stops looking and gives the pet up. The caller stops its pet first. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._timer) clearInterval(this._timer);
    this._timer = undefined;
    if (this._held || this._confirmed) this._unlinkIfMine();
    this._held = false;
    this._confirmed = false;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private _lose(): void {
    this._held = false;
    if (this._confirmed) {
      this._confirmed = false;
      this._log?.('Desktop pet: another window runs the pet now');
      this._onChange?.(false);
    }
  }

  private _readRecord(): Read<OwnerRecord> {
    let text: string;
    try {
      text = this._fs.readFileSync(this._file, 'utf8') as string;
    } catch (err) {
      return errCode(err) === 'ENOENT' ? { kind: 'none' } : { kind: 'error', error: err };
    }
    const parsed = parseOwnerRecord(text);
    if (parsed) return { kind: 'ok', value: parsed };
    // Damaged, or caught between create and write: somebody's, as old as the
    // file. It is claimed again once that goes stale, so it never sticks.
    try {
      const mtime = this._fs.statSync(this._file).mtimeMs;
      return { kind: 'ok', value: { ownerId: '', pid: 0, heartbeatAt: mtime } };
    } catch (err) {
      return errCode(err) === 'ENOENT' ? { kind: 'none' } : { kind: 'error', error: err };
    }
  }

  private _readTakeover(): TakeoverRequest | undefined {
    try {
      return parseTakeover(this._fs.readFileSync(this._takeoverFile, 'utf8') as string);
    } catch {
      // Only a request: missing or unreadable means nobody asked.
      return undefined;
    }
  }

  /** Atomic: one window wins, the rest find the file taken and follow. */
  private _claim(stale: OwnerRecord | undefined, now: number): boolean {
    if (stale) {
      // Move the old record aside first. Only one window can rename it; the
      // rest get ENOENT and look again on their next poll.
      const aside = `${this._file}.${this.me}.stale`;
      try {
        this._fs.renameSync(this._file, aside);
      } catch (err) {
        if (errCode(err) !== 'ENOENT') this._problem('claim', err);
        return false;
      }
      this._unlink(aside);
    }
    const record: OwnerRecord = { ownerId: this.me, pid: this._pid, heartbeatAt: now };
    try {
      this._fs.writeFileSync(this._file, JSON.stringify(record), { flag: 'wx' });
      return true;
    } catch (err) {
      if (errCode(err) !== 'EEXIST') this._problem('claim', err);
      return false;
    }
  }

  private _beat(now: number): void {
    const record: OwnerRecord = { ownerId: this.me, pid: this._pid, heartbeatAt: now };
    // Tried again on the next poll when it fails: three polls short of stale.
    if (this._writeReplacing(this._file, JSON.stringify(record), 'heartbeat')) this._lastBeat = now;
  }

  /** Write a temporary file, then rename it over the target: readers never see half a file. */
  private _writeReplacing(file: string, text: string, what: string): boolean {
    const tmp = `${file}.${this.me}.tmp`;
    try {
      this._fs.writeFileSync(tmp, text);
      this._fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      this._problem(what, err);
      this._unlink(tmp);
      return false;
    }
  }

  private _unlinkIfMine(): void {
    const read = this._readRecord();
    if (read.kind === 'ok' && read.value.ownerId === this.me) this._unlink(this._file);
  }

  private _unlink(file: string): void {
    try {
      this._fs.unlinkSync(file);
    } catch {
      // gone already, or held: harmless either way
    }
  }

  private _ensureDir(): void {
    try {
      this._fs.mkdirSync(this._dir, { recursive: true });
    } catch (err) {
      this._problem('folder', err);
    }
  }

  /** Logged once while it keeps happening; polls run every second. */
  private _problem(what: string, err: unknown): void {
    this._problemThisTick = true;
    const line = `${what}: ${err instanceof Error ? err.message : String(err)}`;
    if (line === this._lastProblem) return;
    this._lastProblem = line;
    this._log?.(`Desktop pet owner file, ${line}`);
  }
}
