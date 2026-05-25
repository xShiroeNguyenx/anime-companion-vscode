# Public Release Guide

> Bản hiện tại đang publish: **v0.3.1** (release notes ngay bên dưới). Phần `v0.1.50` cũ giữ làm reference cho flow chung.

---

## 📦 v0.3.1 Release (2026-05-25)

### Scope

- Extension version public: `0.3.1`
- Headline user-facing:
  - **4 chat providers mới**: xAI Grok, DeepSeek, OpenRouter (gateway 100+ models), Ollama (local, no API key)
  - **Copy-reply button** trên mọi assistant message
  - **Live2D model live resize**: kéo panel cao/thấp/rộng → character refit realtime, không cắt chân nữa
  - Documentation 3 ngôn ngữ: EN root, VI + JA dưới `docs/`
- Platform support: như v0.3.0 (Panel mode trên VS Code / Cursor / VSCodium / Open VSX; Desktop Companion vẫn Windows-only)

### Marketplace / Release notes pitch

- 8 providers chat hỗ trợ giờ gồm cả **xAI Grok**, **DeepSeek**, **OpenRouter** (1 key dùng 100+ models, có cả `:free` tier), và **Ollama** (chat local 100% offline, không cần API key).
- Mỗi câu trả lời của companion giờ có nút **copy nhanh** với checkmark animation xác nhận.
- Live2D model giờ **resize live** theo panel — kéo panel nhỏ lại không còn cắt chân, kéo to ra model tự refit.
- Documentation tách 3 ngôn ngữ: tiếng Anh (mặc định trên Marketplace), tiếng Việt (`docs/README.vi.md`), tiếng Nhật (`docs/README.ja.md`), có language switcher header.
- Command `Set Chat API Key` rename thành `Configure Chat Provider (API Key / Endpoint)` — id cũ giữ nguyên để keybindings không vỡ.

### Pre-publish checklist v0.3.1

- [x] `package.json` ở `0.3.1`
- [x] `README.md` (EN, source of truth cho marketplace) + `docs/README.vi.md` + `docs/README.ja.md`
- [x] `CHANGELOG.md` có entry `## [0.3.1] - 2026-05-25` đầy đủ Added / Changed / Fixed / Removed / Notes
- [x] `FEATURES.md` có section "What's new in v0.3.1"
- [x] `docs/PLAN_v0.3.1.md` — implementation plan + v0.4.0 deferred
- [x] `docs/images/README.md` — screenshot manifest 12 ảnh với capture specs
- [x] `files` array có `"docs/images/**"` để screenshots bundle vào VSIX
- [x] Local verify `npm run compile` clean
- [ ] **Chụp 12 screenshots** theo manifest và commit vào `docs/images/`
- [ ] **Smoke test** 4 provider mới (cần API keys cho xAI/DeepSeek/OpenRouter, `ollama serve` local)
- [ ] (Optional) Review tiếng Nhật ở `docs/README.ja.md`, xóa các marker `<!-- TRANSLATION-REVIEW-NEEDED -->` sau khi review

### Publish flow

```bash
# 1. Bump version đã xong (package.json = 0.3.1)
# 2. Build VSIX final
npm run package

# 3. (Optional) Local install test
npm run package:install

# 4. Tag + push để trigger release workflow
git add -A
git commit -m "release: v0.3.1 — 4 chat providers + copy button + live resize"
git tag v0.3.1
git push origin main --tags
# Workflow .github/workflows/release.yml sẽ tự package + publish lên VS Code Marketplace qua VSCE_PAT

# 5. Publish lên Open VSX (manual)
npm run publish:ovsx
```

### v0.4.0 roadmap (defer)

Đã document ở [docs/PLAN_v0.3.1.md §4](./docs/PLAN_v0.3.1.md):
- Pet desktop quick chat (right-click → input → speech bubble response)
- Right-click menu functional-area reorganization (AI Chat / Appearance / Voice & Sound / Workflow / Git Shortcuts / Desktop Companion submenus)

---

## 📦 v0.1.50 Release (legacy reference)

Mục tiêu của guide này là giúp public bản hiện tại `v0.1.50` theo flow an toàn, dễ lặp lại, đồng thời không bỏ sót các dependency runtime lazy-download.

## 1. Scope release hiện tại

- Extension version public: `0.1.50`
- Headline user-facing gần nhất:
  - `Cursor Chibi` bám theo editor cursor
  - `Capture Chibi from Model` / reset captured sprite
  - Desktop Companion (Windows v1) lazy-download sidecar
  - Extended voice assets cho `en` / `vi`
- Platform support:
  - Panel mode: VS Code / Cursor / VSCodium / Open VSX như cũ
  - Desktop Companion binary chính thức: `Windows`
- Desktop Companion là mode thay thế panel, không chạy song song với panel

## 2. Những gì nên public rõ ràng

Trong Marketplace / GitHub Release / post giới thiệu nên nói ngắn gọn các ý này:

