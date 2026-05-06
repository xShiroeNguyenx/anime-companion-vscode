# Public Release Guide (v0.1.40)

Mục tiêu của guide này là giúp public bản hiện tại với feature **Desktop Companion (Windows v1)** theo flow an toàn, dễ lặp lại.

## 1. Scope release hiện tại

- Extension version public: `0.1.40`
- Feature headline: `Desktop Companion (Windows v1)`
- Platform support cho desktop companion: `Windows`
- Extension vẫn cài được trên VS Code/Cursor/VSCodium như cũ
- Desktop companion là mode thay thế panel, không chạy song song với panel

## 2. Những gì nên public rõ ràng

Trong Marketplace / GitHub Release / post giới thiệu nên nói ngắn gọn các ý này:

- Anime Companion giờ có thể chạy như **floating desktop window** ngoài VS Code.
- Bật bằng `animeCompanion.desktopCompanion.enabled`, sau đó **Reload Window**.
- Lần bật đầu trên Windows sẽ **tự tải sidecar binary** từ GitHub Releases.
- v1 hiện **Windows-only**.
- Nếu Windows hiện SmartScreen warning ở lần chạy đầu thì đó là expected nếu binary chưa code-sign.

## 3. Pre-publish checklist

- `package.json` là `0.1.40`
- `README.md` đã phản ánh Desktop Companion + setting mới
- `CHANGELOG.md` có entry `0.1.40`
- Có file `.vsix` bản cuối cùng cần phát hành
- Đã chuẩn bị asset sidecar release cho URL `desktop-pet-v1/win-x64.zip`
- Đã test clean flow trên Windows:
  - cài extension
  - bật `animeCompanion.desktopCompanion.enabled`
  - reload window
  - sidecar download thành công
  - floating companion hiện ra
  - tắt/bật lại VS Code vẫn hoạt động

## 4. Suggested release order

1. Build và upload desktop companion asset lên GitHub Release tag `desktop-pet-v1`.
2. Verify `animeCompanion.desktopCompanion.downloadBaseUrl` đang trỏ đúng release asset thật.
3. Package extension `.vsix`.
4. Publish extension `v0.1.40` lên VS Code Marketplace / Open VSX.
5. Tạo GitHub Release `v0.1.40` kèm release notes ngắn gọn.

Lý do đi theo thứ tự này:

- Extension public trước khi sidecar asset sẵn sàng sẽ làm user bật feature nhưng download fail.
- Sidecar asset là dependency runtime của Desktop Companion mode.

## 5. Release notes mẫu

```md
## Anime Companion v0.1.40

This release completes the first real lazy-download flow for Desktop Companion (Windows v1).

- Run your Live2D companion as a floating desktop window outside VS Code
- Toggle with `animeCompanion.desktopCompanion.enabled`
- First launch lazy-downloads the Windows sidecar from GitHub Releases
- Added Desktop Companion settings for always-on-top, click-through, size, position, and opacity
- Added download progress / completion feedback for the sidecar

Notes:
- Desktop Companion v1 is currently Windows-only
- Reload Window is required after toggling Desktop Companion mode
```

## 6. Post-publish verification

- Marketplace page hiện đúng version `0.1.40`
- Open VSX hiện đúng version `0.1.40`
- GitHub Release có `.vsix`
- GitHub Release `desktop-pet-v1` có asset sidecar Windows
- README render đúng section Desktop Companion
- Test lại một máy Windows không dùng build local

## 7. Nếu muốn public an toàn hơn nữa

- Thêm screenshot/GIF cho Desktop Companion ngoài desktop thật
- Viết một known-issues section riêng cho Windows SmartScreen và Windows-only scope
- Thêm CI/job riêng để build sidecar và xuất checksum trước khi public rộng
