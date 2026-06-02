<!-- Source of truth: ../README.md — keep sections in sync when editing. -->

# 🌸 Anime Companion for VS Code

> **Ngôn ngữ**: [English](../README.md) · **Tiếng Việt** · [日本語](README.ja.md)

> Một bạn đồng hành Live2D dễ thương ngự ngay trong VS Code, phản ứng theo lúc bạn code: lỗi, save, commit, build, debug, Pomodoro… **và giờ có thể chat với bạn** qua GitHub Copilot hoặc API key của bạn (Anthropic / OpenAI / Gemini / xAI / DeepSeek / OpenRouter / Ollama).

> ⚠️ **Experimental — v0.4.x.** Đây là bản early-access. API, settings, và behavior có thể thay đổi giữa các minor version trước khi đạt v1.0. Nếu bạn gặp bug hoặc có feedback, mở issue tại [GitHub](https://github.com/xShiroeNguyenx/anime-companion-vscode/issues) — rất welcome!

**Phiên bản hiện tại:** v0.4.2

> 🆕 **Có gì mới ở v0.4.2**:
> - **🪪 Lưu tài khoản Claude ổn định hơn** — tài khoản Claude **team/SSO** (không có `organizationUuid` ở top level) giờ lưu được và nhận diện đúng tài khoản đang active, thay vì bị bỏ qua âm thầm. Tài khoản vẫn nhận diện được kể cả khi org id nằm trong oauth blob hoặc không có.
> - **🐙 Swap tài khoản GitHub** — đổi tài khoản GitHub mà extension dùng cho **Copilot**, phạm vi *toàn cục*, từ panel Agent Accounts, status bar, command palette, hoặc pet → **Agent › GitHub Account…**. Dựa trên auth của VS Code nên **không** đổi danh tính commit git hay ảnh hưởng extension khác. Gộp chung với swap credential Claude · Codex trong một UI Accounts.
>
> Kế thừa từ **v0.4.0**: Agent Accounts (swap credential Claude/Codex) và 💬 Pet Quick Chat.

![Anime Companion hero](images/01-hero-companion-panel.png)

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

### 💬 AI Chat Companion

![Chat panel streaming](images/03-chat-panel-streaming.png)

- **Chat trực tiếp với companion** qua panel slide-in cạnh Live2D character. Hỏi về code đang viết, lấy ý tưởng, học framework mới — companion giữ persona anime trong khi trả lời.
- **8 LLM provider** với 1 default no-key:
  - 🟢 **GitHub Copilot (mặc định, không cần API key)** — dùng subscription Copilot có sẵn qua `vscode.lm`. Hỗ trợ mọi model Copilot expose: gpt-4o, claude-3.5/3.7-sonnet, gemini-1.5-pro, o1-mini…
  - 🤖 **Anthropic Claude — BYOK**: claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5.
  - 🤖 **OpenAI GPT — BYOK**: gpt-4o, gpt-4o-mini, o1-mini.
  - 🤖 **Google Gemini — BYOK** (free tier khả thi): gemini-2.5-flash/pro/flash-lite, gemini-2.0-flash.
  - 🆕 **xAI Grok — BYOK**: grok-2-latest, grok-3, grok-beta.
  - 🆕 **DeepSeek — BYOK**: deepseek-chat, deepseek-reasoner (ẩn chain-of-thought).
  - 🆕 **OpenRouter — BYOK**: gateway tới 100+ model gồm cả `:free` tier (Claude, GPT, Llama, Gemini, DeepSeek, …) chỉ với 1 key duy nhất.
  - 🆕 **Ollama (local, không key)** — talk với Ollama server local (default `http://localhost:11434`). Fully offline. Pull bất kỳ model nào với `ollama pull llama3.2`.

![Provider picker](images/04-chat-provider-picker.png)

- **BYOK an toàn**: API keys lưu trong VS Code SecretStorage (OS keychain encrypted). Webview không bao giờ thấy key.
- **Streaming token-by-token** với sparkle caret ✨ + thinking dots animation 3 chấm hồng khi đợi response.
- **Multi-conversation**: persist history qua restart, list/rename/delete trong sidebar, active conversation per-workspace.
- **Context awareness**:
  - 📌 Toggle attach editor selection.
  - 📄 Toggle attach toàn bộ active file.
  - `#filename` — autocomplete picker file trong workspace.
  - Right-click code → "Ask Companion About Selection" → stage selection + open chat.

![Context mention](images/05-chat-context-mention.png)

- **Sentiment reactions**: companion thật sự visibly phản ứng — câu trả lời vui → `TapBody` + happy mood; thinking → `TapHead` + idle; lỗi/buồn → sleepy.
- **Copy câu trả lời** 1 click: mỗi assistant bubble đã hoàn thành có nút clipboard nhỏ góc dưới phải (ẩn khi đang stream). Click → swap sang checkmark với pop animation, bubble flash xanh. Copy raw markdown — không dính label "Copy" từ code blocks bên trong reply.
- **Persona**: 4 preset (`cute` / `professional` / `tsundere` / `energetic`) hoặc custom system prompt riêng.
- **Avatar + tên** lấy từ Live2D model đang dùng — assistant bubble hiển thị "Hiyori" hoặc "Miara" thay vì "Companion" generic.

**Quick start:**
1. Mở panel Anime Companion (bottom panel hoặc `Ctrl+Shift+P` → `Anime Companion: Show`).
2. Click nút 💬 góc dưới phải để mở chat panel.
3. Mặc định provider là **GitHub Copilot** — chỉ cần đã sign in Copilot trong VS Code là gõ câu hỏi và Send.
4. Muốn dùng BYOK hoặc Ollama? Click ⚙ → đổi provider → click 🔑 → paste key (hoặc set endpoint cho Ollama).

### 🎭 Live2D Companion

![Live2D models](images/02-live2d-models-gallery.png)

- **4 model Live2D Sample** dùng Free Material License: **Hiyori**, **Haru**, **Mao**, **Miara**. Hiyori bundled trong `.vsix`, 3 model còn lại lazy download lần đầu chọn.
- Render bằng `pixi-live2d-display` + Cubism Core qua local HTTP server (bypass CSP của VS Code).
- **Live panel resize**: kéo panel VS Code cao/thấp/rộng thì character tự refit realtime. Works cả ở default flex layout lẫn sau khi đã drag companion sang chỗ khác — không bao giờ cắt chân nhờ bottom breathing margin nhỏ cho animation sway.
- Có fallback ảnh tĩnh nếu Live2D load lỗi.
- Expression blending mượt qua PIXI ticker — chuyển trạng thái cảm xúc không bị giật.
- Có thể thêm model local do chính user tự tải về qua setting `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels` (xem [MODEL_LICENSE_AUDIT.md](../MODEL_LICENSE_AUDIT.md)).
- Nếu đang mở workspace, model được lưu theo từng workspace; có command reset về global model.

### 🐥 Cursor Chibi

![Cursor chibi](images/07-cursor-chibi.png)

- Có thể bật **chibi sprite bám theo con trỏ editor** bằng `Anime Companion: Toggle Cursor Chibi` hoặc setting `animeCompanion.cursorChase.enabled`.
- Có command `Anime Companion: Tune Cursor Chibi Position` để chỉnh live theo `Up/Down/Left/Right`, tăng giảm size, rồi lưu vào settings global.
- Có thể **capture chibi trực tiếp từ model Live2D đang render** bằng `Anime Companion: Capture Chibi from Model`; extension sẽ auto-crop nền trong suốt, scale gọn, rồi dùng ngay làm sprite cho model hiện tại.
- Có command `Anime Companion: Reset Captured Chibi` để xoá PNG đã capture và fallback về icon bundled.
- Chibi chỉ bám theo editor thật (`file`, `untitled`, `vscode-userdata`) để tránh leak sang Output / Debug Console.

### 🪪 Agent Accounts (swap tài khoản Claude / Codex)

- **Lưu nhiều tài khoản agent-CLI rồi đổi qua lại mà không cần đăng nhập lại.** Companion snapshot file credential của từng CLI rồi restore atomically khi switch — y tinh thần PowerShell script tự viết để đổi tài khoản, nhưng được port sang Node `fs` cross-platform và gắn thẳng vào right-click menu của pet.
- **Backend registry tool-agnostic** — thêm CLI mới chỉ cần 1 file backend (interface `AccountBackend`) + 1 dòng `registerBackend(...)`. Toàn bộ UI (popup, panel, status bar, command palette) tự discover qua registry.
- **Backend đã ship:**
  - 🤖 **Claude Code** — snapshot `~/.claude/.credentials.json` + settings; identity hiển thị dạng `sub=team · org=09eb97ad · exp=…` để dễ phân biệt tài khoản.
  - ⚡ **Codex** — snapshot `~/.codex/auth.json`; identity hiển thị `mode=chatgpt · email · plan=plus` (decode từ payload JWT id_token, không in token).
- **Per-tool active detection** — không tin vào lần switch cuối, extension đọc credential live của từng backend rồi match signature với snapshot. Vậy nên swap bằng tool ngoài (PowerShell script) cũng được phản ánh đúng. Nhiều tool có thể "active" đồng thời — Claude tài khoản A *cùng lúc* Codex tài khoản B.
- **Popup ngay tại pet** — right-click pet → **Agent ›**:
  - **🔁 Đổi nhanh** — list profile group theo tool, click row để swap.
  - **💾 Lưu hồ sơ hiện tại** — inline tool picker (auto chọn khi 1, buttons khi ≥2) + input tên — tất cả bám theo pet, không nhảy lên VS Code QuickPick.
  - **👀 Quản lý hồ sơ…** — webview panel đầy đủ với Use / Rename / Delete + section theo tool.
- **Status bar item** — hiển thị profile đang active (hoặc "N accounts" + tooltip khi nhiều tool). Click → Quick Switch.
- **Restore an toàn** — mỗi file ghi qua `<final>.tmp` rồi `fs.rename`. Rolling 3 backup per tool trước mỗi restore. Snapshot rỗng/thiếu → từ chối, không clobber credential live.
- **Nhắc restart CLI** — sau mỗi swap, info toast nhắc restart `claude` / `codex` để load token mới. Extension không tự kill process.

**Quick start:**
1. Đăng nhập `claude` (hoặc `codex`) trong terminal để có file credential.
2. Right-click pet → **Agent → 💾 Lưu tài khoản hiện tại…** → đặt tên (vd `work`).
3. Logout, login tài khoản thứ 2, lặp lại với tên khác (vd `personal`).
4. Right-click pet → **Agent → 🔁 Đổi nhanh** → chọn → credential được swap. Restart CLI để dùng tài khoản mới.

### 🪟 Desktop Companion (Windows v1)

![Desktop pet](images/06-desktop-pet-window.png)

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

![Ambient menu](images/10-ambient-menu.png)

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

![Achievements](images/09-achievements-panel.png)

- Có sẵn **23 thành tựu**: 6 chain tiến hóa cho `save`, `fix bug`, `commit`, `thời gian code`, `AI chat`, `Pomodoro`, cộng thêm 4 secret achievements.
- Panel achievements giờ hiển thị dạng **evolution tree** ngay trên companion, có rarity (`Common` → `Mythic`), hiệu ứng unlock theo độ hiếm, lane riêng cho từng chain và lane bí mật chỉ hé hint trước khi unlock.
- Cùng panel đó giờ có thêm **daily / weekly quest** và khu **companion memory** để nhắc lại các thành tựu, quest và cột mốc mà hai bên đã mở cùng nhau.
- Phần thưởng local-first cũng đã có thật: quest và achievement giờ cấp `gems`, `tickets`, cosmetic và voice pack, hoàn toàn offline-friendly và không cần backend.
- Có command xem achievements ngay trong VS Code, kèm fallback Quick Pick nếu panel không mở.

### 📊 Stats
- Theo dõi số lần `save`, `commit`, số lỗi đã fix, thời gian code hôm nay, tổng thời gian code all-time, số lần hỏi AI, tiến độ Pomodoro, quest đang chạy và các memory gần đây.
- Có thêm **profile local** gồm level, affinity, top achievement, inventory unlock và export **share card PNG**.
- Có command mở quick view stats ngay trong VS Code.

### 🍅 Pomodoro tích hợp

![Pomodoro running](images/08-pomodoro-running.png)

- Vòng work/break tự động (mặc định 25/5 phút, tuỳ chỉnh được).
- Status bar hiển thị countdown `🔥 23:42` lúc đang focus, `☕ 04:12` lúc break.
- Có overlay ring ngay trên companion.
- Click status bar để stop nhanh.

### 🖱️ Custom Right-click Menu

![Right-click menu](images/11-rightclick-menu.png)

Click chuột phải lên companion để mở menu inline — không phải mở Command Palette:

- 🚀 **Run** — restart hoặc start debug session
- 🔧 **Git** — `Commit`, `Pull`, `Push`
- 💬 **Chat AI** — `Quick Chat`; ở panel mode có thêm `Open Chat`, `New Conversation`, `Ask About Selection`, `Configure Provider`, `Clear All`
- 🌸 **Diện mạo** — `Model`, `Capture Chibi`, `Toggle Cursor Chibi`, `Tune Cursor Chibi`, `Reset Position`, `Motion`, `Poke`
- 🔊 **Âm thanh** — `Voice`, `Messages`, `Ambient`, `Mute` / `Unmute`
- 🍅 **Quy trình** — `Start Pomodoro`, `Stop Pomodoro`, `Stats`, `Achievements`, `Quests`, `Profile`, `Share Card`
- 🪪 **Agent** — `Quản lý tài khoản…`, `Đổi nhanh…`, `Lưu tài khoản hiện tại…`, `Tài khoản GitHub…` (swap tài khoản Claude · Codex · GitHub; popup gắn ngay tại pet)
- 🖥️ **Desktop Companion** — `Switch to Desktop` / `Switch to Panel`, thêm `Toggle Click-Through` khi đang ở desktop mode, và `Reset Workspace Model`
- ⚙️ **All Settings** — mở Settings UI đã filter sẵn

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

## ⚙️ Cấu hình

![Settings UI](images/12-settings-ui.png)

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
| `animeCompanion.chat.provider` | `copilot` | LLM provider cho chat: `copilot` / `anthropic` / `openai` / `gemini` / `xai` / `deepseek` / `openrouter` / `ollama`. Copilot và Ollama không cần API key. |
| `animeCompanion.chat.ollamaEndpoint` | `http://localhost:11434` | Base URL của Ollama server local. KHÔNG bao gồm `/api/chat` — path được append tự động. |
| `animeCompanion.chat.model` | `""` | Override model id cho provider hiện tại. Empty = dùng default của provider. |
| `animeCompanion.chat.personaPreset` | `cute` | Preset persona: `cute` / `professional` / `tsundere` / `energetic`. Bỏ qua khi `systemPrompt` non-empty. |
| `animeCompanion.chat.systemPrompt` | `""` | Custom system prompt thay thế hoàn toàn persona preset. |
| `animeCompanion.chat.maxTokens` | `2048` | Max tokens generate mỗi response. Gemini 2.5 thinking models cần ≥ 2048. |
| `animeCompanion.chat.temperature` | `0.7` | Sampling temperature (0 = deterministic, càng cao càng creative). |
| `animeCompanion.chat.reactionsEnabled` | `true` | Sentiment-driven Live2D reactions sau khi chat reply. |

> ⚠️ **API keys không lưu ở `settings.json`** — luôn dùng command `Anime Companion: Configure Chat Provider (API Key / Endpoint)` để lưu vào VS Code SecretStorage encrypted. Cùng command này cũng set endpoint cho Ollama.

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
| `Anime Companion: Show Quests` | Mở danh sách quest ngày / tuần |
| `Anime Companion: Show Profile` | Mở hồ sơ local của companion |
| `Anime Companion: Export Share Card` | Xuất thẻ chia sẻ PNG |
| `Anime Companion: Play Motion` | Chạy nhanh `TapBody` / `TapHead` / `Idle` |
| `Anime Companion: Reset Companion Position` | Reset vị trí companion trong panel mode |
| `Anime Companion: Open Settings` | Mở Settings đã filter |
| `Anime Companion: Open Chat` | Mở chat panel + focus textarea |
| `Anime Companion: Configure Chat Provider (API Key / Endpoint)` | Chọn provider → lưu API key vào SecretStorage, HOẶC set endpoint Ollama |
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
      anthropic.ts · openai-compatible.ts · gemini.ts · copilot.ts · ollama.ts

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

- [README.md](../README.md) — Phiên bản English.
- [README.ja.md](README.ja.md) — Phiên bản 日本語.
- [FEATURES.md](../FEATURES.md) — Mô tả chi tiết toàn bộ tính năng đã ship.
- [MODELS.md](../MODELS.md) — Thông tin model bundled, lazy download, custom local models.
- [CHANGELOG.md](../CHANGELOG.md) — Lịch sử thay đổi các version.
- [PLAN.md](../PLAN.md) — Roadmap (sprint hiện tại, ngắn hạn, trung hạn, vision).
- [PLAN_v0.3.1.md](PLAN_v0.3.1.md) — Implementation plan v0.3.1 + work defer cho v0.4.0.
- [CHECKLIST.md](../CHECKLIST.md) — Tiến độ từng task.
- [DECISIONS.md](../DECISIONS.md) — Ghi chú kiến trúc + technical decisions.
- [MODEL_LICENSE_AUDIT.md](../MODEL_LICENSE_AUDIT.md) — Ghi chú license/re-distribution cho model và audio.

---

## 📜 License

[MIT License](../LICENSE).

Live2D Cubism SDK, các model Live2D, audio VoiceVox, và extended voice assets generated via ElevenLabs có license riêng. Các model không có quyền redistribute rõ ràng không còn được ship trong extension; nếu user tự tải về để dùng local thì cấu hình qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels` — xem [MODEL_LICENSE_AUDIT.md](../MODEL_LICENSE_AUDIT.md).

---

## 💖 Credit

- **Live2D Cubism Core SDK** — Live2D Inc.
- **Bundled / standard models:** Hiyori, Haru, Mao, Miara (Live2D Sample).
- **User-added local models:** do người dùng tự tải và tự chịu trách nhiệm license khi thêm qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels`.
- **Audio:** VoiceVox (Shikoku Metan) cho `ja`; `vi` / `en` dùng bundled audio và extended voice assets từ ElevenLabs.

Made with 🌸 by [xShiroeNguyenx](https://github.com/xShiroeNguyenx).
