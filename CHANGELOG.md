# Changelog

Tài liệu này theo format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
extension áp dụng [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.3] - 2026-06-22

### Added — 🔗 Add a background image straight from a URL (Google Drive / Dropbox)

- **You can now paste an image link into the Background control panel instead of only picking a local file.** Each region card (Fullscreen / Editor / Sidebar / Panel) gets a URL box + **Add URL** button next to the existing picker ([media/webview/background-panel.js](media/webview/background-panel.js), [media/webview/background-panel.css](media/webview/background-panel.css)). The extension downloads the image, saves it into global storage exactly like a picked file, and updates `animeCompanion.background.{region}.image` — so the existing apply/encode/patch pipeline is unchanged and **Apply (reload window)** works the same.
  - **Share-link normalization** ([src/background/image-url.ts](src/background/image-url.ts)) — Google Drive share links (`/file/d/<id>/view`, `open?id=<id>`, `uc?id=<id>`) and Dropbox links are rewritten to direct-download URLs automatically, so you can paste the link you get from the *Share* dialog (set it to **Anyone with the link**).
  - **Safe download** — fetched over the built-in `https`/`http` client with redirect-following (Google Drive → `googleusercontent`), a 20s timeout, and a ~2.4 MB cap (the image is embedded into a VS Code startup file, so it must stay small). The real image type is sniffed from magic bytes (png/jpg/webp/gif/bmp/svg) rather than trusting `Content-Type`, and an HTML response (a not-publicly-shared Drive file) is reported as a clear error instead of being saved.
  - **Inline feedback** — per-region loading state and error text live in the panel and survive its live re-renders (e.g. while dragging a slider).
- **i18n** — new `webview.backgroundPanel.url*` strings across en/vi/ja.

## [0.5.2] - 2026-06-13

### Added — 🎨 Custom theme (accent) colour for the Markdown editor

- **Recolour the 🌸 Markdown editor's pink chrome to any colour you like.** A round colour swatch + a **↺ reset** button now sit in the editor header next to the theme toggle ([src/markdown/markdown-editor-panel.ts](src/markdown/markdown-editor-panel.ts), [media/webview/markdown-editor.js](media/webview/markdown-editor.js), [media/webview/markdown-editor.css](media/webview/markdown-editor.css)). The choice is remembered across files and windows (`globalState` key `animeCompanion.markdownEditor.accentColor`); reset clears it so the default sakura pink comes back.
  - **One colour drives the whole accent.** The editor chrome is now refactored onto a single accent variable (`--ac-accent` / `--ac-accent-rgb`) — the header gradient, Save button, theme buttons, toolbar hover/active, borders, links, blockquote, caret, selection, and the scrollbar all derive from it. The deeper/lighter shades and a readable ink colour are derived automatically from the picked colour so text on the accent stays legible. **The page background is intentionally left alone — it keeps following dark/light mode.**
- **i18n** — new `webview.markdownEditor.accentColor` / `accentReset` strings across en/vi/ja.

### Changed — Slim scrollbars in the Markdown editor

