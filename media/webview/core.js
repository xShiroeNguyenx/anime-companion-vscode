// ───────────────────────────────────────────────────────────────────────────
// Shared state, vscode bridge, and tiny utilities used across webview modules.
// ───────────────────────────────────────────────────────────────────────────

// acquireVsCodeApi() may only be called once per webview — single owner here.
export const vscode = acquireVsCodeApi();

// Mutable module-level singleton. All other modules read/write fields on it.
export const state = {
  app: null,           // PIXI.Application
  model: null,         // Live2DModel instance
  isLive2DReady: false,
  currentMood: 'idle',
};

export function debugLog(msg) {
  console.log('[AnimeCompanion] ' + msg);
}
