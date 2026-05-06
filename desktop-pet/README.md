# Anime Companion Pet — Tauri 2 sidecar

Floating desktop window that hosts the Live2D companion outside VS Code.
Spawned by the `DesktopPetBridge` in the extension when
`animeCompanion.desktopPet.enabled` is `true`.

## How it talks to the extension

```
┌───────────────────────────────┐         ┌─────────────────────────────┐
│ VS Code Extension Host (Node) │         │ Tauri Sidecar (this crate)  │
│                               │         │                             │
│  ModelFileServer (HTTP)       │ <───────│  WebView (loads HTTP page,  │
│   /desktop-pet/index.html     │         │  served by ModelFileServer) │
│   /media/*  /audio/*  /ws     │         │                             │
│                               │         │  Rust main:                 │
│  DesktopPetBridge:            │ <==WS==> │   - transparent / topmost   │
│   - WS server, per-session    │         │   - tray menu               │
│     token                     │         │   - drag-region             │
│   - spawns this binary with   │         │   - close → hide            │
│     ANIME_PET_PORT +          │         │                             │
│     ANIME_PET_TOKEN env       │         │                             │
└───────────────────────────────┘         └─────────────────────────────┘
```

The renderer (HTML at `web/index.html`) connects WS using the token, receives
an `init` payload with all `window.__*__` globals the existing webview
runtime expects, then loads `media/webview/main.js` unchanged.

## Build (one-time prereqs)

1. **Rust stable** — install via [rustup](https://rustup.rs).
2. **Microsoft C++ Build Tools** (Windows) — comes with Visual Studio
   "Desktop development with C++" workload, or standalone via
   [Build Tools for VS](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
3. **Tauri prerequisites** — see <https://v2.tauri.app/start/prerequisites/>.
   On Windows the C++ build tools above usually cover everything.

## Build (every change)

From the repo root:

```pwsh
npm run build:desktop-pet
```

That's a thin wrapper for:

```pwsh
cd desktop-pet
cargo build --release
```

Output: `desktop-pet/target/release/anime-companion-pet.exe`.

The extension auto-detects this path on activation. To use a binary
elsewhere, set `animeCompanion.desktopPet.devBinaryPath` in VS Code settings.

## Iterate quickly

`cargo build` (no `--release`) builds faster but produces a larger
unoptimised binary. The path then is
`desktop-pet/target/debug/anime-companion-pet.exe` — point
`devBinaryPath` at it to test.

## Run standalone (debug without VS Code)

The binary needs `ANIME_PET_PORT` + `ANIME_PET_TOKEN` env vars. Start the
extension once (it logs the bootstrap URL with token), then in another
shell:

```pwsh
$env:ANIME_PET_PORT = "12345"     # match the extension's port
$env:ANIME_PET_TOKEN = "abc..."   # match the extension's token
.\target\release\anime-companion-pet.exe
```

Or for the Phase B verification path: just open the bootstrap URL in
Chrome — no Tauri build required.

## Cross-platform notes

v1 ships Windows only. Mac and Linux are planned for v1.1+; see
[DESKTOP_COMPANION_PLAN.md](../DESKTOP_COMPANION_PLAN.md) for the
descope rationale.
