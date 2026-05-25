# Anime Companion VSCode — v0.3.1 Plan

## Context

v0.3.0 đã ship AI Chat Companion với 4 providers (Anthropic, OpenAI, Gemini, GitHub Copilot). v0.3.1 mở rộng provider coverage cho người dùng có nhu cầu đa dạng (giá rẻ DeepSeek, OpenRouter gateway 100+ models, local-first Ollama, xAI Grok), quốc tế hóa documentation (root README hiện chỉ tiếng Việt → cần English cho marketplace + giữ VI, thêm JA), và đặt nền cho v0.4.0 (chat từ pet desktop + restructure right-click menu).

Người dùng đã chốt scope qua AskUserQuestion:
- Providers: xAI Grok, DeepSeek, OpenRouter, Ollama (4 cái)
- Docs i18n: README.md = English (marketplace); VI + JA chuyển vào `docs/`
- Pet chat: **defer v0.4.0** — chỉ note plan
- Right-click menu: defer v0.4.0 — chỉ đề xuất layout

---

## Phase 1 — Add 4 AI Providers

### 1.1 Refactor: tạo `OpenAICompatibleProvider`

xAI / DeepSeek / OpenRouter đều dùng đúng schema OpenAI Chat Completions. Tách core stream logic của [src/chat/providers/openai.ts](src/chat/providers/openai.ts) ra factory để 3 provider mới + OpenAI share chung — không duplicate fetch + SSE parse 3 lần nữa.

**New file** [src/chat/providers/openai-compatible.ts](src/chat/providers/openai-compatible.ts):

```ts
export interface OpenAICompatConfig {
  id: ProviderId;
  baseUrl: string;            // KHÔNG bao gồm /chat/completions
  defaultModel: string;
  extraHeaders?: () => Record<string, string>;  // OpenRouter dùng để gắn HTTP-Referer + X-Title
}
export class OpenAICompatibleProvider implements LLMProvider {
  // body / SSE parse / usage extraction y hệt OpenAIProvider hiện tại
  // chỉ khác: URL = `${baseUrl}/chat/completions`, defaultModel từ config
}
```

**Delete** [src/chat/providers/openai.ts](src/chat/providers/openai.ts) — thay bằng factory call trong registry. Reuse [src/chat/sse-parser.ts](src/chat/sse-parser.ts) (đã có).

### 1.2 Ollama provider (special case: no key, NDJSON, configurable endpoint)

**New file** [src/chat/providers/ollama.ts](src/chat/providers/ollama.ts):
- `requiresApiKey = false`
- Đọc endpoint từ `vscode.workspace.getConfiguration('animeCompanion').get<string>('chat.ollamaEndpoint', 'http://localhost:11434')` ở mỗi request (live setting)
- Normalize trailing `/` rồi `POST ${endpoint}/api/chat`
- Stream là **NDJSON** (newline-delimited JSON), KHÔNG phải SSE — đọc `resp.body`, split `\n`, JSON.parse từng line, yield `chunk.message.content`
- Chunk cuối `done:true` mang `prompt_eval_count` + `eval_count` → map vào `result.usage = {inputTokens, outputTokens}`
- Catch `ECONNREFUSED` → throw `Error("Ollama not reachable at <endpoint>. Run 'ollama serve' + 'ollama pull <model>'.")`

### 1.3 Update [src/chat/secrets.ts](src/chat/secrets.ts)

- Extend type: `type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'copilot' | 'xai' | 'deepseek' | 'openrouter' | 'ollama'`
- `hasAny()` thêm `'xai', 'deepseek', 'openrouter'` vào list (KHÔNG thêm ollama — không có key)
- `needsKey()` refactor sang Set check:
  ```ts
  const NO_KEY_PROVIDERS = new Set<ProviderId>(['copilot', 'ollama']);
  needsKey(p) { return !NO_KEY_PROVIDERS.has(p); }
  ```

### 1.4 Update [src/chat/llm-provider.ts](src/chat/llm-provider.ts)

