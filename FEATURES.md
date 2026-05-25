# 🌸 Anime Companion VS Code Extension — Features Documentation

Tài liệu mô tả chi tiết các tính năng đã được lập trình và tích hợp tính đến **v0.3.3** (cập nhật 2026-05-25). Roadmap chi tiết ở [PLAN.md](./PLAN.md), tiến độ ở [CHECKLIST.md](./CHECKLIST.md), lệnh build/release ở [DEV_COMMANDS.md](./DEV_COMMANDS.md). Kế hoạch tổng quan chat ở [docs/AI_CHAT_PLAN.md](./docs/AI_CHAT_PLAN.md). Implementation plan v0.3.1 ở [docs/PLAN_v0.3.1.md](./docs/PLAN_v0.3.1.md).

---

## ⭐ What's new in v0.3.3

v0.3.3 tập trung vào khả năng khám phá tính năng ngay từ pet: menu chuột phải được tổ chức lại thành các nhóm dễ nhớ, bớt dài dòng hơn ở từng ngôn ngữ, và phần menu tiếng Việt có fallback font riêng để chữ có dấu hiển thị sạch. Section dưới mô tả phần mới của v0.3.3 trước; phần `0. AI Chat Companion` bên dưới vẫn giữ làm reference cho nền tảng chat ship từ v0.3.0/v0.3.1.

### Right-click menu reorganization

- Menu chuột phải trong webview giờ chia thành 6 submenu chức năng: `AI Chat`, `Appearance`, `Voice & Sound`, `Workflow`, `Git`, `Desktop`.
- Các action chat trước đây nằm trong Command Palette như mở chat, tạo conversation mới, hỏi về selection, configure provider, clear history giờ có thể mở trực tiếp từ pet.
- Các action Cursor Chibi như capture, bật/tắt follow cursor, tinh chỉnh vị trí, reset vị trí cũng đã được gom về `Appearance`.

### Menu copy + localization polish

- Nhãn top-level được rút gọn để tránh xuống dòng trong panel hẹp: ví dụ `Desktop Companion` → `Desktop`, `Workflow` tiếng Việt → `Quy trình`, `Voice & Sound` tiếng Việt → `Âm thanh`.
- `Poke / Chọc nhẹ` không còn đứng riêng ở quick action top-level mà nằm trong `Appearance`, và được đặt ở cuối nhóm này để menu gọn hơn.
- Menu tiếng Việt dùng fallback font rounded riêng để các ký tự có dấu không bị vỡ glyph nhưng vẫn giữ vibe mềm, dễ thương gần với font hiện tại.

### 4 provider mới

| Provider | Default model | API key | Endpoint | Notes |
|---|---|---|---|---|
| **xAI Grok** | `grok-2-latest` | ✅ | `https://api.x.ai/v1` (OpenAI-compatible) | Streaming qua SSE giống OpenAI, share toàn bộ logic. Key prefix `xai-…` từ console.x.ai. |
| **DeepSeek** | `deepseek-chat` | ✅ | `https://api.deepseek.com/v1` | OpenAI-compatible. Model `deepseek-reasoner` có chain-of-thought trong `reasoning_content` — extension cố ý KHÔNG yield field này để bubble không phình với CoT (chỉ render final answer, giống Gemini 2.5 thinking). |
| **OpenRouter** | `openrouter/auto` | ✅ | `https://openrouter.ai/api/v1` | Gateway 100+ models. 1 key dùng được Claude / GPT / Llama / Gemini / DeepSeek / ... Models có suffix `:free` không tính phí. Header `HTTP-Referer` + `X-Title` gắn cho dashboard attribution. Key prefix `sk-or-v1-…`. |
| **Ollama (local)** | `llama3.2` | ❌ | `animeCompanion.chat.ollamaEndpoint` (default `http://localhost:11434`) | NDJSON streaming (không phải SSE) qua `POST /api/chat`. Đọc endpoint live mỗi request — đổi setting không cần reload. Token usage map từ `prompt_eval_count` + `eval_count` chunk cuối. Friendly ECONNREFUSED error → gợi ý `ollama serve` + `ollama pull`. |

### `OpenAICompatibleProvider` abstraction ([src/chat/providers/openai-compatible.ts](src/chat/providers/openai-compatible.ts))

