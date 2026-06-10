# Public Release Guide

> Bản hiện tại đang publish: **v0.5.1** (release notes ngay bên dưới). Các phần cũ giữ làm reference cho flow chung.

---

## 📦 v0.5.1 Release (2026-06-10)

### Scope

- Extension version public: `0.5.1`
- Headline user-facing: **🌸 Trình sửa Markdown WYSIWYG trong cửa sổ riêng**
  - Mở file `.md` bất kỳ bằng nút **🌸** trên thanh tiêu đề editor (hoặc item **🌸** nhấp nháy ở status bar) → mở **tab full-size riêng** (`ViewColumn.Active`, không split).
  - Sửa trực quan kiểu **CKEditor** (Toast UI Editor), **ghi thẳng vào file** khi Save (`Ctrl/Cmd+S`), đồng bộ 2 chiều với tab editor thường.
  - **An toàn theo thiết kế:** chỉ ghi khi user thực sự sửa → chỉ xem thì không bao giờ làm xáo trộn định dạng; cảnh báo reformat một lần.
  - **🌗 Dark / Light** toggle ở header, nhớ qua `globalState`. Phối màu Anime Companion (header hồng sakura, nút Save viên kẹo, font Mochiy/Nunito).
  - i18n đầy đủ vi / en / ja (`webview.markdownEditor.*`).
- Library: **Toast UI Editor** vendor dạng UMD bundle tự chứa (`media/vendor/toastui/`), không cần bundler.

### Marketplace / Release notes pitch

- Sửa Markdown trực quan như rich-text editor ngay trong VS Code — không chia đôi preview, không vật lộn cú pháp thô.
- Mở bằng nút 🌸 ở góc editor, mở thành **cửa sổ riêng full-size**, ghi thẳng vào file.
- An toàn: chỉ ghi khi bạn thực sự sửa; có **Dark / Light** và giao diện đậm chất Anime Companion.

### Pre-publish checklist v0.5.1

- [x] `package.json` ở `0.5.1`
- [x] `README.md` (EN) + `docs/README.vi.md` + `docs/README.ja.md` — "What's new" + section feature 🌸 Markdown editor
- [x] `CHANGELOG.md` có entry `## [0.5.1] - 2026-06-10`
- [x] `files` whitelist có `media/vendor/toastui/**` + `media/icons/**`
- [x] Local `npm run compile` + lint + smoke test pass
- [ ] **Smoke test** trên VS Code thật: nút 🌸 hiện với `.md` → mở editor render đúng → sửa + Save (file đổi đúng phần) → round-trip README không sửa thì file sạch → toggle Dark/Light (nhớ lựa chọn)
- [ ] (Optional) Review tiếng Nhật section mới trong `docs/README.ja.md`

### Publish flow

```bash
# 1. Bump version đã xong (package.json = 0.5.1)
# 2. Build VSIX final
npm run package

# 3. (Optional) Local install test — DÙNG ĐÚNG CLI VS Code (lệnh `code` máy này trỏ Cursor)
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension .\anime-companion-vscode-0.5.1.vsix --force

# 4. Tag + push để trigger release workflow (.github/workflows/release.yml)
git add -A
git commit -m "release: v0.5.1 — Markdown WYSIWYG editor (flower button, own window, dark/light)"
git push origin main
git tag -a v0.5.1 -m "v0.5.1 — Markdown WYSIWYG editor"
git push origin v0.5.1

# 5. (Nếu workflow không tự publish Open VSX) publish thủ công
npm run publish:ovsx
```

> ⚠️ Tag phải khớp `package.json` version (`0.5.1`), nếu lệch workflow fail ở bước verify.

---

## 📦 v0.5.0 Release (2026-06-09)

### Scope

- Extension version public: `0.5.0`
- Headline user-facing: **🖼️ Background Image (workbench) với bảng điều khiển trực quan**
  - Đặt ảnh nền cho **từng vùng** (Editor / Sidebar / Panel — ảnh *sau chữ*) hoặc **Toàn cửa sổ** (Fullscreen — 1 ảnh phủ cả window).
  - Bảng điều khiển webview riêng: chọn ảnh + thumbnail, slider opacity / blur, sizing (cover/contain/repeat/stretch), vị trí 3×3, **live preview**.
  - Lifecycle minh bạch: **Apply (reload)** / **Disable & Restore**, tự re-apply sau VS Code update, dọn dẹp khi gỡ qua hook `vscode:uninstall`, toggle opt-in vá checksum để tắt cảnh báo "installation corrupt".
  - i18n đầy đủ vi / en / ja, đổi ngôn ngữ là panel cập nhật ngay.
- Platform: **desktop VS Code stable** (chạy được cả Cursor / editor nền VS Code). Cơ chế = vá `workbench.desktop.main.js` (không có API công khai cho nền workbench).

### Marketplace / Release notes pitch

- Đặt ảnh nền cho VS Code giống extension "Background", nhưng **tập trung vào bảng điều khiển**: chọn ảnh, kéo slider độ mờ/blur, xem trước trực tiếp — không phải sửa JSON.
- Chế độ **Fullscreen** phủ 1 ảnh cả cửa sổ; hoặc đặt ảnh *sau chữ* riêng cho Editor / Sidebar / Panel.
- Toàn bộ "đau đầu" của việc vá workbench được nói thẳng trong panel: cần reload, vá lại sau update, dọn sạch khi tắt/gỡ, và tùy chọn tắt cảnh báo corrupt.

### Pre-publish checklist v0.5.0

