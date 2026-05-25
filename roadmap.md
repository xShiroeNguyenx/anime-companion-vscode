# 🌸 Anime Companion VSCode — Roadmap

> **Phiên bản hiện tại:** v0.3.3 — *cập nhật 2026-05-25*
>
> Tài liệu này là single-source-of-truth cho **trạng thái feature**, việc **còn phải làm** và **hướng phát triển tương lai**. Chi tiết implementation ở [FEATURES.md](./FEATURES.md), lịch sử release ở [CHANGELOG.md](./CHANGELOG.md), kế hoạch chi tiết từng version ở [PLAN.md](./PLAN.md).

---

## 🗺️ Tổng quan theo version

```
v0.1.x  ──→  v0.1.27   Live2D + Reactive Engine + Pomodoro + Ambient + Desktop Companion v1 (Windows)
v0.3.0  ────────────   AI Chat Companion (4 providers: Copilot / Claude / GPT / Gemini)
v0.3.1  ────────────   +4 providers (Grok/DeepSeek/OpenRouter/Ollama) · Tri-lingual docs · Copy-reply · Live resize fix
v0.3.3  ────────────   Right-click menu reorganization (6 functional submenus)
v0.4.0  ────────────   Pet desktop quick chat                                            [NEXT]
v0.5.x  ────────────   Slash commands · Diff-aware chat · Privacy redaction · Stats heatmap [PLANNED]
v0.6.x  ────────────   Real-time TTS · OpenRouter model discovery · Conversation export   [PLANNED]
v1.x    ────────────   Mac/Linux Desktop Companion · Multi-character · Motion editor      [VISION]
```

---

## ✅ Đã ship (v0.3.3)

<details>
<summary>Expand — danh sách đầy đủ feature đã có</summary>

### 🎭 Live2D Companion
- [x] Render Live2D qua local HTTP server (bypass CSP)
- [x] **4 model Live2D Sample** (Free Material License): **Hiyori** (bundled), **Haru**, **Mao**, **Miara** (lazy-download)
- [x] Lazy-download model on-demand từ GitHub Releases (`models-v1`)
- [x] Hot-swap model không cần reload window
- [x] Custom model local qua `animeCompanion.customModelRoots` (auto-scan) + `customModels` (manual override)
- [x] Per-workspace model preference (workspaceState) + `Reset Workspace Model` command
- [x] **Live panel resize**: model refit realtime khi kéo panel cao/thấp/rộng (v0.3.1 fix)

### 🖱️ Tương tác & Biểu cảm
- [x] Single click (poke), Double/Triple click, Long-press headpat (≥0.8s → Shy → Love), Spam click (≥5 → Angry)
- [x] Expression blending mượt qua PIXI ticker (`ParamEyeLOpen`, `ParamMouthSmile`, `ParamCheek`…)
- [x] Sparkle particle FX
- [x] Mood system 4 trạng thái: `idle` · `happy` · `angry` · `sleepy`
- [x] Mood-driven idle expressions

### 🔊 Âm thanh & Lip-sync
- [x] Auto lip-sync qua `model.speak()` + fallback HTML5 Audio
- [x] 3 ngôn ngữ giọng: `ja` (VoiceVox), `vi`, `en` (ElevenLabs, lazy-download)
- [x] Mute toàn cục (`animeCompanion.muted` hoặc toggle command)
- [x] ElevenLabs voice pipeline: build-time generator + GitHub Actions release + runtime lazy-download
- [x] 4-line bundled fallback (offline/first-run)

### 💬 Chat UI & AI
- [x] **8 LLM providers**: GitHub Copilot · Anthropic Claude · OpenAI GPT · Google Gemini · xAI Grok · DeepSeek · OpenRouter (100+ models) · Ollama (local)
- [x] BYOK security: API keys lưu `vscode.ExtensionContext.secrets` (OS keychain)
- [x] Streaming token-by-token với sparkle caret ✨ + thinking dots animation
- [x] Multi-conversation history persist per-workspace
- [x] Context awareness: selection toggle (📌), active file toggle (📄), `#file` mention autocomplete
- [x] Right-click "Ask Companion About Selection" (editor context menu)
- [x] 4 persona preset: `cute` · `professional` · `tsundere` · `energetic`
- [x] Sentiment-driven Live2D reactions sau khi stream xong
- [x] Copy-reply button với checkmark pop animation
- [x] Custom `chat.systemPrompt` setting override toàn bộ preset
- [x] Token usage display (per-turn + Σ accumulated)

