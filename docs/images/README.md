# Screenshot Manifest

Drop PNG files here matching the names below. The 3 README files reference these images by relative path:

- `README.md` (root) → `docs/images/NN-name.png`
- `docs/README.vi.md` and `docs/README.ja.md` → `images/NN-name.png`

Until you fill these in, the marketplace listing will show broken image icons (which is visually ugly but doesn't break the extension). Capture in order of priority — the hero shot first.

| # | Filename | Capture spec |
|---|---|---|
| 01 | `01-hero-companion-panel.png` | **Hero shot.** VS Code window, Anime Companion panel docked at the bottom with Live2D Hiyori visible, a code file open in the editor beside it. Wide aspect. This is what the marketplace listing leads with — make it look polished. |
| 02 | `02-live2d-models-gallery.png` | 2×2 grid of all 4 bundled models: **Hiyori, Haru, Mao, Miara**. Same size + background per cell. Use the Model picker to switch between them and screenshot each, then composite (or take one screenshot per panel and combine in any image editor). |
| 03 | `03-chat-panel-streaming.png` | Chat panel during a streaming response. Capture mid-stream so the ✨ sparkle caret is visible and at least one assistant bubble (pink) is partially filled. User bubble (lavender) above. |
| 04 | `04-chat-provider-picker.png` | The `Configure Chat Provider` QuickPick with **all 8 entries visible** (Copilot + Anthropic + OpenAI + Gemini + xAI + DeepSeek + OpenRouter + Ollama). Run `Anime Companion: Configure Chat Provider (API Key / Endpoint)` from Command Palette. |
| 05 | `05-chat-context-mention.png` | `#filename` autocomplete dropdown over a partially typed `#pa…` prefix in the chat textarea. Make sure 2–3 file suggestions show. |
| 06 | `06-desktop-pet-window.png` | Floating Desktop Companion window placed over another app (e.g., a browser or the desktop wallpaper) so the transparent background is obvious. Always-on-top behavior should be visible. |
| 07 | `07-cursor-chibi.png` | Editor zoomed in. Chibi sprite hovering near the cursor on a code line. Enable via `Anime Companion: Toggle Cursor Chibi`. Crop tight around the cursor area. |
| 08 | `08-pomodoro-running.png` | Status bar showing `🔥 23:42` (work) or `☕ 04:12` (break) + the visual ring overlay on the character. Optionally include a bubble like "Focus time!". |
| 09 | `09-achievements-panel.png` | Achievements panel opened via `Anime Companion: Show Achievements`. Show the chain-based tree lanes, the secret-achievement lane, the quest block, and the memory block with a mix of unlocked and hinted entries. |
| 10 | `10-ambient-menu.png` | Right-click → Ambient submenu (or QuickPick) showing the `lofi / rain / cafe` presets plus a custom track entry. |
| 11 | `11-rightclick-menu.png` | Right-click context menu opened on the companion (panel mode or desktop pet). Show the reorganized top-level menu: `Run`, the six category rows (`Git`, `AI Chat`, `Appearance`, `Voice & Sound`, `Workflow`, `Desktop Companion`), and `All Settings`. In the `Workflow` submenu, make sure the newer `Quests`, `Profile`, and `Share Card` entries are visible if possible. |
| 12 | `12-settings-ui.png` | VS Code Settings UI filtered by `animeCompanion`. Scroll so the new `chat.ollamaEndpoint` and the extended `chat.provider` enum dropdown (8 options) are visible. |
| 13 | `13-background-image.png` | **Background Image feature.** The "Ảnh nền / Background Image" control panel open in the editor, with a Fullscreen image applied behind the whole window (anime wallpaper visible behind the explorer + editor). Show the region card (image thumbnail, opacity/blur sliders, sizing segmented control, 3×3 position grid, live preview) and the footer (Enable, Apply, Disable & Restore, silence-corrupt-warning toggle). This is the v0.5.0 headline shot. |

## Conventions

- **Format**: PNG, transparent background NOT required (default editor background is fine).
- **Width**: aim for ~1200–1800 px wide for hero shots, ~600–900 px for narrow UI captures.
- **DPI**: 1× or 2× both fine. The marketplace and GitHub auto-scale.
- **Compression**: run through `tinypng.com` or similar before commit — the VSIX bundles `docs/images/**`, so file size affects download time.
- **Privacy**: scrub the code visible in screenshots — no personal API keys, no real customer data, no internal paths beyond `D:/NGUYENKHANH/...` which is already public in the repo.

## Why these aren't placeholder files in git

Empty PNGs would just be visual noise during review. The READMEs reference `docs/images/NN-name.png` paths — broken-image icons on the marketplace are a known, accepted state while the screenshot pass is in progress. Once you commit a real PNG with the matching name, it renders automatically.
