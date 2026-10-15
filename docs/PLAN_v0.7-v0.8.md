# Kế hoạch v0.7 – v0.8: Chat nâng cao & Real-time TTS

> Trạng thái: **v0.7.x đã làm xong** (gộp lại ship chung thành v0.7.0) · v0.8 chưa bắt đầu · 2026-10-15 · Xuất phát từ mục "Roadmap trung hạn" trong [roadmap.md](../roadmap.md).
> Số dòng dẫn chiếu là của commit v0.6.5, có thể lệch khi code đổi.

## Tóm tắt

| Bản | Nội dung | Cỡ | Rủi ro |
|---|---|---|---|
| **v0.7.0** | Export hội thoại (Markdown / JSON) + Tìm kiếm hội thoại | S–M | Thấp |
| **v0.7.1** | OpenRouter model discovery | S | Thấp |
| **v0.7.2** | Lưu token usage + Session usage dashboard | M | Trung bình (đổi format lưu) |
| **v0.8.0** | Real-time TTS giai đoạn 1: VoiceVox local + Web Speech | L | Cao (CSP, lip-sync, audio) |
| **v0.8.1** | TTS giai đoạn 2: ElevenLabs BYOK + cache + template mới | M | Trung bình (chi phí API của user) |
| *sau v0.8* | tsc → esbuild | M | Trung bình (test script đọc `out/*.js` lẻ) |

Thứ tự đi từ nhỏ và ít rủi ro đến lớn: các bản v0.7 chỉ đụng tới chat, nên ship độc lập được. TTS để cuối vì chạm vào CSP của webview, audio và lip-sync cùng lúc.

---

## Việc nền, làm trước hoặc làm cùng v0.7.0

1. **Chat UI chưa có i18n.** `chat.js` không đọc `window.__WEBVIEW_STRINGS__`. Mọi chuỗi đang là tiếng Anh viết cứng, cả trong HTML ở `companion-view.ts` L732-785 lẫn các prompt rename/delete trong `chat-manager.ts`.
   - Thêm mục `webview.chat` vào **cả 3 file** `media/messages/{en,vi,ja}.json`.
   - `chat.js` đọc chuỗi qua một hàm `t(key)`, fallback về tiếng Anh.
   - Phạm vi v0.7.0: **chỉ chuyển các chuỗi mới** cùng các chuỗi nằm sát chúng trong sidebar. Phần còn lại chuyển dần, đừng gom vào một PR khổng lồ.
2. **Test cho chat.** Hiện chưa có. Thêm `scripts/chat-test.js`, chạy trên `out/` giống `theme-test.js`, và nối vào `npm test`. Mọi logic mới viết thành **hàm thuần** trong module riêng để test được mà không cần mock `vscode`.
3. **Chuỗi tiếng Nhật bị mojibake** ở `src/messages.ts` L102-108 (runtime templates `ja`) và L123 (thông báo lỗi), do bị double-encode nhiều lần. Đây là bug riêng, có thể ship ngay trong v0.7.0. Đây cũng là **điều kiện bắt buộc** trước TTS tiếng Nhật.

---

## v0.7.0: Export & Tìm kiếm hội thoại

### Hiện trạng
- `ConversationStore` ([src/chat/conversation-store.ts](../src/chat/conversation-store.ts)) lưu mỗi hội thoại thành một file `globalStorage/chat-history/<id>.json` (ghi atomic qua `.tmp` rồi rename).
- `list()` chỉ trả về meta, không có message body.
- **Message user đã lưu kèm luôn phần context** (file đính kèm, selection) ghép sẵn vào `content` (`chat-manager.ts` L126, L136).

### Export
- **Lệnh mới:** `animeCompanion.chat.exportConversation` (hội thoại đang mở, xuất Markdown) và `animeCompanion.chat.exportAll` (xuất JSON).
- **Nút ⤓** trong actions span của mỗi item ở sidebar (`renderConvList`, `chat.js` L570-646), cạnh nút ✎ và 🗑.
- **Chọn nơi lưu:** dùng `vscode.window.showSaveDialog`, cùng kiểu với `requestRename`/`requestDelete`, vì `prompt`/`confirm` bị chặn trong webview.
- **Hàm thuần** (module mới `src/chat/conversation-export.ts`):
  - `toMarkdown(file, opts) → string`
  - `toJsonBundle(files) → string` (có `schemaVersion`)