Tách core stream logic của OpenAI ra factory class — config per-instance:

```ts
interface OpenAICompatConfig {
  id: ProviderId;
  baseUrl: string;            // KHÔNG bao gồm /chat/completions
  defaultModel: string;
  extraHeaders?: () => Record<string, string>;  // OpenRouter HTTP-Referer + X-Title
  displayName?: string;
}
```

Cùng class drive 4 providers (OpenAI + xAI + DeepSeek + OpenRouter). Eliminate 3× duplication. File cũ `src/chat/providers/openai.ts` deleted — registry chỉ tạo factory instance.

### `Configure Chat Provider` command

Command id giữ nguyên `animeCompanion.chat.setApiKey` (backwards-compat cho keybindings). Title rename `Set Chat API Key (BYOK)` → `Configure Chat Provider (API Key / Endpoint)`. Flow branch theo provider:

- `copilot` — không xuất hiện trong picker (no config).
- `ollama` — InputBox cho endpoint URL với validate `^https?://.+`, normalize trailing `/`, save vào `chat.ollamaEndpoint` setting (`ConfigurationTarget.Global`).
- Còn lại (BYOK) — InputBox masked cho API key, lưu `vscode.SecretStorage`.

`ProviderId` type extend 4 → 8 ids. `needsKey()` refactor sang Set check (`NO_KEY_PROVIDERS = {copilot, ollama}`). `hasAny()` dùng explicit `BYOK_PROVIDERS` list để không nhầm khi thêm no-key providers sau.

### Copy-reply button

Mỗi assistant message bubble có nút copy nhỏ ở góc bottom-right ([media/webview/chat.js](media/webview/chat.js) — `buildMessageCopyButton`). Hidden khi đang streaming (CSS `.chat-msg.streaming .chat-msg-copy { display: none }`). Click → checkmark icon pop-in với keyframe `chat-msg-copy-pop` (260ms, easing `cubic-bezier(0.34, 1.56, 0.64, 1)`), background xanh 1.4 s, rồi revert.

Source copy text được stash vào `el.dataset.copySource` (raw markdown) thay vì đọc `innerText` — tránh dính label "Copy" từ code-block buttons.

### Live panel resize cho Live2D model

Fix 2 bug trong `fitModel()` ([media/webview/interaction.js](media/webview/interaction.js)):

1. **Feet clipping**: `getLocalBounds()` chỉ report rigging-bone bounds, miss physics parts (hair sway, váy). Khi panel thấp + scale tính theo bounds (đã bé hơn thực tế), model render to hơn không gian dự kiến → chân tràn xuống dưới. Switched sang `internalModel.originalWidth/Height` (Live2D-designed canvas = authoritative). Thêm `bottomPadding = max(6, h*0.02)` cho breathing room.

2. **Drag-pinned container không follow panel resize**: Sau khi drag companion, container chuyển `position: fixed` + cứng `width: Xpx; height: Ypx`. Wrapper bên trong cũng cứng → existing `ResizeObserver` trên wrapper không fire khi parent resize. Thêm window-level `resize` listener + body-level `ResizeObserver` → `syncPinnedContainerSize()` update pinned dimensions theo parent, clamp `left/top` để không out-of-viewport, rồi explicitly refit. No-op khi container ở default flex layout.

### Tri-lingual documentation

README ship trong 3 ngôn ngữ với language switcher header:
- [README.md](README.md) — **English** (source of truth cho marketplace listing)
- [docs/README.vi.md](docs/README.vi.md) — **Tiếng Việt**
- [docs/README.ja.md](docs/README.ja.md) — **日本語**

Sync convention: EN là source of truth. 2 file non-EN có header comment `<!-- Source of truth: ../README.md -->`. JA file có thêm `<!-- TRANSLATION-REVIEW-NEEDED -->` marker ở section nhiều idiom.

Screenshot manifest [docs/images/README.md](docs/images/README.md) — 12 ảnh placeholder với capture specs. `docs/images/**` thêm vào `package.json` `files` array để bundle vào VSIX.

---

## 0. AI Chat Companion (mới trong v0.3.0)