- **The Markdown editor now uses a slim, accent-coloured scrollbar instead of the chunky default bar.** The webview shell no longer scrolls (`html, body { overflow: hidden }`) so scrolling happens inside the Toast UI panes, which use a thin scrollbar (`scrollbar-width: thin` + accent `scrollbar-color`, plus auto-hiding `::-webkit-scrollbar` rules where the platform honours them) ([media/webview/markdown-editor.css](media/webview/markdown-editor.css), [media/webview/markdown-editor.js](media/webview/markdown-editor.js)). This also resolves the earlier near-black scrollbar in the live-preview pane. (Note: on Windows, the OS may still draw native up/down arrow buttons on the thin bar — that's an OS-level scrollbar style, not removable from inside the webview.)

## [0.5.1] - 2026-06-10

### Added — 🌸 Markdown WYSIWYG editor in its own window

- **Open any `.md` file in a full-size, cute WYSIWYG editor and edit it in place — written straight back to the file.** A 🌸 flower button on the editor title bar (and a pulsing 🌸 status-bar item) shows whenever a Markdown file is active; clicking it opens the file in a dedicated Toast UI Editor tab (`ViewColumn.Active` — a full tab, not a split) where you both see the rendered document and edit it like a rich-text editor (à la CKEditor).
  - **Editor panel** ([src/markdown/markdown-editor-panel.ts](src/markdown/markdown-editor-panel.ts), [media/webview/markdown-editor.js](media/webview/markdown-editor.js), [media/webview/markdown-editor.css](media/webview/markdown-editor.css)) — one window per file URI (re-opening reveals the existing one). Saves through a `WorkspaceEdit` + `document.save()` so a normal editor tab for the same file stays in sync, and pulls in external edits when the panel has no pending changes.
  - **Safe by construction** — the WYSIWYG round-trip normalizes Markdown on save, so the editor **only writes when you actually edit**: merely previewing a file leaves it byte-for-byte, with a one-time reformat warning the first time you type.
  - **🌗 Dark / Light toggle** — a theme button in the header flips the editor between a plum-dark and a pink-cream light theme; the choice is remembered across files and windows (`globalState`).
  - **Anime Companion styling** — pink/sakura gradient header with a bobbing 🌸, a candy Save button, themed Toast UI chrome (toolbar/links/headings/code/selection in pink), and Mochiy Pop One / Nunito fonts.
  - **Status bar** ([src/markdown/markdown-status-bar.ts](src/markdown/markdown-status-bar.ts)) — gentle 🌸/💮 pulse only while a `.md` editor is active; hides and stops its timer otherwise.
  - **Library** — Toast UI Editor vendored as a self-contained UMD bundle ([media/vendor/toastui/](media/vendor/toastui/)), no bundler required.
- **i18n** — new `webview.markdownEditor.*` strings across en/vi/ja.

## [0.5.0] - 2026-06-09

### Added — 🖼️ Background Image (workbench) with a friendly control panel

- **Put a background image behind the editor, sidebar, and panel — driven by a visual control panel instead of hand-edited JSON.** Like the popular "Background" extension, this works by patching VS Code's `workbench.desktop.main.js` (there is no public API for a workbench background), but the focus here is the **control panel** that makes the whole lifecycle obvious — picking images, tuning per region, applying, and cleanly restoring. v1 targets desktop **VS Code stable**.
  - **Patch engine + lifecycle** ([src/background/background-patch-manager.ts](src/background/background-patch-manager.ts), [src/background/patch-generator.ts](src/background/patch-generator.ts), [src/background/workbench-locator.ts](src/background/workbench-locator.ts)) — locates the workbench file (`require.main` → `vscode.env.appRoot` fallback), backs up the pristine content per VS Code version, strips any old block, appends a uniquely-marked block (`// anime-companion-background-*`, distinct from other extensions so they can coexist), and writes atomically via tmp+rename. **Re-applies automatically after a VS Code update** (marker gone → re-patch on activate, gated by a cheap input signature so unchanged setups don't re-encode), handles **EACCES** on protected installs (Program Files) with an actionable message instead of crashing, and never throws into `activate()`.
  - **Clean uninstall** ([src/background/uninstall.ts](src/background/uninstall.ts)) — a `vscode:uninstall` Node hook strips the patch from the workbench file when the extension is removed, so VS Code is left clean. (Best-effort: doesn't fire on a hard kill; the in-app **Disable & Restore** is the other path.)
  - **Dedicated control panel** ([src/background/background-panel.ts](src/background/background-panel.ts), [media/webview/background-panel.js](media/webview/background-panel.js), [media/webview/background-panel.css](media/webview/background-panel.css)) — one card per region (**Fullscreen / Editor / Sidebar / Panel** — Fullscreen puts a single image behind the whole window) with image picker + thumbnail, opacity / blur / sizing / position controls, an in-panel live preview, a master enable toggle, **Apply (reloads window)**, **Disable & Restore**, an opt-in "silence the installation-corrupt warning" toggle (patches `product.json` checksums), and a "how this works" lifecycle explainer. Picked images are copied into global storage and embedded as data-URIs.
  - **Settings** — `animeCompanion.background.*` (master `enabled` / `patchChecksums` + per-region `enabled` / `image` / `opacity` / `blur` / `size` / `position`). Best configured through the panel, not by hand.
  - **Commands** — `Background Image: Open Control Panel` / `Apply` / `Disable & Restore`; also reachable from the companion right-click menu (Appearance › 🖼️ Background Image).
- **i18n** — new `webview.backgroundPanel.*` strings and a `menu.background` entry across en/vi/ja.

## [0.4.3] - 2026-06-02

### Fixed — Claude account swap left the account broken (load forever → logged out)

- **Swapping Claude accounts restored only the OAuth tokens, not the account binding — so every swap left Claude spinning and then forced a re-login.** Claude's identity is split across two files: `~/.claude/.credentials.json` (the tokens, which the swap handled) and the home-level `~/.claude.json`, whose `oauthAccount` holds the **organizationUuid** and account identity. `organizationUuid` exists *only* in `~/.claude.json`, so restoring the new account's token while that file still advertised the previous account's org produced a mismatch on every API call ("loads forever → kicked out → must log in again"). The Claude backend now captures `oauthAccount` + `userID` into a snapshot sidecar (`.claude-account.json`) on save and **merges** them back into `~/.claude.json` on switch — preserving everything else in that file (projects, MCP servers, caches), backing it up first, and writing atomically ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts), [src/agent-profiles/credential-fs.ts](src/agent-profiles/credential-fs.ts)). **Existing saved Claude profiles must be re-saved once** to capture the binding — older snapshots lack the sidecar and the swap stays inert for them.
- **Stale OAuth refresh tokens after a swap.** Claude rotates refresh tokens as the live session refreshes, so a profile captured earlier could hold an already-dead token by the time you switched back to it. Switching away from an account now re-snapshots its *current* live credentials into its own profile first (guarded so a manual CLI re-login can't corrupt the saved profile), keeping it restorable ([src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)). For that guard — and live-active detection — to survive rotation, the account **signature is now derived from the stable `organizationUuid`** (read from the account binding) instead of a refresh-token hash, which itself drifts on every rotation ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts)). The saved-profile label now shows the account email too.
- **Dropped phantom whitelist entries** (`claude.json`, `config.json`, `.config.json`) — no such files exist inside `~/.claude`, and `claude.json` in particular implied the home-level `~/.claude.json` was being handled when it wasn't.

## [0.4.2] - 2026-06-02

### Fixed — Saving Claude team/SSO accounts

- **Claude accounts without a top-level `organizationUuid` could not be saved or detected as active.** Team/SSO logins (and logins that nest the org id inside the `claudeAiOauth` blob) were silently treated as "no account", so *Save current as…* and the live-active check skipped them ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts)). Identity reading now: reads the org id from the oauth blob when it's absent at the top level; and when there's no org at all, derives a stable account signature from a SHA-256 hash of the **refresh** token (more stable than the access token, which rotates on every refresh), falling back to the subscription type. Org-less accounts stay identifiable instead of being dropped.

### Changed — Backend abstraction for non-file accounts

- **`AccountBackend` now supports two flavours uniformly** ([src/agent-profiles/backends/account-backend.ts](src/agent-profiles/backends/account-backend.ts), [src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)): *file-based* backends (Claude, Codex) that describe a `homeDir` + whitelist and let the manager drive the file copy, and *custom* backends that own their own `isAvailable`/`readLiveIdentity`/`snapshot`/`restore`. The manager drives both through capability wrappers, so a non-file (e.g. auth-based) account can ride alongside the file-swap profiles.
- **Clearer errors when a CLI isn't logged in** — *Save* now reports "No `<tool>` credentials found. Log in to `<tool>` first." instead of a raw missing-path message.

## [0.4.1] - 2026-05-30

### Added — GitHub account swap (Agent Accounts)

- **Switch which signed-in GitHub account the extension uses for Copilot, from the same Agent Accounts surfaces — globally.** GitHub accounts in VS Code's account menu are authenticated *into VS Code* (tokens in the OS keychain), so unlike the Claude/Codex file-swap this is **auth-based**: it picks which signed-in account the extension's own sessions use via `vscode.authentication.getSession({ account })`. It does **not** change git commit identity or what other extensions use — VS Code has no global "active account".
  - **Single source of truth** ([src/github-account-service.ts](src/github-account-service.ts)) — `GitHubAccountService` lists accounts (`getAccounts('github')`), stores the chosen account in **`globalState['agentProfiles.githubAccountPreference']`** (global, per the user's choice), switches/adds/clears, re-applies on activation, and emits change events. The previous per-workspace Copilot preference is migrated up to global on first run.
  - **Surfaced everywhere the CLI accounts are** — a 🐙 GitHub section in the Agent Accounts panel (Use / Use VS Code default / Add account, with a "global · only affects this extension/Copilot" note) ([src/agent-profiles/profile-panel.ts](src/agent-profiles/profile-panel.ts)); the unified status-bar quick-switch ([src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)); a new command `Anime Companion: Agent Accounts — Switch GitHub Account…`; and pet right-click → **Agent › GitHub Account…**.
  - **Chat stays in sync** — `ChatManager` delegates its Copilot-account logic to the shared service ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)), and any GitHub switch (from any surface) refreshes the chat panel snapshot.

### Changed

- **GitHub Copilot account preference moved from per-workspace to global** (`workspaceState` → `globalState`), with a one-time migration of any existing choice — so the chosen GitHub account applies across every workspace.

### Fixed

- **`npm test` (smoke test) was broken since v0.4.0** — the mocked `vscode` lacked `EventEmitter`, which `AgentProfileManager` constructs at activation, so activation threw. Completed the mock (`EventEmitter`, `authentication`, `QuickPickItemKind`, `workspaceState`, and a fallback-aware `globalState.get`) so activation is validated again.

## [0.4.0] - 2026-05-28

### Added — Agent Accounts (multi-CLI credential swap)

- **Save and switch between multiple agent CLI accounts without re-logging-in.** Snapshot the credential files of a logged-in CLI tool (Claude Code, Codex), then swap accounts later with one click. Mirrors the spirit of the PowerShell `Switch-ClaudeAccount.ps1` script users had been running externally — same atomic file-swap idea, ported to TypeScript / Node `fs` so it works cross-platform (no shell-out, no Windows-only dependency) and integrates with the companion's UX.
  - **Tool-agnostic backend registry** ([src/agent-profiles/backends/account-backend.ts](src/agent-profiles/backends/account-backend.ts)) — `AccountBackend` interface defines `homeDir()`, a whitelist of credential files, a sentinel file, and `readIdentity()`. New backends register through `registerBackend(...)` in [src/extension.ts](src/extension.ts). Adding a future CLI (Antigravity, Gemini CLI, …) is a single new file + one register line — manager, panel, status bar, popups, status bar all dispatch through the registry.
  - **Claude backend** ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts)) — `~/.claude/`, whitelist `{.credentials.json, settings.json, settings.local.json, claude.json, config.json, .config.json}`. Identity = `organizationUuid` + `claudeAiOauth.subscriptionType` → displayed as `sub=team · org=09eb97ad · exp=…`.
  - **Codex backend** ([src/agent-profiles/backends/codex-backend.ts](src/agent-profiles/backends/codex-backend.ts)) — `~/.codex/`, whitelist `{auth.json}` only (the rest is sessions/sqlite/cache, irrelevant for account swap). Identity = `tokens.account_id`; display text decodes the OAuth `id_token` JWT (no verification, payload only) to surface `email` + `chatgpt_plan_type` — e.g. `mode=chatgpt · user@example.com · plan=plus`.
  - **Cross-platform atomic swap** ([src/agent-profiles/credential-fs.ts](src/agent-profiles/credential-fs.ts)) — `snapshotDir(src, dest, whitelist)` + `restoreDir(src, dest, whitelist)`. Restore writes each file via `<final>.tmp` → `fs.rename` so a half-finished swap can't leave the CLI in a torn state. Rolling 3-backup retention per tool (`.backup-<toolId>-<ts>/`) before every restore.
  - **Profile data model** ([src/agent-profiles/types.ts](src/agent-profiles/types.ts), [src/agent-profiles/profile-store.ts](src/agent-profiles/profile-store.ts)) — `AgentProfile { id, name, tool, claudeSnapshot, createdAt, updatedAt }` lives in `context.globalState['agentProfiles.store']`. Snapshots live under `context.globalStorageUri/agent-profiles/<id>/snapshot/`. Old profiles (saved before the `tool` field existed) migrate transparently to `tool: 'claude'` on first read.
  - **Per-tool active detection** ([src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)) — instead of trusting the last `useProfile` call as ground truth, `detectActiveIds()` reads the live credential of every registered backend's `homeDir()` and matches its `signature` against each saved snapshot. So external swaps (e.g. running the PowerShell script outside the extension) are reflected correctly. Multiple tools can be "active" simultaneously — one per registered backend — and the status bar / panel / quick-switch all show that correctly.
  - **In-webview popups** ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)) — right-click pet → **Agent ›**:
    - **🔁 Đổi nhanh** opens a popup at the model with profiles grouped by tool section (`🤖 Claude (2)` / `⚡ Codex (1)`), each row showing identity text. Click → swap, info toast confirms.
    - **💾 Lưu hồ sơ hiện tại** opens a popup at the model with inline tool picker (auto-selected if only 1 logged-in CLI; tool buttons if ≥2) + name input. No VS Code QuickPick interruption — the entire flow stays attached to the pet.
    - **👀 Quản lý hồ sơ…** opens the full standalone webview panel ([src/agent-profiles/profile-panel.ts](src/agent-profiles/profile-panel.ts)) with tool-section grouping, identity preview, Use / Rename / Delete actions, and a "Save current" button.
  - **Status bar item** ([src/extension.ts](src/extension.ts) `AgentProfileStatusBar`, `Right, 99`) — shows the active profile's name; if multiple tools are active, shows `N accounts` with a per-tool tooltip. Click → quick-switch.
  - **5 command-palette commands** — `Anime Companion: Agent Accounts — Manage… / Save Current As… / List / Quick Switch… / Delete…`.
  - **Restart hint** — every swap shows an info toast reminding the user to restart any running CLI session so it reloads the new token. The extension does not detect or kill CLI processes.
