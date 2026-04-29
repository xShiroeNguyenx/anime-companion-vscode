# 📅 Roadmap Phát Triển — Anime Companion

**Phiên bản hiện tại:** v0.1.20
**Cập nhật:** 2026-04-29

Tài liệu này theo dõi định hướng phát triển của extension. Các tính năng đã ship được liệt kê trong [FEATURES.md](./FEATURES.md), tiến độ chi tiết ở [CHECKLIST.md](./CHECKLIST.md).

---

## 1. 📍 Tình trạng hiện tại (v0.1.20)

**Đã ship và hoạt động ổn định:**
- 🎭 Live2D renderer với 7 model (Hiyori, Cheshire, Ice Girl, Tsubaki, White Angel, Vivian, Changli) qua local HTTP server bypass CSP.
- 💫 Hệ thống tương tác: single click, multi-click, long-press headpat, spam click; expression blending mượt qua PIXI ticker.
- 🔊 Hệ thống audio đa ngôn ngữ (`ja` / `vi` / `en`) + lipsync qua `model.speak()` + fallback HTML5 Audio. Legacy `ja-vi` đã được migrate runtime → `en` trong [extension.ts:108-112](src/extension.ts#L108-L112).
- 🍅 Pomodoro Manager (work/break cycles, customizable interval) — countdown hiển thị trên status bar khi chạy.
- 🤖 Reactive engine: phản ứng theo diagnostics (errors/warnings), save spam, typing speed, build success/fail, debug session, git branch switch / commit / merge conflict / many uncommitted changes; mood system 4 trạng thái (idle/happy/angry/sleepy); time-based greetings; Easter eggs cho `TODO`/`FIXME`/`console.log`.
- 🎚️ Reactive toggles per-channel: `reactive.diagnostics` / `reactive.save` / `reactive.typing` / `reactive.git` + `quietHours` (mute message theo khung giờ) ở [package.json:186-214](package.json#L186-L214).
- 🏆 Achievements primitive: `save50`, `save100`, `error_fix_10/50`, `coding_1h/3h`, `commit10`.
- 🖱️ Custom right-click context menu (10 mục): **Run** (debug.restart), **Commit** / **Pull** / **Push**, **Model** (mở inline picker panel trên character), **Voice** (inline picker `ja`/`vi`/`en`), **Mute** (toggle ngay, label đổi theo state), **Poke**, **Pomodoro**, **Settings** (mở Settings UI đã filter). Bubble + audio "help" khi mở menu. Logic ở [media/webview/interaction.js:151-267](media/webview/interaction.js#L151-L267).
- 📍 Status bar: hiển thị tên model + click toggle panel; tự đổi sang `🍅 MM:SS` / `☕ MM:SS` khi Pomodoro chạy ([extension.ts:43-95](src/extension.ts#L43-L95)).
- 🆕 Version-change toast: khi user upgrade/lần đầu chạy, extension tự bắn info message để xác nhận build mới đã active mà không cần reload thủ công ([extension.ts:121-128](src/extension.ts#L121-L128)).
- 🛠️ Build pipeline: `build-install.sh` bump version + package + auto install.
- 📊 Output channel "Anime Companion" cho diagnostics.

**Codebase đã được tách module:**
- [src/extension.ts](src/extension.ts) còn ~280 dòng (xuống từ ~650). `AnimeCompanionViewProvider` đã ra [src/companion-view.ts](src/companion-view.ts).
- `media/webview.js` mono-file đã được tách thành: [core.js](media/webview/core.js) · [interaction.js](media/webview/interaction.js) · [audio.js](media/webview/audio.js) · [expression.js](media/webview/expression.js) · [ui.js](media/webview/ui.js) · [main.js](media/webview/main.js).
- `tsconfig.json` đã bật `"strict": true`.

---

## 2. 🚧 Sprint hiện tại (1 tuần)

Mục tiêu: hoàn tất các polish nhỏ còn nợ và mở đường cho marketplace prep.

### 2.1 Polish & cleanup còn nợ
- [ ] Verify autoplay activation cho right-click → audio đôi khi không phát ở interaction đầu tiên (Chromium policy). Cân nhắc preload Audio và `play()` ngay trong `mousedown` thay vì `contextmenu`.
- [ ] Dọn legacy folder [media/audio/ja-vi/](media/audio/ja-vi/) khỏi disk (runtime đã migrate, nhưng asset vẫn còn ship — phình bundle vô ích).
- [ ] Sửa comment Vietnamese garbled còn sót (vd `KhÃ´ng cháº¡y...`) trong codebase.
- [ ] Bổ sung MIME `audio/mpeg` trong `MIME_TYPES` map của `ModelFileServer` cho `media/audio/*.mp3`.
- [ ] Verify/xoá launch config "📦 Đóng gói Extension (.vsix)" và "🚀 Antigravity" trong `.vscode/launch.json` nếu không còn dùng.

### 2.2 Smoke test & lint
- [ ] Smoke test activation + command registration (chạy được bằng `vscode-test` headless). Hiện tại extension chưa có test nào.
- [ ] `eslint` config thực tế + bật `npm run lint` hoạt động đầy đủ. Hiện script có nhưng không enforce gì.

---

## 3. 📅 Roadmap ngắn (2–4 tuần)

Tính năng mở rộng dựa trên hệ thống đã có, không cần infrastructure mới.

### 3.1 UX customization
- **Custom user phrases**: `animeCompanion.customPhrases.idle/save/error` cho user thêm câu của riêng mình (merge vào pool default).
- **Per-language reactive messages**: hiện toàn bộ message trong [reactive.ts](src/reactive.ts) là tiếng Việt. Tách ra `media/messages/{lang}.json` cho `ja` / `en` / `vi` và load theo `voiceLanguage`.
- **Custom keyword reactions**: setting cho user định nghĩa `keyword → message` riêng (mở rộng từ Easter egg `TODO`/`FIXME`/`console.log`).

### 3.2 Reveal hidden value
- **Achievements panel**: webview view nhỏ (sibling với main companion) hiển thị danh sách achievement đã/chưa unlock kèm tiến độ. Logic core đã wire ở [reactive.ts:117-123 & 502-520](src/reactive.ts#L117).
- **Coding stats dashboard**: command palette `Anime Companion: Show Stats` mở quick pick hoặc panel hiển thị: tổng saves, commits, hours coded today/week, errors fixed.
- **Per-workspace model preference**: lưu `selectedModel` ở `workspaceState` thay vì global → mỗi project có thể chọn waifu khác. Thêm fallback về global setting nếu workspace chưa chọn.
- **Live2D motion picker**: thêm submenu "Play Motion" trong right-click menu để user tự trigger motion (TapBody, TapHead, Idle…).

### 3.3 Pomodoro nâng cao
- Visual ring/countdown overlay trên character (ngoài status bar đã có).
- Custom interval per workspace.
- Sound cue khác nhau cho start work / start break.

---

## 4. 🎯 Roadmap trung hạn (1–3 tháng)

### 4.1 Chuẩn bị publish Marketplace

Đây là khối công việc lớn nhất, ưu tiên cao vì sẽ publish (sau này). Bundle hiện tại vẫn ~130 MB → block publish.

- [ ] **Shrink bundle size** (hiện ~130 MB):
  - Lazy-load Live2D model: chỉ ship model mặc định (Hiyori), các model khác download khi user chọn (qua HTTP từ release asset hoặc CDN).
  - Hoặc: tách thành **extension pack** — `anime-companion-core` + `anime-companion-models-azurlane` + …
  - Downscale textures: Ice Girl 8192px → 4096px.
  - Loại trừ asset không dùng (vd `media/audio/ja-vi/` legacy) khỏi `.vscodeignore`.
- [ ] **License audit cho assets**:
  - Cubism Core SDK: kiểm tra license redistribution.
  - Mỗi Live2D model: trace nguồn, license, attribution required.
  - Audio files VoiceVox: kiểm tra điều khoản phát hành lại.
- [ ] **Marketplace polish**:
  - README dạng marketplace: hero image, animated GIF demo, feature list with screenshots.
  - Icon 128×128 chuẩn marketplace.
  - Banner color + gallery banner.
  - `categories`, `keywords` tối ưu SEO (hiện chỉ có `Other`).
  - Changelog rõ ràng (CHANGELOG.md) — chưa có.
- [ ] **CI/CD**:
  - GitHub Actions: lint + typecheck + `vsce package` mỗi PR.
  - Auto-publish khi tag `vX.Y.Z`.
- [ ] **Build optimization**: chuyển từ `tsc` sang `esbuild` để bundle nhanh và nhỏ hơn.

### 4.2 Real-time TTS (chỉ làm nếu khả thi)

Mục cũ "VoiceVox runtime" giờ feasible hơn vì:
- Có thể auto-detect VoiceVox local (probe `localhost:50021/version` lúc activate).
- Fallback proxy `api.tts.quest` nếu user không cài local (đã verify hoạt động ở v0.1.6).
- Bundled MP3 vẫn là last resort.

Phrase template system: `{filename}`, `{branch}`, `{error_count}` — sinh audio runtime cho câu nói động kiểu "đã save xong file `extension.ts`!".

### 4.3 Lofi Music Player + ambient
- Webview audio player với playlist lofi/rain/cafe.
- Background của character thay đổi theo nhạc đang phát.
- Volume control + auto-pause khi pomodoro break.

---

## 5. 🌌 Vision dài hạn (chưa cam kết)

Các mục này có giá trị cao nhưng scope lớn / risk cao. Không đưa vào sprint, đánh dấu rõ là **tham vọng**.

- **Floating Desktop Pet**: companion chạy ngoài VS Code, dạng Tauri sidecar + IPC bridge với extension. Vision dài hạn, không POC sớm.
- **AI/LLM chat (BYOK)**: tích hợp Anthropic/OpenAI/Gemini, user dán API key, companion thành chat assistant. Tạm gác — giữ ở đây để không quên.
- **Multi-character interaction**: 2 model trên cùng panel tương tác lẫn nhau.
- **Live2D motion editor**: UI cho user tự gán motion vào event.

---

## 6. ❌ Đã loại / Re-scope

Để tài liệu này không phình ra, các mục dưới đây đã được loại khỏi roadmap kèm lý do.

- **Leaderboard so sánh giờ code giữa user**: cần backend public, vướng GDPR / privacy / spam. ROI thấp cho extension cá nhân hoá.
- **Asset Store mua skin bằng EXP**: cần backend, content moderation, payment. Quá nặng.
- **Hệ thống cấp độ RPG full**: scope-down → giữ achievements primitive đã có, không build XP/level mechanics.
- **Legacy voice option `ja-vi`**: đã migrate runtime sang `en` ở activate. Còn lại: gỡ folder asset `media/audio/ja-vi/` (xem §2.1) là xong.

---

## 7. 🧹 Technical debt

Trạng thái cập nhật theo thực tế codebase v0.1.20.

| Khoản nợ | Mức độ | Ghi chú |
|---|---|---|
| Bundle size ~130 MB | 🔴 Cao | Block marketplace publish. Xem §4.1. |
| Không có unit/integration test | 🟡 Trung | Cần ít nhất smoke test cho activation + command registration. Xem §2.2. |
| `eslint` config trống / không enforce | 🟡 Trung | `npm run lint` chưa hoạt động đầy đủ. Xem §2.2. |
| `reactive.ts` 522 dòng | 🟡 Trung | Đã chứa quá nhiều concern (diagnostics, save, typing, build, debug, git, achievements, mood, greetings, Easter eggs). Cân nhắc tách theo nhóm khi mở `customPhrases` / `messages/{lang}.json`. |
| `companion-view.ts` 447 dòng | 🟢 Thấp | OK ở mức hiện tại nhưng cần để mắt khi thêm motion picker / language submenu. |
| Legacy `media/audio/ja-vi/` còn trên disk | 🟢 Thấp | Runtime đã migrate, asset vẫn ship. Xem §2.1. |
| Comment Vietnamese garbled (`KhÃ´ng cháº¡y...`) | 🟢 Thấp | Encoding bug — dọn khi đụng tới file. |
| Audio MIME types thiếu | 🟢 Thấp | `media/audio/*.mp3` cần `audio/mpeg` trong `MIME_TYPES` map của `ModelFileServer`. |
| Dead launch config "📦 Đóng gói Extension (.vsix)" / "🚀 Antigravity" | 🟢 Thấp | Verify xem còn dùng không, xoá nếu không. |

**Đã trả nợ kể từ v0.1.7:**
- ~~`media/webview.js` mono-file 700+ dòng~~ → đã tách thành 6 module trong [media/webview/](media/webview/).
- ~~`extension.ts` ~650 dòng~~ → còn ~280 dòng, `AnimeCompanionViewProvider` đã ra [src/companion-view.ts](src/companion-view.ts).
- ~~`tsconfig.json` strict mode?~~ → đã bật `"strict": true`.
- ~~Reload-after-install friction~~ → có version-change toast ở activate.

---

*Quy ước: ✅ done · 🚧 đang làm · 📅 lên lịch · 🌌 vision · ❌ đã loại*
