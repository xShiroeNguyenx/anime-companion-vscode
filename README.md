# 🌸 Anime Companion for VS Code

> Một bạn đồng hành Live2D dễ thương ngự ngay trong VS Code, phản ứng theo lúc bạn code: lỗi, save, commit, build, debug, Pomodoro… **và giờ có thể chat với bạn qua GitHub Copilot hoặc API key của bạn** (Anthropic / OpenAI / Gemini).

> ⚠️ **Experimental — v0.3.x.** Đây là bản early-access. API, settings, và behavior có thể thay đổi giữa các minor version trước khi đạt v1.0. Nếu bạn gặp bug hoặc có feedback, mở issue tại [GitHub](https://github.com/xShiroeNguyenx/anime-companion-vscode/issues) — rất welcome!

**Phiên bản hiện tại:** v0.3.0

> 🆕 **v0.3.0**: AI Chat Companion — chat trực tiếp với companion qua GitHub Copilot (không cần API key) hoặc BYOK Anthropic/OpenAI/Gemini. Streaming, multi-conversation, context-aware (selection / file / `#mention`), sentiment-driven Live2D reactions. Xem section [💬 AI Chat](#-ai-chat-companion-mới-trong-v030) bên dưới.

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

### 💬 AI Chat Companion (mới trong v0.3.0)
- **Chat trực tiếp với companion** qua panel slide-in cạnh Live2D character. Hỏi về code đang viết, lấy ý tưởng, học framework mới — companion giữ persona anime trong khi trả lời.
- **4 LLM provider** với 1 default no-key:
  - 🟢 **GitHub Copilot (mặc định, không cần API key)** — dùng subscription Copilot có sẵn qua `vscode.lm`. Hỗ trợ mọi model Copilot expose: gpt-4o, claude-3.5/3.7-sonnet, gemini-1.5-pro, o1-mini…
  - 🤖 **Anthropic Claude — BYOK**: claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5.
  - 🤖 **OpenAI GPT — BYOK**: gpt-4o, gpt-4o-mini, o1-mini.
  - 🤖 **Google Gemini — BYOK** (free tier khả thi): gemini-2.5-flash/pro/flash-lite, gemini-2.0-flash.
- **BYOK an toàn**: API keys lưu trong VS Code SecretStorage (OS keychain encrypted). Webview không bao giờ thấy key.
- **Streaming token-by-token** với sparkle caret ✨ + thinking dots animation 3 chấm hồng khi đợi response.
- **Multi-conversation**: persist history qua restart, list/rename/delete trong sidebar, active conversation per-workspace.
- **Context awareness**:
  - 📌 Toggle attach editor selection.
  - 📄 Toggle attach toàn bộ active file.
  - `#filename` — autocomplete picker file trong workspace.
  - Right-click code → "Ask Companion About Selection" → stage selection + open chat.
- **Sentiment reactions**: companion thật sự visibly phản ứng — câu trả lời vui → `TapBody` + happy mood; thinking → `TapHead` + idle; lỗi/buồn → sleepy.
- **Persona**: 4 preset (`cute` / `professional` / `tsundere` / `energetic`) hoặc custom system prompt riêng.
- **Avatar + tên** lấy từ Live2D model đang dùng — assistant bubble hiển thị "Hiyori" hoặc "Miara" thay vì "Companion" generic.

Quick start:
1. Mở panel Anime Companion (bottom panel hoặc `Ctrl+Shift+P` → `Anime Companion: Show`).
2. Click nút 💬 góc dưới phải để mở chat panel.
3. Mặc định provider là **GitHub Copilot** — chỉ cần đã sign in Copilot trong VS Code là gõ câu hỏi và Send.
4. Muốn dùng BYOK? Click ⚙ → đổi provider → click 🔑 → paste key.

### 🎭 Live2D Companion
- **4 model Live2D Sample** dùng Free Material License: **Hiyori**, **Haru**, **Mao**, **Miara**. Hiyori bundled trong `.vsix`, 3 model còn lại lazy download lần đầu chọn.
- Render bằng `pixi-live2d-display` + Cubism Core qua local HTTP server (bypass CSP của VS Code).
- Có fallback ảnh tĩnh nếu Live2D load lỗi.
- Expression blending mượt qua PIXI ticker — chuyển trạng thái cảm xúc không bị giật.
- Có thể thêm model local do chính user tự tải về qua setting `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels` (xem [MODEL_LICENSE_AUDIT.md](MODEL_LICENSE_AUDIT.md)).
- Nếu đang mở workspace, model được lưu theo từng workspace; có command reset về global model.

### 🐥 Cursor Chibi
- Có thể bật **chibi sprite bám theo con trỏ editor** bằng `Anime Companion: Toggle Cursor Chibi` hoặc setting `animeCompanion.cursorChase.enabled`.
- Có command `Anime Companion: Tune Cursor Chibi Position` để chỉnh live theo `Up/Down/Left/Right`, tăng giảm size, rồi lưu vào settings global.
- Có thể **capture chibi trực tiếp từ model Live2D đang render** bằng `Anime Companion: Capture Chibi from Model`; extension sẽ auto-crop nền trong suốt, scale gọn, rồi dùng ngay làm sprite cho model hiện tại.
- Có command `Anime Companion: Reset Captured Chibi` để xoá PNG đã capture và fallback về icon bundled.
- Chibi chỉ bám theo editor thật (`file`, `untitled`, `vscode-userdata`) để tránh leak sang Output / Debug Console.

### 🪟 Desktop Companion (Windows v1)
- Có thể chạy companion thành **cửa sổ desktop nổi riêng** thay vì chỉ nằm trong panel của VS Code.
- Bật bằng setting `animeCompanion.desktopCompanion.enabled`, sau đó reload window để áp dụng.
- Khi Desktop Companion bật, panel trong VS Code sẽ tự ẩn để tránh chạy 2 instance Live2D cùng lúc.
- Binary desktop pet được **lazy download** từ GitHub Releases ở lần bật đầu tiên; có thể override bằng `animeCompanion.desktopCompanion.devBinaryPath` khi test local.
- Hỗ trợ các tùy chọn `alwaysOnTop`, `clickThrough`, `size`, `position`, `opacity`.
- v1 hiện **Windows-only**. Mac/Linux chưa ship binary chính thức ở bản này.

### 💫 Tương tác đa dạng
- **Single Click** — chạm nhẹ (Surprised).
- **Double / Triple Click** — vui vẻ (Happy).
- **Long Press > 0.8s** — Headpat → Shy → Love kèm hiệu ứng trái tim.
- **Spam Click** — companion sẽ cáu (Angry) "Đừng bấm nữa!".

### 🔊 Audio + Lip-sync 3 ngôn ngữ
- **Japanese (ja)** — VoiceVox Shikoku Metan, giọng anime Nhật.
- **Tiếng Việt (vi)** — bundled lines + extended voice assets lazy-download khi cần.
- **English (en)** — bundled lines + extended voice assets lazy-download khi cần.
- Bubble message và voice tách riêng: có thể để voice `ja` nhưng text `vi` / `en` / `ja`.
- Tự động nhép môi qua `model.speak()`, fallback HTML5 Audio nếu PIXI Audio plugin gặp sự cố.
- Có thể tắt extended voice assets bằng `animeCompanion.voiceAssets.enableExtended` nếu muốn chỉ dùng audio bundled.

### 🎧 Background Ambient
- Có sẵn **3 preset ambient**: **Lofi**, **Rain**, **Cafe** để bật nhạc nền/không khí làm việc ngay trong companion.
- Ambient phát loop riêng với voice của companion, nên vẫn nghe được reaction voice + nhạc nền cùng lúc.
- Có thể tắt hẳn bằng preset `off` hoặc chỉnh volume bằng `animeCompanion.ambientVolume`.
- Hỗ trợ thêm **custom local ambient tracks** qua setting `animeCompanion.customAmbientTracks`.

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

### 🖱️ Custom Right-click Menu (15 mục)
Click chuột phải lên companion để mở menu inline — không phải mở Command Palette:

- 🚀 **Run** — restart-or-start debug session
- 📦 **Commit** — commit với guard cho protected branch (`main`/`master`/`production`), hỏi stage-all nếu cần, nhập message ngay trong webview
- ⬇️ **Pull** / ⬆️ **Push** — có feedback thật ("succeeded / nothing to do / failed")
- 🌸 **Model** — inline picker panel chọn model ngay trên character
- 🗣️ **Voice** — inline picker `ja` / `vi` / `en`
- 💬 **Messages** — đổi ngôn ngữ bubble `vi` / `en` / `ja`
- 🎧 **Ambient** — mở panel chọn `off` / `lofi` / `rain` / `cafe` và các track custom
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

### 🎵 Custom Ambient Tracks
Bạn có thể thêm track local của riêng mình để hiện trong Ambient panel:

```json
"animeCompanion.customAmbientTracks": [
  {
    "label": "My Lofi",
    "path": "D:/Music/lofi.mp3",
    "description": "Personal focus mix"
  }
]
```

Sau đó mở menu chuột phải → **Ambient** để chọn track. Volume dùng chung setting:

```json
"animeCompanion.ambientVolume": 30
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
code --install-extension anime-companion-vscode-0.3.0.vsix
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
| `animeCompanion.ambientPreset` | `off` | Ambient hiện tại: `off` / `lofi` / `rain` / `cafe` hoặc track custom. |
| `animeCompanion.ambientVolume` | `30` | Âm lượng ambient từ `0` đến `100`. |
| `animeCompanion.customAmbientTracks` | `[]` | Danh sách track ambient local tự thêm. |
| `animeCompanion.characterSize` | `medium` | `small` / `medium` / `large`. |
| `animeCompanion.showOnStartup` | `true` | Tự hiện panel khi VS Code khởi động. |
| `animeCompanion.messageIntervalMin` / `Max` | `10` / `20` | Khoảng cách giữa các idle bubble (giây). |
| `animeCompanion.pomodoroWorkTime` / `BreakTime` | `25` / `5` | Thời lượng work / break (phút). |
| `animeCompanion.breakReminderMinutes` | `30` | Phút code liên tục trước khi nhắc nghỉ. |
| `animeCompanion.cursorChase.enabled` | `false` | Bật chibi sprite bám theo vị trí con trỏ trong editor. |
| `animeCompanion.cursorChase.size` | `small` | Preset size cho cursor chibi: `small` / `medium` / `large`. |
| `animeCompanion.cursorChase.sizePx` | `0` | Override size pixel chính xác cho cursor chibi. `0` = dùng preset. |
| `animeCompanion.cursorChase.offsetX` / `offsetY` | `0` / `0` | Offset tinh chỉnh vị trí cursor chibi theo pixel. |
| `animeCompanion.reactive.diagnostics` | `true` | Toggle phản ứng theo errors/warnings. |
| `animeCompanion.reactive.save` | `true` | Toggle phản ứng theo save. |
| `animeCompanion.reactive.typing` | `true` | Toggle phản ứng tốc độ gõ + Easter eggs. |
| `animeCompanion.reactive.git` | `true` | Toggle Git polling. |
| `animeCompanion.quietHours` | `[]` | Khung giờ tắt message. |
| `animeCompanion.customPhrases.idle` | `[]` | Thêm câu cho idle bubble. |
| `animeCompanion.customPhrases.save` | `[]` | Thêm câu cho save reaction. |
| `animeCompanion.customPhrases.error` | `[]` | Thêm câu cho error reaction. |
| `animeCompanion.customKeywords` | `{}` | Map keyword → list message custom. |
| `animeCompanion.desktopCompanion.enabled` | `false` | Bật companion dạng cửa sổ desktop nổi thay cho panel VS Code. |
| `animeCompanion.desktopCompanion.alwaysOnTop` | `true` | Giữ cửa sổ Desktop Companion luôn nổi trên các cửa sổ khác. |
| `animeCompanion.desktopCompanion.clickThrough` | `false` | Cho phép click xuyên qua cửa sổ Desktop Companion. |
| `animeCompanion.desktopCompanion.size` | `medium` | Kích thước cửa sổ desktop: `small` / `medium` / `large`. |
| `animeCompanion.desktopCompanion.position` | `{ "anchor": "bottom-right" }` | Vị trí khởi tạo của Desktop Companion. |
| `animeCompanion.desktopCompanion.opacity` | `1` | Độ trong suốt của Desktop Companion, từ `0.5` đến `1`. |
| `animeCompanion.desktopCompanion.downloadBaseUrl` | GitHub Releases URL | Base URL để lazy-download binary desktop companion. |
| `animeCompanion.desktopCompanion.devBinaryPath` | `""` | Đường dẫn tuyệt đối tới binary local để test Desktop Companion. |
| `animeCompanion.voiceAssets.downloadBaseUrl` | GitHub Releases URL | Base URL để tải extended voice asset zip cho `en` / `vi`. |
| `animeCompanion.voiceAssets.enableExtended` | `true` | Cho phép lazy-download extended voice assets thay vì chỉ dùng audio bundled. |
| `animeCompanion.chat.provider` | `copilot` | LLM provider cho chat: `copilot` / `anthropic` / `openai` / `gemini`. Copilot không cần API key. |
| `animeCompanion.chat.model` | `""` | Override model id cho provider hiện tại. Empty = dùng default của provider. |
| `animeCompanion.chat.personaPreset` | `cute` | Preset persona: `cute` / `professional` / `tsundere` / `energetic`. Bỏ qua khi `systemPrompt` non-empty. |
| `animeCompanion.chat.systemPrompt` | `""` | Custom system prompt thay thế hoàn toàn persona preset. |
| `animeCompanion.chat.maxTokens` | `2048` | Max tokens generate mỗi response. Gemini 2.5 thinking models cần ≥ 2048. |
| `animeCompanion.chat.temperature` | `0.7` | Sampling temperature (0 = deterministic, càng cao càng creative). |
| `animeCompanion.chat.reactionsEnabled` | `true` | Sentiment-driven Live2D reactions sau khi chat reply. |

> ⚠️ **API keys không lưu ở `settings.json`** — luôn dùng command `Anime Companion: Set Chat API Key (BYOK)` để lưu vào VS Code SecretStorage encrypted.

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
| `Anime Companion: Toggle Cursor Chibi` | Bật/tắt chibi sprite đi theo con trỏ editor |
| `Anime Companion: Tune Cursor Chibi Position` | Chỉnh live vị trí và size của cursor chibi |
| `Anime Companion: Capture Chibi from Model` | Capture sprite PNG từ model đang render trong panel mode |
| `Anime Companion: Reset Captured Chibi (use bundled icon)` | Xoá sprite đã capture của model hiện tại |
| `Anime Companion: Start Pomodoro` / `Stop Pomodoro` | Bắt đầu / dừng Pomodoro |
| `Anime Companion: Show Stats` | Mở quick stats |
| `Anime Companion: Show Achievements` | Mở danh sách achievements |
| `Anime Companion: Play Motion` | Chạy nhanh `TapBody` / `TapHead` / `Idle` |
| `Anime Companion: Reset Companion Position` | Reset vị trí companion trong panel mode |
| `Anime Companion: Open Settings` | Mở Settings đã filter |
| `Anime Companion: Open Chat` | Mở chat panel + focus textarea |
| `Anime Companion: Set Chat API Key (BYOK)` | Lưu API key cho Anthropic/OpenAI/Gemini vào SecretStorage |
| `Anime Companion: New Chat Conversation` | Tạo conversation mới (reuse empty active nếu có) |
| `Anime Companion: Clear All Chat Conversations` | Xoá toàn bộ history (có confirm modal) |
| `Anime Companion: Ask Companion About Selection` | Stage code đang select rồi mở chat panel (cũng có ở editor right-click menu) |

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
  companion-message-dispatcher.ts  webview ↔ extension message routing
  reactive.ts           ReactiveManager — toàn bộ event hooks
  pomodoro.ts           PomodoroManager
  stats.ts              StatsStore + achievement unlock
  models.ts             MODEL_MAP + workspace model
  model-downloader.ts   Lazy download/extract model zip
  model-server.ts       Local HTTP server cho model assets
  git-ops.ts            pull/push/commit có feedback
  messages.ts           Message bank + i18n + custom phrases
  cursor-chibi.ts       Cursor chibi sprite manager
  log.ts                Output channel logger
  chat/                 AI chat module (v0.3.0+)
    chat-manager.ts        Orchestrator: provider routing + streaming
    secrets.ts             SecretStorage wrapper cho API keys
    persona.ts             Preset system prompts
    sentiment.ts           Sentiment heuristic → Live2D mood/motion
    conversation-store.ts  Multi-conversation file store
    context-builder.ts     Pack selection / active file / #mention
    sse-parser.ts          Server-Sent Events parser
    llm-provider.ts        Interface + factory
    providers/
      anthropic.ts · openai.ts · gemini.ts · copilot.ts

media/
  webview/              Runtime webview (đã tách module)
    main.js · core.js · interaction.js
    audio.js · expression.js · ui.js
    chat.js · chat.css           Chat panel UI
    cursor-chibi.css             Cursor chibi tuning widget (isolated)
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
- [MODEL_LICENSE_AUDIT.md](./MODEL_LICENSE_AUDIT.md) — Ghi chú license/re-distribution cho model và audio.

---

## 📜 License

[MIT License](./LICENSE).

Live2D Cubism SDK, các model Live2D, audio VoiceVox, và extended voice assets generated via ElevenLabs có license riêng. Các model không có quyền redistribute rõ ràng không còn được ship trong extension; nếu user tự tải về để dùng local thì cấu hình qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels` — xem [MODEL_LICENSE_AUDIT.md](./MODEL_LICENSE_AUDIT.md).

---

## 💖 Credit

- **Live2D Cubism Core SDK** — Live2D Inc.
- **Bundled / standard models:** Hiyori, Haru, Mao, Miara (Live2D Sample).
- **User-added local models:** do người dùng tự tải và tự chịu trách nhiệm license khi thêm qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels`.
- **Audio:** VoiceVox (Shikoku Metan) cho `ja`; `vi` / `en` dùng bundled audio và extended voice assets từ ElevenLabs.

Made with 🌸 by [xShiroeNguyenx](https://github.com/xShiroeNguyenx).
