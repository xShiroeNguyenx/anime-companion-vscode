# Plan: AI/LLM Chat (BYOK) — Anime Companion VSCode

## Context

Tính năng biến companion từ một mascot reactive thành một **chat assistant**. User tự cung cấp API key (BYOK) cho 3 provider chính — Anthropic, OpenAI, Gemini — và chat trực tiếp với companion qua một panel tích hợp trong webview hiện tại. Companion vẫn giữ persona anime (Live2D character có cảm xúc), nhưng giờ có thể trả lời câu hỏi về code, giải thích, brainstorm, v.v.

**Mục tiêu cốt lõi:**
- BYOK: API key lưu an toàn trong `vscode.ExtensionContext.secrets`, không gửi đi đâu khác ngoài provider mà user chọn.
- Streaming token-by-token (SSE) cho UX mượt.
- Multi-conversation history (giống Copilot Chat), persist qua restart.
- Context-aware: editor selection / full file / `#file` mention.
- Live2D phản ứng theo sentiment của response (happy/think/sad/excited).
- Persona = preset + custom override.

**Lý do**: companion hiện tại chỉ react với event (Pomodoro, click, headpat). Để tăng giá trị hằng ngày cho dev, cần thêm conversational layer — vừa entertainment, vừa productivity (giải thích code, debug help).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Webview (media/webview/) — Vanilla JS + PIXI.js                 │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐  │
│  │  Live2D Canvas (sẵn có) │  │  Chat Panel (MỚI)            │  │
│  │  - core.js              │  │  - chat-ui.js                │  │
│  │  - interaction.js       │  │  - chat-history-view.js      │  │
│  │  - expression.js        │  │  - chat-input.js             │  │
│  └─────────────────────────┘  └──────────────────────────────┘  │
│           ▲                              ▲                       │
│           │  expression updates          │  postMessage          │
│           │  từ sentiment                │  chat:send / receive  │
└───────────┼──────────────────────────────┼───────────────────────┘
            │                              │