- [x] `package.json` ở `0.5.0` + `scripts."vscode:uninstall"`
- [x] `README.md` (EN) + `docs/README.vi.md` + `docs/README.ja.md` — "What's new" + section feature 🖼️ Background Image
- [x] `CHANGELOG.md` có entry `## [0.5.0] - 2026-06-09`
- [x] `docs/images/README.md` — thêm spec ảnh `13-background-image.png`
- [x] `docs/BACKGROUND_IMAGE_PLAN.md` — implementation plan
- [x] Local `npm run compile` clean + smoke test pass
- [ ] **Lưu screenshot** `docs/images/13-background-image.png` (ảnh hero của feature — panel + nền fullscreen)
- [ ] **Smoke test** trên VS Code thật: Apply (nền hiện sau chữ) / Fullscreen / Disable & Restore / tắt cảnh báo corrupt / đổi messageLanguage (panel đổi label)
- [ ] (Optional) Review tiếng Nhật phần feature mới trong `docs/README.ja.md`

### Publish flow

```bash
# 1. Bump version đã xong (package.json = 0.5.0)
# 2. Build VSIX final
npm run package

# 3. (Optional) Local install test — DÙNG ĐÚNG CLI VS Code (lệnh `code` máy này trỏ Cursor)
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension .\anime-companion-vscode-0.5.0.vsix --force

# 4. Tag + push để trigger release workflow (.github/workflows/release.yml)
git add -A
git commit -m "release: v0.5.0 — Background Image (workbench) + control panel"
git push origin main
git tag -a v0.5.0 -m "v0.5.0 — Background Image with control panel"
git push origin v0.5.0

# 5. (Nếu workflow không tự publish Open VSX) publish thủ công
npm run publish:ovsx
```

> ⚠️ Tag phải khớp `package.json` version (`0.5.0`), nếu lệch workflow fail ở bước verify.

---

## 📦 v0.3.3 Release (2026-05-25)

### Scope

- Extension version public: `0.3.3`
- Headline user-facing:
  - **Right-click menu reorganization**: 6 submenu chức năng (`AI Chat` / `Appearance` / `Voice & Sound` / `Workflow` / `Git` / `Desktop`)
  - **AI Chat actions ngay trên pet**: open chat / new conversation / ask selection / configure provider / clear history
  - **Cursor Chibi controls trong menu**: capture / toggle / tune / reset position
  - **Menu localization polish**: label ngắn gọn hơn cho EN / VI / JA, menu tiếng Việt có font fallback riêng để chữ có dấu render đẹp
- Platform support: như v0.3.0 (Panel mode trên VS Code / Cursor / VSCodium / Open VSX; Desktop Companion vẫn Windows-only)

### Marketplace / Release notes pitch

- Right-click menu của companion giờ được chia theo khu chức năng thay vì một danh sách phẳng dài, giúp discover feature tốt hơn ngay từ pet.
- `AI Chat` submenu mở thẳng các action chat quan trọng mà trước đây phải vào Command Palette hoặc editor context menu.
- `Appearance` submenu giờ ôm luôn Cursor Chibi controls và `Poke`, nên toàn bộ nhóm tương tác hình ảnh nằm cùng một chỗ.
- Menu labels đã được rút gọn cho panel hẹp; `Desktop Companion` được rút còn `Desktop` ở cả EN / VI / JA.
- Menu tiếng Việt có thêm font fallback bo tròn riêng để ký tự có dấu hiển thị sạch mà không làm mất style kawaii hiện tại.

### Pre-publish checklist v0.3.3

- [x] `package.json` ở `0.3.3`
- [x] `README.md` (EN, source of truth cho marketplace) + `docs/README.vi.md` + `docs/README.ja.md`
- [x] `CHANGELOG.md` có entry `## [0.3.3] - 2026-05-25` đầy đủ changelog cho menu reorganization + localization polish
- [x] `FEATURES.md` có section "What's new in v0.3.3"
- [x] `docs/PLAN_v0.3.1.md` — implementation plan + v0.4.0 deferred
- [x] `docs/images/README.md` — screenshot manifest 12 ảnh với capture specs
- [x] `files` array có `"docs/images/**"` để screenshots bundle vào VSIX
- [x] Local verify `npm run compile` clean
- [ ] **Chụp / refresh screenshot** menu chuột phải mới cho release notes hoặc marketplace
- [ ] **Smoke test** right-click menu ở panel mode + desktop mode (submenu open, action routes đúng, label không xuống dòng ở EN / VI / JA)
- [ ] (Optional) Review tiếng Nhật ở `docs/README.ja.md`, xóa các marker `<!-- TRANSLATION-REVIEW-NEEDED -->` sau khi review

### Publish flow

```bash
# 1. Bump version đã xong (package.json = 0.3.3)
# 2. Build VSIX final
npm run package

# 3. (Optional) Local install test
npm run package:install

# 4. Tag + push để trigger release workflow
git add -A
git commit -m "release: v0.3.3 — right-click menu reorganization"
git tag v0.3.3
git push origin main --tags
# Workflow .github/workflows/release.yml sẽ tự package + publish lên VS Code Marketplace qua VSCE_PAT

# 5. Publish lên Open VSX (manual)
npm run publish:ovsx
```

### v0.4.0 roadmap (defer)

Đã document ở [docs/PLAN_v0.3.1.md §4](./docs/PLAN_v0.3.1.md):
- Pet desktop quick chat (right-click → input → speech bubble response)
- Chat directly from the desktop pet via speech bubble response / input flow

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