- **i18n** — new keys (`menu.agentCategory`, `menu.agentList/Switch/Save`, `panels.agentSwitchTitle/SaveTitle/NamePlaceholder/Cancel/SaveBtn/Loading/Empty/PickTool/NoTool`) added across en/vi/ja.

### Added — Pet Quick Chat (roadmap §4.2)

- **Right-click pet → 💬 Quick Chat → input overlay → streaming reply in speech bubble.** Lets the user ask the companion a one-shot question without opening the full chat panel. Tailored for Desktop Companion mode where the chat panel isn't on-screen, but works identically in panel mode.
  - **Input overlay** ([media/webview/ui.js](media/webview/ui.js), [media/companion.css](media/companion.css)) — pink-themed `companion-quickchat-panel` sits above the character; 2-row textarea (400 char cap), Send + Cancel buttons. Enter sends, Shift+Enter newline, Esc cancels.
  - **Transient reply** — `ChatManager.sendQuickChat()` ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) is a new code path that does **not** touch `ConversationStore`, **not** broadcast `chat:*` events to the panel, and runs on an independent abort/in-flight guard (`_quickAbort`/`_quickInFlight`) so it can't be cancelled by panel chat traffic and vice-versa. Default `maxTokens: 200` (speech-bubble fits ~600 visible chars before the tail-keep window kicks in). Caller drives the bubble through 4 callbacks (`onDelta`, `onEnd`, `onError`).
  - **Streaming bubble** ([media/webview/ui.js](media/webview/ui.js)) — new `startBubbleStream`/`appendBubbleStream`/`finishBubbleStream`/`errorBubbleStream`. While streaming, the bubble suppresses the usual 6s auto-dismiss + sets a `bubbleStreaming` flag so reactive bubble calls (idle phrases, save praises) yield the surface instead of clobbering the reply. End-of-stream starts a 12s dismiss timer with **click-to-pin**: clicking the bubble before the timer fires cancels the timer and keeps the reply visible until the next right-click. CSS pulse `✨` while streaming, pink border when pinned.
  - **WS-bridge-safe** — works through `window.__VS_CODE_BRIDGE__` in Desktop mode (Tauri WebSocket) and through `acquireVsCodeApi()` in Panel mode (VS Code postMessage). No transport-specific code.
  - **New message protocol** — webview → host: `pet:chat:request {prompt, requestId, maxTokens}` / `pet:chat:cancel`. Host → webview: `pet:chat:delta {requestId, delta}` / `pet:chat:end {requestId, text}` / `pet:chat:error {requestId, message, aborted}`. Dispatcher handlers in [src/companion-message-dispatcher.ts](src/companion-message-dispatcher.ts). `maxTokens` server-side capped at 1024 so a stray client can't burn an entire context window through this surface.
