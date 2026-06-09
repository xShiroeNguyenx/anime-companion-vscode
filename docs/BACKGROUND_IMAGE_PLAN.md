# Plan: Tính năng Background Image cho VSCode (có bảng điều khiển webview)

> Trạng thái: **PLAN — chưa code gì.** Extension: `anime-companion-vscode`.

## Context (vì sao làm)

User muốn thêm tính năng **ảnh nền cho VSCode** giống extension "Background"
(shalldie/vscode-background): ảnh hiện **sau vùng Editor + Sidebar + Panel**, không
chỉ trong khung companion. Nhưng extension Background gây **rắc rối ở phần setting**
(chỉ có JSON, khó hiểu, lifecycle khó chịu). Vì vậy **điểm nhấn của tính năng này là
bảng điều khiển (control panel) trực quan** — giống trải nghiệm tuner của Chibi Cursor —
để việc chọn ảnh / chỉnh độ mờ / áp dụng / khôi phục đều rõ ràng, ai cũng làm được.

**Sự thật kỹ thuật cần chấp nhận:** VSCode **không có API công khai** để đặt ảnh nền
cho workbench. Cách duy nhất (và là cách extension Background dùng) là **vá file
workbench JS** trong thư mục cài VSCode. Một số "đau" là **cố hữu**, bảng điều khiển chỉ
**giảm nhẹ** chứ không xóa được: cần **reload cửa sổ** để thấy hiệu ứng, phải **vá lại sau
mỗi lần VSCode update**, cần **quyền ghi thư mục cài** (admin nếu cài ở Program Files), và
cảnh báo **"installation appears corrupt"**.

## Quyết định đã chốt (với user)

| Hạng mục | Lựa chọn |
|---|---|
| Cơ chế | **Vá workbench** (`workbench.desktop.main.js`) |
| Vùng nền | **Editor + Sidebar + Panel** (mỗi vùng cấu hình riêng) |
| Bảng điều khiển | **Webview riêng** (panel độc lập, không nhồi vào companion view) |
| Trình biên tập v1 | **Chỉ VSCode stable** (Cursor/VSCodium = follow-up) |

## Cơ chế vá đã xác minh (từ mã nguồn shalldie/vscode-background)

- **File đích:** `vs/workbench/workbench.desktop.main.js` trong thư mục cài VSCode.
- **Định vị:** ưu tiên thư mục chứa `require.main?.filename`, fallback
  `path.join(vscode.env.appRoot, 'out')` (API `appRoot` đáng tin hơn).
- **Inject:** ghi đoạn JS tạo `<style>` vào DOM workbench, **bọc giữa marker** comment.
  Apply = đọc file → xóa block cũ (regex) → nối block mới → ghi lại.
- **Khôi phục:** regex xóa đoạn giữa 2 marker (độc lập phiên bản, luôn đúng).
- **Cảnh báo corrupt:** bản mới của họ vá luôn checksum để tắt cảnh báo (xâm lấn hơn) →
  ta để **opt-in**.

---

## Kiến trúc: 2 nửa độc lập, nối nhau qua config schema

```
[ Bảng điều khiển webview ]  --ghi/đọc settings-->  [ animeCompanion.background.* ]
   (Phần B - UX)                                          (HỢP ĐỒNG CHUNG)
                                                                  |
                                                       đọc settings, sinh CSS
                                                                  v
                                              [ Lõi vá workbench + lifecycle ]
                                                       (Phần A - rủi ro)
```

Hai nửa **chỉ giao tiếp qua config keys** (mục "Config schema"). Panel không gọi trực
tiếp vào patcher trừ lệnh Apply/Disable (qua command chung).

---

## PHẦN A — Lõi vá workbench + lifecycle

### Module mới (tạo dưới `src/background/`)
- `background-patch-manager.ts` — class điều phối lifecycle (API công khai).
- `workbench-locator.ts` — định vị file workbench + dò quyền ghi (probe).
- `patch-generator.ts` (+ `.editor.ts` / `.sidebar.ts` / `.panel.ts`) — sinh JS+CSS theo từng vùng.
- `patch-generator.checksums.ts` — payload tắt cảnh báo corrupt (OPT-IN, tách riêng).
- `image-encoder.ts` — đọc ảnh → data-URI base64, có giới hạn dung lượng.
- `types.ts` — `BackgroundConfig`, `RegionConfig`, `PatchResult`.

