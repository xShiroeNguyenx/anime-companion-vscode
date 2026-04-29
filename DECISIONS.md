# 🧠 Quyết Định Thiết Kế (Architectural Decisions)

Tài liệu giải thích **tại sao** đã chọn các giải pháp kỹ thuật hiện tại trong Anime Companion. Các quyết định ở đây là log lịch sử — nếu thay đổi, ghi rõ ngày + lý do thay vì xoá. Roadmap chi tiết ở [PLAN.md](./PLAN.md).

---

## 1. Local HTTP Server cho Live2D assets

**File:** [src/model-server.ts](src/model-server.ts)

**Bối cảnh:** `pixi-live2d-display` load model qua Fetch API / XHR (`.moc3`, `.model3.json`, texture PNG).

**Vấn đề:** VS Code Webview có CSP rất chặt — `vscode-webview-resource://` không cho fetch arraybuffer cần thiết cho Cubism Core, và CORS nội bộ của PIXI đứt khi gặp protocol đặc biệt này.

**Phương án đã loại:**
- Viết lại loader của PIXI để hiểu `vscode-webview-resource://` — quá rủi ro, phải maintain fork.
- Embed asset dưới dạng base64 inline — phình bundle khủng khiếp, không khả thi với Live2D.

**Giải pháp đã chọn:** Khởi tạo Express server cực nhẹ chạy ngầm ở `localhost:<port>` (port tự cấp phát qua `server.listen(0)`), serve toàn bộ thư mục `media/` ra HTTP. Webview fetch qua `http://localhost:PORT/...` như normal HTTP request.

**Đánh giá:**
- ✅ Triệt để vấn đề CORS / CSP.
- ✅ Thêm/đổi model = copy folder vào `media/live2d/` rồi update `MODEL_MAP`.
- ⚠️ Chiếm 1 port (vô hại vì localhost-only).
- ⚠️ Cần `lifecycle`-aware: start ở `activate()`, stop ở `deactivate()`.

---

## 2. Expression System tự dựng (không dùng `.exp3.json`)

**File:** [media/webview/expression.js](media/webview/expression.js)

**Vấn đề:** Phần lớn model Live2D phi-official (Azur Lane, TianYeLuLu...) không kèm file `.exp3.json` định nghĩa biểu cảm. Mỗi model đặt tên param khác nhau.

**Giải pháp:** Map các trạng thái cảm xúc (`happy`, `shy`, `angry`, `surprised`, `love`...) trực tiếp vào tập `Live2D Parameter` (`ParamMouthSmile`, `ParamCheek`, `ParamEyeLOpen`...). Dùng `PIXI.Ticker` để tweening tuyến tính giá trị param trong 500–1000ms thay vì set thẳng (avoid "snap" giật).

**Trade-off:** Phải hand-tune param cho mỗi model mới (vài giờ work). Bù lại transition mượt hơn hẳn so với load file `.exp3.json` raw.

---

## 3. Audio đa ngôn ngữ — pre-baked MP3 thay vì runtime TTS

**Folder:** [media/audio/{ja,vi,en}/](media/audio/)

**Vấn đề:**
- VoiceVox (giọng anime tốt nhất cho V-tuber) chỉ hỗ trợ tiếng Nhật.
- API runtime VoiceVox cần local engine (50–100MB) hoặc proxy `api.tts.quest` (network-dependent).
- Google TTS API có rate limit + cần API key.

**Giải pháp:** Pre-render toàn bộ phrase thành `.mp3` bằng Node script ngoài, ship kèm extension:
- `ja` — VoiceVox Shikoku Metan.
- `vi` — Google TTS Vietnamese.
- `en` — Google TTS English.

**Đánh giá:**
- ✅ Hoàn toàn offline, zero dependency runtime.
- ✅ Lipsync tự động vẫn work (PIXI phân tích waveform của file mp3 đã pre-bake).
- ❌ Phình bundle lớn (~10–15 MB chỉ cho audio).
- ❌ Không hỗ trợ phrase động (`{filename}`, `{branch}` trong template).

