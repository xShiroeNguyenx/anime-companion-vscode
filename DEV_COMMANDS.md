# 🛠️ Dev Commands Cheat Sheet

Quick reference cho các lệnh dev/build/release. Mở file này khi quên cú pháp.

---

## 1. Setup ban đầu (máy mới / clone về)

```powershell
npm install                                # Cài deps
cp .env.example .env                       # Tạo .env local
# Mở .env, paste ELEVENLABS_API_KEY của Anh vào
```

---

## 2. Build + cài extension (vòng dev cơ bản)

| Mục đích | Lệnh |
|---|---|
| Compile TypeScript | `npm run compile` |
| Watch mode (auto-rebuild khi save) | `npm run watch` |
| Smoke test (compile + activation test) | `npm test` |
| Type-check không emit | `npx tsc -p ./ --noEmit` |
| **Build VSIX + cài luôn vào VS Code** ⭐ | `npm run package:install` |
| Chỉ build VSIX (không cài) | `npm run package` |
| Lint | `npm run lint` |

> **Sau `package:install`**: Reload VS Code: **Ctrl+Shift+P** → `Developer: Reload Window`.

### Bump version trước khi build

Sửa field `version` trong [package.json](package.json):

```json
"version": "0.1.49"   →   "version": "0.1.50"
```

Quy ước:
- **Patch** (0.1.49 → 0.1.50): bug fix, tinh chỉnh nhỏ
- **Minor** (0.1.49 → 0.2.0): feature mới đáng kể
- **Major** (0.1.49 → 1.0.0): breaking change

> Nếu chỉ muốn rebuild vào cùng version (vd test nhanh): không bump, `--force` install sẽ ghi đè.

---

## 3. Voice asset pipeline (ElevenLabs TTS)

### Generate MP3 từ ElevenLabs

```powershell
# Gen tất cả language (en + vi)
npm run voice:generate

# Chỉ 1 language
npm run voice:generate -- --lang=vi
npm run voice:generate -- --lang=en

# Chỉ 1 (hoặc vài) line cụ thể, các line khác bỏ qua hoàn toàn
npm run voice:generate -- --lang=vi --key=pomodoro
npm run voice:generate -- --lang=vi --key=headpat,spam

# Force regen toàn bộ (bỏ qua hash cache)
npm run voice:generate -- --lang=vi --force

# Combine
npm run voice:generate -- --lang=vi --key=headpat --force
```

**Output:** `dist/voice-assets/{lang}/{key}.mp3` + `{key}.hash` + `manifest.json`.

### Pack MP3 → zip để upload

```powershell
# Pack tất cả language
npm run voice:pack

# Pack 1 language
npm run voice:pack -- --lang=en
npm run voice:pack -- --lang=vi
```

**Output:** `dist/voice-assets/{lang}.zip`.

### Combo gen + pack 1 lệnh

```powershell
npm run voice:release
```

### List voice ID khả dụng (debug khi gặp lỗi 402)

```powershell
node scripts/list-elevenlabs-voices.js
```

In ra mọi voice mà API key dùng được, kèm category:
- `[premade]` → free tier API gọi được ✅
- `[generated]` → voice tự design, free tier OK ✅
- `[professional]` → cần paid plan ❌

### Publish voice assets lên GitHub release

**Cách A: Manual upload qua web** (lần đầu test):
1. Chạy `npm run voice:release -- --lang=en` (hoặc lang Anh muốn)
2. Mở https://github.com/xShiroeNguyenx/anime-companion-vscode/releases/new
3. Tag: `audio-v1` (giữ default này, đừng đổi)
4. Drag-drop `dist/voice-assets/en.zip`
5. Bấm **Publish release**

**Cách B: GitHub Actions workflow** (production):
1. Setup secret 1 lần: https://github.com/xShiroeNguyenx/anime-companion-vscode/settings/secrets/actions → Add `ELEVENLABS_API_KEY`
2. Mở https://github.com/xShiroeNguyenx/anime-companion-vscode/actions/workflows/voice-assets-release.yml
3. Click **Run workflow** → form:
   - `tag_name`: `audio-v1`
   - `languages`: `en` hoặc `en,vi`
   - Còn lại giữ default
4. Workflow tự gen + pack + upload

URL kỳ vọng sau khi publish:
```
https://github.com/xShiroeNguyenx/anime-companion-vscode/releases/download/audio-v1/en.zip
https://github.com/xShiroeNguyenx/anime-companion-vscode/releases/download/audio-v1/vi.zip
```

---

## 4. Desktop Companion sidecar

```powershell
# Build Rust sidecar binary
npm run build:desktop-pet
```

Output: `desktop-pet/target/release/anime-companion-pet.exe`.

