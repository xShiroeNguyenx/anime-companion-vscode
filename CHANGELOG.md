# Changelog

Tài liệu này theo format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
extension áp dụng [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-13

### Added — AI Chat Companion (BYOK + Copilot)

Bản này biến companion từ một mascot thuần reactive thành **chat assistant** ngay trong VS Code panel. Trò chuyện với companion qua một panel slide-in tích hợp cạnh Live2D character, hỏi về code đang viết, lấy ý tưởng, học framework mới — companion vẫn giữ persona anime trong khi trả lời.

- **4 LLM provider hỗ trợ**:
  - **GitHub Copilot (mặc định, không cần API key)** — route qua `vscode.lm.selectChatModels({ vendor: 'copilot' })`. Dùng subscription Copilot có sẵn của user; first call sẽ trigger consent dialog của VS Code. Hỗ trợ mọi model Copilot expose (gpt-4o, claude-3.5/3.7-sonnet, gemini-1.5-pro, o1-mini…).
  - **Anthropic Claude (BYOK)** — `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Streaming qua SSE.
  - **OpenAI GPT (BYOK)** — `gpt-4o`, `gpt-4o-mini`, `o1-mini`. Streaming qua SSE với `stream_options.include_usage` cho token counting realtime.
  - **Google Gemini (BYOK, có free tier)** — `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`. Streaming qua `:streamGenerateContent?alt=sse`. Skip thinking parts (`thought: true`) cho 2.5 series.
- **BYOK an toàn**: API keys lưu trong `vscode.ExtensionContext.secrets` (OS keychain encrypted at rest). Webview không bao giờ thấy key — request body build ở extension host. Command `Set Chat API Key` cho QuickPick chọn provider + InputBox masked. Không có field nào trong `settings.json` lưu key.
- **Streaming token-by-token** với sparkle caret ✨ + thinking dots animation 3 chấm hồng khi đợi chunk đầu tiên — "thoughts coming out" experience.
- **Multi-conversation history**: persist mỗi conversation vào 1 file JSON dưới `globalStorageUri/chat-history/<id>.json` (atomic rename khi save). Sidebar liệt kê conversations, mỗi item có rename ✎ / delete 🗑 (driven bằng `showInputBox` / `showWarningMessage` của VS Code, không phải `prompt`/`confirm` browser — đó là cách hoạt động trong webview). Active conversation pinned per-workspace qua `workspaceState`. Empty conversations tự được dọn khi tạo mới để sidebar không phình.
- **Context awareness**:
  - **Selection toggle (📌)**: chip toggle icon ngay cạnh Send. Click → gửi editor selection hiện tại kèm prompt.
  - **Active file toggle (📄)**: kèm toàn bộ file đang mở (cap 12k chars, có truncation marker).
  - **`#file` mention**: gõ `#` trong textarea → autocomplete dropdown tìm file qua `vscode.workspace.findFiles`. Arrow Up/Down + Tab/Enter để chọn. Mention tự được resolve khi gửi.
  - **Right-click "Ask Companion About Selection"**: command palette + editor context menu. Stage selection vào chip vàng, mở panel, focus textarea.
- **Persona system**: 4 preset prompt (`cute`, `professional`, `tsundere`, `energetic`) inject `{modelName}` của Live2D character đang dùng. Override hoàn toàn bằng `chat.systemPrompt` setting.
- **Live2D reactions theo sentiment**: heuristic regex EN+VI chia mood ra `happy`/`sad`/`thinking`/`excited`/`neutral` sau khi stream xong → trigger `setMood` + `playMotion` (TapBody / TapHead) → character thật sự visibly phản ứng với câu trả lời. Toggle `chat.reactionsEnabled` (default `true`).
- **Avatar + identity**: assistant avatar dùng captured chibi PNG của Live2D model hiện tại (`globalStorageUri/cursor-chibi/{modelId}.png`), fallback `media/character.png`. Display name là tên Live2D model thật ("Hiyori", "Miara"…) chứ không phải "Companion" generic.
- **UI tinh chỉnh**:
  - **Split layout**: character bên trái, chat panel bên phải (clamp 80px–160px–20% cho character column). Character mood/motion animations luôn nhìn thấy được trong khi chat. Không media query để tránh stack dọc bất ngờ.
  - **Header 1 hàng + gear ⚙ toggle**: provider/model picker mặc định ẩn để chat log có thêm chiều cao. Click gear mở/đóng (vscode.getState persist).
  - **Custom AI model combo dropdown**: thay `<datalist>` (yêu cầu gõ mới hiện) bằng combo widget click-to-expand, hỗ trợ keyboard navigation, populate động cho Copilot từ `vscode.lm`.
  - **Anime pink pastel theme**: gradient hồng cho assistant bubble, lavender cho user bubble, soft shadow, rounded 14px với tail flatten, entrance animation cubic-bezier mềm. Pure custom — không phụ thuộc VS Code theme.
- **Token usage display**: trong status bar dưới: tokens per turn + Σ accumulated cho conversation hiện tại. Reset khi switch conversation.
- **Setting schema mới**: `chat.provider`, `chat.model`, `chat.personaPreset`, `chat.systemPrompt`, `chat.maxTokens` (default 2048, đủ cho Gemini 2.5 thinking), `chat.temperature`, `chat.reactionsEnabled`.
- **Commands mới**:
  - `Anime Companion: Open Chat`
  - `Anime Companion: Set Chat API Key (BYOK)`
  - `Anime Companion: New Chat Conversation`
  - `Anime Companion: Clear All Chat Conversations`
  - `Anime Companion: Ask Companion About Selection` (cũng có ở editor right-click menu)

### Changed
- Default `chat.provider` là `copilot` cho mọi user mới — mọi VS Code user đều có account GitHub, không cần xin key để bắt đầu chat. Một-time migration trên upgrade clear global `chat.provider` override để fallback về default Copilot (giữ nguyên workspace-level setting).
- `runSetApiKeyCommand` không còn auto-switch provider sau khi save key. User phải proactively chọn provider qua dropdown — tránh bị bất ngờ chuyển sang BYOK provider chỉ vì paste key thử.
- `files` array trong `package.json`: `out/*.js` → `out/**/*.js` để include `out/chat/**` nested directories.

### Architecture
- **CSS isolation**: cursor chibi tuning UI (orb widget) tách hẳn class prefix từ `chat-*` sang `chibi-orb-*` + có file CSS riêng `media/webview/cursor-chibi.css`. Chat panel và cursor chibi giờ không thể accidentally share CSS rule.
- **3 file CSS độc lập theo prefix**:
  - `media/companion.css` — Live2D character, idle bubble, status bar
  - `media/webview/chat.css` — chat panel UI (header, sidebar, messages, form)
  - `media/webview/cursor-chibi.css` — cursor chibi position tuning widget
- **Webview message protocol mới** (`chat:*`): `chat:send`, `chat:cancel`, `chat:snapshot`, `chat:userMessage`, `chat:assistantStart/Delta/End`, `chat:setProvider`, `chat:setModel`, `chat:setApiKey`, `chat:newConversation`, `chat:loadConversation`, `chat:requestRename`, `chat:requestDelete`, `chat:requestFiles`, `chat:stagedSelection`, `chat:clearStagedSelection`.
- **`src/chat/` module mới**: `secrets.ts`, `persona.ts`, `llm-provider.ts`, `providers/{anthropic,openai,gemini,copilot}.ts`, `sse-parser.ts`, `chat-manager.ts`, `conversation-store.ts`, `context-builder.ts`, `sentiment.ts`.
- **Resource roots mở rộng**: webview localResourceRoots giờ bao `globalStorageUri/cursor-chibi/` cho chibi avatar trong chat.

### Notes
- Toàn bộ feature chat đã được iterate qua 16 patch builds nội bộ (0.2.0 → 0.2.16) trước khi consolidate thành 0.3.0 cho marketplace.
- Desktop Companion mode chưa có chat UI ở phiên bản này — bridge dùng bootstrap HTML khác. Chat commands (set key, etc.) vẫn hoạt động qua Command Palette. Tích hợp đầy đủ Desktop ↔ chat để v0.4.x.

## [0.1.50] - 2026-05-11

### Changed
- Đồng bộ tài liệu public và nội bộ cho trạng thái hiện tại của repo: `README.md`, `CHECKLIST.md`, `PUBLIC_RELEASE_GUIDE.md`.
- README giờ phản ánh đúng các tính năng đã ship gần đây quanh **Cursor Chibi**, **capture/reset chibi**, extended **voice assets**, command list và settings list cho `0.1.50`.

### Notes
- Đây là bản release-prep / documentation sync để gói phát hành `0.1.50` khớp với code và workflow publish hiện tại.

## [0.1.49] - 2026-05-08

### Added
- **Capture Chibi from Model**: command `Anime Companion: Capture Chibi from Model` snapshot canvas Live2D đang render → auto-crop transparent borders → resize tối đa 96px (giữ aspect ratio) → save vào `globalStorage/cursor-chibi/{modelId}.png`. Cursor chibi tự đổi sprite ngay (không cần reload). 1 file/model — switch model là chibi đổi theo.
- Command `Anime Companion: Reset Captured Chibi` để xoá PNG đã capture của model hiện tại, fallback về icon bundled.

### Changed
- `cursor-chibi.ts`: decoration CSS dùng `background-size: contain` + `background-position: center` thay vì stretch sang square — captured chibi portrait giữ đúng aspect ratio, không bị méo.
- Resize captured ảnh xuống ≤96px max dim trước khi save (VS Code icon decoration scale chuẩn hơn khi source PNG nhỏ).

## [0.1.48] - 2026-05-08

### Added
- **Tune Cursor Chibi Size**: extend command tune position thêm options `+ Bigger` / `− Smaller` (step 2px) trong cùng quick-pick. Reset all clear cả x, y, size.
- Config mới `animeCompanion.cursorChase.sizePx` (numeric, 0 = dùng enum small/medium/large; >0 = override exact px). Min 1px, max 64px.

### Fixed
- Chibi không co được dưới ~24px do VS Code có CSS `min-width/min-height` ngầm cho decoration `before` element. Override bằng inline `!important` (`min-width: 0`, `max-width: ${sizePx}px`, `background-size: contain`).

## [0.1.47] - 2026-05-08

### Added
- **Tune Cursor Chibi Position**: command interactive mở quick-pick cho phép nhích chibi 4px theo Up/Down/Left/Right realtime, lặp đến khi user chọn Done. Settings (`cursorChase.offsetX`, `cursorChase.offsetY`) lưu Global, persist qua reload.
- Config mới `animeCompanion.cursorChase.offsetX/offsetY` (default 0) — pixel offset cộng thêm vào base position auto-centered.

## [0.1.46] - 2026-05-08

### Fixed
- **Auto-show panel sau reload không hoạt động**: root cause là `setContext('animeCompanion.visible', true)` được gọi async sau setTimeout 1.5s, nhưng VS Code đã evaluate `when` clause cho view container trước đó. Fix bằng cách gọi `setContext` **synchronous** ngay khi register webview view provider, để view xuất hiện trong panel container ngay từ đầu. Companion giờ tự hiện đúng sau mọi reload window / restart VS Code.

## [0.1.45] - 2026-05-08

### Added
- Webview helper `playLine(key)` trong `media/webview/audio.js` — convenience wrapper cho `playAudio(`${key}.mp3`)` để thêm câu thoại mới chỉ cần 1 dòng code.

### Fixed
- **Cursor chibi leak vào OUTPUT panel / debug console**: VS Code coi các panel này là TextEditor nên `onDidChangeTextEditorSelection` fire kéo chibi theo, gây ra 2 chibi cùng lúc trên màn hình. Fix bằng cách filter `editor.document.uri.scheme` chỉ áp dụng cho `file`, `untitled`, `vscode-userdata`, đồng thời clear decoration từ visible editors khác khi switch.
- `animeCompanion.toggle` (click WhiteAngel ở status bar): bỏ `live2dView.toggleVisibility` (throw trên một số VS Code build) → tự flip `setContext` + focus.

## [0.1.41 - 0.1.44] - 2026-05-08

### Added (0.1.41)
- **ElevenLabs Voice Pipeline** (build-time + lazy-load):
  - Per-language config: `media/voice/en.json`, `media/voice/vi.json` chứa `voiceId`, `modelId`, `voiceSettings`, danh sách `lines`.
  - Script `scripts/generate-voice-assets.js` gọi ElevenLabs TTS API → MP3 ra `dist/voice-assets/{lang}/`. Idempotent qua hash cache, support flag `--lang`, `--key`, `--force`. JSON config tolerate `//` comment.
  - Script `scripts/pack-voice-assets.js` đóng gói thành `{lang}.zip`.
  - Workflow `.github/workflows/voice-assets-release.yml` (manual dispatch) build + upload zips lên GitHub release tag (default `audio-v1`).
  - Class `src/voice-asset-downloader.ts` lazy-load `{lang}.zip` runtime, cache theo extension version trong `globalStorage`. Fallback về `media/audio/{lang}/` bundled khi download fail.
  - Config mới: `voiceAssets.downloadBaseUrl`, `voiceAssets.enableExtended`.
  - Script diagnostic `scripts/list-elevenlabs-voices.js` in ra mọi voice mà API key dùng được + category (`[premade]` / `[generated]` / `[professional]`).

### Changed
- `package.json`: thêm `media/voice/**` vào `files` để JSON config ship trong VSIX, MP3 chỉ lazy-load.
- `companion-view.ts`: trước render webview HTML, gọi `voiceAssetDownloader.ensureLanguageAudio(lang)` cho en/vi, swap `__AUDIO_BASE_URL__` sang cache dir nếu có. `localResourceRoots` mở rộng để webview load được file MP3 cache.

### Notes
- 4 line bundled (`headpat`, `spam`, `poke`, `help`) trong `media/audio/{lang}/` được giữ làm offline fallback. Pipeline mới chỉ ảnh hưởng en/vi; ja vẫn dùng VOICEVOX MP3 bundled.

## [0.1.40] - 2026-05-06

### Added
- Desktop Companion sidecar giờ được lazy-download thật ở runtime từ `animeCompanion.desktopCompanion.downloadBaseUrl` khi máy user chưa có binary cache.
- Có progress notification trong lúc tải Desktop Companion, rồi hiện thông báo khi download/extract xong và chuẩn bị launch.

### Changed
- Desktop Companion sidecar cache theo version extension trong `globalStorage`, để update version không bị dùng lẫn binary cũ.
- Ưu tiên resolve binary theo thứ tự: `devBinaryPath` -> binary đã cache -> local build fallback, giúp bản publish dùng lazy-download còn dev local vẫn test nhanh được.

### Fixed
- Bản publish không còn phụ thuộc vào việc ship sẵn `desktop-pet/target/release/anime-companion-pet.exe` trong `.vsix`.
- `desktopCompanion.downloadBaseUrl` giờ phản ánh đúng behavior runtime thay vì chỉ là setting placeholder.

## [0.1.39] - 2026-05-06

### Fixed
- Packaging/publish flow: bỏ yêu cầu ship `desktop-pet/target/release/anime-companion-pet.exe` trong `.vsix`, tránh việc GitHub Actions release fail khi CI checkout source nhưng không có local Windows sidecar artifact.
- VSIX allowlist tiếp tục giữ gói extension gọn, trong khi Desktop Companion sidecar vẫn được phát hành riêng qua GitHub Release `desktop-pet-v1`.

## [0.1.38] - 2026-05-06

### Added
- Desktop Companion mode (Windows v1): companion có thể chạy thành cửa sổ desktop nổi riêng qua setting `animeCompanion.desktopCompanion.enabled`, dùng Tauri sidecar + WebSocket bridge để tái sử dụng reactive engine hiện có.
- Bộ setting mới cho Desktop Companion: `alwaysOnTop`, `clickThrough`, `size`, `position`, `opacity`, `downloadBaseUrl`, `devBinaryPath`.
- Binary desktop companion được lazy-download từ GitHub Releases ở lần bật đầu tiên; hỗ trợ override binary local cho flow dev/test.
- Command `Anime Companion: Reset Companion Position` để reset vị trí companion trong panel mode.

### Changed
- Public package / docs được cập nhật để phản ánh trạng thái hiện tại ở `v0.1.38`, thay vì snapshot cũ `v0.1.27`.
- Tên setting public được chuẩn hoá sang namespace `animeCompanion.desktopCompanion.*`; extension vẫn migrate/fallback từ legacy key `animeCompanion.desktopPet.*`.
- Panel mode và Desktop Companion mode được tách mutually-exclusive để tránh chạy 2 instance Live2D cùng lúc.

### Notes
- Desktop Companion v1 hiện ship binary chính thức cho Windows. Trên Mac/Linux, extension vẫn có thể chạy bridge để debug nhưng chưa có binary release chính thức.

## [0.1.27] - 2026-05-05

### Added
- Ambient background audio ngay trong companion với 3 preset built-in: `lofi`, `rain`, `cafe`, có thể bật/tắt nhanh từ menu chuột phải.
- Hỗ trợ `animeCompanion.ambientVolume` để chỉnh âm lượng ambient riêng với phần voice/reaction audio.
- Hỗ trợ `animeCompanion.customAmbientTracks` để user thêm track local của riêng mình vào Ambient panel.

### Changed
- README được cập nhật để phản ánh flow sử dụng ambient/background music và các setting liên quan.

## [0.1.26] - 2026-05-04

### Added
- Auto-scan local model roots qua `animeCompanion.customModelRoots`. User chỉ cần trỏ tới một thư mục gốc như `D:/model`, extension sẽ tự quét các thư mục con chứa `.model3.json` và thêm chúng vào model picker.
- Hỗ trợ override chi tiết từng model local qua `animeCompanion.customModels` để đổi tên hiển thị, mô tả, hoặc file `.model3.json`.

### Changed
- Dọn flow publish: loại 6 model không có quyền redistribute rõ ràng khỏi `media/live2d/` và khỏi đường build asset mặc định. Repo/public package giờ chỉ còn 4 model sample an toàn hơn: Hiyori, Haru, Mao, Miara.
- README, MODELS.md và license notes được cập nhật theo flow custom local model mới.

### Fixed
- Ổn định việc đổi model trong webview bằng cách cleanup model / PIXI app cũ trước khi load model mới, giảm lỗi khi switch qua lại giữa các model local.

## [0.1.25] - 2026-05-02

### Fixed
- Extension activation failed silently on Cursor / VSCodium / Open VSX installs because `node_modules/**` was excluded from the vsix, so `require('adm-zip')` in [src/model-downloader.ts](src/model-downloader.ts) hit MODULE_NOT_FOUND. `.vscodeignore` updated to allow vsce to ship production dependencies. `@types/adm-zip` moved to `devDependencies` (no need to ship type definitions at runtime).

## [0.1.24] - 2026-05-01

First Marketplace release.

### Added
- **Lazy-load Live2D models**: chỉ Hiyori bundled trong .vsix (~8 MB). 3 model Live2D Sample khác (Haru, Mao, Miara) download on-demand từ GitHub Release. Setting `animeCompanion.experimentalModels` bật thêm 6 model gated.
- **Achievements panel**: command `Anime Companion: Show Achievements` hiển thị 7 achievement với trạng thái lock/unlock.
- **Stats dashboard**: command `Anime Companion: Show Stats` cho saves / commits / errors fixed / coding time today / all-time.
- **Per-workspace model**: chọn model lưu trong `workspaceState`, fallback về setting global. Thêm command `Reset Workspace Model`.
- **Live2D motion picker**: submenu "Motion" trong right-click + command `Play Motion`.
- **Pomodoro visual ring**: SVG progress ring overlay trên character (đỏ work, vàng break).
- **Custom Pomodoro interval per workspace**: hỗ trợ override `pomodoroWorkTime`/`pomodoroBreakTime` qua `.vscode/settings.json`.
- **Sound cue khác nhau cho Pomodoro work/break**: work giữ `poke.mp3`, break dùng `headpat.mp3`.
- Persistent stats store ([src/stats.ts](src/stats.ts)) với daily rollover, capped 60s gap khi accumulate coding time.

### Changed
- `ReactiveManager` không còn giữ counter trong RAM — toàn bộ chuyển sang `StatsStore` (globalState).
- Bộ context menu mở rộng: thêm Motion, Achievements, Stats.

## [0.1.20]

### Added
- Custom user phrases (`animeCompanion.customPhrases.idle/save/error`).
- Per-language reactive messages: `media/messages/{vi,en,ja}.json`.
- Custom keyword reactions (`animeCompanion.customKeywords`).

## [0.1.19]

### Added
- Reactive toggles per-channel (`reactive.diagnostics` / `reactive.save` / `reactive.typing` / `reactive.git`).
- Quiet hours setting để mute message theo khung giờ.

## [0.1.18]

### Changed
- Tách `extension.ts` thành module: `companion-view.ts`, `models.ts`, `model-server.ts`, `pomodoro.ts`, `messages.ts`, `git-ops.ts`.
- Bật `tsconfig.strict: true`.

## [0.1.16]

### Added
- Custom right-click menu trên character (10 mục): Run, Commit, Pull, Push, Model, Voice, Mute, Poke, Pomodoro, Settings.
- Inline picker panel trên character cho Model / Voice / Message language.

## [0.1.10]

### Added
- Reactive engine: react theo diagnostics, save, typing speed, build, debug, git.
- Mood system 4 trạng thái (idle/happy/angry/sleepy).
- Achievement primitive: `save50/100`, `error_fix_10/50`, `coding_1h/3h`, `commit10`.
- Easter eggs cho `TODO` / `FIXME` / `console.log`.

## [0.1.5]

### Added
- 7 Live2D model: Hiyori, Cheshire, Ice Girl, Tsubaki, White Angel, Vivian, Changli.
- Multilingual voice: `ja` (VoiceVox), `vi`, `en` (Google TTS).
- Lipsync qua `model.speak()` + fallback HTML5 Audio.
- Pomodoro Manager với countdown trên status bar.

## [0.1.0]

### Added
- Initial release: Live2D companion view qua local HTTP server bypass CSP.
- Single click / multi click / long-press / spam click interactions.
- Status bar item.
