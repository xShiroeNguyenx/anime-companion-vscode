# Lazy-loaded Live2D models

Để giữ `.vsix` nhỏ (~8 MB thay vì 130 MB), chỉ Hiyori được ship trong package. Các model khác sẽ được tải về `globalStorage` lần đầu user chọn.

## URL pattern

Extension fetch theo:
```
{animeCompanion.modelDownloadBaseUrl}/{folder}.zip
```

Default base URL:
```
https://github.com/xShiroeNguyenx/anime-companion-vscode/releases/download/models-v1
```

User có thể override qua setting `animeCompanion.modelDownloadBaseUrl` để self-host (CDN, S3, …).

## Folder layout của zip

Mỗi `.zip` phải có `model3.json` ở **top level** (không nested folder thừa). Sau khi unzip vào `{globalStorage}/models/{folder}/`, file `{folder}/{file}` phải tồn tại đúng theo `MODEL_MAP` trong [src/models.ts](src/models.ts).

Ví dụ `Vivian.zip` — nội dung:
```
Vivian.model3.json
Vivian.moc3
Vivian.physics3.json
Vivian.cdi3.json
Vivian.4096/
  texture_00.png
  texture_01.png
  ...
... (motion / expression files)
```

## Cách build zip (1 lần, mỗi khi thêm/đổi model)

Từ root repo:

```bash
# Per model — adjust folder name
cd media/live2d
zip -r chaijun_3.zip chaijun_3
zip -r IceGirl.zip IceGirl
zip -r Tsubaki.zip Tsubaki
zip -r WhiteAngel.zip WhiteAngel
zip -r Vivian.zip Vivian
zip -r Changli.zip Changli
```

Hoặc PowerShell trên Windows:
```powershell
Set-Location media\live2d
'chaijun_3','IceGirl','Tsubaki','WhiteAngel','Vivian','Changli' | ForEach-Object {
  Compress-Archive -Path $_ -DestinationPath "$_.zip" -Force
}
```

## Upload lên GitHub Release

```bash
# Tạo tag dành riêng cho models (không phải tag version extension)
gh release create models-v1 --notes "Live2D model assets v1" \
  media/live2d/chaijun_3.zip \
  media/live2d/IceGirl.zip \
  media/live2d/Tsubaki.zip \
  media/live2d/WhiteAngel.zip \
  media/live2d/Vivian.zip \
  media/live2d/Changli.zip
```

Sau đó verify URL access (browser hoặc curl):
```
https://github.com/xShiroeNguyenx/anime-companion-vscode/releases/download/models-v1/Vivian.zip
```

## Versioning model assets

Khi cần update model (đổi texture, thêm motion, v.v.):

1. Bump tag → `models-v2`
2. Update default `animeCompanion.modelDownloadBaseUrl` trong `package.json`
3. Cache cũ ở `{globalStorage}/models/` sẽ vẫn được dùng (không invalidate tự động)

Để force re-download, user xóa `{globalStorage}/models/{folder}/` thủ công, hoặc mình thêm command `Anime Companion: Clear Model Cache` (chưa làm — TODO khi cần).

## Cache location

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Code\User\globalStorage\shiroenguyen.anime-companion-vscode\models\` |
| macOS | `~/Library/Application Support/Code/User/globalStorage/shiroenguyen.anime-companion-vscode/models/` |
| Linux | `~/.config/Code/User/globalStorage/shiroenguyen.anime-companion-vscode/models/` |

## Lỗi thường gặp

- **HTTP 404 khi download**: zip chưa được upload lên Release tương ứng. Kiểm tra URL trong browser.
- **"Extraction succeeded but {file}.model3.json not found"**: zip có nested folder thừa (vd `Vivian/Vivian/Vivian.model3.json`). Re-zip với layout đúng top-level.
- **Download timeout**: connection chậm hoặc model quá lớn. Tăng timeout trong [src/model-downloader.ts](src/model-downloader.ts) hoặc dùng CDN nhanh hơn.
- **Model fallback về Hiyori**: ensureModel() throw — xem Output channel "Anime Companion" để biết lý do, click Retry trong toast.
