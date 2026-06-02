export interface AccountIdentity {
  signature: string;
  text: string;
}

export interface SnapshotResult {
  files: string[];
  capturedAt: number;
}

// A backend describes how one agent tool stores its login so the manager can
// snapshot it, switch between saved copies, and tell which one is live.
//
// Two flavours share this interface:
//  • File-based (Claude, Codex): credentials live in a few files under a home
//    dir. These provide homeDir/fileWhitelist/sentinelFile and the manager
//    drives the copy via credential-fs helpers. readIdentity reads from a dir.
//  • Custom: a backend whose credentials don't live in plain files can instead
//    override isAvailable/readLiveIdentity/snapshot/restore and own the
//    read/write itself; readIdentity then reads from a snapshot dir.
export interface AccountBackend {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;

  // Identity stored inside a snapshot directory (used to label saved profiles).
  readIdentity(credentialDir: string): Promise<AccountIdentity | undefined>;

  // ── file-based config (omit for custom backends) ──
  homeDir?(): string;
  readonly fileWhitelist?: ReadonlySet<string>;
  readonly sentinelFile?: string;

  // ── custom overrides (omit for file-based backends) ──
  // Is the tool logged in / usable right now?
  isAvailable?(): Promise<boolean>;
  // Identity of the account currently live on this machine.
  readLiveIdentity?(): Promise<AccountIdentity | undefined>;
  // Capture the current live account into destDir.
  snapshot?(destDir: string): Promise<SnapshotResult>;
  // Restore a previously captured snapshot dir into the live account.
  restore?(snapshotDir: string): Promise<string[]>;
}

const _registry = new Map<string, AccountBackend>();

export function registerBackend(backend: AccountBackend): void {
  _registry.set(backend.id, backend);
}

export function getBackend(id: string): AccountBackend | undefined {
  return _registry.get(id);
}

export function listBackends(): AccountBackend[] {
  return Array.from(_registry.values());
}
