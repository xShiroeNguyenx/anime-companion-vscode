export interface AccountIdentity {
  signature: string;
  text: string;
}

export interface AccountBackend {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;
  homeDir(): string;
  readonly fileWhitelist: ReadonlySet<string>;
  readonly sentinelFile: string;
  readIdentity(credentialDir: string): Promise<AccountIdentity | undefined>;
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
