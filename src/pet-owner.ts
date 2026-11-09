// Which VS Code window runs the desktop pet. Pure; used by pet-owner-lock.ts
// and scripts/pet-owner-test.js.
//
// Every window reads the same global setting, and each used to start its own
// pet: four windows, four pets stacked on one spot. One window owns the pet;
// the others follow, and one of them takes over when the owner goes away.

export const HEARTBEAT_MS = 5_000;
/** An owner that has not written for this long is gone (three missed heartbeats). */
export const STALE_MS = 15_000;
/** How often every window looks at the files: one small read. */
export const POLL_MS = 1_000;
/**
 * A poll that comes this late means this window was not running: the machine
 * slept, or the host froze. The owner was most likely asleep too.
 */
export const WAKE_GAP_MS = 3 * POLL_MS;
/** After such a gap, how long a quiet but living owner keeps the pet: time for its own first heartbeat. */
export const WAKE_GRACE_MS = HEARTBEAT_MS + 2 * POLL_MS;

export interface OwnerRecord {
  ownerId: string;
  pid: number;
  heartbeatAt: number;
}

/** "Bring the pet to this window": written by a follower, honoured by the owner. */
export interface TakeoverRequest {
  by: string;
  at: number;
}

export type OwnerAction = 'own' | 'release' | 'follow' | 'claim';

function isFresh(now: number, at: number): boolean {
  const age = now - at;
  // A time from the future (clock changed) is not fresh.
  return Number.isFinite(age) && age >= 0 && age < STALE_MS;
}

export function decide(s: {
  me: string;
  record?: OwnerRecord;
  /** Whether record.pid still runs; ignored when the record is mine. */
  ownerAlive: boolean;
  takeover?: TakeoverRequest;
  /**
   * This window just came back from a gap (sleep). Every window's heartbeat
   * looks old after a sleep, so a living owner is not timed out yet.
   */
  justWoke?: boolean;
  now: number;
}): OwnerAction {
  const t = s.takeover;
  const someoneElseAsked = !!t && t.by !== s.me && isFresh(s.now, t.at);
  if (s.record?.ownerId === s.me) return someoneElseAsked ? 'release' : 'own';
  // A heartbeat from the future is not stale: only time that has really passed
  // without a write counts against the owner.
  const timedOut = !!s.record && s.now - s.record.heartbeatAt >= STALE_MS && !s.justWoke;
  const free = !s.record || !s.ownerAlive || timedOut;
  if (!free) return 'follow';
  // A free spot goes to whoever asked for it, while the request is fresh.
  return someoneElseAsked ? 'follow' : 'claim';
}

/**
 * Whether the bridge should start the sidecar again after it exited.
 * Exit code 0 with no signal is the tray's Quit: the user wants her gone.
 */
export function shouldRestart(s: {
  disposed: boolean;
  wasOurs: boolean;
  code: number | null;
  signal: string | null;
}): boolean {
  if (s.disposed || !s.wasOurs) return false;
  return !(s.code === 0 && !s.signal);
}

/** Reads an owner file's text. Undefined when it is not a complete record. */
export function parseOwnerRecord(text: string): OwnerRecord | undefined {
  try {
    const v = JSON.parse(text) as Partial<OwnerRecord>;
    if (
      v &&
      typeof v.ownerId === 'string' &&
      v.ownerId &&
      Number.isInteger(v.pid) &&
      Number.isFinite(v.heartbeatAt)
    ) {
      return { ownerId: v.ownerId, pid: v.pid as number, heartbeatAt: v.heartbeatAt as number };
    }
  } catch {
    // fall through
  }
  return undefined;
}

/** Reads a takeover file's text. Undefined when it is not a complete request. */
export function parseTakeover(text: string): TakeoverRequest | undefined {
  try {
    const v = JSON.parse(text) as Partial<TakeoverRequest>;
    if (v && typeof v.by === 'string' && v.by && Number.isFinite(v.at)) {
      return { by: v.by, at: v.at as number };
    }
  } catch {
    // fall through
  }
  return undefined;
}