- Anime Companion hiện có thêm **Cursor Chibi**: sprite nhỏ đi theo con trỏ editor, có thể tune vị trí/size live.
- Có thể **capture chibi trực tiếp từ model Live2D đang render** rồi dùng ngay làm sprite theo từng model.
- Desktop Companion vẫn chạy như **floating desktop window** ngoài VS Code.
- Bật Desktop Companion bằng `animeCompanion.desktopCompanion.enabled`, sau đó **Reload Window**.
- Lần bật đầu trên Windows sẽ **tự tải sidecar binary** từ GitHub Releases.
- `en` / `vi` có thể lazy-download extended voice assets từ GitHub Releases.
- Desktop Companion v1 hiện **Windows-only**.
- Nếu Windows hiện SmartScreen warning ở lần chạy đầu thì đó là expected nếu binary chưa code-sign.

## 3. Pre-publish checklist

- `package.json` là `0.1.50`
- `README.md` đã phản ánh Cursor Chibi + voice assets + Desktop Companion + settings mới
- `CHANGELOG.md` có entry `0.1.50`
- Có file `.vsix` bản cuối cùng cần phát hành
- Đã verify các base URL lazy-download còn đúng:
  - `models-v1`
  - `desktop-pet-v1/win-x64.zip`
  - `audio-v1/{lang}.zip`
- Đã test clean flow trên Windows:
  - cài extension
  - bật `cursorChase.enabled` hoặc command `Toggle Cursor Chibi`
  - tune/capture/reset chibi hoạt động
  - bật `animeCompanion.desktopCompanion.enabled`
  - reload window
  - sidecar download thành công
  - floating companion hiện ra
  - tắt/bật lại VS Code vẫn hoạt động
- Đã test local:
  - `npm run compile`
  - `npm test`
  - `npm run package`

## 4. Suggested release order

1. Nếu có thay đổi runtime asset, build/upload asset tương ứng trước:
   - Desktop Companion sidecar -> GitHub Release tag `desktop-pet-v1`
   - Voice assets -> GitHub Release tag `audio-v1`
   - Model zips -> GitHub Release tag `models-v1`
   - Nếu chỉ muốn cắt một sidecar release riêng bằng tag tự động, dùng pattern `desktop-pet-release-v*.*.*`
   - Nếu muốn tự build và tự update asset runtime production `desktop-pet-v1`, dùng tag pattern `desktop-pet-runtime-v*.*.*`
2. Verify `package.json` đang trỏ đúng các release asset thật.
3. Chạy local `compile`, `test`, `package`.
4. Commit release notes / docs cuối cùng.
5. Tag `v0.1.50` và push để workflow [release.yml](./.github/workflows/release.yml) tự package + publish.
6. Verify Marketplace / Open VSX / GitHub Release sau khi workflow xong.

Lý do đi theo thứ tự này:

- Extension public trước khi runtime asset sẵn sàng sẽ làm user bật feature nhưng download fail.
- Repo này hiện có nhiều dependency runtime lazy-download hơn `v0.1.40`, không chỉ riêng Desktop Companion sidecar.
- `desktop-pet-v1` là tag runtime ổn định cho lazy-download; còn tag `desktop-pet-release-v*.*.*` phù hợp cho archival / build release tự động từng đợt.
- Tag `desktop-pet-runtime-v*.*.*` phù hợp khi muốn refresh thẳng asset production mà không cần upload tay lên release `desktop-pet-v1`.

## 5. Release notes mẫu

```md
## Anime Companion v0.1.50

This release syncs the public docs and release package with the current Anime Companion feature set.

- Added Cursor Chibi controls: toggle, tune position/size, capture from model, and reset per-model sprites
- Desktop Companion (Windows v1) remains available as a floating desktop window outside VS Code
- First launch can lazy-download the Windows sidecar from GitHub Releases
- Extended voice assets for `en` / `vi` can lazy-download on demand
- Updated docs and release metadata so Marketplace / VSIX users see the current feature set

Notes:
- Desktop Companion v1 is currently Windows-only
- Reload Window is required after toggling Desktop Companion mode
- Capture Chibi currently works in panel mode, not Desktop Companion mode
```

## 6. Post-publish verification

- Marketplace page hiện đúng version `0.1.50`
- Open VSX hiện đúng version `0.1.50`
- GitHub Release có `.vsix`
- GitHub Release `desktop-pet-v1` có asset sidecar Windows
- GitHub Release `audio-v1` có asset `en.zip` / `vi.zip` nếu release này đụng voice pipeline
- README render đúng section Desktop Companion
- README render đúng section Cursor Chibi / commands / settings mới
- Test lại một máy Windows không dùng build local

## 7. Nếu muốn public an toàn hơn nữa

- Thêm screenshot/GIF cho Cursor Chibi và Desktop Companion ngoài desktop thật
- Viết một known-issues section riêng cho Windows SmartScreen, Windows-only scope, và panel-only capture flow
- Thêm checksum cho sidecar / voice assets trước khi public rộng