┌───────────┴──────────────────────────────┴───────────────────────┐
│  Extension Host (src/)                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ChatManager (MỚI - src/chat/chat-manager.ts)              │  │
│  │  - sendMessage(convId, prompt, context)                    │  │
│  │  - streaming → forward chunks qua transport                │  │
│  │  - sentiment detection → host.postMessage('setMood', ...)  │  │
│  └────────────┬────────────────┬────────────────┬─────────────┘  │
│               │                │                │                 │
│  ┌────────────▼────┐  ┌────────▼────────┐  ┌───▼──────────────┐  │
│  │ LLMProvider     │  │ ConversationStore│  │ ChatContextBuilder│ │
│  │ (interface)     │  │ (persist JSON)   │  │ (editor/file/#)  │  │
│  │ - Anthropic     │  │                  │  │                  │  │
│  │ - OpenAI        │  │                  │  │                  │  │
│  │ - Gemini        │  │                  │  │                  │  │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘  │
│               │                                                   │
│  ┌────────────▼───────────────────────────────────────────────┐  │
│  │  context.secrets — API keys (KEY: animeCompanion.apiKey.*) │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## File-level Changes

### 1. New: `src/chat/` directory

| File | Trách nhiệm |
|------|-------------|
| `src/chat/llm-provider.ts` | Interface `LLMProvider` + factory `getProvider(id)`. Định nghĩa `sendStream(messages, opts) → AsyncIterable<Chunk>`. |
| `src/chat/providers/anthropic.ts` | Implement provider Anthropic. POST `api.anthropic.com/v1/messages` với `stream: true`, parse SSE event `content_block_delta`. |
| `src/chat/providers/openai.ts` | Implement OpenAI. POST `api.openai.com/v1/chat/completions` stream, parse SSE `data:` lines. |
| `src/chat/providers/gemini.ts` | Implement Gemini. POST `generativelanguage.googleapis.com/.../:streamGenerateContent?alt=sse`, parse SSE. |
| `src/chat/sse-parser.ts` | Util parse SSE từ `fetch` ReadableStream (Node 18+ `fetch`/`Response.body`). |
| `src/chat/chat-manager.ts` | Orchestrator. Inject system prompt, build messages, call provider, stream chunks ra transport, detect sentiment cuối câu → trigger Live2D mood. |
| `src/chat/conversation-store.ts` | CRUD conversation. Lưu `globalStorageUri/chat-history/<id>.json`. Schema: `{id, title, providerId, modelId, createdAt, updatedAt, messages: ChatMessage[]}`. |
| `src/chat/context-builder.ts` | Build context block: pack `editor.selection`, `editor.document.getText()`, resolve `#filename` mentions (`vscode.workspace.findFiles`). |
| `src/chat/persona.ts` | Preset persona list (cute / professional / tsundere / energetic) + system prompt templates. Resolve `animeCompanion.chat.personaPreset` + `animeCompanion.chat.systemPrompt` override. |
| `src/chat/sentiment.ts` | Simple keyword + emoji heuristic → map `{mood: 'happy'\|'sad'\|'thinking'\|'excited'\|'neutral'}`. Phase 1 dùng regex; sau có thể nâng cấp dùng LLM call phụ. |
| `src/chat/secrets.ts` | Wrapper quanh `context.secrets`. Keys: `animeCompanion.apiKey.anthropic`, `.openai`, `.gemini`. |

### 2. Modified files

| File | Thay đổi |
|------|----------|
| [src/extension.ts](../src/extension.ts) | activate(): khởi tạo `ChatManager` (singleton), gắn `context.secrets` reference. Register commands: `animeCompanion.chat.open`, `animeCompanion.chat.newConversation`, `animeCompanion.chat.setApiKey`, `animeCompanion.chat.askSelection`, `animeCompanion.chat.clearHistory`. |
| [src/companion-message-dispatcher.ts](../src/companion-message-dispatcher.ts) | Thêm cases inbound: `chat:send`, `chat:cancel`, `chat:listConversations`, `chat:loadConversation`, `chat:newConversation`, `chat:deleteConversation`, `chat:renameConversation`, `chat:setProvider`, `chat:setModel`, `chat:openSettings`. Đều forward sang `ChatManager`. |
| [src/companion-view.ts](../src/companion-view.ts) | `_getHtmlForWebview()`: include thêm `chat-ui.js`, `chat-history-view.js`, `chat-input.js`, `chat.css`. Resource roots: đã trỏ `media/webview/` nên không cần thay đổi. |
| [package.json](../package.json) | **Commands** (5): `chat.open`, `chat.newConversation`, `chat.setApiKey`, `chat.askSelection`, `chat.clearHistory`. **Configuration** mới: `animeCompanion.chat.provider` (`anthropic`/`openai`/`gemini`), `.model` (string), `.personaPreset`, `.systemPrompt`, `.maxTokens`, `.temperature`, `.contextSelectionAutoInclude` (bool). **Menus**: `editor/context` → "Ask companion about selection". |
| `media/webview/main.js` | Mount chat panel khi DOM ready. Wire `window.addEventListener('message', ...)` mở rộng để route `chat:*`. |
| `media/webview/expression.js` | Expose `setMood(name)` được gọi từ `chat:reaction` message khi sentiment thay đổi. (Đã có `setMood` — chỉ verify integration.) |

### 3. New webview UI

| File | Trách nhiệm |
|------|-------------|
| `media/webview/chat-ui.js` | Render chat panel (toggle button ở góc webview, slide-in panel ~360px). Markdown render (dùng `marked` standalone hoặc minimal regex parser cho code block + bold + link). Code block có nút Copy. |
| `media/webview/chat-history-view.js` | Sidebar list conversation: title (auto-generate từ first user message), timestamp, delete/rename context menu. |
| `media/webview/chat-input.js` | Textarea + send button, Shift+Enter newline, Enter send. `#`-trigger mention picker (postMessage `chat:requestFilePicker` → extension trả về danh sách file để webview render dropdown). |
| `media/webview/chat.css` | Styling chat panel — respect VSCode theme variables (`--vscode-editor-foreground`, etc.). |
| `media/webview/lib/marked.min.js` | (optional) markdown lib, nếu không tự viết. ~50KB. |

---

## Data Flow — Một chat message điển hình

1. **User gõ message + chọn context** trong `chat-input.js` → `postMessage({type:'chat:send', conversationId, prompt, contextRefs: [{kind:'selection'}, {kind:'file', path:'src/x.ts'}]})`.
2. **`companion-message-dispatcher.ts`** nhận, forward → `chatManager.sendMessage(...)`.
3. **`ChatManager`**:
   - Load conversation từ `ConversationStore`.
   - Gọi `ContextBuilder.build(contextRefs)` → string block kèm file path + code fence.
   - Gọi `Persona.resolve()` → system prompt.
   - Build `messages: [{role:'system', content: persona}, ...history, {role:'user', content: context + prompt}]`.
   - Lấy `apiKey` từ `Secrets.get(providerId)`. Nếu rỗng → postMessage `chat:error` (kèm action "Set API key") và return.
   - Gọi `provider.sendStream(messages, {model, maxTokens, temperature, signal: AbortController})`.
4. **Stream loop**: với mỗi chunk → `transport.postMessage({type:'chat:chunk', conversationId, delta})`. Webview append vào assistant bubble đang render.
5. **Khi stream done**:
   - Lưu full assistant message vào `ConversationStore`.
   - `Sentiment.detect(fullText)` → `transport.postMessage({type:'chat:reaction', mood, motion})`. Webview gọi `setMood()` + `playMotion()`.
   - `transport.postMessage({type:'chat:done', conversationId})`.
6. **Cancel**: User bấm Stop → webview gửi `chat:cancel` → ChatManager gọi `controller.abort()` → provider stream throw `AbortError` → catch → emit `chat:done` partial.

---

## Security & BYOK details

- API key **chỉ** lưu trong `context.secrets` (VSCode-encrypted at rest, OS keychain trên Mac/Windows).
- Command `animeCompanion.chat.setApiKey`: `vscode.window.showQuickPick` chọn provider → `showInputBox({password: true})` → `secrets.store(...)`. Không log ra Output channel.
- Khi gọi API: header `Authorization`/`x-api-key` build ngay trong provider, không pass key qua webview. Webview **không bao giờ** nhận key.
- `package.json` config: KHÔNG có field nào lưu key (tránh user vô tình paste vào `settings.json` rồi commit).
- Lỗi 401/403 → hiển thị error UI gợi ý "Update API key" mở lại flow setApiKey.
- Network: dùng `fetch` (Node 18+ built-in) — không cần dep mới.

---

## Persona presets (initial)

| Preset | System prompt skeleton |
|--------|------------------------|
| `cute` | "You are {modelName}, a cute anime companion living inside the user's VSCode. Be warm, supportive, sprinkle gentle emoticons. Help with coding questions concisely." |
| `professional` | "You are {modelName}, a focused coding assistant. Be direct, accurate, concise. Avoid roleplay flourishes." |
| `tsundere` | "You are {modelName}, a tsundere anime companion. Pretend reluctance but actually help thoroughly. Light teasing OK, never mean." |
| `energetic` | "You are {modelName}, an energetic, cheerful companion! Be enthusiastic but technically rigorous." |

User override qua `animeCompanion.chat.systemPrompt`. Nếu non-empty → **thay thế hoàn toàn** preset (không append) để tránh nhiễu.

---

## Reuse existing infrastructure

- **Transport**: `WebviewTransport` & `WebSocketTransport` ([src/companion-transport.ts](../src/companion-transport.ts)) — chat messages đi qua đúng kênh này, hoạt động cho cả panel webview và desktop pet.
- **Message dispatcher pattern** ([src/companion-message-dispatcher.ts](../src/companion-message-dispatcher.ts)) — chỉ thêm cases, không refactor.
- **CompanionHost interface** ([src/extension.ts:27](../src/extension.ts#L27)) — chat reactions dùng `host.postMessage()` sẵn có.
- **globalStorageUri pattern** — đã dùng cho models/voice/chibi, dùng tương tự cho `chat-history/`.
- **Live2D `setMood` + `playMotion`** (media/webview/expression.js) — sẵn API, không cần build mới.
- **Status bar** ([src/extension.ts:206](../src/extension.ts#L206)) — có thể optionally show "Chat: <provider>/<model>" khi enabled.

---

## Phased delivery

### Phase 1 — MVP (core chat loop)
- Provider Anthropic + OpenAI + Gemini, non-streaming first để verify auth/transport.
- Single conversation, persist in workspaceState (chưa cần multi-list).
- Persona preset only (chưa custom override).
- No context awareness.
- Output ra speech bubble cũ (đã có) + simple textarea panel.

### Phase 2 — Streaming + multi-conversation
- SSE streaming cho 3 providers.
- ConversationStore với list/new/delete/rename.
- Markdown render + code-block copy.

### Phase 3 — Context awareness
- Selection auto-include (command `askSelection`).
- Full-file toggle.
- `#file` mention picker.

### Phase 4 — Sentiment-driven Live2D reactions
- `sentiment.ts` heuristic.
- Map → existing moods (happy/sad/think/excited).
- Toggle setting `animeCompanion.chat.reactionsEnabled`.

### Phase 5 — Polish
- Custom system prompt override.
- Token usage display (provider responses chứa usage info).
- Cancel/regenerate buttons.
- Cost estimate (rough $ per conversation).

---

## Critical files (paths để mở khi implement)

- [src/extension.ts](../src/extension.ts) — activate, command registration
- [src/companion-view.ts](../src/companion-view.ts) — webview HTML, resource roots
- [src/companion-message-dispatcher.ts](../src/companion-message-dispatcher.ts) — message routing
- [src/companion-transport.ts](../src/companion-transport.ts) — postMessage abstraction
- [package.json](../package.json) — commands, config schema
- media/webview/main.js — webview entry
- media/webview/expression.js — setMood API
- [FEATURES.md](../FEATURES.md) — doc roadmap (sẽ update)

---

## Verification plan

**Manual (mỗi phase):**
1. `npm run compile` không lỗi TS.
2. F5 (Run Extension) trong VSCode → mở Anime Companion panel → toggle chat.
3. Phase 1: Command Palette → "Anime Companion: Set API Key" cho Anthropic → gõ message "hello" → nhận response (non-stream) → kiểm `context.secrets` không log key ra Output.
4. Phase 2: chat OpenAI và Gemini tương tự, verify streaming render token-by-token. Tạo 3 conversation, restart VSCode, verify list reload đúng.
5. Phase 3: Select code → command "Ask companion about selection" → response phải reference đúng file path + code. Gõ `#package.json` trong chat → autocomplete hiển thị → gửi → response biết về deps.
6. Phase 4: Hỏi câu vui ("tell me a joke") → companion `playMotion('happy')`. Hỏi câu khó ("explain monads") → motion `thinking`. Test toggle `reactionsEnabled = false`.
7. Test error paths: API key sai → UI hiển thị "Update key" link. Network drop giữa stream → graceful partial save. Cancel button abort thật sự.

**Automated:**
- Unit test (Mocha mới, hoặc đơn giản node script): `sse-parser.ts` với golden SSE fixtures cho 3 providers.
- Smoke: extend `scripts/smoke-test.js` để compile + load `chat-manager` instance + mock provider trả về stub stream.

**Pre-release:**
- `vsce package` → install `.vsix` cục bộ → repeat scenarios trên với real keys của 3 providers.
- Đảm bảo bundle size không phình quá (target < +200KB nếu thêm marked).

---

## Open considerations (không block plan, ghi chú để decide khi implement)

- **Rate limit & retry**: Phase 1 không retry, phase 5 có thể thêm exponential backoff cho 429.
- **Conversation title auto-generation**: dùng first 40 ký tự của message user, hay gọi 1 LLM call phụ ("summarize in 5 words")? → đề xuất: ký tự trước, optional LLM-gen sau.
- **Multi-modal (ảnh)**: out of scope phase 1-5. Anthropic/OpenAI/Gemini đều support, có thể thêm later.
- **Token counting**: provider trả về `usage`, lưu vào message metadata cho phase 5.
- **Desktop Pet (WebSocket transport)**: chat panel nên hoạt động cùng — verify HTML/JS bundle cũng được serve qua `ModelFileServer` cho desktop pet client. Có thể defer khỏi MVP nếu phức tạp.
