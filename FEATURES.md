# 🌸 Anime Companion VS Code Extension — Features Documentation

Tài liệu mô tả chi tiết các tính năng đã được lập trình và tích hợp tính đến **v0.1.20** (cập nhật 2026-04-29). Roadmap chi tiết ở [PLAN.md](./PLAN.md), tiến độ ở [CHECKLIST.md](./CHECKLIST.md).

---

## 1. Hệ thống Nhân vật Live2D

- **Framework:** `pixi-live2d-display` + `Live2D Cubism Core` + PIXI.js render trực tiếp trong VS Code Webview View (panel area).
- **Local HTTP Server:** Express server cực nhẹ ([src/model-server.ts](src/model-server.ts)) chạy ngầm ở port tự cấp phát, bypass CORS / Strict CSP của VS Code để webview có thể `fetch` file `.moc3`, `.model3.json`, texture, audio. Server tự khởi động ở `activate()` và dừng ở `deactivate()`.
- **7 Model có sẵn** (cấu hình ở [src/models.ts](src/models.ts), chọn qua setting `animeCompanion.model`):

  | ID | Tên | Nguồn |
  |---|---|---|
  | `hiyori` | Hiyori | Live2D Sample (mặc định) |
  | `cheshire` | Cheshire | Azur Lane |
  | `icegirl` | Ice Girl | TianYeLuLu |
  | `tsubaki` | Tsubaki | 11月椿 |
  | `whiteangel` | White Angel | 白发天使 |
  | `vivian` | Vivian | 薇薇安 |
  | `changli` | Changli | 长离 |

- **Hot-swap model:** Đổi setting `animeCompanion.model` hoặc dùng command `Anime Companion: Change Model` (quick pick có chấm ✓ ở model đang chọn) → view tự refresh, không cần reload window.

---

## 2. Hệ thống Tương tác & Biểu cảm

### Click & Touch
- **Single Click (Poke):** Chạm nhẹ → biểu cảm ngạc nhiên (Surprised), bubble ngẫu nhiên kiểu "Ơ chạm vào mình làm gì vậy?".
- **Double / Triple Click:** Bấm nhanh 2–3 lần → vui vẻ (Happy), khen ngợi.
- **Long Press (Headpat):** Giữ chuột > 0.8s → Shy → Love kèm hiệu ứng trái tim, "Dễ chịu quá nha~".
- **Spam Click (>5 clicks ngắn):** Cáu (Angry), "Đừng bấm nữa, chóng mặt quá đi!".

### Animation & Expression
- **Motion Groups Live2D:** gọi trực tiếp `TapBody`, `TapHead`, `Idle`… tương ứng với hành động.
- **Expression Blending mượt:** tweening các param Live2D (`ParamEyeLOpen`, `ParamMouthSmile`, `ParamCheek`, `ParamMouthOpenY`, …) qua PIXI ticker để chuyển trạng thái cảm xúc không bị giật.
- **Mood-driven idle:** companion nghiêng nhẹ, đổi nét mặt theo mood hiện tại (xem §5).

### Particle FX
- **Sparkle:** hệ thống particle đơn giản tạo các hạt lấp lánh bay lên khi tương tác / khi unlock achievement.

---

## 3. Hệ thống Âm thanh & Lip-sync

- **Auto Lip-sync:** dùng `model.speak()` của `pixi-live2d-display`. Khi phát file mp3, thư viện phân tích waveform và điều khiển `ParamMouthOpenY` để mấp máy môi khớp với tiếng.
- **Fallback Audio:** nếu plugin Audio của PIXI gặp sự cố, hệ thống tự fallback về `HTML5 Audio` thuần để đảm bảo tiếng vẫn phát ra.
- **Đa ngôn ngữ giọng** (`animeCompanion.voiceLanguage`):
  - `ja` — VoiceVox (Shikoku Metan), giọng anime Nhật.
  - `vi` — Google TTS Tiếng Việt.
  - `en` — Google TTS English.
  - Legacy `ja-vi` (cũ) tự động được migrate sang `en` ở activate.
- **Mute toàn cục:** setting `animeCompanion.muted` hoặc command `Anime Companion: Toggle Mute`. Khi mute, mood/expression vẫn chạy — chỉ tắt audio.

---

## 4. Giao diện (UI/UX)