- **i18n** — `menu.chatQuick` and `bubbles.quickChatThinking` added to all 3 message files (en/vi/ja).

### Fixed

- **Desktop Quick Chat bubble overflow** ([media/companion.css](media/companion.css)) — a long quick-chat reply made the speech bubble taller than the small Tauri desktop window and clipped off the top of the screen. `.bubble-text` now caps at `max-height: 40vh` with `overflow-y: auto` + `overflow-wrap: anywhere` so the bubble stays inside the window and scrolls internally for long replies.
- **Desktop Quick Chat panel clipped at top** ([media/companion.css](media/companion.css)) — the default `bottom: calc(100% - 20px)` anchor placed the quick-chat panel's bottom edge near the top of the `character-wrapper`, then grew the panel upward off the Tauri window. Desktop mode now `position: fixed`-pins the panel to `top: 8px` of the viewport (with a higher-specificity override on the `.quickchat-compact` rule so it wins the cascade); history scrolls inside the panel at `max-height: 28vh`. Pet right-click → Quick Chat now always renders fully inside the window.
- **Stale bubble overlapping reopened Quick Chat panel** ([media/webview/ui.js](media/webview/ui.js)) — a previous reply's bubble (still inside its 12s auto-dismiss window, or pinned) overlapped the freshly-opened Quick Chat panel and looked like a layout bug. `showQuickChatPanel()` now calls a new exported `forceDismissBubble()` first to nuke any lingering bubble state before showing the input.
- **`finishBubbleStream` click-handler leak** ([media/webview/ui.js](media/webview/ui.js)) — each stream finish attached a fresh `click` listener (pin/unpin handler) on the bubble element without removing the previous one. Over many replies, listeners piled up and a single click toggled pin state multiple times. Listeners are now tracked through a module-level `bubbleClickHandler` and removed before attaching the next one (and on hard dismiss / force dismiss).

### Notes

- Reuses the panel chat's persona system prompt (`resolveSystemPrompt(panelModelName)`) so the pet replies with the same character voice as the chat panel. Quick chat ignores conversation history — every Quick Chat is a fresh turn (matches the "transient" intent from the roadmap).
- Sentiment-driven Live2D reaction (`_reactToReply`) runs on the final accumulated text, just like panel chat replies — pet's expression/mood still tracks reply tone.
- The PowerShell `Switch-ClaudeAccount.ps1` script users were running externally remains compatible — it touches the same `~/.claude/.credentials.json` the extension does. The extension's per-tool `detectActiveIds()` reads the live credential, so external swaps via that script are reflected in the status bar / panel without re-running anything in the extension. Profiles saved via the PS script (under `~/.claude/account-profiles/`) are stored independently of the extension's snapshots (`globalStorage/.../agent-profiles/<id>/`); no automatic import — re-save through the extension to register a profile here.

## [0.3.3] - 2026-05-25

### Changed

- **Right-click menu reorganization** ([media/webview/interaction.js](media/webview/interaction.js)) — the companion's in-webview context menu is now grouped into 6 functional submenus instead of a single flat "Settings ›" list per roadmap v0.4.0 §4.1: 💬 **AI Chat** (Open Chat · New Conversation · Ask About Selection · Configure Provider · Clear All) · 🌸 **Appearance** (Model · Capture Chibi · Cursor Chibi toggle/tune · Reset Position · Motion · Poke) · 🔊 **Voice & Sound** (Voice · Messages · Ambient · Mute) · 🍅 **Workflow** (Start/Stop Pomodoro · Stats · Achievements) · 🔧 **Git** (Commit · Pull · Push · Run) · 🖥️ **Desktop** (Switch Desktop/Panel · Click-Through · Reset Workspace Model). Top level now keeps only `All Settings` as the quick action below the category list. Implementation is now data-driven (single `categories` array) so adding/removing items is one entry instead of HTML+handler+i18n in three places.

### Added

- **AI Chat entries reachable from the companion's right-click menu** — previously the chat commands (`animeCompanion.chat.open`, `.newConversation`, `.askSelection`, `.setApiKey`, `.clearHistory`) were only in the Command Palette and the editor context menu. They now appear under the companion's **AI Chat ›** submenu so the pet itself can launch a conversation without leaving the mouse.
- **Cursor Chibi controls in the right-click menu** — `Capture Chibi`, `Toggle Cursor Chibi`, `Tune Cursor Chibi`, and `Reset Position` were previously only command-palette accessible. They are now grouped under **Appearance ›**.
- **i18n keys for new menu labels** ([media/messages/{en,vi,ja}.json](media/messages/)) — `menu.chatCategory`, `menu.appearanceCategory`, `menu.voiceCategory`, `menu.workflowCategory`, `menu.gitCategory`, `menu.desktopCategory`, `menu.allSettings`, plus per-item keys (`menu.chatOpen`, `menu.startPomodoro`, `menu.stopPomodoro`, `menu.switchToDesktop`, `menu.switchToPanel`, `menu.clickThrough`, `menu.resetWorkspaceModel`, etc.). Vietnamese and Japanese menu strings translated; previously several entries were left as English ("Model", "Voice", "Messages") in vi.json/ja.json — now properly localized.

### Fixed

- **`animeCompanion.toggleDesktopClickThrough` command was declared in `package.json` but never registered** ([src/extension.ts](src/extension.ts)) — invoking it from the Command Palette since v0.1.x silently did nothing. Handler now reads `desktopCompanion.clickThrough`, flips it, and shows an info toast. Refuses with a hint message if the user is still in Panel mode (the setting only takes effect when Desktop Companion is enabled).
- **Menu label fit + Vietnamese glyph rendering** ([media/messages/{en,vi,ja}.json](media/messages/), [media/companion.css](media/companion.css)) — shortened the top-level `Desktop Companion` label to `Desktop` across EN / VI / JA, tightened several Vietnamese menu labels (`Chat AI`, `Âm thanh`, `Quy trình`, `Cài đặt`) to avoid wrapping in narrow panels, and added a Vietnamese-only rounded font fallback for the context menu so accented characters render cleanly without losing the current cute visual tone.

## [0.3.2] - 2026-05-25

### Added

