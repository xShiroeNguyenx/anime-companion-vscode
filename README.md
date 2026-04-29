# 🌸 Anime Companion for VS Code

> Một bạn đồng hành Live2D dễ thương ngự ngay trong VS Code, phản ứng theo lúc bạn code: lỗi, save, commit, build, debug, Pomodoro… và biết khi nào bạn cần được khen hoặc bị nhắc nghỉ tay.

**Phiên bản hiện tại:** v0.1.20

---

## ✨ Tính năng nổi bật

### 🎭 Live2D Companion
- 7 model có sẵn, đổi nóng không cần reload: **Hiyori**, **Cheshire** (Azur Lane), **Ice Girl** (TianYeLuLu), **Tsubaki** (11月椿), **White Angel**, **Vivian**, **Changli** (长离).
- Render bằng `pixi-live2d-display` + Cubism Core qua local HTTP server (bypass CSP của VS Code).
- Expression blending mượt qua PIXI ticker — chuyển trạng thái cảm xúc không bị giật.

### 💫 Tương tác đa dạng
- **Single Click** — chạm nhẹ (Surprised).
- **Double / Triple Click** — vui vẻ (Happy).
- **Long Press > 0.8s** — Headpat → Shy → Love kèm hiệu ứng trái tim.
- **Spam Click** — companion sẽ cáu (Angry) "Đừng bấm nữa!".

### 🔊 Audio + Lip-sync 3 ngôn ngữ
- **Japanese (ja)** — VoiceVox Shikoku Metan, giọng anime Nhật.
- **Tiếng Việt (vi)** — Google TTS.
- **English (en)** — Google TTS.
- Tự động nhép môi qua `model.speak()`, fallback HTML5 Audio nếu PIXI Audio plugin gặp sự cố.

### 🤖 Reactive Engine — phản ứng theo môi trường code
| Sự kiện | Phản ứng |
|---|---|
| Lỗi tăng / giảm trong Problems panel | Bubble than vãn / khen ngợi |
| Save spam (Ctrl+S liên tục) | "Ctrl+S warrior detected! 🛡️" |
| Typing nhanh | "Speed coding mode activated! 💨" |
| Gõ `TODO` / `FIXME` / `console.log` | Easter egg riêng cho từng keyword |
| Build success / fail | "Build OK! 🎉" / "Toang rồi 😭" |
| Debug start / stop | "Detective mode: ON 🕵️" |
| Đổi git branch | "Đổi branch rồi à? 🌿" |
| Commit mới | "Nice commit! 💪" |
| Merge conflict | "Merge conflict kìa! 😨" |
| Nhiều file uncommitted | "{count} files thay đổi rồi, commit sớm nha!" |
| Code 30 phút liên tục | Nhắc nghỉ ngơi, uống nước |

Mỗi kênh đều có thể bật/tắt độc lập qua settings.

### 🏆 Achievements
Tự unlock khi đạt mốc: `save50`, `save100`, `error_fix_10/50`, `coding_1h/3h`, `commit10`.

### 🍅 Pomodoro tích hợp
- Vòng work/break tự động (mặc định 25/5 phút, tuỳ chỉnh được).
- Status bar hiển thị countdown `🍅 23:42` lúc đang focus, `☕ 04:12` lúc break.
- Click status bar để stop nhanh.

### 🖱️ Custom Right-click Menu (10 mục)
Click chuột phải lên companion để mở menu inline — không phải mở Command Palette:

- 🐞 **Run** — restart-or-start debug session
- 📦 **Commit** — commit với guard cho protected branch (`main`/`master`/`develop`), hỏi message qua input dialog
- ⬇️ **Pull** / ⬆️ **Push** — có feedback thật ("succeeded / nothing to do / failed")
- 🌸 **Model** — inline picker panel chọn 1 trong 7 model ngay trên character
- 🗣️ **Voice** — inline picker `ja` / `vi` / `en`
- 🔇 **Mute** — toggle audio (label tự đổi `Mute` ↔ `Unmute`)
- 👉 **Poke** — chạm model
- 🍅 **Pomodoro** — start
- ⚙️ **Settings** — mở Settings UI đã filter sẵn

### 🌙 Quiet Hours
Đặt khung giờ tắt mọi bubble, ví dụ trong giờ họp:

```json
"animeCompanion.quietHours": ["09:00-12:00", "22:00-06:00"]
```

Mood/expression vẫn cập nhật bình thường — chỉ tắt message để không phân tâm.

---

## 📦 Cài đặt

### Từ file `.vsix` (hiện tại)
```bash
code --install-extension anime-companion-vscode-0.1.20.vsix
```

### Từ source
```bash
git clone https://github.com/ShiroeNguyen/anime-companion.git
cd anime-companion
npm install
npm run package:install
```

