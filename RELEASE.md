# Release flow (tag-based) — note nội bộ

Publish **tự động bằng cách push git tag** `vX.Y.Z`. Không publish thủ công bằng `vsce publish`.

Workflow: [.github/workflows/release.yml](.github/workflows/release.yml) — trigger khi push tag khớp `v*.*.*`.
Nó sẽ tự: kiểm tra tag khớp `version` trong package.json → build VSIX → publish **Marketplace** (nếu có secret `VSCE_PAT`) + **Open VSX** (nếu có `OVSX_PAT`) → tạo **GitHub Release** đính kèm `.vsix`.

> Quy ước tag: `v0.4.0`, `v0.4.2`, `v0.4.3`… (chữ `v` thường + `MAJOR.MINOR.PATCH`).

---

## Chuẩn bị trước khi release

- [ ] Bump `version` trong [package.json](package.json) (vd `0.4.3`).
- [ ] Thêm mục mới vào [CHANGELOG.md](CHANGELOG.md) (`## [X.Y.Z] - YYYY-MM-DD`).
- [ ] Cập nhật version + khối "What's new" trong **3 README**:
  [README.md](README.md) · [docs/README.vi.md](docs/README.vi.md) · [docs/README.ja.md](docs/README.ja.md)
  (README.md là source of truth — sửa nó trước rồi đồng bộ vi/ja).
- [ ] `npm test` chạy pass (compile + smoke test).
- [ ] (Tùy chọn) `npm run package` để build thử VSIX local và soi nội dung gói.

> ⚠️ Tag **bắt buộc** khớp `package.json` version, nếu lệch workflow fail ở bước "Verify tag matches package.json version".

---

## Các lệnh release (tuần tự)

Thay `0.4.3` bằng version thật.

```bash
# 1. Kiểm tra trạng thái
git branch --show-current                      # phải: main
git status --short
node -p "require('./package.json').version"     # phải khớp tag sắp tạo

# 2. Stage CHỈ file tracked đã sửa (.vsix đã gitignore, không dính)
git add -u

# 3. Commit
git commit -m "release: v0.4.3 — <mô tả ngắn>"

# 4. Push commit lên main TRƯỚC (workflow checkout theo tag → tag phải trỏ commit đã có trên remote)
git push origin main

# 5. Tạo annotated tag
git tag -a v0.4.3 -m "v0.4.3 — <mô tả ngắn>"

# 6. Push tag → kích hoạt workflow Release
git push origin v0.4.3
```

**Thứ tự sống còn:** push commit (bước 4) **trước** push tag (bước 6).

---

## Theo dõi & kiểm tra (cần `gh` CLI đã đăng nhập)

```bash
gh run watch                                    # xem workflow chạy realtime
gh run list --workflow=release.yml --limit 3    # liệt kê các run gần nhất
gh release view v0.4.3                          # xem GitHub Release vừa tạo
```

Trong log run, kiểm tra bước **"Publish to Marketplace"** / **"Publish to Open VSX"** có chạy không — nếu bị *skip* nghĩa là repo chưa cấu hình secret tương ứng (xem mục dưới).

---

## Làm lại tag khi lỡ sai

```bash
git tag -d v0.4.3                       # xóa tag local
git push origin :refs/tags/v0.4.3       # xóa tag trên remote
# sửa code/docs → commit thêm → push main → tạo lại tag v0.4.3 → push tag
```

> Push lại tag cùng tên (sau khi đã xóa remote) sẽ trigger workflow chạy lại.

---

## Ghi chú

- **Secrets publish:** Marketplace/Open VSX chỉ tự publish nếu repo có secret `VSCE_PAT` / `OVSX_PAT`
  (Settings → Secrets and variables → Actions). Thiếu secret thì workflow **vẫn** tạo GitHub Release + đính `.vsix`, chỉ bỏ qua bước publish store (không báo lỗi).
- **VSIX local không commit:** `anime-companion-vscode-*.vsix` đã được gitignore; CI tự build lại từ source.
- **Bundle docs trong VSIX:** README + CHANGELOG được đóng gói vào VSIX, nên cập nhật docs *trước* khi tag để bản publish chứa nội dung mới.
- **`PUBLIC_RELEASE_GUIDE.md`** là log release-notes theo từng version (pitch Marketplace) — khác file này (quy trình thao tác).