### ⚡ Reactive Engine
- [x] Diagnostics (errors/warnings) → bubble + expression
- [x] Save events + spam-save detection
- [x] Typing speed Easter eggs (`TODO` / `FIXME` / `console.log`)
- [x] Build success/fail + debug session events
- [x] Git polling: branch switch, commit, merge conflict, many uncommitted changes, stale repo
- [x] Time-based greetings (morning/afternoon/evening/night/2AM)
- [x] Break reminder timer
- [x] `quietHours` — suppress messages trong khung giờ chỉ định
- [x] Toggle từng kênh reactive độc lập
- [x] Custom phrases: `customPhrases.idle/save/error` + `customKeywords`
- [x] Per-language reactive messages: `media/messages/{vi,en,ja}.json`

### 🏆 Gamification
- [x] 7 achievements primitive: `save50/100`, `error_fix_10/50`, `coding_1h/3h`, `commit10`
- [x] Persistent stats store: saves / commits / errors fixed / coding time today + all-time
- [x] `Anime Companion: Show Stats` command (webview panel)
- [x] `Anime Companion: Show Achievements` command (webview panel)

### 🍅 Pomodoro
- [x] Work/break cycles, customizable interval per-workspace
- [x] Status bar countdown 🍅 MM:SS / ☕ MM:SS
- [x] SVG progress ring overlay trên character
- [x] Sound cue khác nhau cho work/break

### 🖥️ Desktop Companion (Windows v1)
- [x] Tauri sidecar + WebSocket bridge
- [x] Always-on-top, transparent window, click-through toggle
- [x] System tray: Show/Hide/Quit/Settings
- [x] Lazy-download binary từ GitHub Releases
- [x] Auto-hide VS Code panel khi Desktop mode bật

### 🎧 Ambient Audio
- [x] 3 preset built-in: `lofi` / `rain` / `cafe`
- [x] Setting `animeCompanion.ambientVolume`
- [x] Custom local tracks qua `animeCompanion.customAmbientTracks`

### 🖱️ Cursor Chibi
- [x] Sprite chibi floating tại editor cursor (`TextEditorDecoration`)
- [x] `Tune Cursor Chibi Position` — quick-pick chỉnh x/y/size realtime
- [x] `Capture Chibi from Model` — snapshot Live2D canvas → PNG riêng per-model
- [x] `Reset Captured Chibi` — fallback về icon bundled

### 🛠️ CI/CD & Toolchain
- [x] GitHub Actions CI (lint + compile + test + `vsce package` mỗi PR)
- [x] Auto-publish lên VS Code Marketplace + Open VSX khi tag `vX.Y.Z`
- [x] Voice assets release workflow (ElevenLabs → GitHub Release)
- [x] Tri-lingual README (EN/VI/JA) với language switcher

</details>

---

## 🚧 Chưa làm — v0.4.0 (Next release)

> Các item này đã được **thiết kế và defer rõ ràng** từ v0.3.1. Implementation plan có sẵn ở [docs/PLAN_v0.3.1.md §4](./docs/PLAN_v0.3.1.md).

### 4.1 Right-click Menu Reorganization — ✅ shipped in v0.3.3
- [x] Companion right-click menu nay nhóm vào 6 submenu functional area thay vì flat list, implement trong [media/webview/interaction.js](./media/webview/interaction.js) (data-driven `categories` array):
  - 💬 **AI Chat** ➤ (Open Chat · New Conversation · Ask About Selection · Configure Provider · Clear All)
  - 🌸 **Appearance** ➤ (Change Model · Capture Chibi · Toggle Cursor Chibi · Tune · Reset Position · Motion)
  - 🔊 **Voice & Sound** ➤ (Change Voice · Change Message Lang · Toggle Mute · Ambient)
  - 🍅 **Workflow** ➤ (Start/Stop Pomodoro · Show Stats · Show Achievements)
  - 🔧 **Git Shortcuts** ➤ (Commit · Pull · Push · Run)
  - 🖥️ **Desktop Companion** ➤ (Toggle Desktop/Panel Mode · Toggle Click-Through · Reset Workspace Model)