Bản 0.3.0 thêm conversational layer — biến companion từ reactive mascot thành **chat assistant** thực thụ. Module sống trong [src/chat/](src/chat/), webview UI trong [media/webview/chat.{js,css}](media/webview/chat.js).

### 0.1 LLM Provider system

4 provider, switch bằng `chat.provider` setting hoặc dropdown trong chat panel:

| Provider | Default model | API key | Notes |
|---|---|---|---|
| **GitHub Copilot** | `gpt-4o` | ❌ (dùng VS Code Copilot session) | Default cho mọi user mới. Route qua `vscode.lm.selectChatModels({ vendor: 'copilot' })`. Hỗ trợ mọi model Copilot expose theo subscription. |
| **Anthropic Claude** | `claude-haiku-4-5-20251001` | ✅ | SSE stream với `content_block_delta`. Đọc usage từ `message_start` + `message_delta`. |
| **OpenAI GPT** | `gpt-4o-mini` | ✅ | SSE với `stream_options.include_usage` cho realtime token count. |
| **Google Gemini** | `gemini-2.5-flash` | ✅ (có free tier) | `:streamGenerateContent?alt=sse`. Skip thinking parts (`thought: true`) cho 2.5 series. |

Provider interface: [src/chat/llm-provider.ts](src/chat/llm-provider.ts) — `sendStream(opts) → { stream: AsyncIterable<string>, result: StreamResult }`. Mỗi provider implement riêng error mapping + usage extraction.

### 0.2 BYOK Security
- API keys lưu **chỉ** trong `vscode.ExtensionContext.secrets` (OS keychain — Mac Keychain / Windows Credential Manager / Linux Secret Service) — đọc/ghi qua [src/chat/secrets.ts](src/chat/secrets.ts).
- Không có field nào trong `settings.json` lưu key → user không thể vô tình commit key.
- Webview **không bao giờ** nhận key. Header `Authorization`/`x-api-key`/`x-goog-api-key` build ngay trong extension host, request body fetch trực tiếp tới provider.
- Command `animeCompanion.chat.setApiKey`: QuickPick chọn BYOK provider (Copilot bị loại) → InputBox `password: true` → validate length → `secrets.store`. Không log key ra Output channel.
- Lỗi 401/403/quota → surface qua status bar trong chat, không vào toàn cục.

### 0.3 Streaming
- SSE parser tự viết tại [src/chat/sse-parser.ts](src/chat/sse-parser.ts) — handle cả `\n\n` và `\r\n\r\n` event boundary, flush trailing event nếu server không gửi blank line cuối, dùng `Response.body.getReader()` + `TextDecoder` (Node 18+ fetch API).
- Mỗi chunk → `chat:assistantDelta` message → webview append vào bubble đang render với sparkle caret ✨ animation.
- Trước chunk đầu tiên → 3 chấm hồng nhảy staggered (`.chat-thinking-dots` CSS) thay placeholder → "thoughts coming out" UX.
- Cancel: `AbortController` hủy fetch, signal abort cũng propagate sang `CancellationTokenSource` cho Copilot path. Partial accumulated text vẫn được persist.

### 0.4 Multi-conversation persistence
- Mỗi conversation lưu vào 1 file JSON: `globalStorageUri/chat-history/<id>.json` qua atomic write (tmp + rename). Schema: `{ meta: { id, title, providerId, model, createdAt, updatedAt }, messages: [{ role, content, ts }] }`.
- Active conversation id pinned per-workspace (`workspaceState`) — mỗi project nhớ chat riêng.
- Title auto-generate từ user message đầu tiên (max 48 chars), có thể rename qua sidebar.
- Sidebar có rename/delete actions — driven bằng `vscode.window.showInputBox` / `showWarningMessage` thay vì browser `prompt()`/`confirm()` (cái sau bị VS Code webview block).
- "+ New chat" reuse active conversation nếu rỗng + auto-cleanup các empty conversation khác để sidebar không phình.

