import * as fs from 'fs';
import * as path from 'path';

const fsp = fs.promises;

export interface SnapshotResult {
  files: string[];
  capturedAt: number;
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

async function listWhitelistedFiles(dir: string, whitelist: ReadonlySet<string>): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (whitelist.has(e.name)) out.push(e.name);
  }
  return out;
}

export async function dirExists(dir: string): Promise<boolean> {
  try {
    const st = await fsp.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function snapshotDir(
  srcDir: string,
  destDir: string,
  whitelist: ReadonlySet<string>,
): Promise<SnapshotResult> {
  await ensureDir(destDir);
  const files = await listWhitelistedFiles(srcDir, whitelist);
  for (const name of files) {
    await fsp.copyFile(path.join(srcDir, name), path.join(destDir, name));
  }
  return { files, capturedAt: Date.now() };
}

// Per-file atomic restore via `.tmp` + rename. Cross-platform best-effort.
export async function restoreDir(
  srcDir: string,
  destDir: string,
  whitelist: ReadonlySet<string>,
): Promise<string[]> {
  await ensureDir(destDir);
  const snapshotFiles = await listWhitelistedFiles(srcDir, whitelist);
  if (snapshotFiles.length === 0) {
    throw new Error(`Snapshot directory is empty: ${srcDir}`);
  }
  const written: string[] = [];
  for (const name of snapshotFiles) {
    const finalPath = path.join(destDir, name);
    const tmpPath = `${finalPath}.tmp`;
    await fsp.copyFile(path.join(srcDir, name), tmpPath);
    await fsp.rename(tmpPath, finalPath);
    written.push(name);
  }
  return written;
}

export async function backupDir(
  srcDir: string,
  backupRoot: string,
  whitelist: ReadonlySet<string>,
  toolId: string,
): Promise<string | null> {
  const files = await listWhitelistedFiles(srcDir, whitelist);
  if (files.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupRoot, `.backup-${toolId}-${stamp}`);
  await ensureDir(dir);
  for (const name of files) {
    await fsp.copyFile(path.join(srcDir, name), path.join(dir, name));
  }
  return dir;
}

export async function pruneOldBackups(
  backupRoot: string,
  toolId: string,
  keep: number,
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(backupRoot, { withFileTypes: true });
  } catch {
    return;
  }
  const prefix = `.backup-${toolId}-`;
  const backups = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name)
    .sort();
  const toDrop = backups.slice(0, Math.max(0, backups.length - keep));
  for (const name of toDrop) {
    await fsp.rm(path.join(backupRoot, name), { recursive: true, force: true });
  }
}

export async function removeSnapshotDir(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function readJsonSafe<T = any>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

// Lift a subset of top-level keys out of a JSON file. Used to capture just the
// account-binding fields of a large shared config (e.g. ~/.claude.json) without
// snapshotting the whole thing. Returns only the keys that are actually present.
export async function readJsonSubset(
  filePath: string,
  keys: readonly string[],
): Promise<Record<string, unknown> | undefined> {
  const j = await readJsonSafe<Record<string, unknown>>(filePath);
  if (!j || typeof j !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(j, k)) out[k] = j[k];
  }
  return Object.keys(out).length ? out : undefined;
}

// Merge top-level keys into a JSON file, preserving every other key. Backs the
// original up to <backupDir>/<name>.backup.<ts> first (best-effort), then writes
// atomically via tmp+rename so a crash mid-write can't truncate the file. When
// the target doesn't exist yet it's created from the patch alone.
export async function mergeJsonFile(
  filePath: string,
  patch: Record<string, unknown>,
  backupDir?: string,
): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return;
  const current = (await readJsonSafe<Record<string, unknown>>(filePath)) ?? {};

  if (backupDir) {
    try {
      await ensureDir(backupDir);
      const stamp = Date.now();
      const name = `${path.basename(filePath)}.backup.${stamp}`;
      // Only back up a file that already exists; nothing to preserve otherwise.
      if (await fileExists(filePath)) {
        await fsp.copyFile(filePath, path.join(backupDir, name));
      }
    } catch {
      // A failed backup shouldn't block the swap — the atomic write below is
      // still safe on its own.
    }
  }

  const merged = { ...current, ...patch };
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(merged, null, 2), 'utf8');
  await fsp.rename(tmpPath, filePath);
}