### API `BackgroundPatchManager`
- `applyIfNeeded()` — gọi lúc activate (deferred). Nếu tắt → đảm bảo file sạch. Nếu bật mà
  chưa có marker (hoặc hash payload đổi) → `apply()`. **Không bao giờ throw vào activate.**
- `apply()` — vá đầy đủ (xem dưới). Trả `{ ok, needsReload, reason }`.
- `restore()` — gỡ block marker → ghi atomic → nhắc reload.
- `isPatched()` — đọc file, kiểm tra marker. **Đây là cò re-apply thật.**
- `getState()` — `{ enabled, patched, vscodeVersion, lastError }` cho status bar + panel.

### Quy trình APPLY (kèm xử lý lỗi từng bước)
1. Định vị file → không thấy: log + cảnh báo 1 lần, return (không throw).
2. **Probe quyền ghi** (ghi/xóa file `.tmp` cạnh file đích) → EACCES/EPERM: thông báo (mục
   "Quyền ghi"), dừng sạch.
3. Đọc file (utf8).
4. **Backup bản gốc sạch**: xóa marker trước rồi mới lưu (chỉ lưu nội dung pristine), keyed
   theo `vscode.version`, vào `globalStorageUri/background/backup/<version>/`. Backup lỗi =
   non-fatal (atomic write vẫn an toàn).
5. **Xóa block cũ** bằng regex **non-greedy** → đảm bảo idempotent (vá nhiều lần không chồng).
6. **Sinh JS+CSS** cho 3 vùng từ config; tính hash payload nhúng vào marker.
7. Nối block mới.
8. **Ghi atomic**: ghi `${file}.tmp` **trong cùng thư mục workbench** (tránh `EXDEV` khi
   rename xuyên ổ đĩa), rồi `fs.rename` đè lên file gốc. **Tái dùng pattern tmp+rename của**
   [src/agent-profiles/credential-fs.ts](../src/agent-profiles/credential-fs.ts).
9. Lưu state (`vscode.version` + hash payload) vào `globalState` (best-effort).
10. **Nhắc reload** — `showInformationMessage(..., "Reload Window")` → `workbench.action.reloadWindow`.
    Không bao giờ tự reload.

### Marker (KHÁC tên với extension Background để không xung đột)
`// anime-companion-background-start <hash>` … `// anime-companion-background-end`.
Regex gỡ dùng non-greedy `[\s\S]*?`.

### CSS theo vùng
Selector (xác nhận lại với DOM VSCode thực lúc code — **selector hay đổi theo phiên bản**):
- Editor: container của editor group / `.split-view-view`.
- Sidebar: `.part.sidebar`. Panel: `.part.panel`.
Ưu tiên overlay bằng pseudo-element, `pointer-events:none`, `z-index` dưới nội dung.

### RESTORE (khi tắt + khi gỡ extension)
- **Khi nào:** config `background.enabled` true→false (listener) → restore + nhắc reload;
  hoặc command `animeCompanion.background.remove` (+ action ở status bar, giống Background ext).
- **Cách:** regex gỡ marker (restore chính, độc lập phiên bản) → ghi atomic → nhắc reload →
  xóa state patched.
- **Dọn dẹp khi GỠ extension — dùng hook `vscode:uninstall`** (đã xác minh extension Background
  dùng đúng cơ chế này: `"vscode:uninstall": "node ./out/uninstall"`). Tạo script Node thuần
  `src/background/uninstall.ts` (build ra `out/background/uninstall.js`): **không có `vscode` API**,
  tự định vị file workbench qua env/`appRoot`-style + regex gỡ block marker (đúng restore chính,
  độc lập phiên bản). Đây là **đường dọn tự động chính khi uninstall** — giải đúng nỗi đau "để lại
  install bẩn" của extension Background.
- **Hạn chế của hook (thật thà):** `vscode:uninstall` **không chạy khi bị kill cứng** (không phải
  100% tin cậy). Fallback tài liệu hóa: gỡ mà chưa Disable + script không kịp chạy → cài lại +
  Disable, hoặc xóa thủ công đoạn giữa marker. (Đây là fallback, KHÔNG còn là đường chính.)
- **KHÔNG restore trong `deactivate()`** — `deactivate()` chạy cả khi tắt cửa sổ bình thường, không
  phải tín hiệu uninstall. Hiện chỉ làm `modelServer.stop()`; giữ nguyên vậy.

