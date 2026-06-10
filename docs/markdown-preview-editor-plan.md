# Plan: Markdown Preview + WYSIWYG Edit (Anime Companion)

> Trạng thái: **PLAN — chưa code.** Tài liệu này mô tả thiết kế tính năng để triển khai sau.

## Context

Hiện extension chưa có chức năng xem/sửa Markdown. Mục tiêu là thêm trải nghiệm giống
extension "Background"/preview, nhưng đậm chất Anime Companion:

* Khi đang mở file `.md`, hiện một **icon "bông hoa" 🌸** ở góc trên-phải editor.
* Click vào icon → mở **một cửa sổ (tab) mới full-size** (KHÔNG chia đôi màn hình)
    hiển thị nội dung Markdown.
* Trong cửa sổ đó **sửa trực tiếp kiểu WYSIWYG như CKEditor** (vừa thấy bản render
    vừa gõ tại chỗ), và **ghi thẳng vào file `.md`** khi Save.

Kết quả mong muốn: một panel webview render đẹp + sửa tại chỗ, đồng bộ an toàn với file gốc.

## Quyết định đã chốt

* **Icon trigger: cả hai** — nút tĩnh trên `editor/title` (chỉ hiện với `.md`) +
    item nhấp nháy ở status bar.
* **Edit: WYSIWYG giống CKEditor** — sửa ngay trên bản render, không phải ô textarea rời.
* **Save: ghi thẳng vào file `.md`**.
* Mở ở **tab mới full-size** (`ViewColumn.Active`), không split.

## Lựa chọn kỹ thuật

* **Thư viện WYSIWYG: Toast UI Editor (`@toast-ui/editor`)** — bản UMD
    (`toastui-editor-all.min.js` + `toastui-editor.min.css`), MIT, **không cần bundler**
    (khớp với dự án chỉ dùng `tsc`, không esbuild/webpack). Cho cả chế độ WYSIWYG
    (mặc định) lẫn Markdown-source, có toolbar định dạng, `getMarkdown()` xuất ra
    Markdown. Đây là lựa chọn "CKEditor-like" thực dụng nhất. (CKEditor 5 / Milkdown
    bị loại vì cần build ESM.)
* Vendor thư viện vào `media/vendor/toastui/` (không thêm vào `node_modules` runtime).

## ⚠️ Rủi ro quan trọng phải xử lý: round-trip reformat

WYSIWYG markdown editor khi `getMarkdown()` sẽ **chuẩn hoá lại toàn bộ file** (đổi
list marker, `*` vs `_`, spacing dòng trống, **viết lại block HTML thô**, …). File như
`README.md` của repo này nhiều HTML + emoji + đa ngôn ngữ → nếu "mở preview rồi Save"
sẽ âm thầm làm xáo trộn định dạng. Biện pháp:

1. **Chỉ ghi khi user thực sự sửa.** Lắng nghe sự kiện `change` của Toast UI; nếu
    không có thay đổi nào thì nút Save vô hiệu và không bao giờ ghi đè file chưa động tới.
    → triệt tiêu hoàn toàn case "xem rồi vô tình reformat".
2. **Cảnh báo một lần** khi user bắt đầu sửa: "Lưu sẽ chuẩn hoá lại định dạng Markdown".
3. **Acceptance test** với chính `README.md`: load → `getMarkdown()` (không sửa) →
    diff với bản gốc, ghi nhận khác biệt để đánh giá có chấp nhận được không.

## Các thay đổi & file liên quan

### 1. `package.json`

* **`contributes.commands`**: thêm `animeCompanion.openMarkdownEditor`
    (title: "Open in Anime Markdown Editor", icon trỏ tới SVG hoa).
* **`contributes.menus` → `editor/title`**: thêm mục với
    `"when": "resourceExtname == .md"`, `"group": "navigation"` để hiện nút 🌸 góc phải.
    (Hiện chưa có mục `editor/title` nào — sẽ tạo mới.)
* **`contributes.icons`** (hoặc dùng path icon light/dark trong command): icon hoa.
* **`files` whitelist**: thêm `media/vendor/toastui/**` và `media/icons/**`
    (asset/dep mới bắt buộc khai báo ở "files" mới được đóng gói VSIX).

### 2\. Asset mới

* `media/icons/flower.svg` (sakura hồng, có biến thể light/dark nếu cần) — dùng cho nút editor/title.
* `media/vendor/toastui/toastui-editor-all.min.js`, `toastui-editor.min.css`.

