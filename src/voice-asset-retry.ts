// When to try downloading a voice asset zip again after it failed. Pure; used
// by voice-asset-downloader.ts and scripts/voice-asset-retry-test.js.
//
// Every panel load used to ask for the zip again, and each VS Code window does
// its own panel loads. A language whose zip is not on the release (HTTP 404)
// cost a request, a progress notification and, while the panel waited for it,
// a few seconds of empty panel, every time, in every window.

/** The server said the file is not there: ask again after this long. Shared by every window (a marker file). */
export const MISSING_RETRY_MS = 24 * 60 * 60 * 1000;
/** Offline, timed out, or a server error: ask again after this long. Per window. */
export const FAILED_RETRY_MS = 10 * 60 * 1000;

/** Statuses that mean "this file does not exist", as opposed to "try later". */
export function isMissingStatus(status: unknown): boolean {
  return status === 404 || status === 410;
}

/** Whether `at` (ms) is less than `limit` ago. A time in the future (clock changed) does not count. */
function within(now: number, at: number | undefined, limit: number): boolean {
  if (at === undefined || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < limit;
}

/** Whether to try the download now, given when it was last found missing or last failed. */
export function shouldTryDownload(s: { missingAt?: number; failedAt?: number; now: number }): boolean {
  if (within(s.now, s.missingAt, MISSING_RETRY_MS)) return false;
  if (within(s.now, s.failedAt, FAILED_RETRY_MS)) return false;
  return true;
}

/** Reads the time a marker file holds; undefined for anything that is not a plain number of ms. */
export function parseMarker(text: string | undefined): number | undefined {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!/^\d{1,16}$/.test(trimmed)) return undefined;
  return Number(trimmed);
}
