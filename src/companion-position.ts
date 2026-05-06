import * as vscode from 'vscode';

// Persists where the user dragged the panel-mode companion to. Stored in
// globalState (per-user) so the same position survives across workspaces and
// reloads — the user's idea of "the companion lives in the bottom-right
// corner" shouldn't reset when they open a different project.
//
// Desktop pet mode does NOT use this: there the position is the OS-level
// window position, owned by Tauri.

const KEY = 'animeCompanion.panelPosition.v1';

export interface CompanionPosition {
  x: number;
  y: number;
}

let _ctx: vscode.ExtensionContext | null = null;

export function initCompanionPosition(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

export function getStoredPanelPosition(): CompanionPosition | undefined {
  if (!_ctx) return undefined;
  const raw = _ctx.globalState.get<unknown>(KEY);
  if (!raw || typeof raw !== 'object') return undefined;
  const x = (raw as any).x;
  const y = (raw as any).y;
  if (typeof x !== 'number' || typeof y !== 'number') return undefined;
  return { x, y };
}

export async function savePanelPosition(x: number, y: number): Promise<void> {
  if (!_ctx) return;
  await _ctx.globalState.update(KEY, { x, y });
}

export async function clearPanelPosition(): Promise<void> {
  if (!_ctx) return;
  await _ctx.globalState.update(KEY, undefined);
}
