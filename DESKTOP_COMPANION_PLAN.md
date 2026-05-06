# Desktop Companion — Tauri sidecar + IPC bridge

## Context

Hôm nay companion chỉ sống trong webview của VS Code panel (`animeCompanion.live2dView`). Roadmap [PLAN.md:142](./PLAN.md#L142) liệt kê "Desktop Companion" trong vision dài hạn. User muốn promote tính năng này lên thành feature thực sự: companion chạy như một cửa sổ desktop trong suốt, always-on-top, ngoài VS Code, giao tiếp với extension qua IPC; có toggle bật/tắt — tắt = giữ nguyên hành vi hiện tại.

**Quyết định đã chốt với user:**
- Khi desktop pet bật: **auto-hide panel VS Code** (tránh chạy 2 instance Live2D song song).
- **Lazy download** Tauri binary từ GitHub Releases (theo pattern model lazy-download hiện có).
- v1 cover **Windows-only** (Mac descope sang v1.1 do chưa có Apple Developer ID; Linux follow-up xa hơn).
- Code Tauri đặt trong **subdir `desktop-pet/`** cùng repo.

**Mục tiêu UX:** user enable setting → cửa sổ Live2D nổi trên desktop, drag được, click-through optional, cùng reactive engine (diagnostics, save, git, pomodoro…) như panel hiện tại. Disable → mọi thứ về như cũ.

---

## Insight cốt lõi định hình thiết kế

1. **`media/webview/core.js:6` là chokepoint duy nhất**: nó gọi `acquireVsCodeApi()` đúng 1 lần. Nếu thay bằng shim WebSocket, **toàn bộ runtime Live2D (`main.js`, `interaction.js`, `audio.js`, `expression.js`, `ui.js`) chạy không sửa** trong Tauri webview.
2. **`ModelFileServer` đã CORS `*`** ([model-server.ts:45-47](./src/model-server.ts#L45-L47)) → Tauri fetch model assets được ngay, chỉ cần extend thêm route `/audio/*` và endpoint `/ws`.
3. **Protocol postMessage hiện tại đã sạch & async-safe** (~14 ext→webview, ~12 webview→ext, đa số fire-and-forget; chỉ confirm/input dialog dùng `requestId`). Map 1-1 sang WebSocket frames là việc cơ học, không cần redesign.
4. **Toàn bộ logic VS Code-specific (config, git ops, diagnostics, dialogs) đã nằm extension-side**, webview chỉ là consumer/producer của events. Nên Tauri window không cần biết về VS Code API — bridge proxy là đủ.

---

## Kiến trúc đề xuất

```
┌─────────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node)                          │
│                                                          │
│  ┌─ ModelFileServer (extended) ─────────────────────┐   │
│  │  GET /<model>/<file>     (existing)              │   │
│  │  GET /audio/<lang>/<f>   (NEW)                   │   │
│  │  GET /desktop-pet/...    (NEW: HTML+JS for Tauri)│   │
│  │  WS  /ws?token=…         (NEW: bridge transport) │   │
│  └──────────────────────────────────────────────────┘   │
│                          ▲                               │
│  ┌─ DesktopPetBridge (NEW) ─────────────────────────┐   │
│  │  - spawn/kill Tauri sidecar process              │   │
│  │  - WS server, per-session token                  │   │
│  │  - mirrors postMessage protocol bidirectionally  │   │
│  │  - reuses ReactiveManager, PomodoroManager, etc  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  CompanionViewProvider — gated: skip register khi pet on│
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ WebSocket (localhost only)
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Tauri Sidecar Process (desktop-pet/)                   │
│                                                          │
│  Rust main:                                              │
│   - transparent + frameless + always-on-top window      │
│   - drag-region, click-through toggle                   │
│   - system tray (show/hide/quit/settings)               │
│   - graceful shutdown trên IPC `closeRequest`           │
│                                                          │
│  Webview content (loaded từ http://127.0.0.1:{port}):   │
│   - desktop-pet/index.html (variant của getHtmlForWebview)│
│   - core.js shim: detect ?transport=ws, dùng WS thay    │
│     cho acquireVsCodeApi()                              │
│   - main.js / interaction.js / audio.js / ui.js / ...   │
│     **chạy không đổi**                                  │
└─────────────────────────────────────────────────────────┘
```

**Vì sao WebSocket, không phải Tauri stdin/stdout?** WS có debug tooling sẵn (Chrome DevTools, `wscat`), test được mà không cần build Tauri (Phase B verifiable trong Chrome thường), và đã đi cùng hạ tầng `ModelFileServer` sẵn có. Token-protected, bind `127.0.0.1` only — security ngang stdin/stdout.

---

## Phase breakdown

### Phase A — Settings, transport abstraction, audio HTTP

**Mục tiêu:** chuẩn bị nền không liên quan Tauri. Phase này một mình đã có giá trị (audio qua HTTP cũng giúp custom ambient track tránh CSP edge cases).

1. Thêm settings vào [package.json](./package.json) (dưới `contributes.configuration.properties`):
   - `animeCompanion.desktopPet.enabled` — boolean, default `false`
   - `animeCompanion.desktopPet.alwaysOnTop` — boolean, default `true`
   - `animeCompanion.desktopPet.clickThrough` — boolean, default `false`
   - `animeCompanion.desktopPet.size` — `"small" | "medium" | "large"`, default `"medium"`
   - `animeCompanion.desktopPet.position` — object `{ x?, y?, anchor: "bottom-right" | ... }`, default anchor `"bottom-right"`
   - `animeCompanion.desktopPet.opacity` — number `0.5..1`, default `1`

2. Refactor [`ModelFileServer`](./src/model-server.ts):
   - Thêm route prefix `/audio/<lang>/<file>` → resolve về `extensionUri/media/audio/<lang>/<file>`
   - Thêm route prefix `/desktop-pet/<path>` → resolve về `extensionUri/desktop-pet/web/<path>` (bundle HTML+JS riêng cho Tauri target)
   - Thêm route prefix `/ambient/<id>` → resolve qua bảng dynamic do extension đăng ký (xem mục 4 dưới đây).
   - Giữ MIME map cho `.html`, `.js`, `.css`, `.wasm`

3. Trừu tượng hóa transport trong [companion-view.ts](./src/companion-view.ts):
   - Tạo interface `CompanionTransport { post(msg): void; onMessage(cb): Disposable }`.
   - `WebviewTransport` wrap `webview.postMessage` + `onDidReceiveMessage` (logic hiện tại).
   - Tách phần xây HTML thành `buildHtml(opts: { mode: 'webview' | 'desktop-pet', ... })` để dùng lại cho Tauri.
   - **Không** đổi protocol — chỉ wrap sender/receiver.

4. **Custom ambient tracks (arbitrary user paths):**
   - Hiện tại [companion-view.ts:466](./src/companion-view.ts#L466) resolve `customAmbientTracks[].path` qua `webview.asWebviewUri` → Tauri webview KHÔNG fetch được URL `vscode-resource://`.
   - Bridge mode cần map mỗi custom track thành route HTTP: thêm method `ModelFileServer.registerAmbientTrack(id, absolutePath)` lưu vào `Map<string, string>`. Route `/ambient/<id>` đọc path từ map này, vẫn enforce path-traversal protection (so canonical path khớp với path đã đăng ký).
   - Khi `_getCustomAmbientTracks()` chạy ở bridge mode, đăng ký từng track + sinh URL `http://127.0.0.1:{port}/ambient/{id}` thay cho `asWebviewUri`. Panel mode giữ flow cũ.

**Verify:** extension build pass, panel hoạt động y như trước, không có behavior change visible.

### Phase B — Bridge + WebSocket transport

1. Tạo [`src/desktop-pet-bridge.ts`](./src/desktop-pet-bridge.ts) (NEW):
   - Add dependency `ws` (~40 KB, zero native deps). Tránh hand-rolling RFC 6455 framing/masking/control frames — false economy, dễ bug subtle.
   - WS server attach lên `http.Server` của `ModelFileServer` qua `server.on('upgrade', …)` rồi delegate cho `ws.Server({ noServer: true })`.
   - Per-session token (random 32-byte hex) sinh khi enable, query `?token=…` bắt buộc khớp.
   - Class `WebSocketTransport implements CompanionTransport` để bridge dùng cùng interface với webview.
   - Bridge sở hữu `ReactiveManager` instance riêng (không reuse instance của panel để tránh double-fire).

2. Sửa [extension.ts](./src/extension.ts) khoảng line 155:
   - Đọc `desktopPet.enabled` lúc activate.
   - Nếu `true`: skip `registerWebviewViewProvider`, set context `animeCompanion.visible = false`, instantiate `DesktopPetBridge`.
   - Nếu `false`: flow hiện tại, `DesktopPetBridge` không khởi tạo.
   - Listen `onDidChangeConfiguration` cho key `desktopPet.enabled` → toggle runtime cần restart extension (dùng `showInformationMessage` với action "Reload Window").

3. Tạo `desktop-pet/web/` (assets phục vụ Tauri webview, bundle vào .vsix):
   - `index.html` — template tương tự `_getHtmlForWebview()` nhưng:
     - URLs absolute về `http://127.0.0.1:{port}/...` (model, audio, lib pixi/cubism được copy hoặc serve qua model-server).
     - Inject `window.__TRANSPORT__ = 'ws'`, `window.__WS_URL__`, `window.__WS_TOKEN__` thay cho dùng `acquireVsCodeApi()`.
     - Background transparent (CSS `body { background: transparent; }`).
   - `media/webview/core.js` — sửa thành dual-mode:
     ```js
     export const vscode = window.__TRANSPORT__ === 'ws'
       ? createWsBridge(window.__WS_URL__, window.__WS_TOKEN__)
       : acquireVsCodeApi();
     ```
     `createWsBridge` expose cùng API (`postMessage`, `onMessage` qua `window.addEventListener('message', …)`) — wrap WS frames thành CustomEvent `'message'` với `event.data = JSON.parse(...)` để `main.js` không cần biết transport.

4. **Test point trước khi đụng Tauri:** mở `http://127.0.0.1:{port}/desktop-pet/index.html?token={token}` trong Chrome thường. Companion phải render, click → poke, save file VS Code → bubble text. Đây là gate quality cho Phase C.

### Phase C — Tauri shell (Windows-only cho v1)

**Lock Tauri version:** dùng **Tauri 2.x** (API names + config schema khác 1.x đáng kể; ví dụ `set_click_through` đã rename thành `set_ignore_cursor_events`). `Cargo.toml` pin `tauri = "2"`.

> **Mac descope:** v1 chỉ build và ship Windows. Phần WKWebView spike + cross-platform build matrix dời sang **v1.1** (xem mục riêng cuối plan).

#### Phase C.1 — Skeleton

1. Tạo `desktop-pet/` skeleton:
   - `desktop-pet/Cargo.toml` (`tauri = "2"`), `desktop-pet/src/main.rs`
   - `desktop-pet/tauri.conf.json` (Tauri 2 schema) — single window, `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`, content URL = `http://127.0.0.1:{PORT_PLACEHOLDER}/desktop-pet/index.html?token=...`
   - Port + token được pass qua process env vars khi extension spawn binary (`ANIME_PET_PORT`, `ANIME_PET_TOKEN`).

2. Rust main: handlers tối thiểu cho v1
   - Window drag (Tauri có `drag_region` CSS class — chỉ định element trong index.html).
   - Tauri command `set_ignore_cursor_events(ignore: bool)` (Tauri 2 API; thay cho `set_click_through` của 1.x).
   - System tray: Show/Hide, Toggle Click-through, Open Settings (gửi WS message `runCommand: animeCompanion.openSettings` về extension), Quit.
   - Trên `WindowEvent::CloseRequested` → gửi WS `closeRequest`, đợi extension respond `closeAck` rồi exit (đảm bảo bridge biết để cleanup).

3. Bridge process management trong `desktop-pet-bridge.ts`:
   - Spawn binary từ `{globalStorage}/desktop-pet/<platform>/<binaryName>` (sau khi lazy-download).
   - Auto-restart on unexpected exit, max 3 lần trong 60s rồi báo `showErrorMessage` với "Disable desktop pet".
   - Kill binary trên `dispose()` (extension deactivate / window reload).

4. Lazy download flow (NEW class `DesktopPetDownloader`, mirror `ModelDownloader`):
   - URL pattern: `{baseUrl}/desktop-pet-v1/{platform}.zip` (v1: chỉ `win-x64`; sau này thêm `mac-x64`, `mac-arm64`).
   - Setting `animeCompanion.desktopPet.downloadBaseUrl` (default GitHub Releases URL).
   - On first enable: detect `process.platform` + arch → nếu khác `win32-x64` → showError "Desktop Pet hiện chỉ hỗ trợ Windows, Mac/Linux đang phát triển" → return về panel mode.
   - Nếu Windows: download → extract → spawn.
   - Cache dir: `{globalStorage}/desktop-pet/{platform}/`.
   - Verify: SHA-256 checksum bundled với extension (`media/desktop-pet-checksums.json`) để chống tampering.

### Phase D — Polish & release (Windows v1)

- Multi-monitor: persist position khi user drag, restore lúc spawn.
- Tray icon dùng `media/icon.png` (đã có).
- Handle VS Code reload/restart: bridge cleanup trên `deactivate()`, sidecar tự exit khi WS đóng > 30s không reconnect.
- Build pipeline: `scripts/build-desktop-pet.js` — wrapper gọi `cargo tauri build` cho target Windows, zip output, sinh checksums, push vào GitHub Release `desktop-pet-v1`.
- CI: thêm job trong [.github/workflows/release.yml](./.github/workflows/release.yml) build Tauri binary trên `windows-latest` khi tag match `desktop-pet-v*`. Single platform → đơn giản, không cần matrix.
- Code signing Windows: optional cho v1 (Windows không có hard gate như Mac, SmartScreen có thể warn nhưng user click "Run anyway" được). Nếu sau này build trust với marketplace user thì cân nhắc EV cert.

---

## Critical files to touch

| Loại | File | Vai trò |
|---|---|---|
| Modify | [package.json](./package.json) | + 6 settings `desktopPet.*`, + scripts cho Tauri build |
| Modify | [src/extension.ts:147-160](./src/extension.ts#L147-L160) | Gate webview registration, instantiate bridge |
| Modify | [src/model-server.ts](./src/model-server.ts) | + audio route, + desktop-pet static route, + WS upgrade |
| Modify | [src/companion-view.ts:472-570](./src/companion-view.ts#L472-L570) | Tách `buildHtml(mode)`, abstract transport |
| Modify | [media/webview/core.js:6](./media/webview/core.js#L6) | Dual-mode shim cho `acquireVsCodeApi` |
| New | `src/desktop-pet-bridge.ts` | WS server + sidecar process management + reactive wiring |
| New | `src/desktop-pet-downloader.ts` | Lazy download binary, mirror `ModelDownloader` |
| New | `desktop-pet/web/index.html` | HTML template cho Tauri webview |
| New | `desktop-pet/Cargo.toml`, `desktop-pet/src/main.rs`, `desktop-pet/tauri.conf.json` | Tauri shell |
| New | `scripts/build-desktop-pet.js` | Tauri build orchestration |
| New | `.github/workflows/release-desktop-pet.yml` (hoặc job mới trong release.yml) | CI build matrix |

---

## Reuse opportunities (đã verify trong Phase 1)

- **`ModelFileServer`** ([model-server.ts:22](./src/model-server.ts#L22)) — extend bằng `addRoute()` thay vì viết server mới.
- **`ReactiveManager`** ([src/reactive.ts](./src/reactive.ts)) — bridge instantiate instance riêng, callback đẩy thẳng qua WS.
- **`PomodoroManager`** ([extension.ts:183](./src/extension.ts#L183)) — singleton ở extension level, có thể broadcast cho cả panel transport lẫn bridge transport (nếu sau này muốn coexist).
- **`ModelDownloader`** ([src/model-downloader.ts](./src/model-downloader.ts)) — pattern lazy-download + zip extract + cache root → copy 1-1 sang `DesktopPetDownloader`.
- **`getMessageBank()`** ([companion-view.ts:497](./src/companion-view.ts#L497)) — webview strings inject y nguyên cho Tauri target.
- **Toàn bộ `media/webview/*.js`** — chạy không sửa ngoài `core.js`.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Tauri build setup trên CI | v1 chỉ Windows → single CI job đơn giản. Trước đó build local Windows + upload tay lên Releases cho alpha. |
| Mac/Linux user enable nhưng không có binary | `DesktopPetDownloader` detect platform sớm, showError friendly + nút "Disable desktop pet" → fallback panel mode. |
| Windows SmartScreen warn binary chưa signed | Document trong README: lần đầu chạy chọn "More info" → "Run anyway". EV cert là follow-up nếu cần. |
| WS port collision / firewall prompt | Dùng port của `ModelFileServer` đã chạy (`listen(0)` random) — không thêm prompt mới |
| Binary lazy download fail offline | Fallback rõ ràng: showError + nút "Disable desktop pet" trả về panel mode |
| 2 instance Live2D tốn GPU nếu user disable auto-hide | Auto-hide là default (đã chốt với user); document trade-off nếu user override |
| Reactive double-fire (panel + pet cùng listen) | Bridge mode skip panel registration hoàn toàn → 1 ReactiveManager duy nhất |
| Audio CSP cho Tauri | Phase A đã chuyển audio sang HTTP route — Tauri webview fetch như assets thường |
| Tauri webview Live2D performance | Live2D Cubism + PIXI đã chạy trong Chromium webview của VS Code → Tauri (cùng WebView2/WKWebView base) khả năng cao OK; verify bằng smoke test Phase B |

---

## Verification plan

**Phase A:**
- `npm run compile` pass.
- Extension load, panel hoạt động y hệt trước (manual smoke: click, save file → bubble text, set ambient).
- `curl http://127.0.0.1:{port}/audio/ja/poke.mp3` trả MP3 200.

**Phase B (no Tauri):**
- Mở `http://127.0.0.1:{port}/desktop-pet/index.html?token={token}` trong Chrome desktop.
- Live2D render, click → poke audio + motion.
- Save file trong VS Code → bubble text xuất hiện trong Chrome window.
- Right-click menu → `git.pull` → bridge nhận message → VS Code chạy command → feedback bubble về.
- Open DevTools, kiểm WS frame trong Network tab.

**Phase C:**
- Build Tauri binary local (`cd desktop-pet && cargo tauri build`).
- Manual: enable setting `desktopPet.enabled` → first run download → cửa sổ trong suốt nổi trên desktop → drag được → tray icon → quit từ tray → bridge cleanup.
- Restart VS Code → sidecar respawn auto.
- Disable setting → reload window → sidecar exit, panel quay lại.

**Phase D:**
- CI green trên `windows-latest` cho tag `desktop-pet-v0.1.0`.
- E2E user fresh install Windows → enable setting → SmartScreen warn → "Run anyway" → cửa sổ floating xuất hiện đúng.

---

## Quyết định đã chốt

- ✅ **Q1 (Mac signing):** chưa có Apple Developer ID → **descope Mac sang v1.1**, v1.0 ship Windows-only.

## Trạng thái thực thi

- ✅ **Phase A** — settings, route prefixes, transport abstraction. Verified với `npm test` + `node scripts/verify-routes.js` (10/10 pass).
- ✅ **Phase B** — WebSocket bridge, `DesktopPetBridge`, dual-mode `core.js`, `desktop-pet/web/index.html`. Verifiable trong Chrome qua bootstrap URL.
- ✅ **Phase C** — Tauri 2.1 Rust shell built and verified.
  - Binary: `desktop-pet/target/release/anime-companion-pet.exe` (~3.16 MB).
  - `npm run build:desktop-pet` auto-generates `icons/icon.ico` từ `media/icon.png` (RGBA-encoded PNG-in-ICO container) trước khi gọi cargo.
  - **Cargo pinning:** `tauri = "2.1"` features `["tray-icon", "image-png"]`, `tauri-build = "2.1"`, `url = "2"`.
  - Setting `animeCompanion.desktopPet.devBinaryPath` cho dev override; bridge auto-detect `desktop-pet/target/release/*.exe`.
  - Non-Windows user: bridge vẫn chạy (Chrome bootstrap URL), warning popup khi enable.
- 🔜 **Phase D** — CI build matrix (windows-latest), publish `desktop-pet-v1` GitHub Release với SHA-256 checksums, `DesktopPetDownloader` lazy fetch.

---

## Out of scope cho v1 (sẽ làm ở v1.1+)

- **Mac support (v1.1):**
  - Phase C.0 spike WKWebView (PIXI/Live2D + audio autoplay policy + WebGL extensions) — verify trên Mac trước khi đầu tư build matrix.
  - Apple Developer ID ($99/năm) + notarize binary trong CI.
  - Mở rộng `DesktopPetDownloader` để detect `mac-x64` / `mac-arm64`.
  - Mở rộng CI matrix thêm `macos-latest`.
- **Linux support (v1.2+):** AppImage hoặc deb, sau khi Mac ổn.
- Click-through advanced (per-pixel transparency hit-testing): v1 dùng Tauri built-in toggle full window.
- Multi-monitor smart positioning: v1 chỉ persist tọa độ cuối; nếu monitor disconnect, fallback bottom-right primary.
- Voice TTS streaming sang Tauri: dùng nguyên flow audio HTML5 hiện tại (HTTP MP3).
- Tauri auto-update: dùng VS Code reload + `DesktopPetDownloader` re-fetch nếu version trong `package.json` bump.
