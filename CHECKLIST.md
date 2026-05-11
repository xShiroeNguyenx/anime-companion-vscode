# ✅ Nhiệm Vụ & Kiểm Tra (Checklist)

Bảng theo dõi tiến độ phát triển của Anime Companion. Chi tiết roadmap ở [PLAN.md](./PLAN.md).

**Phiên bản hiện tại:** v0.1.50 — *cập nhật 2026-05-11*

## 🚀 Public release readiness (v0.1.50)

### Tài liệu & public-facing
- [x] README phản ánh version hiện tại `v0.1.50`.
- [x] README có section riêng cho `Cursor Chibi`.
- [x] README có section riêng cho `Desktop Companion (Windows v1)`.
- [x] README đã liệt kê command mới cho cursor chibi capture / reset / tune.
- [x] README đã liệt kê settings mới cho `cursorChase.*` và `voiceAssets.*`.
- [x] Cấu hình public đã dùng namespace `animeCompanion.desktopCompanion.*`.
- [x] CHANGELOG có entry cho `0.1.50`.
- [ ] Bổ sung GIF/screenshots cho Marketplace mô tả Desktop Companion ngoài VS Code.
- [ ] Bổ sung GIF/screenshots cho Cursor Chibi trong editor.
- [x] Viết release notes public ngắn gọn cho `v0.1.50` trong `PUBLIC_RELEASE_GUIDE.md`.

### Packaging & publish
- [x] `package.json` đang ở `0.1.50`.
- [x] Repo đã có workflow `.github/workflows/release.yml` để package `.vsix` và publish khi tag `v*.*.*`.
- [x] Repo đã có script `npm run build:desktop-pet` cho sidecar Windows.
- [x] Repo đã có workflow tag-based `.github/workflows/desktop-companion-tag-release.yml` cho sidecar releases pattern `desktop-pet-release-v*.*.*`.
- [x] Repo đã có workflow tag-based `.github/workflows/desktop-companion-runtime-update.yml` để refresh runtime asset `desktop-pet-v1` qua tag `desktop-pet-runtime-v*.*.*`.
- [x] Repo đã có workflow `.github/workflows/voice-assets-release.yml` cho voice asset zips.
- [ ] Tạo / cập nhật GitHub Release asset cho desktop companion (`desktop-pet-v1`) trước khi public rộng rãi.
- [ ] Tạo / cập nhật GitHub Release asset cho voice assets (`audio-v1`) nếu release này đụng pipeline audio.
- [ ] Verify URL trong `animeCompanion.modelDownloadBaseUrl` trỏ đúng asset release thực tế.
- [ ] Verify URL trong `animeCompanion.desktopCompanion.downloadBaseUrl` trỏ đúng asset release thực tế.
- [ ] Verify URL trong `animeCompanion.voiceAssets.downloadBaseUrl` trỏ đúng asset release thực tế.
- [ ] Smoke test clean install trên Windows máy mới: bật `desktopCompanion.enabled` -> reload -> binary download -> floating window xuất hiện.
- [x] Local verify release basics: `npm run compile`, `npm test`, `npm run package`.

### Known limitations cần nói rõ khi public
- [x] Desktop Companion v1 là **Windows-only**.
- [x] Toggle `desktopCompanion.enabled` cần **Reload Window** để áp dụng.
- [x] Khi Desktop Companion bật, panel trong VS Code sẽ auto-hide.
- [x] Capture Chibi hiện chỉ hoạt động ở **panel mode**.
- [x] Nếu chưa ký code signing, Windows SmartScreen có thể hiện warning ở lần chạy đầu.

---

## ✅ Đã hoàn thành (Done)

### Foundation
- [x] Khởi tạo Project Webview VS Code.
- [x] Tích hợp `pixi-live2d-display` và render thành công Live2D Model.
- [x] Sửa lỗi CORS bằng Express Local Server (`ModelFileServer`).
- [x] Nạp thành công 7 Model: Hiyori, Cheshire, Ice Girl, Tsubaki, White Angel, Vivian, Changli.
- [x] Setting cho phép thay đổi Model + Voice Language qua VS Code Configuration.
- [x] `tsconfig.json` đã bật `"strict": true`.