### 0.5 Context awareness
- 📌 **Selection toggle**: icon toggle pin button cạnh Send. Pressed → gửi `editor.selection.text` cùng prompt.
- 📄 **Active file toggle**: gửi `editor.document.getText()` (cap 12 000 chars với truncation marker).
- `#filename` mention: gõ `#` trong textarea → autocomplete dropdown call `vscode.workspace.findFiles('**/*${query}*', '**/node_modules/**', 12)`. Arrow Up/Down + Tab/Enter chọn.
- **Right-click "Ask Companion About Selection"**: command + editor/context menu entry. Capture `selection.text` + `document.languageId` → `chatManager.stageSelection()` → chip vàng hiện trong info row của chat form.
- Context được pack thành markdown code-fences với file path + language hint (xem [src/chat/context-builder.ts](src/chat/context-builder.ts)).

### 0.6 Persona
4 preset trong [src/chat/persona.ts](src/chat/persona.ts), inject tên Live2D model hiện tại:
- `cute` — warm, supportive, gentle emoticons.
- `professional` — direct, technical, không roleplay.
- `tsundere` — reluctant on surface, thorough underneath.
- `energetic` — cheerful enthusiast, vẫn rigorous về code.

User override hoàn toàn bằng `chat.systemPrompt` setting (nếu non-empty thay thế cả preset).

### 0.7 Sentiment-driven Live2D reactions
- [src/chat/sentiment.ts](src/chat/sentiment.ts) — heuristic regex + emoji keyword match (EN + VI) phân loại reply assistant thành `happy` / `excited` / `sad` / `thinking` / `neutral`.
- Sau khi stream xong → post `setMood` + `playMotion` messages tới webview → trigger existing Live2D animation system. Happy → `TapBody`, thinking/sad → `TapHead`.
- Toggle `chat.reactionsEnabled` (default `true`) để tắt nếu không thích.

### 0.8 UI architecture
- **Split layout**: character bên trái (clamp 80–160–20%), chat bên phải. Character mood/motion luôn visible trong khi chat. Không media query stack dọc.
- **Header 2-row collapsible**: row 1 luôn hiện (☰ title ⚙ 🔑 ✕). Row 2 (provider dropdown + AI model combo) collapse sau ⚙ gear, state persist qua `vscode.getState()`.
- **Anime pink pastel theme** với gradient bubbles (hồng cho assistant, lavender cho user), thinking dots, sparkle streaming caret, soft shadows. CSS biến `--ac-*` ở đầu file [media/webview/chat.css](media/webview/chat.css) — đổi 5 biến là theme đổi toàn diện.
- **Avatar + tên** = Live2D model identity. Captured chibi PNG (`globalStorageUri/cursor-chibi/{modelId}.png`) với fallback `media/character.png` qua `<img onerror>`. Tên model thật ("Hiyori", "Miara") thay "Companion".
- **Custom AI model combo**: click input → dropdown all suggestions (vì `<datalist>` chỉ filter khi gõ). Keyboard navigation arrow / Tab / Enter / Esc. Cho Copilot, populate động bằng `vscode.lm.selectChatModels` lúc snapshot.
- **3 file CSS độc lập** theo prefix:
  - `media/companion.css` — Live2D character + idle bubble + status bar
  - `media/webview/chat.css` — Chat panel (`.chat-*`)
  - `media/webview/cursor-chibi.css` — Cursor chibi tuning orb (`.chibi-orb-*`)
  Class prefix disjoint → sửa file này không thể accidentally đụng file kia.

### 0.9 Commands
- `Anime Companion: Open Chat` — bring panel forward + post `chat:focus`.
- `Anime Companion: Set Chat API Key (BYOK)` — QuickPick + InputBox flow.
- `Anime Companion: New Chat Conversation` — reuse empty active hoặc tạo + cleanup empties.
- `Anime Companion: Clear All Chat Conversations` — confirm modal trước khi wipe.
- `Anime Companion: Ask Companion About Selection` — stage selection + open chat, cũng có ở editor right-click menu (`editorHasSelection`).

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
  - `vi` — bundled audio + extended voice assets từ ElevenLabs.
  - `en` — bundled audio + extended voice assets từ ElevenLabs.
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

---

## 11. Cursor Chibi (sprite nhỏ tại con trỏ editor)

Một sprite chibi nhỏ floating ở vị trí cursor trong editor, render qua VS Code `TextEditorDecoration` với `before.contentIconPath`. Tách biệt hoàn toàn với companion view chính trong panel.