### 3. `src/markdown/markdown-editor-panel.ts` (mới) — theo khuôn `src/background/background-panel.ts`

* Quản lý panel theo **`Map<string, MarkdownEditorPanel>` keyed by URI** (mỗi file một
    cửa sổ; nếu đã mở thì `reveal()` lại thay vì tạo mới).
* `createWebviewPanel('animeCompanion.markdownEditor', <tên file>, vscode.ViewColumn.Active, { enableScripts, retainContextWhenHidden, localResourceRoots: [media] })`.
* `_renderHtml()`: nạp CSS/JS Toast UI qua `webview.asWebviewUri()`, CSP có `nonce`
    (kiểm tra Toast UI inject inline style → cho phép trong CSP), khởi tạo editor ở chế độ
    WYSIWYG với nội dung file.
* Message protocol (theo mẫu `onDidReceiveMessage`/`postMessage`):
    * webview→ext: `md:ready`, `md:dirty` (đã sửa), `md:save` (kèm markdown), `md:requestContent`.
    * ext→webview: `md:setContent` (nội dung + tên file + cảnh báo reformat).
* **Save** (`md:save`): dùng `vscode.workspace.openTextDocument(uri)` + `WorkspaceEdit`
    thay toàn bộ range rồi `document.save()` — đồng bộ với editor đang mở, tránh xung đột
    "file changed on disk". Chỉ chạy khi có dirty.
* **Đồng bộ ngược**: `onDidChangeTextDocument` cho uri đó → nếu webview KHÔNG dirty thì
    cập nhật lại nội dung (file sửa ở nơi khác). Nếu webview dirty → bỏ qua / hỏi (tránh đè).
* `onDidDispose` + cảnh báo "có thay đổi chưa lưu" khi đóng (lắng nghe dirty và nhắc khi
    save thủ công, vì webview không chặn được sự kiện close).

### 4. `src/markdown/markdown-status-bar.ts` (mới) hoặc thêm vào `src/extension.ts`

* `createStatusBarItem(Right)` với text emoji 🌸 + nhãn; `command = openMarkdownEditor`.
* **Nhấp nháy**: chỉ chạy `setInterval` (\~800ms, đổi text 🌸/💮 hoặc toggle màu) **khiactive editor là `.md`**; ẩn item + clear interval khi rời `.md` (tránh tốn CPU).
* Cập nhật theo `window.onDidChangeActiveTextEditor`.

### 5. `src/extension.ts`

* Đăng ký command `animeCompanion.openMarkdownEditor` → lấy uri của active `.md`
    (hoặc uri truyền vào từ editor/title) → `MarkdownEditorPanel.reveal(uri)`.
* Khởi tạo status bar markdown trong `activate()`, push vào `context.subscriptions`.

### 6\. i18n — `media/messages/{vi,en,ja}.json`

* Thêm nhóm `webview.markdownEditor`: tiêu đề, tooltip nút 🌸, nhãn Save / "Đã lưu",
    cảnh báo reformat, "có thay đổi chưa lưu". Lấy qua
    `getMessageBank().getWebviewStrings()` (mẫu giống `backgroundPanel`).

## Cần làm rõ thêm khi code (không chặn plan)

* CSP cho inline-style của Toast UI: thêm `style-src` cho phép `'unsafe-inline'` hoặc
    nonce phù hợp trong webview này.
* Biến thể icon light/dark cho editor/title.

## Verification (khi đã code xong)

1. `npm run compile` không lỗi TS.
2. F5 chạy Extension Development Host. Mở một file `.md`:
    * Thấy nút 🌸 góc phải editor + item 🌸 nhấp nháy ở status bar; mở file không phải
        `.md` thì cả hai biến mất/ngừng nháy.
3. Click 🌸 → mở tab mới full-size (không split), render đúng nội dung.
4. **Round-trip test**: mở chính `README.md`, KHÔNG sửa gì → đóng/không Save → file gốc
    không đổi (kiểm `git status` sạch). Bật chế độ và `getMarkdown()` so diff để ghi nhận
    mức chuẩn hoá.
5. Sửa nội dung (in đậm/heading/list) → Save → `git diff` chỉ thay đúng phần đã sửa;
    nếu file đang mở ở tab thường thì nội dung tab đó cập nhật theo (đồng bộ 2 chiều).
6. Mở 2 file `.md` khác nhau → 2 cửa sổ riêng; mở lại file đã mở thì focus lại cửa sổ cũ.