**Cập nhật tương lai:** PLAN §4.2 — auto-detect VoiceVox local + fallback `api.tts.quest` để mở phrase template runtime.

---

## 4. Custom Right-click Context Menu

**File:** [media/webview/interaction.js:151-267](media/webview/interaction.js#L151-L267)

**Vấn đề:** Không thể trigger native Context Menu của VS Code từ trong Webview Canvas. Browser default context menu thì xấu và không phù hợp.

**Giải pháp:** `e.preventDefault()` event `contextmenu` → render `<div>` DOM nổi tại vị trí cursor → mỗi mục bind `data-action` → click handler postMessage về extension host.

**Đã expand từ 5 → 10 mục:** Run, Commit, Pull, Push, Model, Voice, Mute, Poke, Pomodoro, Settings.

### 4.1 Inline picker panel (Model / Voice) thay vì submenu

**Cân nhắc:**
- **Submenu hover** — quen tay nhưng dễ trigger nhầm khi rê chuột.
- **Quick Pick của VS Code** (qua `executeCommand`) — đã có sẵn ở command `Anime Companion: Change Model` / `Change Voice`, nhưng "nhảy ra ngoài context của character" mỗi lần đổi.
- ✅ **Inline panel** — render panel mới trên character ngay sau khi click "Model"/"Voice", click model muốn chọn, click ngoài để đóng. Cảm giác "ở trong thế giới companion" trong suốt UX.

**Trade-off:** Phải duplicate model list giữa `MODEL_MAP` (TS) và HTML template trong `setupModelPanel()` (JS). Khi thêm model mới phải sửa cả 2 chỗ. Chấp nhận vì list 7 model ổn định, không đổi thường xuyên.

### 4.2 Settings shortcut trong menu

Dùng `animeCompanion.openSettings` mở Settings UI **đã filter sẵn** `@ext:shiroenguyen.anime-companion-vscode` — user không phải scroll qua hàng trăm setting khác.

---

## 5. ReactiveManager — single class, event-driven, in-memory state

**File:** [src/reactive.ts](src/reactive.ts) (~522 dòng)

**Quyết định:** Gom toàn bộ event hook (diagnostics, save, typing, build, debug, git, mood, achievements, greetings, break reminder) vào **một class** thay vì tách mỗi feature thành plugin riêng.

**Lý do:**
- Toàn bộ feature share state: `_saveCount`, `_totalErrorsFixed`, `_codingStartTime`, `_currentMood`, `_achievements`. Tách ra rồi sẽ phải truyền state qua bus → phức tạp hơn.
- Constructor inject 2 callback (`sendMessage`, `sendMood`) → ReactiveManager không phụ thuộc trực tiếp vào webview hoặc extension host → vẫn testable.
- Số dòng đang rơi vào ngưỡng cần tách (xem [PLAN.md §7](./PLAN.md#7--technical-debt)) — sẽ refactor khi mở `customPhrases` / `messages/{lang}.json`.

### 5.1 Git polling thay vì file watcher

**Cân nhắc:**
- File watcher trên `.git/HEAD`, `.git/refs/heads/` — phải xử lý `packed-refs`, các binary state (rebase/merge) phức tạp.
- ✅ **Polling Git extension API** mỗi vài giây — đọc `repo.state.HEAD`, `repo.state.workingTreeChanges` đã được VS Code Git extension parse sẵn.

**Đánh giá:** Polling 2–5s là acceptable cho UX (không cần realtime), giảm 90% complexity so với watcher.

### 5.2 Achievements — in-memory `Set<string>`, reset mỗi session

**Quyết định:** Không persist achievement vào `globalState`.

**Lý do hiện tại:**
- v0.1.20 chưa có Achievements panel UI nên persistence không có giá trị hiển thị.
- Persist sớm sẽ phải migrate khi thêm achievement mới.

**Khi nào đổi:** Khi build Achievements panel webview ([PLAN §3.2](./PLAN.md)) — lúc đó persist + version field cho schema.

### 5.3 Quiet Hours — mute messages, **không** mute mood/expression

**Quyết định:** Trong khung giờ quiet, suppress bubble nhưng vẫn cập nhật mood/expression nội bộ.

**Lý do:** Mood là state liên tục. Nếu pause hoàn toàn:
- Khi rời quiet hours, mood "nhảy" đột ngột (vd từ idle sang angry vì chồng error tích lũy).
- User nhìn character thấy không khớp với tình trạng code thực tế.

Suppress chỉ ở layer message giữ character "alive" mà vẫn không phân tâm.

---

## 6. Status Bar — single slot mode-swap

**File:** [src/extension.ts:43-95](src/extension.ts#L43-L95)

**Cân nhắc:**
- 2 slot riêng (model name + pomodoro countdown) — đỡ phải swap, nhưng chiếm 2 vị trí status bar quý giá khi user đã có nhiều extension khác.
- ✅ **1 slot tự đổi mode** — idle hiển thị model name, pomodoro chạy thì swap sang countdown + đổi `command` click handler từ `toggle` sang `stopPomodoro`.

**Trade-off:** Logic `_renderIdle()` / `_renderPomodoro()` phải sync với `setPomodoro()` callback. Đổi lại UX nhỏ gọn, không ăn vùng status bar.

---

## 7. Git Ops với feedback thật, không fire-and-forget

**File:** [src/git-ops.ts](src/git-ops.ts) — `pullWithFeedback` / `pushWithFeedback` / `commitWithFeedback`.

**Vấn đề ban đầu:** Gọi `vscode.commands.executeCommand('git.pull')` từ webview → command return ngay, không biết pull thành công, có gì để pull, hay fail vì conflict. Bubble companion luôn hiện "Đã pull xong!" kể cả khi fail.

**Giải pháp:** Dùng Git Extension API trực tiếp (`vscode.extensions.getExtension('vscode.git')` → `gitAPI.repositories[0]`). Ghi snapshot state **trước** khi pull, gọi pull, đọc state **sau** pull → so sánh để phân biệt 3 case: thành công có thay đổi / nothing to do / failed.

**Bonus — protected-branch guard:** `commitWithFeedback` cảnh báo khi đang ở `main`/`master`/`develop` ([git-ops.ts:121](src/git-ops.ts#L121)) — yêu cầu xác nhận thêm để tránh commit thẳng vào branch protected.

---

## 8. Module split cho `media/webview/`

**Lịch sử:** Trước v0.1.7 toàn bộ webview runtime là 1 file `webview.js` ~700 dòng. Đã gây bug scope: function `playAudio` reference từ scope sai, `setExpression`, `showBubble` cũng có khả năng tương tự.

**Đã refactor (v0.1.10–0.1.15):** Tách thành 6 module trong [media/webview/](media/webview/):

| Module | Trách nhiệm |
|---|---|
| `main.js` | Entry, init Live2D model, start ticker |
| `core.js` | Live2D loader, model swap, state global |
| `interaction.js` | Click/headpat/spam/long-press + context menu + Model/Voice panel |
| `audio.js` | Playback + lipsync + mute |
| `expression.js` | Param tweening cho mood/expression |
| `ui.js` | Chat bubble + DOM utilities |

Vẫn dùng `<script type="module">` thay vì bundle (esbuild) — ship raw để debug từ DevTools dễ.

**Khi nào bundle:** Khi chuẩn bị publish marketplace ([PLAN §4.1](./PLAN.md)) — bundle giảm cold-start time + minify.

---

## 9. Migration legacy `voiceLanguage = "ja-vi"` → `"en"`

**File:** [src/extension.ts:108-112](src/extension.ts#L108-L112)

**Lịch sử:** Phiên bản đầu có option `ja-vi` (Nhật + Vietnamese subtitle) — bỏ vì confusing. Replace bằng 3 option độc lập `ja` / `vi` / `en`.

**Quyết định:** Migrate **runtime ở `activate()`** thay vì để user tự sửa hoặc văng lỗi.

```typescript
if (legacyVoiceLanguage === 'ja-vi') {
  await config.update('voiceLanguage', 'en', vscode.ConfigurationTarget.Global);
}
```

**Lý do:**
- User không phải đụng vào Settings.
- Idempotent — chạy lại không hại gì.
- Audio asset folder `media/audio/ja-vi/` vẫn còn trên disk → debt nhỏ, dọn ở [PLAN §2.1](./PLAN.md#2--sprint-hiện-tại-1-tuần).

---

## 10. Version-change toast — fix "reload-after-install friction"

**File:** [src/extension.ts:121-128](src/extension.ts#L121-L128)

**Vấn đề:** Sau khi `vsce install` extension mới, VS Code thường yêu cầu reload window. User dễ tưởng extension đã reload, thực ra vẫn chạy code cũ → confusion khi test feature mới không thấy.

**Giải pháp:** Lưu version cuối cùng vào `globalState`, mỗi lần `activate()` so sánh với `package.json` hiện tại. Khác → bắn `showInformationMessage` xác nhận build mới đã active.

Đơn giản, ít side effect, hiệu quả.

---

## 11. Reactive toggles — granular per-channel + Quiet Hours

**Bối cảnh:** User feedback "tôi thích reactive engine nhưng đôi khi cần tắt nó (vd lúc demo, lúc họp)".

**Phương án đã loại:**
- 1 toggle global `animeCompanion.reactive.enabled` — quá thô, user vẫn muốn giữ git nhưng tắt save spam.
- Disable toàn bộ extension — ảnh hưởng cả Pomodoro, status bar, model.

**Giải pháp đã chọn:** 4 toggle độc lập + quietHours theo time range:
- `reactive.diagnostics`, `reactive.save`, `reactive.typing`, `reactive.git` — bật/tắt từng kênh.
- `quietHours: ["09:00-12:00", "22:00-06:00"]` — array khung giờ, hỗ trợ cross-midnight.

**Trade-off:** Mỗi check trong ReactiveManager phải đọc config — chấp nhận vì `getConfiguration()` đã được VS Code cache.

---

## 12. TypeScript strict mode, chưa esbuild

**Hiện tại:**
- ✅ `tsconfig.json` đã bật `"strict": true` → null-safety, no implicit any.
- ❌ Build vẫn dùng `tsc -p ./` thẳng ra `out/`, **không** bundle / minify / treeshake.

**Lý do chưa esbuild:**
- Extension activate time hiện tại đã ổn (~300ms cold start).
- Module split đã giúp dev navigate code dễ.
- Bundle thật sự cần thiết khi publish marketplace để giảm cold-start ở user mới — sẽ làm cùng đợt prep marketplace ([PLAN §4.1](./PLAN.md)).

---

## 13. View location: Panel area, không phải Sidebar

**Trong `package.json`:**
```json
"viewsContainers": {
  "panel": [{ "id": "animeCompanionPanel", ... }]
}
```

**Cân nhắc:**
- **Sidebar** (left/right) — narrow, model bị crop nếu user thu nhỏ.
- ✅ **Panel** (bottom) — rộng theo chiều ngang, đủ chỗ render character full body. User vẫn drag panel ra sidebar nếu thích.

**Trade-off:** Panel area thường được dùng cho Terminal / Output → chiếm chỗ. Đổi lại extension không gò bó user vào layout cụ thể.

---

*Quy ước cập nhật: thêm decision mới ở dưới cùng. Khi đảo quyết định cũ, không xoá — sửa thành "~~deprecated, see §X~~" và link tới quyết định mới.*