- [x] Top-level giữ lại `Poke` + `All Settings` làm quick action.
- [x] Fix bug `animeCompanion.toggleDesktopClickThrough` declared trong package.json nhưng never registered → command palette giờ chạy được.

### 4.2 Pet Desktop Quick Chat
- [ ] Right-click trên desktop pet → "💬 Chat with me" → input overlay
- [ ] Submit qua WebSocket bridge → response render trong speech bubble trên pet
- [ ] Auto-dismiss sau N giây, click-to-pin
- [ ] New WS events: `pet:chat:request`, `pet:chat:delta`, `pet:chat:response`
- [ ] Reuse `chatManager.sendUserMessage` với flag `transient:true` (không persist history)
- [ ] Cap `maxTokens: 200` (speech bubble không gian hạn chế)

---

## 📋 Chưa làm — Backlog ngắn hạn (v0.5.x)

### Chat productivity
- [ ] **Slash commands trong chat** — gõ `/` đầu textarea mở dropdown:
  - `/explain` — explain code đang select
  - `/refactor` — gợi ý refactor selection theo guideline
  - `/test` — sinh unit test cho selection
  - `/commit` — sinh commit message từ staged diff (`git diff --staged`)
  - `/clear` — xóa active conversation (alias của command palette)
  - `/help` — list các slash command
  - Implementation: hijack `#` autocomplete pattern hiện có ở [src/chat/context-builder.ts](./src/chat/context-builder.ts), thay token `#` bằng `/` + bộ template prompts
- [ ] **Diff-aware chat** — right-click ở Source Control panel → "Ask Companion About Diff":
  - Stage `git diff` của file/hunk đang chọn vào chip
  - Templates: explain diff, review diff, suggest commit message
  - Tận dụng `vscode.scm.SourceControl` API
- [ ] **Privacy redaction trước khi send** — quick toggle 🔒 cạnh Send button:
  - Khi bật: auto-mask `sk-…`, `AIza…`, `xai-…`, `ghp_…` key patterns + biến env (`.env` regex) trong context trước khi push lên cloud provider
  - Status bar warn nếu detect key pattern còn raw trong prompt
  - Áp dụng cho mọi BYOK provider; Ollama (local) skip vì không leak
- [ ] **Token budget warning** — banner cảnh báo khi context (selection + active file + mentions + history) vượt ngưỡng:
  - Ngưỡng default = 50% của `chat.maxTokens` setting
  - Show estimated input/output tokens trước khi click Send
  - Suggest trim active-file toggle hoặc giảm history depth

### UI/UX Polish
- [ ] **Screenshots marketplace** — chụp 12 ảnh theo [docs/images/README.md](./docs/images/README.md) manifest (hiện placeholder)
- [ ] **GIF demo** cho README marketplace (Desktop Companion floating + Chat streaming + Live resize)
- [ ] **Achievements webview đầy đủ** — logic core đã có, UI cần:
  - Group theo category: `Productivity` (save/commit), `Debugging` (error_fix), `Endurance` (coding_h)
  - Progress bar `current / target` cho achievement đang gần unlock nhất
  - Lock icon overlay cho achievement chưa đạt, sparkle FX khi unlock
- [ ] **Stats breakdown theo thời gian** — webview hiện chỉ all-time, thêm:
  - Tab toggle: Today / This Week / This Month / All-Time
  - Bar chart đơn giản (SVG inline, không cần lib) cho saves/commits/errors per day
  - "Best day" badge cho ngày nhiều save nhất trong tuần
- [ ] Review tiếng Nhật `docs/README.ja.md` (sections có marker `TRANSLATION-REVIEW-NEEDED`)

### Reactive Engine Nâng cao
- [ ] **Contextual recommendations** — proactive bubble dựa trên pattern:
  - ≥ 3 lỗi cùng loại trong 5 phút → suggest "Want me to look at this?"
  - Repo có > 20 uncommitted files trong > 1 giờ → suggest commit/stash
  - Pomodoro break đến hạn + đang ở giữa edit → defer suggestion 30s sau khi pause typing