- ⚠️ **Context có thể chứa bí mật.** Selection hoặc file đính kèm có thể chứa key hay `.env`.
  - Mặc định **bỏ phần context** khỏi bản export và chỉ giữ câu hỏi của user. Có tuỳ chọn "kèm context" trong QuickPick trước khi lưu.
  - Muốn tách được hai phần này, từ v0.7.0 trở đi message user phải lưu **thêm** trường `prompt` (câu gõ gốc) bên cạnh `content`.
  - Hội thoại cũ không có trường `prompt`: export nguyên `content` và ghi chú ở đầu file.
- **Format file:** chỉ **thêm trường optional**, không migration, file cũ vẫn đọc được.

### Tìm kiếm
- Ô tìm kiếm trong header sidebar (`companion-view.ts` L770-773).
- **Lọc tiêu đề** chạy ngay trong webview, vì meta đã có sẵn.
- **Tìm trong nội dung:** webview gửi `chat:search {query}`, host trả về `chat:searchResults {hits:[{id, snippet}]}`.
  - Host đọc các file, dùng lại `_metaCache` cho meta.
  - Debounce 250 ms, giới hạn 50 kết quả.
  - Hàm thuần `searchConversations(files, query) → hits` (không phân biệt hoa thường, bỏ dấu tiếng Việt khi so khớp).
- Chưa làm index: số hội thoại thực tế nhỏ, đọc file là đủ. Đo lại khi có người dùng hơn ~500 hội thoại.

### Test
`toMarkdown` (có và không có context, hội thoại cũ không có `prompt`), `searchConversations` (bỏ dấu, snippet, giới hạn số kết quả).

---

## v0.7.1: OpenRouter model discovery

### Hiện trạng
- Gợi ý model cho OpenRouter là 6 tên cứng trong `PROVIDER_INFO` (`llm-provider.ts` L158-173).
- Gemini đã có sẵn khuôn: `_fetchProviderModels` cùng cache trong bộ nhớ với TTL 5 phút (`chat-manager.ts` L558-607).
- Combo box lọc theo chuỗi con và **không giới hạn số kết quả** (`chat.js` L687). Với khoảng 300+ model của OpenRouter, danh sách sẽ quá dài.

### Làm
- Thêm nhánh `openrouter` vào `_fetchProviderModels`. Gọi `GET https://openrouter.ai/api/v1/models`, **không cần key**.
- **Cache trên đĩa:** `globalStorage/chat-models/openrouter.json`, TTL 24 giờ, giữ lại khi offline. Lần đầu, hoặc khi fetch lỗi, thì dùng 6 tên cứng hiện có.
- **Combo:**
  - Hiện tối đa 50 kết quả, kèm dòng "và N model khác, gõ thêm để lọc".
  - Item chuyển từ chuỗi sang `{id, label?, detail?}` để hiện giá và context length. Vẫn nhận chuỗi để không phá các provider khác.
- **Giá lấy từ `/models`** (`pricing.prompt` / `pricing.completion`) được lưu kèm, để v0.7.2 dùng cho phần ước tính chi phí.
- **Hàm thuần:** `parseOpenRouterModels(json)`, `filterModelOptions(options, query, limit)`.

### Sửa kèm
Đổi provider hiện vẫn giữ model của provider cũ (`setProvider` L516). Nên nhớ model **theo từng provider** trong `workspaceState`. Đây là thay đổi nhỏ và hợp để làm luôn ở bản này.

---

## v0.7.2: Lưu token usage + Usage dashboard

### Hiện trạng
- Mỗi provider trả về `usage` của từng lượt, **trừ Copilot**.
- Usage chỉ được gửi sang webview trong `chat:assistantEnd`, **không lưu lại**.
- Tổng Σ chỉ sống trong webview và bị reset mỗi lần nhận snapshot.
- Quick chat bỏ luôn phần usage (`chat-manager.ts` L327).