Release binary lên GitHub: dùng workflow [.github/workflows/desktop-companion-release.yml](.github/workflows/desktop-companion-release.yml).

---

## 5. Publish extension (marketplace)

```powershell
# VS Code Marketplace
npm run publish:vsce

# Open VSX (cho VSCodium / Cursor)
npm run publish:ovsx
```

Yêu cầu:
- `.env` có `VSCE_PAT` (Visual Studio Marketplace token)
- `.env` có `OVSX_PAT` (Open VSX token)

---

## 6. Cleanup

```powershell
# Xoá VSIX cũ (giữ 10 cái mới nhất)
npm run cleanup:vsix
```

Tự chạy sau `package:install` rồi, ít khi cần gọi tay.

---

## 7. Test commands trong VS Code (sau khi cài)

Các command mới Anh có thể trigger qua **Ctrl+Shift+P**:

| Command | Tác dụng |
|---|---|
| `Anime Companion: Show` / `Hide` / `Toggle` | Bật/tắt panel companion |
| `Anime Companion: Change Model` | Đổi Live2D model |
| `Anime Companion: Change Voice` | Đổi voice language (ja/vi/en) |
| `Anime Companion: Toggle Cursor Chibi` | Bật/tắt chibi nhỏ ở cursor editor |
| `Anime Companion: Tune Cursor Chibi Position` ⭐ | Picker interactive: nhích x/y, +/- size |
| `Anime Companion: Capture Chibi from Model` ⭐ | Snapshot model hiện tại làm chibi sprite |
| `Anime Companion: Reset Captured Chibi` | Xoá chibi đã capture, về icon mặc định |
| `Anime Companion: Show Stats` / `Show Achievements` | Stats Pomodoro/save/commit |

---

## 8. File location quan trọng

| Thứ | Path |
|---|---|
| Voice config nguồn | `media/voice/{lang}.json` |
| Voice MP3 sau gen | `dist/voice-assets/{lang}/*.mp3` |
| Voice MP3 bundled (4-line fallback) | `media/audio/{lang}/*.mp3` |
| VSIX đã build | `anime-companion-vscode-{version}.vsix` (root) |
| Captured chibi PNGs | `%APPDATA%\Code\User\globalStorage\shiroenguyen.anime-companion-vscode\cursor-chibi\{modelId}.png` |
| Voice assets cache (lazy-loaded) | `%APPDATA%\Code\User\globalStorage\shiroenguyen.anime-companion-vscode\voice-assets\{ext-version}\{lang}\` |
| Model cache (lazy-loaded) | `%APPDATA%\Code\User\globalStorage\shiroenguyen.anime-companion-vscode\models\` |
| Desktop pet sidecar cache | `%APPDATA%\Code\User\globalStorage\shiroenguyen.anime-companion-vscode\desktop-pet\{ext-version}\` |
| Output channel logs (runtime debug) | View → Output → dropdown "Anime Companion" |

---

## 9. Troubleshooting nhanh

### Auto-show panel không hoạt động sau reload
- Check: setting `animeCompanion.showOnStartup = true`
- Output channel "Anime Companion" → tìm dòng `showOnStartup: invoking animeCompanion.show`
- Fallback: chạy command `Anime Companion: Show` thủ công

### ElevenLabs HTTP 402 "paid_plan_required"
- Voice đang dùng có category `[professional]` → free tier API chặn
- Fix: chạy `node scripts/list-elevenlabs-voices.js`, đổi `voiceId` trong JSON sang voice category `[premade]` hoặc `[generated]`

### Captured chibi không scale theo Tune Bigger/Smaller
- File PNG cũ trong globalStorage có natural size to → VS Code ignore sizePx
- Fix: chạy `Reset Captured Chibi` rồi `Capture Chibi from Model` lại (script đã resize ≤96px max dim)

### Cursor chibi leak vào OUTPUT panel
- Đã fix ở v0.1.45 — chỉ áp dụng cho file editor (`scheme === 'file' / 'untitled'`)

---

## 10. Workflow điển hình khi thêm dialogue line mới

```powershell
# 1. Edit media/voice/vi.json hoặc en.json — append entry mới:
#    { "key": "newkey", "text": "Câu thoại mới~" }

# 2. Gen MP3 cho line mới (5 line cũ không bị động nhờ cache hoặc --key filter)
npm run voice:generate -- --lang=vi --key=newkey

# 3. Nghe thử dist/voice-assets/vi/newkey.mp3 — nếu OK:
npm run voice:pack -- --lang=vi

# 4. Upload vi.zip lên GitHub release tag audio-v1 (ghi đè zip cũ)

# 5. (Optional) Trigger trong code: thêm playLine('newkey') ở chỗ Anh muốn
#    trong media/webview/interaction.js hoặc audio.js
```
