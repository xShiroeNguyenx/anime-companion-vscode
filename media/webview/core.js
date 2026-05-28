// ───────────────────────────────────────────────────────────────────────────
// Shared state, vscode bridge, and tiny utilities used across webview modules.
// ───────────────────────────────────────────────────────────────────────────

// Two execution targets:
//   1. VS Code webview panel — `acquireVsCodeApi()` is provided by the host.
//   2. Floating desktop pet (Tauri / Chrome) — bootstrap script in
//      desktop-pet/web/index.html sets `window.__VS_CODE_BRIDGE__` to a
//      WebSocket-backed object exposing `postMessage`, and re-dispatches
//      incoming WS messages as `window` 'message' events so existing
//      addEventListener('message', …) listeners keep working unchanged.
// `acquireVsCodeApi` may only be called once per webview, so the bridge
// short-circuit also ensures we never call it twice.
export const vscode =
  (typeof window !== 'undefined' && window.__VS_CODE_BRIDGE__)
    ? window.__VS_CODE_BRIDGE__
    : acquireVsCodeApi();

// Mutable module-level singleton. All other modules read/write fields on it.
export const state = {
  app: null,           // PIXI.Application
  model: null,         // Live2DModel instance
  isLive2DReady: false,
  currentMood: 'idle',
  quickChatOverlayVisible: false,
};

export function debugLog(msg) {
  console.log('[AnimeCompanion] ' + msg);
  try {
    vscode.postMessage({ command: 'runtimeDebug', source: 'webview', message: String(msg) });
  } catch {
    // Ignore logging failures; console remains the fallback.
  }
}
