# 🌸 Anime Companion for VS Code

> Một bạn đồng hành Live2D dễ thương ngự ngay trong VS Code, phản ứng theo lúc bạn code: lỗi, save, commit, build, debug, Pomodoro… và biết khi nào bạn cần được khen hoặc bị nhắc nghỉ tay.

> ⚠️ **Experimental — v0.1.x.** Đây là bản early-access. API, settings, và behavior có thể thay đổi giữa các minor version trước khi đạt v1.0. Nếu bạn gặp bug hoặc có feedback, mở issue tại [GitHub](https://github.com/xShiroeNguyenx/anime-companion-vscode/issues) — rất welcome!

**Phiên bản hiện tại:** v0.1.26

## 📦 Cài đặt

### VS Code (Microsoft Marketplace)
```bash
code --install-extension shiroenguyen.anime-companion-vscode
```

### Cursor / VSCodium / Theia / Gitpod (Open VSX Registry)
```bash
code --install-extension shiroenguyen.anime-companion-vscode
```
Hoặc tải `.vsix` từ [Open VSX page](https://open-vsx.org/extension/shiroenguyen/anime-companion-vscode) → `code --install-extension <file>`.

### Manual install (mọi VS Code-based editor)
1. Tải `.vsix` mới nhất từ [GitHub Releases](https://github.com/xShiroeNguyenx/anime-companion-vscode/releases).
2. Trong editor: `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → chọn file vừa tải.

---

## ✨ Tính năng nổi bật

### 🎭 Live2D Companion
- **4 model Live2D Sample** dùng Free Material License: **Hiyori**, **Haru**, **Mao**, **Miara**. Hiyori bundled trong `.vsix`, 3 model còn lại lazy download lần đầu chọn.
- Render bằng `pixi-live2d-display` + Cubism Core qua local HTTP server (bypass CSP của VS Code).
- Có fallback ảnh tĩnh nếu Live2D load lỗi.
- Expression blending mượt qua PIXI ticker — chuyển trạng thái cảm xúc không bị giật.
- Có thể thêm model local do chính user tự tải về qua setting `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels` (xem [LICENSE-AUDIT.md](LICENSE-AUDIT.md)).
- Nếu đang mở workspace, model được lưu theo từng workspace; có command reset về global model.

### 💫 Tương tác đa dạng
- **Single Click** — chạm nhẹ (Surprised).
- **Double / Triple Click** — vui vẻ (Happy).
- **Long Press > 0.8s** — Headpat → Shy → Love kèm hiệu ứng trái tim.
- **Spam Click** — companion sẽ cáu (Angry) "Đừng bấm nữa!".

### 🔊 Audio + Lip-sync 3 ngôn ngữ
- **Japanese (ja)** — VoiceVox Shikoku Metan, giọng anime Nhật.
- **Tiếng Việt (vi)** — Google TTS.
- **English (en)** — Google TTS.
- Bubble message và voice tách riêng: có thể để voice `ja` nhưng text `vi` / `en` / `ja`.
- Tự động nhép môi qua `model.speak()`, fallback HTML5 Audio nếu PIXI Audio plugin gặp sự cố.

### 🤖 Reactive Engine — phản ứng theo môi trường code
| Sự kiện | Phản ứng |
|---|---|
| Lỗi tăng / giảm trong Problems panel | Bubble than vãn / khen ngợi |
| Save spam (Ctrl+S liên tục) | "Ctrl+S warrior detected! 🛡️" |
| Typing nhanh | "Speed coding mode activated! 💨" |
| Gõ `TODO` / `FIXME` / `console.log` | Easter egg riêng cho từng keyword |
| Từ khoá custom do user định nghĩa | Bubble riêng theo `animeCompanion.customKeywords` |
| Build success / fail | "Build OK! 🎉" / "Toang rồi 😭" |
| Debug start / stop | "Detective mode: ON 🕵️" |
| Đổi git branch | "Đổi branch rồi à? 🌿" |
| Commit mới | "Nice commit! 💪" |
| Merge conflict | "Merge conflict kìa! 😨" |
| Nhiều file uncommitted | "{count} files thay đổi rồi, commit sớm nha!" |
| Code 30 phút liên tục | Nhắc nghỉ ngơi, uống nước |
| Ít hoạt động / nhiều lỗi / vừa code sung | Đổi mood `sleepy` / `angry` / `happy` |

Mỗi kênh đều có thể bật/tắt độc lập qua settings.

### 🏆 Achievements
- Tự unlock khi đạt mốc: `save50`, `save100`, `error_fix_10`, `error_fix_50`, `coding_1h`, `coding_3h`, `commit10`.
- Có command xem danh sách achievements đã mở / chưa mở ngay trong VS Code.

### 📊 Stats
- Theo dõi số lần `save`, `commit`, số lỗi đã fix, thời gian code hôm nay và tổng thời gian code all-time.
- Có command mở quick view stats ngay trong VS Code.

### 🍅 Pomodoro tích hợp
- Vòng work/break tự động (mặc định 25/5 phút, tuỳ chỉnh được).
- Status bar hiển thị countdown `🔥 23:42` lúc đang focus, `☕ 04:12` lúc break.
- Có overlay ring ngay trên companion.
- Click status bar để stop nhanh.

### 🖱️ Custom Right-click Menu (14 mục)
Click chuột phải lên companion để mở menu inline — không phải mở Command Palette:

- 🚀 **Run** — restart-or-start debug session
- 📦 **Commit** — commit với guard cho protected branch (`main`/`master`/`production`), hỏi stage-all nếu cần, nhập message ngay trong webview
- ⬇️ **Pull** / ⬆️ **Push** — có feedback thật ("succeeded / nothing to do / failed")
- 🌸 **Model** — inline picker panel chọn model ngay trên character
- 🗣️ **Voice** — inline picker `ja` / `vi` / `en`
- 💬 **Messages** — đổi ngôn ngữ bubble `vi` / `en` / `ja`
- 🔇 **Mute** — toggle audio (label tự đổi `Mute` ↔ `Unmute`)
- 👉 **Poke** — chạm model
- 🎬 **Motion** — play nhanh `TapBody` / `TapHead` / `Idle`
- 🍅 **Pomodoro** — start
- 🏆 **Achievements** — mở danh sách achievement
- 📊 **Stats** — mở thống kê
- ⚙️ **Settings** — mở Settings UI đã filter sẵn

### 🌙 Quiet Hours
Đặt khung giờ tắt mọi bubble, ví dụ trong giờ họp:

```json
"animeCompanion.quietHours": ["09:00-12:00", "22:00-06:00"]
```

Mood/expression vẫn cập nhật bình thường — chỉ tắt message để không phân tâm.

### 🪄 Custom Phrases & Keywords
Bạn có thể thêm câu riêng cho companion:

```json
"animeCompanion.customPhrases.idle": ["Nhớ uống nước nha~"],
"animeCompanion.customPhrases.save": ["Save đẹp lắm đó!"],
"animeCompanion.customPhrases.error": ["Bình tĩnh, mình sửa được mà."]
```

Hoặc thêm keyword reaction riêng:

```json
"animeCompanion.customKeywords": {
  "refactor": ["Refactor gọn gàng nha~"],
  "NOTE": ["Có note mới rồi đó!"]
}
```

### 📁 Custom Local Models
Nếu bạn có một thư mục gốc như `D:/model` và bên trong là nhiều thư mục con model local, chỉ cần trỏ một lần:

```json
"animeCompanion.customModelRoots": [
  "D:/model"
]
```

Extension sẽ tự quét từng thư mục con trực tiếp. Thư mục nào có file `.model3.json` sẽ tự xuất hiện trong model picker.

Nếu muốn chỉnh riêng tên hiển thị, mô tả, hoặc chỉ định file `.model3.json` cụ thể, bạn vẫn có thể override bằng:

```json
"animeCompanion.customModels": {
  "my-model": {
    "name": "My Model",
    "path": "D:/model/MyModel",
    "modelFile": "MyModel.model3.json",
    "description": "Custom local model"
  }
}
```

---

## 📦 Cài đặt

### Từ file `.vsix` (hiện tại)
```bash
code --install-extension anime-companion-vscode-0.1.26.vsix
```

### Từ source
```bash
git clone https://github.com/xShiroeNguyenx/anime-companion-vscode.git
cd anime-companion-vscode
npm install
npm run package:install
```

> **Marketplace:** đã có trên VS Code Marketplace và Open VSX. Bạn vẫn có thể cài từ `.vsix` nếu muốn test local hoặc pin version cụ thể.

---

## ⚙️ Cấu hình

Mở Settings (`Ctrl+,`) → tìm `Anime Companion`, hoặc click **Settings** trong right-click menu của companion.

| Setting | Default | Mô tả |
|---|---|---|
| `animeCompanion.model` | `hiyori` | Chọn model hiện tại. |
| `animeCompanion.customModelRoots` | `[]` | Danh sách thư mục gốc để tự quét model local. |
| `animeCompanion.customModels` | `{}` | Khai báo thêm model local do user tự tải về. |
| `animeCompanion.modelDownloadBaseUrl` | GitHub Releases URL | Base URL để lazy-download model zip. |
| `animeCompanion.voiceLanguage` | `ja` | `ja` / `vi` / `en` cho audio. |
| `animeCompanion.messageLanguage` | `vi` | `vi` / `en` / `ja` cho bubble text. |
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
| `animeCompanion.customPhrases.idle` | `[]` | Thêm câu cho idle bubble. |
| `animeCompanion.customPhrases.save` | `[]` | Thêm câu cho save reaction. |
| `animeCompanion.customPhrases.error` | `[]` | Thêm câu cho error reaction. |
| `animeCompanion.customKeywords` | `{}` | Map keyword → list message custom. |

---

## 🎮 Commands

Mở Command Palette (`Ctrl+Shift+P`) và gõ `Anime Companion`:

| Command | Mô tả |
|---|---|
| `Anime Companion: Show` / `Hide` / `Toggle` | Bật/tắt panel companion |
| `Anime Companion: Change Model` | Quick pick chọn model (✓ ở model đang chọn) |
| `Anime Companion: Reset Workspace Model` | Bỏ model per-workspace, quay về global setting |
| `Anime Companion: Change Voice` | Quick pick chọn giọng |
| `Anime Companion: Change Message Language` | Quick pick chọn ngôn ngữ bubble |
| `Anime Companion: Toggle Mute` | Bật/tắt audio |
| `Anime Companion: Start Pomodoro` / `Stop Pomodoro` | Bắt đầu / dừng Pomodoro |
| `Anime Companion: Show Stats` | Mở quick stats |
| `Anime Companion: Show Achievements` | Mở danh sách achievements |
| `Anime Companion: Play Motion` | Chạy nhanh `TapBody` / `TapHead` / `Idle` |
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
npm test                 # Compile + smoke test
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
  stats.ts              StatsStore + achievement unlock
  models.ts             MODEL_MAP + workspace model
  model-downloader.ts   Lazy download/extract model zip
  model-server.ts       Local HTTP server cho model assets
  git-ops.ts            pull/push/commit có feedback
  messages.ts           Message bank + i18n + custom phrases
  log.ts                Output channel logger

media/
  webview/              Runtime webview (đã tách module)
    main.js · core.js · interaction.js
    audio.js · expression.js · ui.js
  audio/{ja,vi,en}/     MP3 cho từng ngôn ngữ
  messages/             Bubble text i18n
  live2d/               Cubism model assets
  lib/                  pixi-live2d-display + Cubism core
```

---

## 📚 Tài liệu

- [FEATURES.md](./FEATURES.md) — Mô tả chi tiết toàn bộ tính năng đã ship.
- [MODELS.md](./MODELS.md) — Thông tin model bundled, lazy download, custom local models.
- [CHANGELOG.md](./CHANGELOG.md) — Lịch sử thay đổi các version.
- [PLAN.md](./PLAN.md) — Roadmap (sprint hiện tại, ngắn hạn, trung hạn, vision).
- [CHECKLIST.md](./CHECKLIST.md) — Tiến độ từng task.
- [DECISIONS.md](./DECISIONS.md) — Ghi chú kiến trúc + technical decisions.
- [LICENSE-AUDIT.md](./LICENSE-AUDIT.md) — Ghi chú license/re-distribution cho model và audio.

---

## 📜 License

[MIT License](./LICENSE).

Live2D Cubism SDK, các model Live2D, và audio VoiceVox/Google TTS có license riêng. Các model không có quyền redistribute rõ ràng không còn được ship trong extension; nếu user tự tải về để dùng local thì cấu hình qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels` — xem [LICENSE-AUDIT.md](./LICENSE-AUDIT.md).

---

## 💖 Credit

- **Live2D Cubism Core SDK** — Live2D Inc.
- **Bundled / standard models:** Hiyori, Haru, Mao, Miara (Live2D Sample).
- **User-added local models:** do người dùng tự tải và tự chịu trách nhiệm license khi thêm qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels`.
- **Audio:** VoiceVox (Shikoku Metan) cho `ja`, Google TTS cho `vi` / `en`.

Made with 🌸 by [ShiroeNguyen](https://github.com/ShiroeNguyen).
