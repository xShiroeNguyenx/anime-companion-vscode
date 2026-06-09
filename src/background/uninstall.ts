// vscode:uninstall hook. VS Code runs this as `node ./out/background/uninstall`
// when the extension is uninstalled. There is NO `vscode` API here — this is a
// plain Node process. It reads the sidecar written by the patch manager (which
// records the workbench file path) and strips our injected block so the user's
// VS Code is left clean.
//
// Best-effort: any failure is swallowed. The hook does not fire on a hard kill,
// so this is the primary — but not the only — cleanup path (the in-app
// "Disable & Restore" is the other).

import * as fs from 'fs';
import * as path from 'path';
import { SIDECAR_NAME, stripPatch, PatchTargetSidecar } from './patch-constants';

function run(): void {
  try {
    const sidecarPath = path.join(__dirname, SIDECAR_NAME);
    if (!fs.existsSync(sidecarPath)) return;

    let sidecar: PatchTargetSidecar;
    try {
      sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    } catch {
      return;
    }

    const workbenchPath = sidecar?.workbenchPath;
    if (!workbenchPath || !fs.existsSync(workbenchPath)) return;

    const content = fs.readFileSync(workbenchPath, 'utf8');
    const cleaned = stripPatch(content).replace(/\s+$/, '\n');
    if (cleaned !== content) {
      const tmp = `${workbenchPath}.anime-bg-uninstall.tmp`;
      fs.writeFileSync(tmp, cleaned, 'utf8');
      fs.renameSync(tmp, workbenchPath);
    }

    try { fs.rmSync(sidecarPath, { force: true }); } catch { /* ignore */ }
  } catch {
    // Swallow — uninstall cleanup is best-effort.
  }
}

run();
