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