Registry:
```ts
const PROVIDERS: Record<ProviderId, LLMProvider> = {
  anthropic: new AnthropicProvider(),
  openai:    new OpenAICompatibleProvider({ id:'openai',     baseUrl:'https://api.openai.com/v1',     defaultModel:'gpt-4o-mini' }),
  gemini:    new GeminiProvider(),
  copilot:   new CopilotProvider(),
  xai:       new OpenAICompatibleProvider({ id:'xai',        baseUrl:'https://api.x.ai/v1',           defaultModel:'grok-2-latest' }),
  deepseek:  new OpenAICompatibleProvider({ id:'deepseek',   baseUrl:'https://api.deepseek.com/v1',   defaultModel:'deepseek-chat' }),
  openrouter:new OpenAICompatibleProvider({ id:'openrouter', baseUrl:'https://openrouter.ai/api/v1',  defaultModel:'openrouter/auto',
              extraHeaders:()=>({ 'HTTP-Referer':'https://github.com/xShiroeNguyenx/anime-companion-vscode', 'X-Title':'Anime Companion VSCode' }) }),
  ollama:    new OllamaProvider(),
};
```

Append 4 entries vào `PROVIDER_INFO` array (giữ format hiện có: `id, label, defaultModel, modelExamples, keyHint, requiresApiKey, notes?`):

| id | label | defaultModel | keyHint |
|---|---|---|---|
| `xai` | `xAI Grok — BYOK` | `grok-2-latest` | `xai-… — generate at console.x.ai` |
| `deepseek` | `DeepSeek — BYOK` | `deepseek-chat` | `sk-… — generate at platform.deepseek.com` |
| `openrouter` | `OpenRouter (100+ models) — BYOK` | `openrouter/auto` | `sk-or-v1-… — generate at openrouter.ai/keys` |
| `ollama` | `Ollama (local, no key)` | `llama3.2` | `No API key. Configure endpoint (default http://localhost:11434).` |

`modelExamples` cho OpenRouter list các phổ biến + tip `:free` suffix. DeepSeek note về `deepseek-reasoner` (CoT hidden — chỉ yield `delta.content`, không yield `reasoning_content`).

### 1.5 Update [src/chat/chat-manager.ts](src/chat/chat-manager.ts) — `runSetApiKeyCommand` (line 588)

Filter `PROVIDER_INFO.filter(p => p.id !== 'copilot')` (thay vì `p.requiresApiKey`) để Ollama xuất hiện trong picker.