### Làm
- **Lưu usage vào message:** thêm `usage?: {in, out}` và `model` vào `StoredMessage` (trường optional).
- **Tổng theo ngày:** store mới `UsageStore` trong `globalState`, key `animeCompanion.chatUsage.v1`, cấu trúc `{[day]: {[provider]: {[model]: {in, out, turns}}}}`.
  - Dùng lại `todayKey()` của `stats.ts`.
  - Giữ dữ liệu 180 ngày, cũ hơn thì gộp theo tháng.
  - Quick chat cũng ghi vào đây.
- **Ước tính chi phí** (module `src/chat/pricing.ts`):
  - OpenRouter: giá thật từ cache của v0.7.1.
  - Các provider khác: bảng giá tĩnh, có ngày cập nhật, hiển thị rõ chữ **"ước tính"**.
  - Ollama và Copilot hiện "—", không đoán.
- **Dashboard:** ~~một tab trong Stats webview~~. Stats thật ra là QuickPick, nên dashboard là một panel riêng, mở bằng cách bấm vào Σ hoặc qua Stats › Chat usage.
  - Bảng theo provider/model và cột theo ngày, vẽ bằng SVG inline, không thêm thư viện.
  - Chọn khoảng thời gian: Today / 7 ngày / 30 ngày.
- Σ trong chat đổi sang đọc từ host, nên không còn mất khi reload.
- **Hàm thuần:** `aggregateUsage(days, range)`, `estimateCost(usage, priceTable)`, `pruneUsage(store, now)`.

### Rủi ro
Đây là lần đầu format lưu có thêm trường mới. Giữ đúng nguyên tắc **chỉ thêm optional field**, và test để chắc đọc được file cũ.

---

## v0.8.0: Real-time TTS giai đoạn 1 (VoiceVox + Web Speech)

### Hiện trạng (điểm quan trọng nhất)
- **Hiện không có câu bubble nào được đọc thành tiếng.** `speakText()` trong `media/webview/audio.js` L287-291 cố ý để trống. Chỉ có 5 clip cố định cho mỗi ngôn ngữ (`headpat`, `spam`, `poke`, `help`, `server`).
- **Template engine đã có sẵn:** `pickResolved` và `_applyVars` trong `messages.ts`, với `{filename}`, `{branch}`, `{error_count}`. Phía host đã gửi `speakText` / `phraseVars` sang webview.
- **Lip-sync** dùng `model.speak(url)` trong `playAudio` (`audio.js` L221-279), nên cần một **URL mà webview fetch được**.
- **CSP** (`companion-view.ts` L633-642) chặn `localhost:50021`, và `media-src` / `connect-src` không có `blob:`.

### Thiết kế
- **Tổng hợp giọng nói ở extension host, không làm trong webview.**
  - Host gọi engine, ghi file audio vào `globalStorage/tts-cache/`, rồi gửi webview một **webview URI**. Thư mục cache được thêm vào `localResourceRoots`.
  - Nhờ vậy `playAudio` và `model.speak` dùng lại nguyên vẹn, lip-sync chạy như với clip MP3. **CSP không phải nới.**
  - Desktop pet dùng route mới `/tts/<hash>.<ext>` trên model server. Model server cần thêm MIME `audio/wav` (VoiceVox trả về wav).
- **Chuỗi fallback:** chọn bằng hàm thuần `pickTtsEngine(settings, availability)`.
  1. **VoiceVox local** (chỉ khi giọng là `ja`): ping `http://127.0.0.1:50021/version` lúc activate và mỗi 5 phút khi đang tắt. Gọi `audio_query` rồi `synthesis`.
  2. **Web Speech API** trong webview: dùng lại code có sẵn ở `audio.js` L163-215. **Không có lip-sync**, cần ghi rõ trong mô tả setting.
  3. **Không đọc**: giữ hành vi hiện tại, tức chỉ phát 5 clip bundled.
- **Setting mới:**
  - `animeCompanion.tts.engine`: `off` | `auto` | `voicevox` | `system`, **mặc định `off`**. Lý do: bật âm thanh cho mọi câu bubble thay đổi trải nghiệm quá nhiều để tự bật.
  - `animeCompanion.tts.voicevoxSpeaker` (số), `animeCompanion.tts.voicevoxEndpoint` (mặc định `http://127.0.0.1:50021`).