- **Dynamic Gemini model list** ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) — when the active provider is Gemini and an API key is stored, the chat panel now calls `GET https://generativelanguage.googleapis.com/v1beta/models` and populates the model dropdown with whatever the key actually supports. Result is cached in-memory for 5 minutes (per-provider, `_modelListCache`) and invalidated on provider switch. Filter keeps only models whose `supportedGenerationMethods` include `generateContent` / `streamGenerateContent`; drops the deprecated `gemini-1.*` family; sorts newest version first. The hardcoded `PROVIDER_INFO.modelExamples` for Gemini stays as fallback when the key is missing or the API call fails. Cache helper is generic (`_fetchProviderModels(providerId, apiKey)`) so OpenAI/OpenRouter listing can plug in later without restructuring.
- **Roleplay actions render as emoji icons** ([media/webview/chat.js](media/webview/chat.js), [media/webview/chat.css](media/webview/chat.css)) — anime-companion personas often emit narrative actions like `*blushes softly and smiles warmly*` or `*ôm chặt anh*`. The minimal webview markdown previously showed these as raw asterisked text. Now `renderInlineCode()` runs a single regex pass that detects both inline `` `code` `` and `*action*` blocks (action must start with a letter to avoid swallowing `**bold**` or bullet-list asterisks) and substitutes each action with a single representative emoji via `ROLEPLAY_ACTION_EMOJI` — ~25 keyword clusters covering EN + VI verbs (hug/ôm → 🤗, blush/đỏ mặt → ☺️, kiss/hôn → 😘, headpat → 🫳, wink/nháy mắt → 😉, pout/phụng phịu → 😤, cry/khóc → 🥺, sigh/thở dài → 😮‍💨, think/nghĩ → 🤔, wave/vẫy → 👋, etc.). Unmatched actions fall back to 🌸. The emoji span carries `title={original action}` so hovering still surfaces the model's exact wording for debugging or curiosity. CSS class `.chat-roleplay-emoji` bumps font-size to `1.15em` with `cursor: help`.

### Fixed

- **Chat provider & model selection survives reload + Q&A turns** ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) — picking "Google Gemini" + `gemini-2.5-pro` in the panel header and then sending a message could leave the dropdown reset to GitHub Copilot on the next snapshot, even though the API call itself used the right provider. Root cause was that `sendSnapshot()` re-read `cfg.get('chat.provider')` and any scope/persistence hiccup on the workspace-target write surfaced as the dropdown silently snapping back to the default. Fix introduces a durable layer: `workspaceState` keys `chat.providerSelection` and `chat.modelSelection` are written first in `setProvider()` / `setModel()` (synchronous, never fails), then the VS Code config is mirrored inside a `try/catch` (best-effort, still editable from Settings UI). New `_resolveActiveProvider()` / `_resolveActiveModel()` helpers read workspaceState first, fall back to cfg, then to the provider's default — every snapshot, every send, every new-conversation call goes through them so the user's choice is the source of truth instead of a derived computation.

### Changed

- **Cute persona — bolder waifu tone, language-aware addressing** ([src/chat/persona.ts](src/chat/persona.ts)) — `cute` preset rewritten to be "warm, affectionate, playful, slightly clingy, with a bold waifu vibe". Explicit per-language guidance for self-reference and the user's address form: Vietnamese → "em"/"bé" for self + "anh"/"Onii-chan" for the user; English → "Onii-chan"/"big bro"; Japanese → "Onii-chan"/"anata". Soft-flirty allowed but explicitly blocked from explicit/sexual/rude content. Companion stays in character (no "as an AI" breaks). Other presets (`professional`, `tsundere`, `energetic`) untouched.
- **`package.json` setting descriptions** — `chat.provider` and `chat.model` descriptions now mention that the chat-panel-driven write lands in the workspace `.vscode/settings.json` when a workspace is open, so users editing settings.json directly know which scope owns the value.

## [0.3.1] - 2026-05-25

### Added — 4 new chat providers + tri-lingual docs

- **xAI Grok (BYOK)** — OpenAI-compatible endpoint `https://api.x.ai/v1`. Default model `grok-2-latest`. Examples: `grok-2-latest`, `grok-2`, `grok-3`, `grok-beta`. Key prefix `xai-…` from console.x.ai.
- **DeepSeek (BYOK)** — OpenAI-compatible endpoint `https://api.deepseek.com/v1`. Models `deepseek-chat`, `deepseek-reasoner`. Key prefix `sk-…` from platform.deepseek.com. Reasoner chain-of-thought (`reasoning_content`) is intentionally NOT rendered in the chat bubble — only the final answer streams to the user, matching the UX of Gemini 2.5 thinking models.
- **OpenRouter (BYOK)** — gateway to 100+ models via `https://openrouter.ai/api/v1`. Default `openrouter/auto`. Examples include `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`, `meta-llama/llama-3.3-70b-instruct`, `google/gemini-2.0-flash-exp:free` (no-cost free-tier suffix). Sends `HTTP-Referer` + `X-Title` headers for proper attribution on the OpenRouter dashboard. Key prefix `sk-or-v1-…` from openrouter.ai/keys.
- **Ollama (local, no API key)** — talks to a local Ollama server. Streams via NDJSON (newline-delimited JSON) on `POST /api/chat`, not SSE. Reads endpoint live from the new `animeCompanion.chat.ollamaEndpoint` setting (default `http://localhost:11434`) so the user can change hosts without reloading the window. Maps `prompt_eval_count` + `eval_count` from the final chunk into our `StreamUsage`. Connection failure → friendly error pointing at the configured endpoint, `ollama serve`, and `ollama pull <model>`.
- **`OpenAICompatibleProvider` abstraction** ([src/chat/providers/openai-compatible.ts](src/chat/providers/openai-compatible.ts)) — single class drives OpenAI + xAI + DeepSeek + OpenRouter from per-instance config (`baseUrl`, `defaultModel`, optional `extraHeaders` for OpenRouter attribution headers). Eliminates 3× duplication of fetch + SSE parsing.
- **`animeCompanion.chat.ollamaEndpoint`** setting — string, default `http://localhost:11434`. Validated and normalized (trailing `/` stripped) when set via the `Configure Chat Provider` command.
- **Tri-lingual documentation** — README now ships in 3 languages with a language switcher at the top of each file:
  - [README.md](README.md) (root) — **English**, the source of truth for marketplace listing.
  - [docs/README.vi.md](docs/README.vi.md) — **Tiếng Việt**.
  - [docs/README.ja.md](docs/README.ja.md) — **日本語**.
- **Screenshot manifest** ([docs/images/README.md](docs/images/README.md)) — listing 12 screenshots with capture specs (hero, chat panel streaming, provider picker showing all 8 entries, `#mention` autocomplete, desktop pet, cursor chibi, Pomodoro, achievements, ambient menu, right-click menu, settings UI). Marketplace listing includes inline image references; broken-image icons are acceptable until shots land.
- **Copy-reply button on every assistant message** ([media/webview/chat.js](media/webview/chat.js), [media/webview/chat.css](media/webview/chat.css)) — small clipboard icon at the bottom-right of finalised assistant bubbles. Hidden during streaming so an in-flight reply can't be copied half-formed. On click the icon swaps to a checkmark with a `cubic-bezier(0.34, 1.56, 0.64, 1)` pop animation and the bubble flashes green; reverts after 1.4 s. Failure shows red. The button copies the raw markdown source (stored in `dataset.copySource`) rather than `innerText`, so code-block "Copy" labels don't leak into the clipboard.