Sau khi user pick provider, **branch**:
```ts
if (pick.id === 'ollama') {
  const cfg = vscode.workspace.getConfiguration('animeCompanion');
  const current = cfg.get<string>('chat.ollamaEndpoint', 'http://localhost:11434');
  const next = await vscode.window.showInputBox({
    prompt: 'Ollama server endpoint (no trailing /api/chat).',
    value: current,
    validateInput: v => /^https?:\/\/.+/.test(v ?? '') ? null : 'Must start with http:// or https://',
    ignoreFocusOut: true,
  });
  if (next === undefined) return;
  await cfg.update('chat.ollamaEndpoint', next.trim().replace(/\/+$/,''), vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Ollama endpoint saved: ${next.trim()}`);
  return;
}
// existing BYOK flow unchanged
```

### 1.6 Update [package.json](package.json)

- `contributes.commands` — rename command title: `Set Chat API Key (BYOK)` → `Configure Chat Provider (API Key / Endpoint)`. **Giữ nguyên command id** `animeCompanion.chat.setApiKey` (backwards compat keybindings).
- `contributes.configuration.properties.animeCompanion.chat.provider` — extend enum + enumDescriptions thêm 4 ids.
- Thêm setting mới:
  ```json
  "animeCompanion.chat.ollamaEndpoint": {
    "type": "string",
    "default": "http://localhost:11434",
    "description": "Base URL of local Ollama server. Do NOT include /api/chat — path is appended."
  }
  ```
- `files` array — thêm `"docs/images/**"` (cho screenshot bundle vào VSIX, marketplace render được). KHÔNG thêm `docs/*.md` (giữ VSIX nhỏ; GitHub viewers vẫn xem được trên repo).

### 1.7 Files changed (Section 1 summary)

- [src/chat/secrets.ts](src/chat/secrets.ts) — extend type + needsKey
- [src/chat/llm-provider.ts](src/chat/llm-provider.ts) — registry + PROVIDER_INFO
- [src/chat/providers/openai.ts](src/chat/providers/openai.ts) — **DELETE**
- [src/chat/providers/openai-compatible.ts](src/chat/providers/openai-compatible.ts) — **NEW**
- [src/chat/providers/ollama.ts](src/chat/providers/ollama.ts) — **NEW**
- [src/chat/chat-manager.ts](src/chat/chat-manager.ts) — branch Ollama trong setApiKey
- [package.json](package.json) — enum, command title, new setting, files

---

## Phase 2 — Documentation i18n + Screenshots

### 2.1 File structure

```
<root>/
├── README.md              ← English (marketplace; source of truth)
├── docs/
│   ├── README.vi.md       ← Tiếng Việt (port nội dung README hiện tại + 0.3.1)
│   ├── README.ja.md       ← 日本語 (dịch từ EN)
│   └── images/
│       └── *.png          (placeholder; user chụp sau)
```

### 2.2 Language switcher (header mỗi file, ngay sau H1 + badges)

- `README.md`: `> **Language**: **English** · [Tiếng Việt](docs/README.vi.md) · [日本語](docs/README.ja.md)`
- `docs/README.vi.md`: `> **Ngôn ngữ**: [English](../README.md) · **Tiếng Việt** · [日本語](README.ja.md)`
- `docs/README.ja.md`: `> **言語**: [English](../README.md) · [Tiếng Việt](README.vi.md) · **日本語**`

Ngôn ngữ hiện tại bold + no-link.

### 2.3 Image path convention

- Root `README.md` refs: `docs/images/foo.png`
- `docs/README.vi.md` + `docs/README.ja.md` refs: `images/foo.png`

### 2.4 Screenshot list (đặt placeholder trong markdown, user chụp sau)

Mỗi placeholder thêm vào README ở section tương ứng dạng `![alt](docs/images/NN-name.png)`.

| # | Filename | Nội dung cần chụp | Section |
|---|---|---|---|
| 01 | `01-hero-companion-panel.png` | Hero: VS Code + Live2D Hiyori trong sidebar panel + file code bên cạnh | Top README |
| 02 | `02-live2d-models-gallery.png` | 2×2 grid: Hiyori, Haru, Mao, Miara | Live2D Models |
| 03 | `03-chat-panel-streaming.png` | Chat panel mid-stream, message trong bubble hồng + sparkle caret | AI Chat |
| 04 | `04-chat-provider-picker.png` | QuickPick "Configure Chat Provider" hiển thị đủ 8 providers (sau khi merge v0.3.1) | Multi-provider |
| 05 | `05-chat-context-mention.png` | Autocomplete `#filename` dropdown khi gõ `#pa…` | Context awareness |
| 06 | `06-desktop-pet-window.png` | Floating desktop pet đè lên 1 app khác (always-on-top, transparent) | Desktop Companion |
| 07 | `07-cursor-chibi.png` | Editor zoom với chibi sprite ở cursor | Cursor Chibi |
| 08 | `08-pomodoro-running.png` | Status bar + bubble trong session Pomodoro | Pomodoro |
| 09 | `09-achievements-panel.png` | Achievements webview với vài cái unlocked | Achievements |
| 10 | `10-ambient-menu.png` | Ambient picker (lofi/rain/cafe + custom) | Ambient |
| 11 | `11-rightclick-menu.png` | Right-click menu hiện tại trên pet desktop | Commands |
| 12 | `12-settings-ui.png` | VS Code Settings UI lọc `animeCompanion` | Configuration |

User có thể chụp dần — README ship với placeholder, broken image trên marketplace không catastrophic.

### 2.5 Sync convention (chống drift 3 file)

Thêm comment đầu mỗi file non-EN:
```md
<!-- Source of truth: ../README.md — keep in sync when editing. -->
```

CHANGELOG checklist mỗi entry: `[ ] Updated all 3 READMEs`.

### 2.6 JA translation — tone

- Polite (です/ます)
- Katakana cho technical loanwords (チャット, パネル, モデル)
- Giữ Latin: `Live2D Cubism`, tên model, command IDs
- Mark `<!-- TRANSLATION-REVIEW-NEEDED -->` ở section nhiều idiom (taglines, persona)

### 2.7 `package.json` description

**Verified**: hiện tại đã English (`"🌸 Live2D anime companion in your sidebar..."`). KHÔNG cần đổi — chỉ note trong CHANGELOG là "verified, no change".

---

## Phase 3 — CHANGELOG entry

Append block `## [0.3.1] - 2026-05-25` lên đầu [CHANGELOG.md](CHANGELOG.md), theo format Keep a Changelog. Sections:
- **Added**: 4 providers (xAI/DeepSeek/OpenRouter/Ollama với chi tiết endpoint), `OpenAICompatibleProvider` abstraction, 3-language docs, screenshots folder, `chat.ollamaEndpoint` setting
- **Changed**: README.md → English, command title rename (id unchanged), `ProviderId` extended, `needsKey()` Set-based, `package.json` enum + files array
- **Removed**: `src/chat/providers/openai.ts` (replaced by factory instance — no public-facing change)
- **Verified**: `package.json` description đã English — no change
- **Notes**: Pet chat + menu restructure deferred → v0.4.0

---

## Phase 4 — v0.4.0 Deferred Plan (NOT implement)

Ghi vào CHANGELOG `### Notes` section + tạo/append [docs/AI_CHAT_PLAN.md](docs/AI_CHAT_PLAN.md) một block `## v0.4.0 Roadmap`.

### 4.1 Pet desktop quick chat

- Right-click trên pet → "💬 Chat with me" → input overlay → submit qua WebSocket bridge (đã có ở [desktop-pet/src/main.rs](desktop-pet/src/main.rs):83) → response render trong **speech bubble** trên pet (auto-dismiss N giây, click-to-pin)
- New WS events: `pet:chat:request`, `pet:chat:delta`, `pet:chat:response`
- Reuse `chatManager.sendUserMessage` với flag `transient:true` (no history persist)
- Reuse `resolveSystemPrompt` từ `src/chat/persona.ts`
- Cap `maxTokens:200` (speech bubble không gian hạn chế)
- Touch points: [desktop-pet/web/](desktop-pet/web/), [media/webview/interaction.js](media/webview/interaction.js), [src/desktop-companion/companion-message-dispatcher.ts](src/desktop-companion/companion-message-dispatcher.ts)

### 4.2 Right-click menu reorganization — **Proposed layout**

Current main menu flat (Run, Commit, Pull, Push, Pomodoro, Achievements, Settings➤). Đề xuất gom nhóm theo functional area, top-level giữ ≤ 8 items:

```
Anime Companion
├── 💬 AI Chat                    ➤
│   ├── Open Chat
│   ├── New Conversation
│   ├── Ask About Selection
│   ├── ─────
│   ├── Configure Provider…
│   └── Clear All Conversations
├── 🌸 Appearance                 ➤
│   ├── Change Model…
│   ├── Capture Chibi from Model
│   ├── Toggle Cursor Chibi
│   ├── Tune Cursor Chibi Position…
│   └── Reset Companion Position
├── 🔊 Voice & Sound              ➤
│   ├── Change Voice Language…
│   ├── Change Message Language…
│   ├── Toggle Mute
│   └── Ambient…
├── 🍅 Workflow                   ➤
│   ├── Start / Stop Pomodoro
│   ├── Show Stats
│   └── Show Achievements
├── 🔧 Git Shortcuts              ➤
│   ├── Commit / Pull / Push
│   └── Run (build/test)
├── 🖥 Desktop Companion          ➤
│   ├── Toggle Desktop Mode
│   ├── Toggle Click-Through
│   └── Reset Workspace Model
├── ─────
├── ⚙ Open Settings (VS Code)
└── ❓ Show / Hide Companion
```

**Rationale**: AI Chat lên đầu (newest, most active); Git tách riêng (không phải core companion); Appearance vs Voice tách (visual vs audio); Desktop Companion submenu riêng (experimental toggles). File sửa khi implement: [media/webview/interaction.js](media/webview/interaction.js) lines 586-850 (`setupCompactContextMenu`).

---

## Risks & Tradeoffs

- **Ollama-not-installed UX**: Error message phải actionable — bao gồm endpoint URL + lệnh `ollama serve` + `ollama pull`. Optional polish v0.3.1: ping `GET ${endpoint}/api/tags` health check khi user pick Ollama từ picker.
- **OpenRouter model discovery**: 100+ models, free-text input là OK cho v0.3.1 (consistent với UX hiện có). Document `modelExamples` + tip `:free`. Future: cache `/api/v1/models`.
- **DeepSeek reasoner**: chỉ yield `delta.content`, bỏ `reasoning_content` (long pause trước response — same UX caveat như Gemini 2.5 thinking).
- **OpenRouter headers**: `extraHeaders` hook chỉ apply cho OpenRouter instance, không leak sang OpenAI.
- **Marketplace image rendering**: belt-and-suspenders — `docs/images/**` vào `files` array để VSIX bundle, đề phòng marketplace không fetch raw GitHub.
- **Ollama endpoint normalization**: strip trailing `/` trước khi save + concat `/api/chat`.
- **JA translation quality**: auto-translate có thể stiff — user (đọc được JA) review trước publish, mark `<!-- TRANSLATION-REVIEW-NEEDED -->`.
- **README drift**: 3 files × frequent changes — sync comment + CHANGELOG checklist mitigate.

---

## Verification

### Build / lint
```
npm run compile && npm run lint && npm run package
```

### Per-provider smoke test (manual)

| Provider | Setup | Test |
|---|---|---|
| xAI | Configure Chat Provider → xAI → paste key console.x.ai | `"Hello, who are you?"` — streamed Grok response |
| DeepSeek | Same flow, platform.deepseek.com key | `"Write Python fizzbuzz"` — code block ok |
| DeepSeek-R | Switch model to `deepseek-reasoner` | `"What is 17 * 23?"` — pause then final (CoT hidden) |
| OpenRouter | openrouter.ai/keys, default `openrouter/auto` | Send prompt; verify `HTTP-Referer` reaches dashboard |
| Ollama | `ollama pull llama3.2 && ollama serve` | Pick Ollama (no key prompt) → send → streaming works |
| Ollama err | Set endpoint `localhost:11435` (wrong port) | Send → error mentions endpoint + how-to-fix |

### Regression — existing providers
Anthropic / OpenAI / Gemini / Copilot vẫn hoạt động sau refactor. Đặc biệt OpenAI: verify `stream_options.include_usage` vẫn được set trong `OpenAICompatibleProvider`.

### Settings
- Open VS Code Settings → search `animeCompanion.chat` → `ollamaEndpoint` xuất hiện, default đúng
- `chat.provider` dropdown hiển thị 8 options với descriptions
- Upgrade từ 0.3.0: `chat.provider = copilot` hoặc `openai` vẫn valid (factory giữ id)

### Docs render
- `npx markdown-link-check README.md docs/README.vi.md docs/README.ja.md` — all links + image refs resolve
- Push branch → view trên GitHub: language switcher + screenshots render
- `vsce package` → unzip VSIX → confirm `extension/docs/images/` present
- Local VSIX install → Extension page hiển thị README English + hero image load

### Command palette + menus
- Type "Configure Chat Provider" → command appears (renamed)
- Old keybinding `animeCompanion.chat.setApiKey` vẫn work (id unchanged)
- Editor context menu "Ask Companion About Selection" still works

---

## Critical Files

**Modified**:
- [src/chat/llm-provider.ts](src/chat/llm-provider.ts)
- [src/chat/secrets.ts](src/chat/secrets.ts)
- [src/chat/chat-manager.ts](src/chat/chat-manager.ts) (around line 588 `runSetApiKeyCommand`)
- [package.json](package.json)
- [README.md](README.md) (rewrite EN)
- [CHANGELOG.md](CHANGELOG.md)

**New**:
- [src/chat/providers/openai-compatible.ts](src/chat/providers/openai-compatible.ts)
- [src/chat/providers/ollama.ts](src/chat/providers/ollama.ts)
- [docs/README.vi.md](docs/README.vi.md)
- [docs/README.ja.md](docs/README.ja.md)
- [docs/images/](docs/images/) (placeholder PNGs — user chụp)

**Deleted**:
- [src/chat/providers/openai.ts](src/chat/providers/openai.ts) — replaced by factory call

**Reuse (no edit)**:
- [src/chat/sse-parser.ts](src/chat/sse-parser.ts) — `parseSSE()` for OpenAI-compat
- [src/chat/persona.ts](src/chat/persona.ts) — `resolveSystemPrompt()` (v0.4.0 pet chat)
- [src/chat/providers/anthropic.ts](src/chat/providers/anthropic.ts), [gemini.ts](src/chat/providers/gemini.ts), [copilot.ts](src/chat/providers/copilot.ts) — không thay đổi