- **Chống ồn:**
  - Chỉ đọc khi `speakText` có giá trị (host đã lọc sẵn). Tôn trọng `muted` và `quietHours`.
  - Bỏ câu mới nếu câu trước còn đang đọc, trừ achievement.
  - Mỗi câu tối đa 200 ký tự.
- **Cache:** key = `sha1(engine, speaker, text)`, giống cách `hashLine` trong `generate-voice-assets.js` tính hash. Giới hạn 50 MB, quá thì xoá file dùng lâu nhất (LRU).
- **Hàm thuần:** `pickTtsEngine`, `ttsCacheKey`, `evictLru(entries, capBytes)`, `sanitizeForSpeech(text)` (bỏ emoji và markdown, đọc đường dẫn file gọn lại).

### Kiểm thử
- Test thuần cho các hàm trên.
- **Phải chạy thật** với VoiceVox local, cả panel lẫn desktop pet, để xác nhận lip-sync. Ghi rõ trong CHANGELOG là đã hay chưa test GUI.

---

## v0.8.1: TTS giai đoạn 2 (ElevenLabs BYOK + template)

- **ElevenLabs runtime** cho `en` / `vi`, theo mô hình BYOK:
  - Key lưu trong `context.secrets`, cùng prefix `animeCompanion.apiKey.` như các provider chat.
  - Webview chỉ nhận cờ `hasElevenLabsKey`, **không bao giờ nhận key**.
  - Gọi API ở host. Cache dùng chung với v0.8.0, nên mỗi câu chỉ tốn tiền một lần.
  - **Hạn mức ký tự mỗi ngày** do user tự đặt (mặc định 5.000), hết hạn mức thì rơi về engine tiếp theo trong chuỗi fallback.
- Thêm `elevenlabs` vào `tts.engine`, cùng setting `tts.elevenlabsVoiceId`.
- **Template mới:**
  - `{commit_count_today}` cần thêm accessor trong `StatsStore` (tính từ `commits` trừ baseline của daily quest, `stats.ts` L513).
  - Sửa chỗ `gitManyChanges` đang dùng nhầm `error_count` làm số thay đổi (`reactive.ts` L372).
  - Thêm template vào cả 3 ngôn ngữ cùng lúc.
- Giữ 5 clip bundled làm fallback cuối cùng, cho trường hợp offline hoặc không có key.

---

## Sau v0.8: tsc → esbuild

Tách thành một bản riêng, không gộp với tính năng.
- **Hai entry point:** `out/extension.js` và `out/background/uninstall.js`. Entry thứ hai dùng `__dirname` để tìm sidecar, nên phải giữ nguyên layout thư mục.
- **Các script đang `require` từng file `out/*.js` lẻ:** `smoke-test.js`, `theme-test.js`, `gen-themes.js`, `verify-routes.js`. Phương án: vẫn chạy `tsc` riêng cho test, esbuild chỉ dùng để đóng gói. Hoặc chuyển các script này sang import từ `src` qua esbuild.
- Bundle `adm-zip` và `ws` vào file build, rồi bỏ hai mục `node_modules/...` khỏi `files` trong `package.json`. Nhớ kiểm lại VSIX bằng `vsce ls`.
- Sửa cả `ci.yml` và `release.yml`.
- Lợi ích thật cần đo trước: kích thước VSIX hiện là 6.84 MB, phần lớn là media; `out/` chỉ khoảng 624 KB. **Có thể không đáng làm.** Đo thời gian activate trước khi quyết.

---

## Ngoài phạm vi

- TTS cho bubble phát qua webview khi panel đang ẩn: `retainContextWhenHidden` giữ webview sống, nhưng user không nhìn thấy. Bỏ qua, không đọc.
- Đồng bộ lịch sử hội thoại hay usage lên cloud.
- Tìm kiếm có index hoặc tìm theo ngữ nghĩa.

## Đã chốt (2026-10-15)

1. Export **bỏ context**: chỉ xuất câu user gõ và câu trả lời.
2. `tts.engine` mặc định là **`off`**.
3. **Không làm bảng giá tĩnh.** Chỉ OpenRouter hiện chi phí ước tính, lấy giá thật từ `/models`; các provider khác chỉ hiện số token.
4. esbuild **để tính sau**, không lên lịch.
