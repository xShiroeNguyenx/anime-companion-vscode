# Changelog

Tài liệu này theo format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
extension áp dụng [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