- [ ] **Reactive event snooze** — quick command `Anime Companion: Snooze Reactions`:
  - Pick event type (`save` / `git` / `diagnostics` / `typing` / `all`)
  - Pick duration (`15m` / `30m` / `1h` / `until reload`)
  - Khác `quietHours` ở chỗ: per-event-type, on-demand, ngắn hạn
- [ ] **Companion focus widget** — khi Pomodoro work session đang chạy:
  - Tự suppress reactions không-focus (idle bubble, easter eggs, ambient git polling)
  - Chỉ kích hoạt save praise + error help (đúng việc đang code)
  - Auto-restore full reactivity ở break
- [ ] **Custom reactive presets import/export** — JSON file chứa bộ `customPhrases.*` + `customKeywords`:
  - Command `Export Companion Personality` → save `.companion-preset.json`
  - Command `Import Companion Personality` → load + merge
  - Mở đường cho community share preset qua gist
- [ ] **Per-workspace message personality** — `.vscode/anime-companion.json` override `personaPreset` + custom phrases riêng cho từng project

### Ambient Follow-up
- [ ] **Richer ambient library** — thêm preset: `jazz`, `forest`, `fireplace`, `white-noise` (mỗi preset ~5-10 MB, lazy-download cùng release `audio-v1`)
- [ ] **Pomodoro-aware ambient** — auto-fade volume hoặc switch preset giữa work (focus mix) và break (chill mix)

### Technical Debt
- [ ] Tắt `continue-on-error` cho `npm run lint` trong CI khi codebase đã sạch (hiện có 8 pre-existing lint errors, fix từng cái)
- [ ] Mở rộng test coverage cho commands mới (stats / achievements / motion / ambient / chat slash)
- [ ] Cập nhật GitHub Actions runtime tránh Node.js 20 deprecation warning
- [ ] Bổ sung MIME `audio/mpeg` trong `ModelFileServer` cho `media/audio/*.mp3`
- [ ] Dọn comment/text tiếng Việt bị lỗi encoding còn sót
- [ ] Tách [src/reactive.ts](./src/reactive.ts) (~522 dòng) thành module nhỏ hơn theo concern: `reactive-git.ts`, `reactive-diagnostics.ts`, `reactive-typing.ts`

---

## 🎯 Chưa làm — Roadmap trung hạn (v0.6.x – v1.0)

### Real-time TTS (replace bundled MP3 cho `vi`/`en` extended)
- [ ] **Auto-detect VoiceVox local** lúc activate qua `http://localhost:50021/version` ping (cho `ja`)
- [ ] **Fallback service**: thử ElevenLabs streaming → web TTS browser API (lowest-quality fallback) → bundled MP3
- [ ] **Phrase template engine** — placeholders trong message strings: `{filename}`, `{branch}`, `{error_count}`, `{commit_count_today}` → resolve runtime trước khi TTS, audio sinh động hơn (hiện chỉ play MP3 đã render sẵn)
- [ ] **Cache TTS theo hash phrase** — cache miss thì sinh + lưu, hit thì play ngay (giảm cost ElevenLabs cho user dùng heavy)
- [ ] Giữ bundled 4-line MP3 làm fallback ultimate (offline + no key)

### Build Optimization
- [ ] Chuyển từ `tsc` sang `esbuild` (bundle nhỏ hơn ~3-5x, build < 200ms)
- [ ] Tách `out/` thành `out/extension.js` (main) + `out/chat.js` (lazy-loaded khi chat panel mở) → speedup activation cho user không dùng chat
- [ ] Verify/xóa launch config cũ trong `.vscode/launch.json`

### Custom Content Ecosystem
- [ ] **Custom content validator command** — `Anime Companion: Validate Custom Content`:
  - Scan tất cả paths trong `customModels`, `customModelRoots`, `customAmbientTracks`
  - Report missing files, invalid model3.json, unreadable audio
  - Output panel có clickable file links
- [ ] **Rescan assets** command — refresh model/ambient picker mà không cần reload window
- [ ] **Model preview tooltip** — hover model trong picker → mini preview canvas hiện thumbnail (tận dụng captured chibi nếu có)