### Toggle + size preset (cũ)
- Setting `animeCompanion.cursorChase.enabled` (default `false`).
- Setting `animeCompanion.cursorChase.size`: enum `small` (12px) / `medium` (16px) / `large` (20px).
- Command `Anime Companion: Toggle Cursor Chibi` flip enabled.

### Position + size offset (v0.1.47–0.1.48) ⭐
- Setting `animeCompanion.cursorChase.offsetX/offsetY` (number, default 0): pixel offset cộng thêm vào base position auto-centered phía trên line cursor.
- Setting `animeCompanion.cursorChase.sizePx` (number, 0 = dùng enum, 1–64 = override exact pixel size).

### Tune Position (interactive picker)
- Command `Anime Companion: Tune Cursor Chibi Position` mở quick-pick lặp với 8 options:
  - `↑ Up` / `↓ Down`: y ±= 4
  - `← Left` / `→ Right`: x ±= 4
  - `+ Bigger` / `− Smaller`: sizePx ±= 2
  - `↻ Reset all`: clear offsets + size về 0
  - `✓ Done`: thoát picker
- Placeholder hiển thị giá trị hiện tại realtime: `offset x=0, y=0 — size=12px`.
- Mỗi pick lưu vào settings (Global) → config listener fire `_reapply()` → decoration re-create với param mới → chibi nhích/thay đổi size **realtime trong editor**, không cần đóng picker.

### Capture Chibi from Model (v0.1.49) ⭐
Snapshot model Live2D đang render thành sprite chibi cá nhân hoá.

**Workflow:**
1. Mở companion panel, chỉnh model về pose/expression Anh muốn (vd happy + idle motion)
2. **Ctrl+Shift+P** → `Anime Companion: Capture Chibi from Model`
3. Extension gửi `command: 'captureModelChibi'` qua webview
4. Webview ([media/webview/main.js](media/webview/main.js) handler `captureModelChibi`):
   - `state.app.render()` force 1 frame
   - `canvas.getImageData()` đọc pixel
   - `autoCropCanvas()` scan alpha > 8 tìm tight bounding box, crop transparent borders
   - Resize ≤ 96px max dim (giữ aspect ratio, `imageSmoothingQuality: 'high'`)
   - `canvas.toDataURL('image/png')` → post lại extension
5. Dispatcher receives `modelChibiCaptured` → save base64 decode vào `globalStorage/cursor-chibi/{modelId}.png`
6. `cursorChibi._reapply()` → decoration mới dùng PNG vừa save

**Mỗi model có 1 file PNG riêng** — switch model tự đổi chibi (config listener watch `animeCompanion.model`).

**Reset:** Command `Anime Companion: Reset Captured Chibi` xoá PNG model hiện tại, fallback về `media/icon.png` bundled.

**File location:** `%APPDATA%\Code\User\globalStorage\shiroenguyen.anime-companion-vscode\cursor-chibi\{modelId}.png`.

### Implementation chi tiết

- **Decoration CSS** ([src/cursor-chibi.ts](src/cursor-chibi.ts)):
  ```css
  position: absolute;
  width: ${sizePx}px !important;
  height: ${sizePx}px !important;
  min-width: 0 !important;     /* override VS Code default min */
  max-width: ${sizePx}px !important;
  background-size: contain !important;     /* preserve aspect ratio */
  background-repeat: no-repeat !important;
  background-position: center !important;
  transform: translate(${offsetX}px, ${offsetY}px);
  ```
  Override `min-width: 0` cần thiết vì VS Code có CSS ngầm áp min ~24px cho decoration `before` element, ngăn chibi co dưới size đó.

- **Filter editor scheme**: chỉ apply trên `file` / `untitled` / `vscode-userdata` để tránh leak vào OUTPUT panel, debug console, terminal (cũng là TextEditor trong VS Code).

- **Decoration cleanup khi switch editor**: lặp `vscode.window.visibleTextEditors`, clear decoration từ tất cả editor không phải target → tránh stale chibi từ split view.

---

## 12. ElevenLabs Voice Pipeline (build-time + lazy-load)

Hệ thống tự sinh MP3 voice cho en/vi qua ElevenLabs API ở build time, đóng gói release riêng để lazy-load runtime. Mở rộng beyond 4 line bundled gốc.