### AUTO RE-APPLY sau khi VSCode update
- **Cò chính (đúng):** mỗi lần `activate()`, nếu `enabled` → `isPatched()`; mất marker
  (update đã ghi đè file) → `apply()` lại. **Không** dựa vào đổi version của extension.
- **Tái dùng** version-change detection sẵn có ([extension.ts:351-389](../src/extension.ts#L351))
  cho ghi chú lần đầu + pattern migration-key; còn việc re-apply chạy trong `setTimeout`
  deferred, gate bằng `isPatched()`.
- Nếu đã vá nhưng hash payload ≠ hash mới (user đổi ảnh/độ mờ) → vá lại để config có hiệu lực.

### Quyền ghi thất bại (Program Files → EACCES)
- Bắt EACCES/EPERM/EROFS/EBUSY ở bước probe + bước ghi. Không throw vào activate.
- 1 thông báo hành động được: bản Program Files → "Không ghi được vào thư mục cài VSCode
  (Program Files được bảo vệ). Chạy VSCode bằng quyền Administrator một lần, hoặc cài bản
  **User**." Nút `[Mở Output] [Tìm hiểu]`. v1 không tự nâng quyền.
- Không tự tắt `enabled` (user có thể sửa quyền rồi reload).

### Cảnh báo "installation corrupt"
- **Mặc định v1:** KHÔNG vá checksum. Panel hiện ghi chú: "VSCode có thể báo cài đặt hỏng —
  bình thường sau khi áp ảnh nền, bấm 'Don't Show Again', vô hại."
- **Opt-in:** `animeCompanion.background.patchChecksums` (mặc định `false`); bật lần đầu phải
  qua dialog cảnh báo. Cơ chế vá checksum chính xác **xác nhận lại với VSCode đang cài lúc code**.

---

## PHẦN B — Bảng điều khiển webview (điểm nhấn chính)

### Nguyên tắc khung sườn (QUAN TRỌNG)
- **Lifecycle panel** (singleton `_current`, `reveal()`, `onDidDispose`, `_broadcast()` full-state):
  theo mẫu [src/agent-profiles/profile-panel.ts](../src/agent-profiles/profile-panel.ts).
- **Nhưng phần ảnh / CSS-JS rời / i18n / CSP**: theo mẫu
  [src/companion-view.ts](../src/companion-view.ts) — vì `profile-panel.ts` **thiếu `img-src`,
  thiếu `localResourceRoots`, hardcode tiếng Anh** (sẽ không load được ảnh).
- Một câu cho người code: *lifecycle lấy từ profile-panel, còn asset/ảnh/i18n/CSP lấy từ companion-view.*

### Module mới
- `src/background/background-panel.ts` — class `BackgroundPanel`.
- `media/webview/background-panel.css` — style (dùng `--vscode-*`, region card, slider, preview).
- `media/webview/background-panel.js` — controller webview: đọc `__BG_STATE__`/`__BG_STRINGS__`,
  render card + preview, nối control → postMessage `background:*`, nhận `background:state`.

### `createWebviewPanel` — options bắt buộc
```
{ enableScripts: true, retainContextWhenHidden: true,
  localResourceRoots: [ joinPath(extensionUri,'media'), globalStorageUri ] }
```
CSP nonce: `img-src ${cspSource} data:; style-src ${cspSource}; script-src 'nonce-...';`.

### Lưu ảnh user (tái dùng pattern chibi-capture của cursor-chibi.ts)
- Ảnh lưu dưới `globalStorageUri/background/`. Khi user `background:pickImage` →
  `showOpenDialog({ filters:{ Images:['png','jpg','jpeg','webp','gif'] } })` → **copy** vào
  globalStorage (độc lập file gốc) → ghi fsPath vào config → `_broadcast()`.
- Render trong webview: `webview.asWebviewUri(Uri.file(fsPath))` (KHÔNG dùng `file://` thô —
  bị CSP chặn). Tính lại URI mỗi lần `_broadcast()`.

### Bố cục UX (deliverable ưu tiên)
Cuộn dọc: **3 card vùng giống hệt nhau** (Editor / Sidebar / Panel) + **thanh điều khiển chung**.

**Mỗi region card:**
- Header: tên vùng + checkbox **bật/tắt riêng vùng**.
- Trái — **chọn ảnh**: ô lớn (chưa có ảnh = placeholder "Chọn ảnh…"; có ảnh = thumbnail),
  nút **Chọn…** / **Xóa**, caption tên file.
- Phải — **tinh chỉnh**: slider **Opacity** (0–100%), slider **Blur** (0–40px), segmented
  **Sizing** (Cover / Contain / Repeat / Stretch), lưới 3×3 chọn **Position**.
- Dưới — **Preview trong panel**: ô ~16:9 render ảnh với opacity/blur/size/position hiện tại,
  có vài "dòng code" giả đè lên để thấy độ tương phản. **Caption thật thà:** "Xem trước gần
  đúng — nền thật xuất hiện sau khi Apply (reload cửa sổ)."

**Thanh điều khiển chung (sticky footer):**
- Toggle **Bật tổng** (`background.enabled`).
- Nút chính **Apply (reload cửa sổ)**.
- Nút phụ **Disable & Restore** (có confirm).
- Toggle **"Tắt cảnh báo corrupt"** (`patchChecksums`) kèm ghi chú ⚠️.
- Mục gập **"Cách hoạt động"**: cần reload / vá lại sau update / cần admin nếu ở Program Files.
- **Dirty banner** (ẩn nếu không có thay đổi chờ áp): dải nhắc "Có thay đổi chưa áp dụng — bấm Apply".

### Giao thức message (webview ⇄ extension), namespace `background:*`
**Webview → Extension** (mỗi cái ghi config rồi `_broadcast()` lại full-state):
`background:ready`, `background:pickImage {region}`, `background:clearImage {region}`,
`background:set {region,key,value}`, `background:setRegionEnabled {region,value}`,
`background:setEnabled {value}`, `background:setPatchChecksums {value}`,
`background:apply`, `background:disable`.
**Extension → Webview:** chỉ `background:state {state}` (gửi lại toàn bộ state mỗi lần đổi).
Xử lý message **trong `BackgroundPanel._handleMessage`** (giống profile-panel), **không** đụng
`companion-message-dispatcher.ts`. `region` validate trong `{editor,sidebar,panel}`.

### State inject vào webview (`window.__BG_STATE__`)
```ts
interface BackgroundRegionState {
  enabled: boolean; imageUri: string|null; imagePath: string|null;
  opacity: number; blur: number;
  size: 'cover'|'contain'|'repeat'|'stretch'; position: string;
}
interface BackgroundState {
  enabled: boolean; patchChecksums: boolean;
  editor: BackgroundRegionState; sidebar: BackgroundRegionState; panel: BackgroundRegionState;
  dirty: boolean; platformNote?: string;
}
```
- **Nguồn chân lý = settings** (giống cursor-chibi); `__BG_STATE__` chỉ là bản mirror để render.
- `workspace.onDidChangeConfiguration` lọc theo `animeCompanion.background` → `_broadcast()`.
- **Dirty:** lưu `appliedSignature` (hash các key lúc bấm Apply) trong `globalState` (không
  phải settings); `dirty = signature(config hiện tại) !== appliedSignature`.

---

## Config schema — HỢP ĐỒNG CHUNG (`animeCompanion.background.*`)

Khai báo trong `package.json > contributes.configuration.properties`, ghi bằng
`ConfigurationTarget.Global` (giống `cursorChase.*`). Patcher PHẢI đọc đúng các key này.

**Global:**
- `background.enabled` (boolean, default `false`)
- `background.patchChecksums` (boolean, default `false`)

**Mỗi vùng `R ∈ {editor, sidebar, panel}` (×3):**
- `background.R.enabled` (boolean, default `true`)
- `background.R.image` (string fsPath, default `""`)
- `background.R.opacity` (number 0–100, default `15`) — patcher chia 100 khi sinh CSS
- `background.R.blur` (number 0–40 px, default `0`)
- `background.R.size` (enum `cover|contain|repeat|stretch`, default `cover`) — patcher map
  `stretch`→`100% 100%`, `repeat`→`background-repeat:repeat`
- `background.R.position` (string, default `center`)

> **Ảnh nhúng bằng data-URI base64** (lựa chọn ưu tiên: ít phụ thuộc origin/đường dẫn nhất).
> `image-encoder.ts` giới hạn dung lượng (cảnh báo ~1MB, từ chối >~2MB) vì data-URI nằm trong file
> JS VSCode parse **mỗi lần khởi động**.
> **Cần xác nhận lúc code:** workbench có CSP meta riêng — việc `url(data:...)` trong `<style>`
> inject có qua `img-src`/`style-src` hay không **đổi theo phiên bản VSCode**. Thêm câu hỏi này vào
> danh sách "xác nhận với VSCode thực" (cùng selector vùng + cơ chế checksum). Dự phòng: nếu data-URI
> bị chặn, fallback sang `vscode-file://`/`file://` đã encode.
> *Phase 2 (chưa làm v1):* `useFront`, ảnh ngẫu nhiên (`random`, `images[]`), ảnh mặc định bundle.

---

## i18n (vi / en / ja — cả 3 file `media/messages/`)

- `webview.menu.background` — VI "Hình nền", EN "Background", JA "背景".
- Khối `webview.panels.background.*` (panel HTML/JS đọc qua `getWebviewStrings()` →
  inject `window.__BG_STRINGS__`): `title, subtitle, regionEditor/Sidebar/Panel, regionEnable,
  pick, clear, noImage, opacity, blur, sizing, position, sizeCover/Contain/Repeat/Stretch,
  previewTitle, previewApprox, masterEnable, apply, applyHint, disableRestore, disableConfirm,
  patchChecksums, patchChecksumsWarning, lifecycleTitle/Reload/Update/Admin, dirtyBanner`.
- Title panel (`createWebviewPanel`) cũng lấy từ message bank để tab OS được dịch.
- **Lưu ý:** file JA có mojibake ở phần runtime templates — chuỗi JA mới phải viết UTF-8 đúng,
  không copy kiểu hỏng.

---

## Lệnh + điểm vào (discoverability)

- Command chính: `animeCompanion.openBackgroundSettings` ("Background Image: Open Control Panel",
  category "Anime Companion") → `BackgroundPanel.reveal(context)`. Đăng ký trong
  [extension.ts](../src/extension.ts) cạnh block `agentProfile.showPanel`.
- Wrapper tùy chọn: `animeCompanion.background.apply`, `...remove` (dùng chung code path).
- **Phát hiện:** (1) Command palette (tự động); (2) **Nút "Hình nền" trong menu companion view**
  — post `runCommand {action:'animeCompanion.openBackgroundSettings'}` qua đường có sẵn
  ([companion-message-dispatcher.ts:84/525](../src/companion-message-dispatcher.ts#L84)), **không cần
  case dispatcher mới**, chỉ thêm 1 entry HTML trong menu; (3) status-bar `🖼️` (tùy chọn phase 2).

---

## Files tạo / sửa

**Tạo:**
- `src/background/background-patch-manager.ts`, `workbench-locator.ts`, `patch-generator.ts`
  (+ `.editor/.sidebar/.panel/.checksums`), `image-encoder.ts`, `types.ts`
- `src/background/uninstall.ts` — script Node thuần cho hook `vscode:uninstall` (không dùng
  `vscode` API; regex gỡ block marker khỏi file workbench)
- `src/background/background-panel.ts`
- `media/webview/background-panel.css`, `media/webview/background-panel.js`

**Sửa:**
- [src/extension.ts](../src/extension.ts) — khởi tạo `BackgroundPatchManager`, gọi `applyIfNeeded()`
  deferred trong activate, đăng ký command + panel, listener config-change → restore-on-disable.
- [package.json](../package.json) — thêm `contributes.commands`, `contributes.configuration` (2 key
  global + 18 key vùng), category "Anime Companion"; thêm `scripts."vscode:uninstall": "node ./out/background/uninstall"`.
- [media/messages/en.json](../media/messages/en.json) / [vi.json](../media/messages/vi.json) /
  [ja.json](../media/messages/ja.json) — thêm khối i18n ở trên.
- [src/companion-view.ts](../src/companion-view.ts) — thêm entry "Hình nền" vào menu (post runCommand).

**`files` whitelist (package.json:49-70):** `media/webview/**` (dòng 61) đã phủ css/js mới.
**CHỈ cần thêm `"media/background/**"` NẾU** bundle ảnh mặc định (phase 2). Quy tắc memory
[VSIX packaging whitelist] vẫn áp dụng.

**Không cần đụng:** `companion-message-dispatcher.ts`, `companion-transport.ts` (panel tự xử lý
message; chỉ mượn đường runCommand sẵn có để mở panel).

---

## Thứ tự build đề xuất
1. `package.json`: config keys + commands (hợp đồng chung — mở khóa cho cả 2 nửa).
2. `background-panel.ts` skeleton (reveal/singleton/CSP/state/broadcast) + css/js rỗng → mở được panel.
3. i18n 3 ngôn ngữ + inject `__BG_STRINGS__`.
4. `background-panel.js`: render card + control + live preview + dirty banner.
5. Flow pick/clear ảnh → copy globalStorage → thumbnail.
6. Lõi patcher: `workbench-locator` → `patch-generator` (3 vùng) → `apply/restore` + atomic write.
7. Wiring activate: `applyIfNeeded()` deferred + re-apply theo `isPatched()` + restore-on-disable.
8. Apply/Disable (reload) + dirty `appliedSignature`.
9. Discoverability: nút menu companion (+ status bar tùy chọn).
10. Opt-in checksum patch (cuối, sau khi xác nhận cơ chế với VSCode thực).

---

## Rủi ro & edge cases
- **Selector vùng + cơ chế checksum đổi theo phiên bản VSCode** → xác nhận lại lúc code; CSS
  viết phòng thủ (pseudo-element, `pointer-events:none`).
- **Multi-window:** 1 file dùng chung; reload chỉ tác động cửa sổ hiện tại, cửa sổ khác cập nhật
  khi reload lần sau. Không ép reload tất cả.
- **VSCode đang chạy khi vá:** workbench JS đọc lúc load cửa sổ → sửa trên đĩa giữa phiên an toàn,
  hiệu lực khi reload.
- **Ảnh lớn:** phình file JS + chậm khởi động → giới hạn dung lượng trong `image-encoder`.
- **Antivirus khóa file (Windows):** EBUSY/EPERM → xử lý như nhánh quyền ghi.
- **Cài chồng với extension Background:** marker tên riêng + regex non-greedy → không ăn nhầm block nhau.
- **EXDEV khi rename:** tránh bằng tmp cùng thư mục.
- **Gỡ extension mà chưa Disable:** để lại patch → tài liệu hóa cách cứu.
- **An toàn activate:** mọi thao tác file đều deferred + try/catch; thao tác chậm/lỗi ở Program
  Files không bao giờ làm chậm/hỏng activate.

---

## Verification (kiểm thử end-to-end)
1. **Build:** `npm run compile` (tsc) không lỗi; `npm run package` ra `.vsix` (kiểm tra css/js mới
   có trong vsix qua `files` whitelist).
2. **Mở panel:** Command palette → "Background Image: Open Control Panel" → panel hiện 3 card +
   footer; đổi ngôn ngữ (`animeCompanion.messageLanguage`) → chuỗi panel đổi theo.
3. **Chọn ảnh + tinh chỉnh:** pick ảnh cho Editor → thumbnail + live preview cập nhật theo slider
   opacity/blur/size/position; dirty banner xuất hiện.
4. **Apply:** bấm Apply → nhắc reload → reload → kiểm tra ảnh nền hiện **sau Editor/Sidebar/Panel**
   trong workbench thật. Tắt 1 vùng → Apply → vùng đó không còn nền.
5. **Lifecycle update:** giả lập VSCode ghi đè file (xóa thủ công block marker) → reload/restart →
   `applyIfNeeded()` thấy mất marker → tự vá lại.
6. **Disable & Restore:** bấm Disable → reload → workbench sạch (không còn marker trong file).
   Kiểm tra file `workbench.desktop.main.js` không còn đoạn `anime-companion-background-*`.
6b. **Uninstall hook:** áp nền (còn marker) → gỡ extension qua UI VSCode → kiểm tra
   `out/background/uninstall.js` chạy và file workbench đã sạch marker (đường dọn tự động chính).
7. **Quyền ghi:** test trên bản cài Program Files (không admin) → nhận thông báo hành động được,
   activate không crash.
8. **Corrupt warning:** xác nhận cảnh báo xuất hiện ở chế độ mặc định; bật `patchChecksums` →
   cảnh báo tắt sau reload.
9. **Cài chồng:** cài kèm extension Background → vá cả 2 → gỡ từng cái → block của cái kia còn nguyên.