### Chat Nâng cao
- [ ] **OpenRouter model discovery** — cache `/api/v1/models` → autocomplete model name (hiện free-text)
- [ ] **Conversation search** — Ctrl+F trong sidebar conversation list, full-text qua title + message bodies
- [ ] **Export conversation** ra Markdown (single conv) hoặc JSON (all conv) → save vào folder user pick
- [ ] **Session usage dashboard** — webview tổng hợp `tokens_in / tokens_out / estimated_cost_usd` per-provider, per-day (cost lookup table built-in cho các provider có rate công khai)

---

## 🌌 Vision dài hạn (chưa cam kết)

| Feature | Mô tả | Ghi chú |
|---|---|---|
| **Mac Desktop Companion** | Build Tauri binary cho `mac-x64` + `mac-arm64`, Apple notarize | Cần Apple Developer ID ($99/năm); Phase C.0 spike WKWebView trước |
| **Linux Desktop Companion** | AppImage hoặc `.deb` | Sau Mac ổn, thêm CI matrix |
| **Multi-character interaction** | 2 model cùng panel tương tác lẫn nhau | Cần refactor render pipeline |
| **Live2D motion editor** | UI cho user gán motion vào event tùy ý | Scope lớn, cần motion picker submenu làm nền |
| **Windows code signing (EV cert)** | Bỏ SmartScreen warning | Optional nếu build trust với marketplace user |

---

## 🔴 Đã loại khỏi roadmap

| Feature | Lý do loại |
|---|---|
| Leaderboard so sánh giờ code giữa user | Cần backend public, vướng privacy/GDPR, ROI thấp |
| Asset Store mua skin bằng EXP | Cần backend + moderation + payment, quá nặng |
| Hệ thống cấp độ RPG full | Scope-down → giữ achievements primitive là đủ giai đoạn này |
| Legacy voice `ja-vi` | Đã migrate runtime → `en`; không revive lại |
| **Inline code suggestions từ companion** | Chồng chéo trực tiếp với Copilot/Cursor inline; persona-flavor không đủ để justify rebuild ghost-text pipeline |
| **Web companion version (standalone)** | Port webview ra app riêng = bỏ toàn bộ value VS Code (diagnostics, git, lm API). Effort khổng lồ, không align với positioning "in your editor" |
| **Community model gallery** | Vướng license/redistribution (chính lý do remove 6 model gated v0.1.26); moderation cost quá cao cho 1-người maintainer |
| **Animated sticker reactions** | Expression blending hiện đã đủ expressive; sticker overlay thêm visual noise + asset bloat |
| **Real-time pitch control** | Niche, ít user dùng; nếu cần custom voice → đã có voice pipeline ElevenLabs custom |
| **Notification sound pack swap** | Audio per-event đã có qua `voiceAssets`; thêm 1 lớp sound pack = duplicate concern, không thêm value rõ |
| **README Korean + Chinese (penta-lingual)** | Maintenance cost 5 README × every change = unsustainable. Giữ tri-lingual EN/VI/JA. KR/ZH voice OK; README để community fork nếu cần |
| **Background/theme sync theo ambient track** | Visual treatment đổi theo ambient = quá phụ thuộc taste cá nhân, dễ gây confuse; theme sync theo VS Code (dark/light) đủ rồi |

---

## 🏷️ Feature Flag Legend

| Symbol | Ý nghĩa |
|---|---|
| `[x]` | Đã ship |
| `[ ]` | Chưa làm, đã lên lịch |
| `OPTIONAL` | Có thể thêm nếu phù hợp, chưa cam kết |

---

## 💡 Optional Features (ý tưởng — chưa trong backlog chính thức)

> Các feature dưới đây **chưa có trong backlog**, nhưng hợp lý với định hướng project và có thể xem xét sau khi hoàn thành các milestone chính. Mỗi item đều note rõ scope/giá trị để dễ ưu tiên sau.

### 🤖 AI/Chat Extensions
- `OPTIONAL` **Test failure auto-stage** — khi test fail trong Test Explorer, companion offer:
  - Stage failure output + test source vào chip
  - Quick prompt "Why did this fail?"
  - Tận dụng `vscode.tests.onDidChangeTestRun` API