### Changed

- **`Set Chat API Key (BYOK)` → `Configure Chat Provider (API Key / Endpoint)`** — command title renamed to reflect that it now also configures the Ollama endpoint. The command id `animeCompanion.chat.setApiKey` is unchanged, so any existing keybindings keep working.
- **`runSetApiKeyCommand`** ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) — filter changed from `p.requiresApiKey` to `p.id !== 'copilot'` so Ollama appears in the QuickPick. When the user picks Ollama, the flow branches to an InputBox prompting for the endpoint URL (validated with `^https?://.+`) and saves to `chat.ollamaEndpoint` via `ConfigurationTarget.Global`.
- **`ProviderId` type** ([src/chat/secrets.ts](src/chat/secrets.ts)) — extended from 4 to 8 ids. `needsKey()` refactored to a Set check (`NO_KEY_PROVIDERS = {copilot, ollama}`). `hasAny()` now iterates the explicit `BYOK_PROVIDERS` list so adding non-BYOK providers later is safe.
- **`package.json`** — `chat.provider` enum + `enumDescriptions` extended to 8 ids; new `chat.ollamaEndpoint` setting; `files` array adds `"docs/images/**"` so screenshots ship in the VSIX (marketplace listing renders them reliably regardless of GitHub fetch behavior); command title renamed as above.

### Fixed

- **Live2D model now resizes live with the panel** ([media/webview/interaction.js](media/webview/interaction.js)). Two issues fixed:
  - `fitModel()` was scaling to `getLocalBounds()`, which under-counts physics-driven parts (hair sway, skirt, breathing). With the panel made short, the actual rendered character overflowed and the feet got clipped. Switched to `internalModel.originalWidth/Height` (the Live2D-designed canvas — authoritative full extent) and added a small bottom padding (`max(6, h * 0.02)`) so animation sway no longer pokes past the panel edge.
  - After the user dragged the companion, the container was pinned with `position: fixed` + explicit pixel `width`/`height`. The wrapper inside then had frozen dimensions, so the existing `ResizeObserver` on the wrapper never fired when the parent panel was resized — the model size froze. Added a window-level `resize` listener AND a body-level `ResizeObserver` that re-sync the pinned container's `width`/`height` to its parent and explicitly refit the model. Clamps `left`/`top` so the companion stays inside the viewport after shrink. No-op for the default flex layout (unpinned case still works via the wrapper observer).

### Removed

- `src/chat/providers/openai.ts` — replaced by an `OpenAICompatibleProvider` instance with `baseUrl: 'https://api.openai.com/v1'` registered directly in [src/chat/llm-provider.ts](src/chat/llm-provider.ts). No public-facing change.

### Verified (no change needed)

- `package.json` `description` was already English — no rewrite required.

### Notes

- **Deferred to v0.4.0** (see [docs/PLAN_v0.3.1.md](docs/PLAN_v0.3.1.md) §4): chat directly from the desktop-pet right-click menu via speech-bubble response, and the right-click menu functional-area reorganization (AI Chat / Appearance / Voice & Sound / Workflow / Git Shortcuts / Desktop Companion submenus).
- **README sync convention**: English is the source of truth. The two non-EN files carry a `<!-- Source of truth: ../README.md -->` header comment; the JA file additionally carries a `<!-- TRANSLATION-REVIEW-NEEDED -->` marker since auto-translation may sound stiff in idiom-heavy sections (taglines, persona). Update all three when editing.

## [0.3.0] - 2026-05-13

### Added — AI Chat Companion (BYOK + Copilot)

Bản này biến companion từ một mascot thuần reactive thành **chat assistant** ngay trong VS Code panel. Trò chuyện với companion qua một panel slide-in tích hợp cạnh Live2D character, hỏi về code đang viết, lấy ý tưởng, học framework mới — companion vẫn giữ persona anime trong khi trả lời.

- **4 LLM provider hỗ trợ**:
  - **GitHub Copilot (mặc định, không cần API key)** — route qua `vscode.lm.selectChatModels({ vendor: 'copilot' })`. Dùng subscription Copilot có sẵn của user; first call sẽ trigger consent dialog của VS Code. Hỗ trợ mọi model Copilot expose (gpt-4o, claude-3.5/3.7-sonnet, gemini-1.5-pro, o1-mini…).
  - **Anthropic Claude (BYOK)** — `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Streaming qua SSE.
  - **OpenAI GPT (BYOK)** — `gpt-4o`, `gpt-4o-mini`, `o1-mini`. Streaming qua SSE với `stream_options.include_usage` cho token counting realtime.
  - **Google Gemini (BYOK, có free tier)** — `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`. Streaming qua `:streamGenerateContent?alt=sse`. Skip thinking parts (`thought: true`) cho 2.5 series.
- **BYOK an toàn**: API keys lưu trong `vscode.ExtensionContext.secrets` (OS keychain encrypted at rest). Webview không bao giờ thấy key — request body build ở extension host. Command `Set Chat API Key` cho QuickPick chọn provider + InputBox masked. Không có field nào trong `settings.json` lưu key.
- **Streaming token-by-token** với sparkle caret ✨ + thinking dots animation 3 chấm hồng khi đợi chunk đầu tiên — "thoughts coming out" experience.
- **Multi-conversation history**: persist mỗi conversation vào 1 file JSON dưới `globalStorageUri/chat-history/<id>.json` (atomic rename khi save). Sidebar liệt kê conversations, mỗi item có rename ✎ / delete 🗑 (driven bằng `showInputBox` / `showWarningMessage` của VS Code, không phải `prompt`/`confirm` browser — đó là cách hoạt động trong webview). Active conversation pinned per-workspace qua `workspaceState`. Empty conversations tự được dọn khi tạo mới để sidebar không phình.
- **Context awareness**:
  - **Selection toggle (📌)**: chip toggle icon ngay cạnh Send. Click → gửi editor selection hiện tại kèm prompt.
  - **Active file toggle (📄)**: kèm toàn bộ file đang mở (cap 12k chars, có truncation marker).
  - **`#file` mention**: gõ `#` trong textarea → autocomplete dropdown tìm file qua `vscode.workspace.findFiles`. Arrow Up/Down + Tab/Enter để chọn. Mention tự được resolve khi gửi.
  - **Right-click "Ask Companion About Selection"**: command palette + editor context menu. Stage selection vào chip vàng, mở panel, focus textarea.