### Per-language config ([media/voice/](media/voice/))
- File `media/voice/en.json`, `media/voice/vi.json` chứa:
  - `voiceId`, `modelId` (vd `eleven_multilingual_v2`)
  - `voiceSettings`: `stability`, `similarityBoost`, `style`, `useSpeakerBoost`, `speed`
  - `lines`: array `{ key, text }` — `key` thành filename `{key}.mp3`
- Thêm câu thoại mới = append entry vào array `lines`. Hash cache đảm bảo chỉ line mới gen, line cũ skip.

### Generator script ([scripts/generate-voice-assets.js](scripts/generate-voice-assets.js))
- Đọc `ELEVENLABS_API_KEY` từ `.env` hoặc env var.
- POST `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` với text + voice_settings → write `dist/voice-assets/{lang}/{key}.mp3`.
- **Idempotent hash cache**: hash `(text + voiceId + modelId + voiceSettings)` → save `{key}.hash`. Lần chạy sau khớp hash → skip.
- **Flags**:
  - `--lang=vi` / `--lang=en,vi`: filter language
  - `--key=k1,k2`: surgical mode, chỉ xử lý các key chỉ định, các line khác `[ignr]` không đụng (an toàn khi voiceSettings drift)
  - `--force`: bỏ qua hash cache, regen toàn bộ
- **JSON tolerate `//` comment** (parser custom strip line comments + trailing commas) — Anh có thể comment line tạm.
- Emit `manifest.json` mỗi language làm registry.

### Packer ([scripts/pack-voice-assets.js](scripts/pack-voice-assets.js))
- Dùng `adm-zip` (đã có trong deps) → `dist/voice-assets/{lang}.zip`.

### GitHub Actions release workflow ([.github/workflows/voice-assets-release.yml](.github/workflows/voice-assets-release.yml))
- Manual dispatch với inputs: `tag_name` (default `audio-v1`), `languages`, `force_regenerate`, `make_latest`, `prerelease`.
- Dùng repo secret `ELEVENLABS_API_KEY` → run gen + pack → upload zips qua `softprops/action-gh-release@v2`.

### Runtime downloader ([src/voice-asset-downloader.ts](src/voice-asset-downloader.ts))
- Pattern y hệt `DesktopPetDownloader`.
- Cache root: `globalStorage/voice-assets/{ext-version}/{lang}/`.
- `ensureLanguageAudio(lang)`: nếu cache hit (có MP3) → return path. Else download `${baseUrl}/${lang}.zip`, extract, return path. On fail → return `null` (caller fallback bundled).
- In-flight dedupe map tránh double-download.
- Progress notification "Downloading EN voice assets" với % progress.

### Config keys
- `animeCompanion.voiceAssets.downloadBaseUrl` (default `https://github.com/.../releases/download/audio-v1`).
- `animeCompanion.voiceAssets.enableExtended` (boolean, default `true`).

### Wire-up trong companion-view.ts
- `_renderWith()` gọi `voiceAssetDownloader.ensureLanguageAudio(lang)` cho `en`/`vi` (skip `ja`) trước khi render HTML.
- Nếu success: `__AUDIO_BASE_URL__` trỏ vào `webview.asWebviewUri(cacheDir)`. `localResourceRoots` mở rộng để webview load MP3 từ globalStorage.
- Nếu fail / `enableExtended = false` / `ja`: fallback về `mediaUri('audio', lang)` bundled.

### 4-line bundled fallback
- `media/audio/{en,vi,ja}/{headpat,spam,poke,help,server}.mp3` được giữ trong VSIX. Đảm bảo extension hoạt động:
  - First-run trước khi download xong
  - Offline / GitHub blocked
  - User tắt `voiceAssets.enableExtended`

### Diagnostic ([scripts/list-elevenlabs-voices.js](scripts/list-elevenlabs-voices.js))
- Call `GET /v1/voices` → in voiceId + tên + category (`[premade]` / `[generated]` / `[professional]`) + labels.
- Free tier API chỉ gọi được `[premade]` và `[generated]` (voice tự design); `[professional]` (cộng đồng/library) cần Starter plan trở lên — nhận diện qua category này tránh debug HTTP 402 mò mẫm.

---

Lệnh chạy chi tiết cho từng tính năng ở [DEV_COMMANDS.md](./DEV_COMMANDS.md).