- `OPTIONAL` **Multi-turn context auto-tracking** — implicit context: companion tự nhớ
  - File user save gần nhất → auto-attach nếu prompt mention "this file"
  - Branch hiện tại → inject vào system prompt cho commit message gen
  - Toggle on/off qua setting `chat.autoContext.enabled`
- `OPTIONAL` **Conversation templates** — preset prompt library trong combo box dưới Send button:
  - Code review checklist · Refactor guide · Bug triage · API design review
  - User tự custom thêm template qua setting `chat.customTemplates`
- `OPTIONAL` **Chat reaction button** — 👍👎 cạnh assistant message, log lựa chọn vào `globalState`:
  - Không gửi đi đâu (privacy-safe)
  - Dùng để: warn khi pick model có rate thấp, surface "best replies" trong stats
- `OPTIONAL` **`@` mentions for symbols** — gõ `@functionName` autocomplete qua workspace symbols (`vscode.executeWorkspaceSymbolProvider`), khác `#filename` ở chỗ nhắm tới function/class

### 🎭 Live2D & Visual
- `OPTIONAL` **Model outfit switcher** — nếu model có multiple `groups` trong `model3.json` (ví dụ Hiyori `school` / `casual`), expose qua menu picker
- `OPTIONAL` **Seasonal/holiday themes** — date-triggered: Tết (Lunar New Year), Halloween, Christmas → swap bubble color scheme + thêm accessory layer (event hat / hairpin) nếu model support
- `OPTIONAL` **VS Code theme sync** — companion adjust color palette theo `vscode.window.activeColorTheme.kind` (dark vs light) cho bubble background/border

### 🔊 Audio & Voice
- `OPTIONAL` **Ambient playlist** — thay vì 1 track loop, phát list theo shuffle/sequential, cross-fade 2s giữa tracks. Tận dụng `customAmbientTracks` đã có

### 📊 Stats & Productivity
- `OPTIONAL` **Productivity heatmap** — calendar heatmap GitHub-style (52 weeks × 7 days) hiển thị `saves_per_day` hoặc `coding_minutes_per_day`. SVG inline trong Stats webview
- `OPTIONAL` **Weekly report bubble** — trigger sáng thứ 2 (9-10h local time): "Tuần trước em ghi nhận {N} commits, {M} bugs fixed, {H}h coding. Tuần này muốn đặt goal gì không?"
- `OPTIONAL` **Goal setting** — `animeCompanion.goals.dailyCodingMinutes` setting. Companion nhắc khi gần đến, celebrate (motion + voice line) khi đạt
- `OPTIONAL` **Pomodoro session history** — log mỗi session vào `globalState` với timestamp + duration + completion. Stats webview show "X focus sessions today, Y hours total"
- `OPTIONAL` **Achievement badge export** — render unlocked achievement ra PNG (canvas → blob) để share lên social/repo README

### 🔧 Developer Experience
- `OPTIONAL` **Companion config profile** — preset full settings (persona + voice + ambient + reactive toggles) theo ngữ cảnh:
  - `study` (slow ambient, persona `cute`, no git polling)
  - `crunch` (no ambient, persona `professional`, all reactions silent except errors)
  - `relax` (lofi ambient, persona `energetic`, ja voice)
  - Quick command `Anime Companion: Switch Profile`
- `OPTIONAL` **Extension API** — export public event bus:
  - `animeCompanion.onDidReact(callback)` → other extensions hook in
  - `animeCompanion.triggerReaction(eventName, payload)` → cho CI/CD extension báo deploy success
  - Cần versioning + breaking-change policy nếu publish

### 🌐 Internationalization
- `OPTIONAL` **Korean (KR) voice + messages** — extend voice pipeline cho `ko`. Bundled phrase + extended ElevenLabs
- `OPTIONAL` **Chinese (ZH-CN) voice + messages** — extend cho `zh`

---

*Cập nhật lần cuối: 2026-05-25 · v0.3.3 — roadmap revision r3 (menu reorganization shipped, release docs synced, localization/menu polish folded into current public release)*