- **Persona system**: 4 preset prompt (`cute`, `professional`, `tsundere`, `energetic`) inject `{modelName}` của Live2D character đang dùng. Override hoàn toàn bằng `chat.systemPrompt` setting.
- **Live2D reactions theo sentiment**: heuristic regex EN+VI chia mood ra `happy`/`sad`/`thinking`/`excited`/`neutral` sau khi stream xong → trigger `setMood` + `playMotion` (TapBody / TapHead) → character thật sự visibly phản ứng với câu trả lời. Toggle `chat.reactionsEnabled` (default `true`).
- **Avatar + identity**: assistant avatar dùng captured chibi PNG của Live2D model hiện tại (`globalStorageUri/cursor-chibi/{modelId}.png`), fallback `media/character.png`. Display name là tên Live2D model thật ("Hiyori", "Miara"…) chứ không phải "Companion" generic.
- **UI tinh chỉnh**:
  - **Split layout**: character bên trái, chat panel bên phải (clamp 80px–160px–20% cho character column). Character mood/motion animations luôn nhìn thấy được trong khi chat. Không media query để tránh stack dọc bất ngờ.
  - **Header 1 hàng + gear ⚙ toggle**: provider/model picker mặc định ẩn để chat log có thêm chiều cao. Click gear mở/đóng (vscode.getState persist).
  - **Custom AI model combo dropdown**: thay `<datalist>` (yêu cầu gõ mới hiện) bằng combo widget click-to-expand, hỗ trợ keyboard navigation, populate động cho Copilot từ `vscode.lm`.
  - **Anime pink pastel theme**: gradient hồng cho assistant bubble, lavender cho user bubble, soft shadow, rounded 14px với tail flatten, entrance animation cubic-bezier mềm. Pure custom — không phụ thuộc VS Code theme.
- **Token usage display**: trong status bar dưới: tokens per turn + Σ accumulated cho conversation hiện tại. Reset khi switch conversation.
- **Setting schema mới**: `chat.provider`, `chat.model`, `chat.personaPreset`, `chat.systemPrompt`, `chat.maxTokens` (default 2048, đủ cho Gemini 2.5 thinking), `chat.temperature`, `chat.reactionsEnabled`.
- **Commands mới**:
  - `Anime Companion: Open Chat`
  - `Anime Companion: Set Chat API Key (BYOK)`
  - `Anime Companion: New Chat Conversation`
  - `Anime Companion: Clear All Chat Conversations`
  - `Anime Companion: Ask Companion About Selection` (cũng có ở editor right-click menu)

### Changed
- Default `chat.provider` là `copilot` cho mọi user mới — mọi VS Code user đều có account GitHub, không cần xin key để bắt đầu chat. Một-time migration trên upgrade clear global `chat.provider` override để fallback về default Copilot (giữ nguyên workspace-level setting).
- `runSetApiKeyCommand` không còn auto-switch provider sau khi save key. User phải proactively chọn provider qua dropdown — tránh bị bất ngờ chuyển sang BYOK provider chỉ vì paste key thử.
- `files` array trong `package.json`: `out/*.js` → `out/**/*.js` để include `out/chat/**` nested directories.

### Architecture
- **CSS isolation**: cursor chibi tuning UI (orb widget) tách hẳn class prefix từ `chat-*` sang `chibi-orb-*` + có file CSS riêng `media/webview/cursor-chibi.css`. Chat panel và cursor chibi giờ không thể accidentally share CSS rule.
- **3 file CSS độc lập theo prefix**:
  - `media/companion.css` — Live2D character, idle bubble, status bar
  - `media/webview/chat.css` — chat panel UI (header, sidebar, messages, form)
  - `media/webview/cursor-chibi.css` — cursor chibi position tuning widget
- **Webview message protocol mới** (`chat:*`): `chat:send`, `chat:cancel`, `chat:snapshot`, `chat:userMessage`, `chat:assistantStart/Delta/End`, `chat:setProvider`, `chat:setModel`, `chat:setApiKey`, `chat:newConversation`, `chat:loadConversation`, `chat:requestRename`, `chat:requestDelete`, `chat:requestFiles`, `chat:stagedSelection`, `chat:clearStagedSelection`.
- **`src/chat/` module mới**: `secrets.ts`, `persona.ts`, `llm-provider.ts`, `providers/{anthropic,openai,gemini,copilot}.ts`, `sse-parser.ts`, `chat-manager.ts`, `conversation-store.ts`, `context-builder.ts`, `sentiment.ts`.
- **Resource roots mở rộng**: webview localResourceRoots giờ bao `globalStorageUri/cursor-chibi/` cho chibi avatar trong chat.

### Notes
- Toàn bộ feature chat đã được iterate qua 16 patch builds nội bộ (0.2.0 → 0.2.16) trước khi consolidate thành 0.3.0 cho marketplace.
- Desktop Companion mode chưa có chat UI ở phiên bản này — bridge dùng bootstrap HTML khác. Chat commands (set key, etc.) vẫn hoạt động qua Command Palette. Tích hợp đầy đủ Desktop ↔ chat để v0.4.x.

## [0.1.50] - 2026-05-11

### Changed
- Đồng bộ tài liệu public và nội bộ cho trạng thái hiện tại của repo: `README.md`, `CHECKLIST.md`, `PUBLIC_RELEASE_GUIDE.md`.
- README giờ phản ánh đúng các tính năng đã ship gần đây quanh **Cursor Chibi**, **capture/reset chibi**, extended **voice assets**, command list và settings list cho `0.1.50`.

### Notes
- Đây là bản release-prep / documentation sync để gói phát hành `0.1.50` khớp với code và workflow publish hiện tại.

## [0.1.49] - 2026-05-08

### Added
- **Capture Chibi from Model**: command `Anime Companion: Capture Chibi from Model` snapshot canvas Live2D đang render → auto-crop transparent borders → resize tối đa 96px (giữ aspect ratio) → save vào `globalStorage/cursor-chibi/{modelId}.png`. Cursor chibi tự đổi sprite ngay (không cần reload). 1 file/model — switch model là chibi đổi theo.
- Command `Anime Companion: Reset Captured Chibi` để xoá PNG đã capture của model hiện tại, fallback về icon bundled.

### Changed
- `cursor-chibi.ts`: decoration CSS dùng `background-size: contain` + `background-position: center` thay vì stretch sang square — captured chibi portrait giữ đúng aspect ratio, không bị méo.
- Resize captured ảnh xuống ≤96px max dim trước khi save (VS Code icon decoration scale chuẩn hơn khi source PNG nhỏ).

## [0.1.48] - 2026-05-08

### Added
- **Tune Cursor Chibi Size**: extend command tune position thêm options `+ Bigger` / `− Smaller` (step 2px) trong cùng quick-pick. Reset all clear cả x, y, size.
- Config mới `animeCompanion.cursorChase.sizePx` (numeric, 0 = dùng enum small/medium/large; >0 = override exact px). Min 1px, max 64px.

### Fixed
- Chibi không co được dưới ~24px do VS Code có CSS `min-width/min-height` ngầm cho decoration `before` element. Override bằng inline `!important` (`min-width: 0`, `max-width: ${sizePx}px`, `background-size: contain`).

## [0.1.47] - 2026-05-08

### Added
- **Tune Cursor Chibi Position**: command interactive mở quick-pick cho phép nhích chibi 4px theo Up/Down/Left/Right realtime, lặp đến khi user chọn Done. Settings (`cursorChase.offsetX`, `cursorChase.offsetY`) lưu Global, persist qua reload.
- Config mới `animeCompanion.cursorChase.offsetX/offsetY` (default 0) — pixel offset cộng thêm vào base position auto-centered.