### Tương tác & UI
- [x] Bắt tương tác: Single Click (Poke), Double/Triple Click, Spam Click, Long Press (Headpat).
- [x] Animation Ticker thay đổi biểu cảm mượt (Surprised, Happy, Angry, Shy, Love).
- [x] UI Chat Bubble Glassmorphism + viền gradient.
- [x] Custom Context Menu 10 mục (Run, Commit, Pull, Push, **Model**, **Voice**, **Mute**, Poke, Pomodoro, **Settings**).
- [x] Help bubble + audio khi mở context menu (chuột phải).
- [x] Inline Model picker panel trên character (chọn 1 trong 7 model không cần quick pick).
- [x] Inline Voice picker panel trên character (`ja`/`vi`/`en`).
- [x] Mute toggle trực tiếp từ context menu (label tự đổi theo state).
- [x] Hệ thống Sparkle particles.
- [x] Status bar: tên model + click toggle panel; tự đổi sang `🍅 MM:SS` / `☕ MM:SS` khi Pomodoro chạy ([extension.ts:43-95](src/extension.ts#L43-L95)).
- [x] Version-change toast khi upgrade/lần đầu activate ([extension.ts:121-128](src/extension.ts#L121-L128)).
- [x] Cursor chibi bám theo editor cursor, có toggle command + config `cursorChase.enabled`.
- [x] Tune Cursor Chibi Position: quick pick chỉnh `x/y` và size live, persist qua settings global.
- [x] Capture Chibi from Model + reset captured sprite theo từng model.

### Audio & TTS
- [x] Auto Lip-sync qua `model.speak()` với fallback HTML5 Audio.
- [x] Sinh giọng đa ngôn ngữ (Google TTS + VoiceVox qua proxy `api.tts.quest`).
- [x] 3 ngôn ngữ giọng: `ja` / `vi` / `en`.
- [x] Migrate legacy `voiceLanguage = "ja-vi"` → `"en"` ở activate ([extension.ts:108-112](src/extension.ts#L108-L112)).
- [x] Lazy-download extended voice assets cho `en` / `vi` từ GitHub Releases, có fallback audio bundled.

### Reactive Engine (toàn bộ wired ở [src/reactive.ts](src/reactive.ts))
- [x] `onDidChangeDiagnostics` — phản ứng theo errors/warnings.
- [x] `onDidSaveTextDocument` — phản ứng theo save (kèm spam-save detection).
- [x] `onDidChangeTextDocument` — track tốc độ gõ + Easter eggs.
- [x] `tasks.onDidEndTaskProcess` — phản ứng build success/fail.
- [x] `debug.onDidStartDebugSession` + `onDidTerminateDebugSession`.
- [x] Git API integration — branch switch, commit detection, merge conflict, many-changes nudge.
- [x] Achievements primitive (`save50`, `save100`, `error_fix_10/50`, `coding_1h/3h`, `commit10`).
- [x] Mood system 4 trạng thái (idle/happy/angry/sleepy).
- [x] Time-based greetings (morning/afternoon/evening/night).
- [x] Easter eggs `TODO`/`FIXME`/`console.log`.
- [x] Break reminder timer.
- [x] Settings tắt từng kênh reactive: `reactive.diagnostics` / `reactive.save` / `reactive.typing` / `reactive.git`.
- [x] `animeCompanion.quietHours` — array các khung giờ tắt mọi message.

### Pomodoro & Misc
- [x] Pomodoro Manager (work/break cycles, customizable interval).
- [x] `startDebuggingFromContext` — restart vs start logic + đọc workspace launch config.
- [x] Output channel "Anime Companion" cho diagnostics.
- [x] `build-install.sh` — bump version + package + auto install.

### Refactor
- [x] Tách `media/webview.js` mono-file thành 6 module ([core.js](media/webview/core.js) · [interaction.js](media/webview/interaction.js) · [audio.js](media/webview/audio.js) · [expression.js](media/webview/expression.js) · [ui.js](media/webview/ui.js) · [main.js](media/webview/main.js)).
- [x] Tách `AnimeCompanionViewProvider` ra [src/companion-view.ts](src/companion-view.ts) — `extension.ts` còn ~280 dòng.

### Tài liệu
- [x] FEATURES.md, DECISIONS.md, PLAN.md, CHECKLIST.md.

---

## 🚧 Sprint hiện tại (PLAN §2)

### Polish & cleanup còn nợ
- [ ] Verify autoplay activation cho right-click (Chromium policy) — preload Audio + `play()` ngay trong `mousedown`.
- [ ] Xoá folder legacy [media/audio/ja-vi/](media/audio/ja-vi/) khỏi disk (runtime đã migrate, asset vẫn còn ship).
- [ ] Sửa comment Vietnamese garbled còn sót (vd `KhÃ´ng cháº¡y...`).
- [ ] Bổ sung MIME `audio/mpeg` trong `MIME_TYPES` map của `ModelFileServer`.
- [ ] Verify/xoá launch config "📦 Đóng gói Extension (.vsix)" / "🚀 Antigravity" trong `.vscode/launch.json`.

### Smoke test & lint
- [x] Smoke test activation + command registration (`npm test` / `scripts/smoke-test.js`).
- [ ] `eslint` config thực tế + bật `npm run lint` enforce.

---

## 📦 Backlog ngắn hạn (PLAN §3, 2–4 tuần)

### UX customization
- [x] Custom user phrases qua settings (`customPhrases.idle/save/error`).
- [x] Per-language reactive messages (tách `media/messages/{lang}.json`).
- [x] Custom keyword reactions (mở rộng từ Easter egg `TODO`/`FIXME`/`console.log`).

### Reveal hidden value
- [ ] Achievements panel webview.
- [x] Coding stats dashboard (`Anime Companion: Show Stats`).
- [x] Per-workspace model preference (workspaceState thay vì global).
- [x] Live2D motion picker submenu.

### Pomodoro nâng cao
- [x] Visual ring/countdown overlay trên character (status bar đã có).
- [x] Custom interval per workspace.
- [x] Sound cue khác nhau cho start work / start break.

---

## 🎯 Backlog trung hạn (PLAN §4, 1–3 tháng)

### Marketplace prep
- [ ] Shrink bundle size từ ~130 MB (lazy-load model / extension pack / downscale Ice Girl 8192→4096 / `.vscodeignore` legacy assets).
- [ ] License audit: Cubism Core SDK + từng Live2D model + VoiceVox audio.
- [ ] README marketplace + GIF demo + screenshots.
- [ ] Marketplace icon 128×128 + banner color + gallery banner.
- [ ] `categories` + `keywords` SEO (hiện chỉ có `Other`).
- [x] CHANGELOG.md.
- [ ] CI: GitHub Actions lint + typecheck + `vsce package` mỗi PR.
- [x] Auto-publish khi tag `vX.Y.Z`.
- [ ] Chuyển build từ `tsc` sang `esbuild`.

### Features
- [ ] Real-time TTS: auto-detect VoiceVox local + fallback `api.tts.quest` + bundled MP3.
- [ ] Phrase template system (`{filename}`, `{branch}`, `{error_count}`).
- [ ] Lofi Music Player + ambient sounds.

---

## 🌌 Vision dài hạn (PLAN §5)

- [x] Desktop Companion (Tauri sidecar) cho Windows v1.
- [ ] Mac support cho Desktop Companion.
- [ ] Linux support cho Desktop Companion.
- [ ] AI/LLM chat BYOK.
- [ ] Multi-character interaction.
- [ ] Live2D motion editor.

---

## 🧹 Technical debt (PLAN §7)

- [ ] 🔴 Bundle size ~130 MB.
- [ ] 🟡 Thiếu test sâu hơn ngoài smoke test activation + commands.
- [ ] 🟡 ESLint config không enforce.
- [ ] 🟡 [src/reactive.ts](src/reactive.ts) 522 dòng — quá nhiều concern, cần tách khi mở `customPhrases` / `messages/{lang}.json`.
- [ ] 🟢 Dọn folder `media/audio/ja-vi/` (runtime đã migrate).
- [ ] 🟢 Sửa comment Vietnamese garbled trong codebase.
- [ ] 🟢 Bổ sung MIME `audio/mpeg` trong `ModelFileServer`.
- [ ] 🟢 Verify/xoá launch config Antigravity nếu không dùng.

**Đã trả nợ kể từ v0.1.7:**
- [x] ~~`media/webview.js` mono-file 700+ dòng~~ → tách thành 6 module trong [media/webview/](media/webview/).
- [x] ~~`extension.ts` ~650 dòng~~ → còn ~280 dòng, view provider đã ra [src/companion-view.ts](src/companion-view.ts).
- [x] ~~`tsconfig.json` strict mode?~~ → đã bật `"strict": true`.
- [x] ~~Reload-after-install friction~~ → có version-change toast ở activate.
