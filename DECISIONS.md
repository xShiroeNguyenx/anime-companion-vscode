# 🧠 Quyết Định Thiết Kế (Architectural Decisions)

Tài liệu này giải thích tại sao chúng ta lại áp dụng các giải pháp kỹ thuật nhất định trong quá trình phát triển Anime Companion.

## 1. Tại sao lại cần một Local HTTP Server (`src/server.ts`)?
**Bối cảnh:** Các file của Live2D (moc3, model3.json, png textures) thường được tải qua Fetch API hoặc XHR bởi thư viện `pixi-live2d-display`.
**Vấn đề:** VS Code Webview chặn việc fetch trực tiếp các file tĩnh từ hệ thống (`file://` hoặc `vscode-webview-resource://`) nếu nó liên quan đến buffer array / CORS nội bộ của PIXI. 
**Giải pháp:** Thay vì cố gắng viết lại loader của PIXI để hỗ trợ giao thức của VS Code, chúng ta khởi tạo một `express` server cực nhỏ gọn chạy ẩn ở localhost (cổng tự động) để phục vụ các file asset tĩnh.
**Đánh giá:** Giải quyết triệt để lỗi "Cross-Origin" và giúp dễ dàng thay thế/thêm bớt model mới chỉ bằng cách copy thả vào thư mục media.

## 2. Xử lý Biểu Cảm (Expression System)
**Vấn đề:** Model thiếu file định nghĩa biểu cảm `.exp3.json`.
**Giải pháp:** Viết một hệ thống Expression Engine thủ công trong `webview.js`.
Thay vì load file ngoài, chúng ta ánh xạ các trạng thái cảm xúc (happy, shy, angry) vào trực tiếp mảng các `Live2D Parameter` (như `ParamMouthSmile`, `ParamCheek`).
Dùng `PIXI.Ticker` để tạo Tweening (nội suy) tuyến tính thay đổi các tham số này một cách từ từ (trong 500ms - 1000ms), tạo hiệu ứng mặt đổi sắc siêu thực tế.

## 3. Hệ thống Âm Thanh Đa Ngôn Ngữ (Dual Audio TTS)
**Vấn đề:** Người dùng muốn có giọng Anime nhưng VoiceVox (Công cụ tạo giọng AI tốt nhất cho V-tuber) chỉ hỗ trợ chữ Nhật.
**Giải pháp:** Phân thành 3 hệ thống:
1. `ja`: Nhật 100%
2. `vi`: Tiếng Việt (bằng Google TTS)
3. `en`: Tiếng Anh (audio generated with Google TTS)
Các file âm thanh này được sinh ra từ các Node script độc lập và lưu sẵn thành `.mp3` để đóng gói vào extension, giúp extension chạy mượt mà offline mà không cần gọi API thật lúc runtime.

## 4. UI Context Menu tuỳ chỉnh
**Vấn đề:** Không thể mở Native Context Menu của VS Code bên trong Webview Canvas của PIXI.
**Giải pháp:** Ngăn chặn event chuột phải mặc định (`e.preventDefault()`) và hiển thị thẻ `div` DOM nổi ngay vị trí trỏ chuột. Từ DOM này, truyền Message qua cầu nối (PostMessage) về Extension Host để thực thi hàm `vscode.commands.executeCommand('workbench.action.debug.run')`.