## [0.1.46] - 2026-05-08

### Fixed
- **Auto-show panel sau reload không hoạt động**: root cause là `setContext('animeCompanion.visible', true)` được gọi async sau setTimeout 1.5s, nhưng VS Code đã evaluate `when` clause cho view container trước đó. Fix bằng cách gọi `setContext` **synchronous** ngay khi register webview view provider, để view xuất hiện trong panel container ngay từ đầu. Companion giờ tự hiện đúng sau mọi reload window / restart VS Code.

## [0.1.45] - 2026-05-08

### Added
- Webview helper `playLine(key)` trong `media/webview/audio.js` — convenience wrapper cho `playAudio(`${key}.mp3`)` để thêm câu thoại mới chỉ cần 1 dòng code.

### Fixed
- **Cursor chibi leak vào OUTPUT panel / debug console**: VS Code coi các panel này là TextEditor nên `onDidChangeTextEditorSelection` fire kéo chibi theo, gây ra 2 chibi cùng lúc trên màn hình. Fix bằng cách filter `editor.document.uri.scheme` chỉ áp dụng cho `file`, `untitled`, `vscode-userdata`, đồng thời clear decoration từ visible editors khác khi switch.
- `animeCompanion.toggle` (click WhiteAngel ở status bar): bỏ `live2dView.toggleVisibility` (throw trên một số VS Code build) → tự flip `setContext` + focus.

## [0.1.41 - 0.1.44] - 2026-05-08

### Added (0.1.41)
- **ElevenLabs Voice Pipeline** (build-time + lazy-load):
  - Per-language config: `media/voice/en.json`, `media/voice/vi.json` chứa `voiceId`, `modelId`, `voiceSettings`, danh sách `lines`.
  - Script `scripts/generate-voice-assets.js` gọi ElevenLabs TTS API → MP3 ra `dist/voice-assets/{lang}/`. Idempotent qua hash cache, support flag `--lang`, `--key`, `--force`. JSON config tolerate `//` comment.
  - Script `scripts/pack-voice-assets.js` đóng gói thành `{lang}.zip`.
  - Workflow `.github/workflows/voice-assets-release.yml` (manual dispatch) build + upload zips lên GitHub release tag (default `audio-v1`).
  - Class `src/voice-asset-downloader.ts` lazy-load `{lang}.zip` runtime, cache theo extension version trong `globalStorage`. Fallback về `media/audio/{lang}/` bundled khi download fail.
  - Config mới: `voiceAssets.downloadBaseUrl`, `voiceAssets.enableExtended`.
  - Script diagnostic `scripts/list-elevenlabs-voices.js` in ra mọi voice mà API key dùng được + category (`[premade]` / `[generated]` / `[professional]`).

### Changed
- `package.json`: thêm `media/voice/**` vào `files` để JSON config ship trong VSIX, MP3 chỉ lazy-load.
- `companion-view.ts`: trước render webview HTML, gọi `voiceAssetDownloader.ensureLanguageAudio(lang)` cho en/vi, swap `__AUDIO_BASE_URL__` sang cache dir nếu có. `localResourceRoots` mở rộng để webview load được file MP3 cache.

### Notes
- 4 line bundled (`headpat`, `spam`, `poke`, `help`) trong `media/audio/{lang}/` được giữ làm offline fallback. Pipeline mới chỉ ảnh hưởng en/vi; ja vẫn dùng VOICEVOX MP3 bundled.

## [0.1.40] - 2026-05-06

### Added
- Desktop Companion sidecar giờ được lazy-download thật ở runtime từ `animeCompanion.desktopCompanion.downloadBaseUrl` khi máy user chưa có binary cache.
- Có progress notification trong lúc tải Desktop Companion, rồi hiện thông báo khi download/extract xong và chuẩn bị launch.

### Changed
- Desktop Companion sidecar cache theo version extension trong `globalStorage`, để update version không bị dùng lẫn binary cũ.
- Ưu tiên resolve binary theo thứ tự: `devBinaryPath` -> binary đã cache -> local build fallback, giúp bản publish dùng lazy-download còn dev local vẫn test nhanh được.

### Fixed
- Bản publish không còn phụ thuộc vào việc ship sẵn `desktop-pet/target/release/anime-companion-pet.exe` trong `.vsix`.
- `desktopCompanion.downloadBaseUrl` giờ phản ánh đúng behavior runtime thay vì chỉ là setting placeholder.

## [0.1.39] - 2026-05-06

### Fixed
- Packaging/publish flow: bỏ yêu cầu ship `desktop-pet/target/release/anime-companion-pet.exe` trong `.vsix`, tránh việc GitHub Actions release fail khi CI checkout source nhưng không có local Windows sidecar artifact.
- VSIX allowlist tiếp tục giữ gói extension gọn, trong khi Desktop Companion sidecar vẫn được phát hành riêng qua GitHub Release `desktop-pet-v1`.

## [0.1.38] - 2026-05-06

### Added
- Desktop Companion mode (Windows v1): companion có thể chạy thành cửa sổ desktop nổi riêng qua setting `animeCompanion.desktopCompanion.enabled`, dùng Tauri sidecar + WebSocket bridge để tái sử dụng reactive engine hiện có.
- Bộ setting mới cho Desktop Companion: `alwaysOnTop`, `clickThrough`, `size`, `position`, `opacity`, `downloadBaseUrl`, `devBinaryPath`.
- Binary desktop companion được lazy-download từ GitHub Releases ở lần bật đầu tiên; hỗ trợ override binary local cho flow dev/test.
- Command `Anime Companion: Reset Companion Position` để reset vị trí companion trong panel mode.

### Changed
- Public package / docs được cập nhật để phản ánh trạng thái hiện tại ở `v0.1.38`, thay vì snapshot cũ `v0.1.27`.
- Tên setting public được chuẩn hoá sang namespace `animeCompanion.desktopCompanion.*`; extension vẫn migrate/fallback từ legacy key `animeCompanion.desktopPet.*`.
- Panel mode và Desktop Companion mode được tách mutually-exclusive để tránh chạy 2 instance Live2D cùng lúc.

### Notes
- Desktop Companion v1 hiện ship binary chính thức cho Windows. Trên Mac/Linux, extension vẫn có thể chạy bridge để debug nhưng chưa có binary release chính thức.

## [0.1.27] - 2026-05-05

### Added
- Ambient background audio ngay trong companion với 3 preset built-in: `lofi`, `rain`, `cafe`, có thể bật/tắt nhanh từ menu chuột phải.
- Hỗ trợ `animeCompanion.ambientVolume` để chỉnh âm lượng ambient riêng với phần voice/reaction audio.
- Hỗ trợ `animeCompanion.customAmbientTracks` để user thêm track local của riêng mình vào Ambient panel.

### Changed
- README được cập nhật để phản ánh flow sử dụng ambient/background music và các setting liên quan.

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
