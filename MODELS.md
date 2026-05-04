# Live2D models

Để giữ `.vsix` nhỏ, extension hiện chỉ ship / lazy-load các model sample có thể phân phối an toàn hơn:

- `Hiyori` ship sẵn trong package
- `Haru`, `Mao`, `Miara` lazy-download qua `animeCompanion.modelDownloadBaseUrl`

Các model khác không còn được bundle hoặc fetch như một phần mặc định của extension. Nếu user muốn dùng model riêng đã tự tải về, hãy cấu hình qua `animeCompanion.customModelRoots` hoặc `animeCompanion.customModels`.

## Auto-scan theo thư mục gốc

Nếu bạn có cấu trúc như:

```text
D:/model/
  ModelA/
  ModelB/
  ModelC/
```

chỉ cần setting:

```json
"animeCompanion.customModelRoots": [
  "D:/model"
]
```

Extension sẽ tự quét từng thư mục con trực tiếp. Thư mục nào chứa file `.model3.json` sẽ được thêm vào picker.

## Custom local models chi tiết

Setting:

```json
"animeCompanion.customModels": {
  "my-model": {
    "name": "My Model",
    "path": "D:/Live2D/MyModel",
    "modelFile": "MyModel.model3.json",
    "description": "Custom local model"
  }
}
```

Ý nghĩa:

- key `vivian`: id của model trong picker
- `name`: tên hiển thị
- `path`: đường dẫn tới thư mục model trên máy user
- `modelFile`: file `.model3.json` nằm trong thư mục đó
- `description`: mô tả hiển thị trong picker

`customModels` hữu ích khi bạn muốn override tên hiển thị, mô tả, hoặc chỉ định file `.model3.json` cụ thể. Nếu một model xuất hiện ở cả `customModelRoots` và `customModels`, bản khai báo chi tiết trong `customModels` sẽ được ưu tiên.

## Cấu trúc thư mục local model

Ví dụ:

```text
D:/Live2D/MyModel/
  MyModel.model3.json
  MyModel.moc3
  MyModel.physics3.json
  MyModel.cdi3.json
  MyModel.4096/
    texture_00.png
    texture_01.png
```

Extension sẽ serve thư mục này qua local HTTP server để webview có thể load được asset.

## Built-in lazy download

Với các model sample hỗ trợ lazy-download, extension fetch theo:

```text
{animeCompanion.modelDownloadBaseUrl}/{folder}.zip
```

Default:

```text
https://github.com/xShiroeNguyenx/anime-companion-vscode/releases/download/models-v1
```

## Cache location

| OS | Path |
|---|---|
| Windows | `%APPDATA%\\Code\\User\\globalStorage\\shiroenguyen.anime-companion-vscode\\models\\` |
| macOS | `~/Library/Application Support/Code/User/globalStorage/shiroenguyen.anime-companion-vscode/models/` |
| Linux | `~/.config/Code/User/globalStorage/shiroenguyen.anime-companion-vscode/models/` |

## Lỗi thường gặp

- `Not found` hoặc fallback về Hiyori: đường dẫn `path` hoặc `modelFile` trong `animeCompanion.customModels` đang sai.
- Model load được nhưng texture lỗi: kiểm tra lại các path tương đối bên trong file `.model3.json`.
- Model sample không tải được: kiểm tra `animeCompanion.modelDownloadBaseUrl` và asset zip trên release/CDN.