- **Webview View Panel:** companion ngự trong panel area của VS Code (bottom panel) qua `viewsContainers.panel.animeCompanionPanel` → có thể drag sang sidebar nếu thích.
- **Chat Bubble:** Glassmorphism (làm mờ viền), gradient hồng/tím, hợp dark theme. Bubble đồng bộ với hành động + audio.
- **Custom Right-click Context Menu** — HTML/CSS overlay tự render trong webview (bỏ menu mặc định), 10 mục, logic ở [media/webview/interaction.js:151-267](media/webview/interaction.js#L151-L267):
  - 🐞 **Run** (`animeCompanion.runProject` → restart-or-start debug session)
  - 📦 **Commit** — đi qua flow `commitWithFeedback` ([src/git-ops.ts](src/git-ops.ts)): hỏi commit message, hỏi xác nhận khi staged trống (auto stage all), cảnh báo khi đang ở **protected branch** (`main`/`master`/`develop`).
  - ⬇️ **Pull** / ⬆️ **Push** — `pullWithFeedback` / `pushWithFeedback` cho feedback "succeeded / nothing to do / failed" rõ ràng (không fire-and-forget).
  - 🌸 **Model** — mở **inline Model picker panel** ngay trên character (không phải quick pick), chọn 1 trong 7 model. Highlight model đang chọn. Click ngoài để đóng.
  - 🗣️ **Voice** — mở **inline Voice picker panel** trên character cho `ja` / `vi` / `en`, highlight giọng đang dùng.
  - 🔇 / 🔊 **Mute** — toggle mute trực tiếp ngay tại menu, label + icon tự đổi theo state (`Mute` ↔ `Unmute`) qua `syncMuteMenuLabel`.
  - 👉 **Poke** — chạm model + bắn motion `TapBody`.
  - 🍅 **Pomodoro** — start pomodoro.
  - ⚙️ **Settings** — mở Settings UI đã filter `@ext:shiroenguyen.anime-companion-vscode` qua `animeCompanion.openSettings`.
- **Context-menu Help:** mở chuột phải → bubble hint + audio "help" hướng dẫn các mục.
- **Dynamic visibility:** setting `animeCompanion.visible` (context key) cho phép hide/show panel mà vẫn giữ state webview (`retainContextWhenHidden: true`).

---

## 5. Reactive Engine — Phản ứng theo môi trường

Toàn bộ wired ở [src/reactive.ts](src/reactive.ts). Mỗi kênh reactive có thể bật/tắt độc lập qua settings.

### 5.1 Diagnostics (errors / warnings)
- `vscode.languages.onDidChangeDiagnostics` track tổng số error trong workspace.
- **Tăng error** → bubble than vãn ("Ơ kìa lỗi rồi…"), motion / expression "angry".
- **Giảm error** → bubble khen ("Nice, sạch lỗi rồi! 😎"), tăng counter `_totalErrorsFixed`.
- **Nhiều error đột biến** → bubble dạng "Bạn có {count} lỗi… chúc may mắn 😏".
- Toggle: `animeCompanion.reactive.diagnostics`.

### 5.2 Save events
- `onDidSaveTextDocument` → bubble cổ vũ kiểu "Đã save! 💾".
- **Spam-save detection:** save liên tục (≥3 save trong vài giây) → bubble trêu "Ctrl+S warrior detected! 🛡️".
- Toggle: `animeCompanion.reactive.save`.

### 5.3 Typing speed & Easter eggs
- `onDidChangeTextDocument` đếm keystroke trong cửa sổ thời gian:
  - **Typing nhanh** → "Speed coding mode activated! 💨".
  - **Easter eggs** trên nội dung diff: thêm `TODO`, `FIXME`, `console.log` → bubble cảm thán riêng cho từng keyword.
- Toggle: `animeCompanion.reactive.typing`.

### 5.4 Build & Debug
- `tasks.onDidEndTaskProcess` → "Build OK! 🎉" hoặc "Toang rồi 😭" theo `exitCode`.
- `debug.onDidStartDebugSession` → "Debug time! 🔍".
- `debug.onDidTerminateDebugSession` → "Xong debug rồi à? Tìm ra chưa? 😏".

### 5.5 Git polling
- Đọc Git extension API định kỳ:
  - **Branch switch** → "Đổi branch rồi à? Branch {name} nha~ 🌿".
  - **New commits** (HEAD count tăng) → "Commit rồi nha! 📦✅", tăng `_totalCommits`.
  - **Merge conflict** (file ở state Conflicted) → "Merge conflict kìa! 😨".
  - **Many uncommitted changes** → "{count} files thay đổi rồi, commit sớm nha!".
  - **Stale repo** (lâu không commit) → "Lâu rồi chưa commit, nhớ commit nha!".
- Toggle: `animeCompanion.reactive.git`.

### 5.6 Mood System
4 trạng thái: `idle` · `happy` · `angry` · `sleepy`. Mood ảnh hưởng tới expression baseline và tần suất bubble.
- Không error + đang gõ → drift về `happy`.
- Nhiều error / build fail → `angry`.
- Lâu không hoạt động → `sleepy` ("Zzz... bạn đâu rồi?").

### 5.7 Time-based greetings
Mở extension lần đầu trong ngày → bubble theo khung giờ: morning / afternoon / evening / night. Sau 2h sáng có message riêng "2 giờ sáng rồi đó, ngủ đi! 😴".

### 5.8 Break reminder
Sau `animeCompanion.breakReminderMinutes` phút code liên tục → nhắc nghỉ ngơi ("Code {mins} phút rồi, nghỉ chút đi! ⏰", "Uống nước chưa bạn? 💧").

### 5.9 Achievements (primitive)
Ngay khi đạt ngưỡng, bubble unlock + achievement message:

| Key | Điều kiện |
|---|---|
| `save50` | Save 50 lần |
| `save100` | Save 100 lần |
| `error_fix_10` | Fix 10 lỗi |
| `error_fix_50` | Fix 50 lỗi |
| `coding_1h` | Code 1 tiếng liên tục |
| `coding_3h` | Code 3 tiếng liên tục |
| `commit10` | Đạt 10 commits |

Lưu trong `Set<string>` của ReactiveManager (in-memory cho session).

### 5.10 Quiet Hours
Setting `animeCompanion.quietHours` — array khung giờ kiểu `["09:00-12:00", "22:00-06:00"]`. Trong khung giờ này, **mọi bubble message bị suppress**, nhưng mood/expression vẫn cập nhật bình thường. Hỗ trợ khung giờ vắt qua nửa đêm.

---

## 6. Pomodoro

- **Manager:** [src/pomodoro.ts](src/pomodoro.ts). Vòng lặp work → break → work…
- Settings: `animeCompanion.pomodoroWorkTime` (mặc định 25 phút), `animeCompanion.pomodoroBreakTime` (mặc định 5 phút).
- Commands: `Anime Companion: Start Pomodoro` / `Anime Companion: Stop Pomodoro` (cũng có trong context menu).
- **Status bar countdown:** khi chạy, status bar item swap sang `🍅 MM:SS` (work) hoặc `☕ MM:SS` (break, có warning background). Click → stop. Khi idle, item hiển thị tên model + click để toggle panel.
- Bubble tự bắn ở các mốc: start work, start break, end break.

---

## 7. Status Bar Item

[src/extension.ts:43-95](src/extension.ts#L43-L95) — single slot ở `StatusBarAlignment.Right` (priority 100):

- **Idle:** `$(heart) {ModelName}` + tooltip mô tả model. Click → `animeCompanion.toggle` (toggle visibility panel).
- **Pomodoro work:** `🍅 MM:SS` countdown, click → stop pomodoro.
- **Pomodoro break:** `☕ MM:SS` countdown, click → stop, background warning theme color.
- **Auto-refresh:** tự cập nhật khi đổi setting `animeCompanion.model`.

---

## 8. Commands & Keyboard

Đăng ký ở [src/extension.ts:175-264](src/extension.ts#L175):

| Command ID | Title |
|---|---|
| `animeCompanion.show` | Show companion |
| `animeCompanion.hide` | Hide companion |
| `animeCompanion.toggle` | Toggle visibility |
| `animeCompanion.changeModel` | Change Model (quick pick) |
| `animeCompanion.changeVoice` | Change Voice (quick pick `ja`/`vi`/`en`) |
| `animeCompanion.toggleMute` | Toggle Mute |
| `animeCompanion.startPomodoro` | Start Pomodoro |
| `animeCompanion.stopPomodoro` | Stop Pomodoro |
| `animeCompanion.openSettings` | Mở Settings UI đã filter `@ext:shiroenguyen.anime-companion-vscode` |
| `animeCompanion.runProject` | Restart-or-start debug session với feedback bubble + motion |

---

## 9. Cấu hình (Settings)

Toàn bộ ở `contributes.configuration` trong [package.json:94-215](package.json#L94-L215).

| Key | Type | Default | Mô tả |
|---|---|---|---|
| `animeCompanion.model` | enum | `hiyori` | Chọn 1 trong 7 model. |
| `animeCompanion.voiceLanguage` | enum | `ja` | Giọng nói: `ja` / `vi` / `en`. |
| `animeCompanion.muted` | boolean | `false` | Tắt toàn bộ audio. |
| `animeCompanion.characterSize` | enum | `medium` | `small` / `medium` / `large`. |
| `animeCompanion.showOnStartup` | boolean | `true` | Tự hiện panel khi VS Code khởi động. |
| `animeCompanion.messageIntervalMin` | number (5–120) | `10` | Khoảng cách min giữa các idle bubble (giây). |
| `animeCompanion.messageIntervalMax` | number (10–300) | `20` | Khoảng cách max giữa các idle bubble (giây). |
| `animeCompanion.pomodoroWorkTime` | number | `25` | Thời lượng work phút. |
| `animeCompanion.pomodoroBreakTime` | number | `5` | Thời lượng break phút. |
| `animeCompanion.breakReminderMinutes` | number (10–120) | `30` | Phút code liên tục trước khi nhắc nghỉ. |
| `animeCompanion.reactive.diagnostics` | boolean | `true` | Toggle phản ứng theo errors/warnings. |
| `animeCompanion.reactive.save` | boolean | `true` | Toggle phản ứng theo save (kèm spam-save). |
| `animeCompanion.reactive.typing` | boolean | `true` | Toggle phản ứng tốc độ gõ + Easter eggs. |
| `animeCompanion.reactive.git` | boolean | `true` | Toggle Git polling (branch / commit / conflict / many changes). |
| `animeCompanion.quietHours` | string[] | `[]` | Khung giờ tắt message, ví dụ `["09:00-12:00", "22:00-06:00"]`. |

---

## 10. Tích hợp IDE

- **`startDebuggingFromContext`** ([extension.ts:10-37](src/extension.ts#L10-L37)): nếu đang có active debug session → gọi `workbench.action.debug.restart`; nếu không, đọc `launch.json` của workspace folder và start config đầu tiên; fallback `workbench.action.debug.selectandstart`.
- **Git Extension API:** dùng trực tiếp Git extension của VS Code (không spawn `git` CLI) cho commit / pull / push, đồng thời poll repo state cho reactive engine.
- **Output channel "Anime Companion":** logger tập trung ở [src/log.ts](src/log.ts) — toàn bộ command, error, server start, version migration, command failure đều được ghi lại để debug.
- **Version-change toast** ([extension.ts:121-128](src/extension.ts#L121-L128)): mỗi lần version trong `package.json` đổi (sau install/upgrade), extension bắn `showInformationMessage` xác nhận build mới đã active — giải quyết "reload-after-install friction".
- **Webview ↔ Extension postMessage protocol:** view gửi `poke` / `headpat` / `spamClick` / `multiClick` / `runCommand` / `setModel` / `setVoiceLanguage` / `setMuted` / `confirmDialogResult` / `inputDialogResult` / `live2dReady`. Extension phản hồi bằng `setExpression` / `playMotion` / `setMood` / `pomodoroStart` / `pomodoroBreak` / `pomodoroStop` / `requestConfirm` / `requestInput`.

---

## 11. Cấu trúc Code & Build

### Layout
```
src/
  extension.ts          ~280 dòng — activate, status bar, commands
  companion-view.ts     ~447 dòng — WebviewViewProvider, idle bubble timer
  reactive.ts           ~522 dòng — ReactiveManager (toàn bộ event hooks)
  pomodoro.ts                     — PomodoroManager
  models.ts                       — MODEL_MAP
  model-server.ts                 — Local Express HTTP server
  git-ops.ts                      — pull/push/commit có feedback
  log.ts                          — output channel logger

media/
  webview/                        — runtime webview, đã tách module
    main.js                       — entry
    core.js                       — Live2D init / model loading
    interaction.js                — click/headpat/spam/long-press
    audio.js                      — playback + lipsync
    expression.js                 — param tweening
    ui.js                         — chat bubble + context menu
  audio/{ja,vi,en}/               — bundled MP3 cho từng ngôn ngữ
  live2d/                         — model assets (Cubism)
  lib/                            — pixi-live2d-display + Cubism core
```

### Toolchain
- **TypeScript strict mode:** `tsconfig.json` đã bật `"strict": true`.
- **Build:** `npm run compile` (`tsc -p ./`) → `out/`. Watch: `npm run watch`.
- **Package & install:** `build-install.sh` tự bump version → `vsce package` → install vào VS Code local. Cũng có `npm run package:install`.

---

## 12. Những thứ chưa có (refer roadmap)

Để tránh hiểu lầm — các tính năng sau **chưa** được ship ở v0.1.20, đang ở backlog:

- Custom user phrases qua settings.
- Per-language reactive messages (hiện hardcode tiếng Việt).
- Achievements panel webview (logic core có, UI chưa).
- Coding stats dashboard.
- Per-workspace model preference (hiện chỉ global).
- Live2D motion picker submenu.
- Pomodoro visual ring overlay trên character.
- Real-time TTS / phrase template.
- Lofi music player.
- CHANGELOG.md, marketplace prep, CI/CD, esbuild bundle.

Chi tiết kế hoạch ở [PLAN.md](./PLAN.md) §3–4.
