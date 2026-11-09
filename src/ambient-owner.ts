// Which VS Code window plays the ambient music.
//
// `ambientPreset` is a global setting and every window's panel plays it, so
// four windows played four copies over each other. Now the last window you
// used plays it: a window takes the music when it gains focus (and its page
// may play sound, i.e. you have clicked her there once), and the window that
// has it looks every AMBIENT_POLL_MS whether another took it since. Windows
// without the music do not look at all.
//
//   <dir>/ambient-owner.json   { ownerId, at }
//
// No `vscode` import: scripts/ambient-owner-test.js runs it in plain Node.

import * as nodeFs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const AMBIENT_OWNER_FILE = 'ambient-owner.json';
export const AMBIENT_POLL_MS = 2_000;

export type AmbientFs = Pick<typeof nodeFs, 'readFileSync' | 'writeFileSync' | 'renameSync' | 'unlinkSync' | 'mkdirSync'>;

/** The window named in the file's text; undefined when the text names none. */
export function ambientOwnerOf(text: string): string | undefined {
  try {
    const v = JSON.parse(text) as { ownerId?: unknown };
    return v && typeof v.ownerId === 'string' && v.ownerId ? v.ownerId : undefined;
  } catch {
    return undefined;
  }
}

export interface AmbientOwnerOptions {
  dir: string;
  me?: string;
  fs?: AmbientFs;
  now?: () => number;
  log?: (line: string) => void;
}

export class AmbientOwner {
  readonly me: string;
  private readonly _dir: string;
  private readonly _file: string;
  private readonly _fs: AmbientFs;
  private readonly _now: () => number;
  private readonly _log?: (line: string) => void;
  private _mine = false;
  private _lastProblem = '';

  constructor(o: AmbientOwnerOptions) {
    this.me = o.me ?? crypto.randomUUID();
    this._dir = o.dir;
    this._file = path.join(o.dir, AMBIENT_OWNER_FILE);
    this._fs = o.fs ?? nodeFs;
    this._now = o.now ?? Date.now;
    this._log = o.log;
  }

  /** This window plays the music (as of its last claim or check). */
  get mine(): boolean {
    return this._mine;
  }

  /** Takes the music for this window. True when that changed whether it plays here. */
  claim(): boolean {
    const tmp = `${this._file}.${this.me}.tmp`;
    try {
      this._fs.mkdirSync(this._dir, { recursive: true });
      this._fs.writeFileSync(tmp, JSON.stringify({ ownerId: this.me, at: this._now() }));
      // Renamed over the old file: no reader ever sees half of it.
      this._fs.renameSync(tmp, this._file);
    } catch (err) {
      this._problem('claim', err);
      try {
        this._fs.unlinkSync(tmp);
      } catch {
        // never written, or already gone
      }
      // Could not say so: keep doing what this window did, rather than go quiet.
      return false;
    }
    this._lastProblem = '';
    const changed = !this._mine;
    this._mine = true;
    return changed;
  }

  /** Whether another window took the music since. True when that changed whether it plays here. */
  check(): boolean {
    if (!this._mine) return false;
    let text: string;
    try {
      text = this._fs.readFileSync(this._file, 'utf8') as string;
    } catch (err) {
      // Missing: nobody took it, it stays here. Unreadable: look again next time.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') this._problem('check', err);
      return false;
    }
    const owner = ambientOwnerOf(text);
    if (owner && owner !== this.me) {
      this._mine = false;
      return true;
    }
    return false;
  }

  /** This window stops playing (it closes); the file goes if it still names this window. */
  release(): void {
    if (!this._mine) return;
    this._mine = false;
    try {
      if (ambientOwnerOf(this._fs.readFileSync(this._file, 'utf8') as string) === this.me) {
        this._fs.unlinkSync(this._file);
      }
    } catch {
      // gone already, or held: the next window to claim overwrites it anyway
    }
  }

  private _problem(what: string, err: unknown): void {
    const line = `${what}: ${err instanceof Error ? err.message : String(err)}`;
    if (line === this._lastProblem) return;
    this._lastProblem = line;
    this._log?.(`Ambient owner file, ${line}`);
  }
}