> **Marketplace:** đang chuẩn bị publish — xem [PLAN.md §4.1](./PLAN.md).

---

## ⚙️ Cấu hình

Mở Settings (`Ctrl+,`) → tìm `Anime Companion`, hoặc click **Settings** trong right-click menu của companion.

| Setting | Default | Mô tả |
|---|---|---|
| `animeCompanion.model` | `hiyori` | Chọn 1 trong 7 model. |
| `animeCompanion.voiceLanguage` | `ja` | `ja` / `vi` / `en`. |
| `animeCompanion.muted` | `false` | Tắt toàn bộ audio. |
| `animeCompanion.characterSize` | `medium` | `small` / `medium` / `large`. |
| `animeCompanion.showOnStartup` | `true` | Tự hiện panel khi VS Code khởi động. |
| `animeCompanion.messageIntervalMin` / `Max` | `10` / `20` | Khoảng cách giữa các idle bubble (giây). |
| `animeCompanion.pomodoroWorkTime` / `BreakTime` | `25` / `5` | Thời lượng work / break (phút). |
| `animeCompanion.breakReminderMinutes` | `30` | Phút code liên tục trước khi nhắc nghỉ. |
| `animeCompanion.reactive.diagnostics` | `true` | Toggle phản ứng theo errors/warnings. |
| `animeCompanion.reactive.save` | `true` | Toggle phản ứng theo save. |
| `animeCompanion.reactive.typing` | `true` | Toggle phản ứng tốc độ gõ + Easter eggs. |
| `animeCompanion.reactive.git` | `true` | Toggle Git polling. |
| `animeCompanion.quietHours` | `[]` | Khung giờ tắt message. |

---

## 🎮 Commands

Mở Command Palette (`Ctrl+Shift+P`) và gõ `Anime Companion`:

| Command | Mô tả |
|---|---|
| `Anime Companion: Show` / `Hide` / `Toggle` | Bật/tắt panel companion |
| `Anime Companion: Change Model` | Quick pick chọn model (✓ ở model đang chọn) |
| `Anime Companion: Change Voice` | Quick pick chọn giọng |
| `Anime Companion: Toggle Mute` | Bật/tắt audio |
| `Anime Companion: Start Pomodoro` / `Stop Pomodoro` | Bắt đầu / dừng Pomodoro |
| `Anime Companion: Open Settings` | Mở Settings đã filter |

---

## 🛠️ Phát triển

Yêu cầu: **Node.js ≥ 18** và **npm**.

```bash
npm install              # Cài dependency
npm run compile          # Build TypeScript → out/
npm run watch            # Watch mode
npm run package          # Đóng .vsix
npm run package:install  # Đóng + cài đè vào VS Code local
```

Hoặc dùng script tổng hợp tự bump version + package + install:
```bash
./build-install.sh
```

Trong VS Code, nhấn `F5` để mở **Extension Development Host** với extension đã load sẵn.

### Cấu trúc

```
src/
  extension.ts          activate, status bar, command registration
  companion-view.ts     WebviewViewProvider, idle bubble timer
  reactive.ts           ReactiveManager — toàn bộ event hooks
  pomodoro.ts           PomodoroManager
  models.ts             MODEL_MAP
  model-server.ts       Local Express server
  git-ops.ts            pull/push/commit có feedback
  log.ts                Output channel logger

media/
  webview/              Runtime webview (đã tách module)
    main.js · core.js · interaction.js
    audio.js · expression.js · ui.js
  audio/{ja,vi,en}/     MP3 cho từng ngôn ngữ
  live2d/               Cubism model assets
  lib/                  pixi-live2d-display + Cubism core
```

---

## 📚 Tài liệu

- [FEATURES.md](./FEATURES.md) — Mô tả chi tiết toàn bộ tính năng đã ship.
- [PLAN.md](./PLAN.md) — Roadmap (sprint hiện tại, ngắn hạn, trung hạn, vision).
- [CHECKLIST.md](./CHECKLIST.md) — Tiến độ từng task.
- [DECISIONS.md](./DECISIONS.md) — Ghi chú kiến trúc + technical decisions.

---

## 📜 License

[MIT License](./LICENSE).

Live2D Cubism SDK, các model Live2D, và audio VoiceVox/Google TTS có license riêng — xem [PLAN.md §4.1](./PLAN.md) (license audit là điều kiện để publish lên Marketplace).

---

## 💖 Credit

- **Live2D Cubism Core SDK** — Live2D Inc.
- **Models:** Hiyori (Live2D Sample), Cheshire (Azur Lane), Ice Girl (TianYeLuLu), Tsubaki (11月椿), White Angel, Vivian, Changli (长离).
- **Audio:** VoiceVox (Shikoku Metan) cho `ja`, Google TTS cho `vi` / `en`.

Made with 🌸 by [ShiroeNguyen](https://github.com/ShiroeNguyen).
