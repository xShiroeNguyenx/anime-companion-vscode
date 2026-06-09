import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../log';

const fsp = fs.promises;

// Relative path of the desktop workbench bundle inside the VS Code install
// `out/` directory. (Web/code-server use a different file; v1 targets desktop
// VS Code only.)
const WORKBENCH_REL = path.join('vs', 'workbench', 'workbench.desktop.main.js');

export interface WriteProbe {
  writable: boolean;
  code?: string;
}

// Resolve the absolute path to workbench.desktop.main.js.
//
// Preferred: directory of the running main module (require.main.filename →
// .../out/...). Fallback: vscode.env.appRoot + 'out' (the reliable public API).
// Returns null if neither yields an existing file.
export function resolveWorkbenchFile(): string | null {
  const candidates: string[] = [];

  const mainFile = require.main?.filename;
  if (mainFile) {
    // require.main is typically .../out/<something>; the workbench bundle sits
    // under the same `out` root. Walk up to the `out` segment.
    const idx = mainFile.lastIndexOf(`${path.sep}out${path.sep}`);
    if (idx >= 0) {
      const outDir = mainFile.slice(0, idx + `${path.sep}out`.length);
      candidates.push(path.join(outDir, WORKBENCH_REL));
    }
  }

  try {
    if (vscode.env.appRoot) {
      candidates.push(path.join(vscode.env.appRoot, 'out', WORKBENCH_REL));
    }
  } catch {
    /* env may be unavailable in odd hosts */
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* keep trying */
    }
  }

  log(`Background: could not resolve workbench file. Tried: ${candidates.join(' | ')}`);
  return null;
}

// Probe whether we can write to the workbench file by creating and removing a
// sibling temp file in the same directory. Catches the EACCES/EPERM that a
// Program Files (system) install raises without admin rights.
export async function probeWritable(filePath: string): Promise<WriteProbe> {
  const probePath = path.join(path.dirname(filePath), '.anime-companion-bg-probe.tmp');
  try {
    await fsp.writeFile(probePath, 'probe', 'utf8');
    await fsp.rm(probePath, { force: true });
    return { writable: true };
  } catch (err: any) {
    const code = err?.code ? String(err.code) : 'UNKNOWN';
    log(`Background: write probe failed (${code}) for ${filePath}`);
    return { writable: false, code };
  }
}

// Heuristic: is this a protected (system) install that likely needs elevation?
// Used only to tailor the error message — Program Files on Windows.
export function isProtectedInstall(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.includes('\\program files') || lower.includes('/usr/') || lower.includes('/opt/');
}
