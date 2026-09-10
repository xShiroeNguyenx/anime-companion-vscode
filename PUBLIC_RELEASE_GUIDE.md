# Public Release Guide

> Bản hiện tại đang chuẩn bị publish: **v0.6.0** (release notes ngay bên dưới). v0.5.5 → v0.5.9 đã publish (0.5.9 ngày 2026-09-10). Các phần cũ giữ làm reference cho flow chung.

---

## 📦 v0.6.0 Release (2026-09-10)

### Scope

- Extension version public: `0.6.0` (minor bump: tính năng mới đáng kể, không có breaking change)
- **🚶 Em đi lang thang qua khung code**: [src/wander.ts](src/wander.ts) — sau `wander.idleMinutes` (mặc định **3 phút**) không gõ phím, model mờ dần khỏi panel (`setModelVisible` → webview đổi `opacity` của `#characterWrapper`, **không ẩn view**: ẩn view sẽ huỷ webview và phải load lại model khi quay về) rồi hiện ra ở **góc trái dưới** khung code trong `wander.staySeconds` (10 s), xong tự về. Gõ phím / di chuyển con trỏ / đổi file → `noteActivity()` gọi về ngay. **Cuộn không tính là hoạt động**: `onDidChangeTextEditorVisibleRanges` tính lại neo nên em đứng yên ở góc trong khi chữ chạy phía sau.
- **Cách vẽ**: VS Code không cho float nội dung sống lên editor, chỉ có `TextEditorDecoration` + `contentIconPath` (đúng kỹ thuật Chibi Cursor đang dùng) → ảnh tĩnh. Nên webview chụp **4 khung** cách nhau 260 ms từ Live2D đang chạy (`handleCaptureWanderFrames` trong [media/webview/main.js](media/webview/main.js)), lưu PNG ở globalStorage `wander-frames/`, đổi khung mỗi 420 ms → nhìn như đang thở. Chụp **một lần cho mỗi model** rồi dùng lại.
- **Ba lỗi hiển thị đã fix sau vòng test đầu** (đáng ghi lại vì dễ tái phạm):
  1. *Ảnh cũ không được chụp lại* — bản đầu coi mọi file đã có là hợp lệ, nên khi tăng `sizePx` vẫn dùng ảnh 96 px cũ. Giờ `_pngHeight()` đọc chiều cao trong header PNG, nhỏ hơn kích thước hiển thị thì chụp lại; đổi `wander.sizePx` cũng xoá cache.
  2. *Khung vuông bó nhân vật* — đặt `width = height = size` cộng `background-size: contain` thì ảnh dọc (49×96) bị fit theo **chiều rộng**, đặt 190 px thực tế chỉ cao ~95 px. Giờ `_frameAspect()` đọc tỉ lệ thật từ PNG và tính `width = height × ratio`.
  3. *Chưa sát mép trái* — cột 0 nằm **sau** máng số dòng. Thêm `LEFT_INSET_PX = 62` kéo sang trái vượt máng, `background-position: bottom left` và `BASELINE_DROP_PX` để chân chạm đúng dòng neo.
- **Kích thước**: mặc định **300 px** (trần 480), ảnh chụp ở 560 px để hiển thị 300 px vẫn nét trên màn HiDPI. Dung lượng ~0.5–1 MB cho 4 khung, nhỏ hơn một ảnh nền người dùng thường lưu.
- **Timer đều `unref()`**: bộ đếm 3 phút giữ tiến trình Node sống làm `npm test` treo tới 5 phút; sau khi unref thì test xong trong ~6 s.
- 4 setting mới nhóm **Model & Diện mạo**: `wander.enabled` / `wander.idleMinutes` / `wander.staySeconds` / `wander.sizePx`. Không thêm chuỗi i18n (không có chữ hiển thị).

### Pre-publish checklist v0.6.0

- [x] `package.json` ở `0.6.0`
- [x] `CHANGELOG.md` có entry `## [0.6.0] - 2026-09-10`
- [x] 3 README — "What's new v0.6.0" + 4 hàng setting mới
- [x] Local `npm test` + `npm run package` pass (174 files)
- [ ] **Smoke test**: (1) mở panel + mở một file code, **không gõ gì 3 phút** → model mờ khỏi panel rồi hiện ở **góc trái dưới** khung code, cao ~300 px, **nét không vỡ** — (2) đứng đó ~10 s, có nhúc nhích nhẹ (đổi 4 khung) rồi tự về panel, panel hiện lại **không khựng, không load lại model** — (3) trong lúc em đang đứng: gõ một phím → về ngay; thử tiếp: di chuyển con trỏ → về ngay; đổi file → về ngay — (4) **cuộn code** trong lúc em đứng → em **vẫn ở góc trái dưới**, không trôi theo chữ, không bị gọi về — (5) lần chạy đầu tiên (chưa có ảnh) → em chụp 4 khung rồi mới đi, có thể trễ ~1 s; xem `wander-frames/` trong globalStorage có 4 file PNG cao ≥ 300 px — (6) đổi `wander.sizePx` lên 480 → lần sau em **chụp lại** và to đúng 480 px (không mờ) — (7) đổi model → ảnh chụp lại theo model mới, không dùng nhầm ảnh model cũ — (8) `wander.enabled: false` → không bao giờ đi — (9) đóng hết editor (chỉ còn Welcome) → không lỗi, em ở lại panel — (10) mở Output panel / Debug Console → em **không** hiện trong đó — (11) đóng file đang có em đứng → em về panel, không kẹt decoration — (12) Desktop Companion bật → tính năng không áp dụng, không lỗi console
- [ ] Không stage `docs/images/Screenshot_1.png`

### Publish flow

```bash
npm run package
git add -u
git add src/wander.ts
git commit -m "release: v0.6.0 — She wanders into your code"
git push origin main
git tag -a v0.6.0 -m "v0.6.0 — She wanders into your code"
git push origin v0.6.0
```

---

## 📦 v0.5.9 Release (2026-09-10)

### Scope

- Extension version public: `0.5.9`
- **🌱 Nhịp sống khi rảnh**: [media/webview/idle-life.js](media/webview/idle-life.js) — mỗi **40–90 s** (random) diễn một "beat" tự phát: `yawn` / `rubEyes` / `stretch` / `lookAround` / `tiltCurious` / `hum` / `peek` / `daydream`. Beat nào có motion khớp regex trong model (`打哈欠` → yawn, `揉眼睛` → rubEyes) thì **chạy motion của model**, không thì dùng preset biểu cảm + đẩy `focusController.focus()` cho ánh mắt; vài beat còn cộng thêm `ParamAngleZ` (nghiêng đầu) ghi ở `afterMotionUpdate` để tóc bay theo. Bốc có trọng số: **22:00–05:00** nhân hệ số đêm (yawn ×2.6, rubEyes ×2.2, hum ×0.4), mood hiện tại nhân hệ số riêng (mood `sleepy` đẩy yawn ×2.5; mood `happy` dìm yawn ×0.4, đẩy hum ×1.8); **loại trừ 2 beat gần nhất** để không lặp liên tiếp. Im khi `document.hidden`, khi `isBusy()` (side panel / radial / context menu / chat / agent / voice / message / ambient panel — dùng chung hàm `somethingOnStage` với hover) → thử lại sau 12 s. Mọi `pointerdown` lên model và mọi cử chỉ hover đều gọi `noteIdleInteraction()` → lùi beat kế tiếp **25–40 s**. Setting **`animeCompanion.idleLife.enabled`** (mặc định `true`) → `window.__IDLE_LIFE__`.
- **🫳 Kéo nhân vật ra rồi thả về** (mặc định, setting `animeCompanion.dragMode` = `character` | `panel`): ở chế độ `character`, `beginDrag()` **không** tạo `panelDragState` nữa (khung companion đứng yên), chỉ gọi `startSway()`; `mousemove` đẩy vào `updateSway()`. Nhân vật lệch theo con trỏ với hệ số `PULL_RATIO` 0.55, chặn ở `MAX_PULL_PX` 90 px, bám với `PULL_FOLLOW` 0.35 — đây là **vị trí** nên **giữ chuột đứng yên là em đứng yên đúng chỗ đó**. Thả ra: lò xo `HOME_SPRING` 0.08 / `HOME_DAMPING` 0.86 kéo về gốc, mô phỏng cho **~0.9 s là về đúng chỗ cũ**. Ghi qua `model.pivot` (chia cho `scale`, đảo dấu) chứ **không** ghi `model.x/y` vì `fitModel()` sở hữu x/y và ghi đè mỗi lần panel đổi cỡ. `initSway()` reset pivot về 0 khi đổi model. Chế độ `panel` giữ nguyên hành vi cũ (kéo cả khung + nhớ vị trí qua `setCompanionPosition`).
- **🌬️ Quán tính khi kéo model**: [media/webview/sway.js](media/webview/sway.js) — kéo model trong panel thì nghiêng người **ngược hướng kéo** theo *vận tốc* (không phải quãng đường): `ParamBodyAngleX/Z/Y` (tối đa 15° / 9° / 9°) + `ParamAngleX/Z` (22° / 11°) cộng bằng `addParameterValueById` (cộng chứ không gán, để không đè nhịp thở của idle motion). Ghi ở sự kiện **`afterMotionUpdate`** — đúng khe sau motion và **trước `physics.evaluate`** trong pipeline `motion → expression → focus → physics → draw`; ghi muộn hơn (ticker thường hay `beforeModelUpdate`) thì thân nghiêng mà **tóc đứng yên**, đúng thứ tính năng này sinh ra để tránh. **Kéo rồi giữ**: chuột đứng yên > `HOLD_LATCH_MS` 110 ms thì chuyển từ *vận tốc* sang *độ lệch so với điểm bắt đầu kéo* (`DIST_FOR_FULL_LEAN` 300 px = nghiêng hết cỡ) — em **giữ nguyên tư thế nghiêng** tới khi thả, kéo xa nghiêng nhiều, kéo ngắn 60 px chỉ ~3°. Không chốt theo vận tốc cuối vì tay ai cũng chậm dần trước khi dừng, chốt kiểu đó thì kéo mạnh xong lại về gần thẳng. Thả ra: lò xo giảm chấn (`SPRING 0.06`, `DAMPING 0.92`, recoil 0.06) đi xuyên qua vị trí thẳng và vọt quá — mô phỏng số cho **3 nhịp lắc, tần số ~2.14 Hz (chu kỳ 0.47 s), đỉnh vượt ~10.5° thân / 15.4° đầu, tắt hẳn sau ~0.77 s**. Lò xo cố ý **mềm**: bản trước `SPRING 0.16` cho cùng biên độ nhưng lắc ~3.75 Hz — nhìn ra rung chứ không ra người, nên hạ tần số và cắt recoil theo để biên độ không bị đội lên. `FOLLOW_SPEED` 0.18 (bản trước 0.3): bám con trỏ mềm hơn, giảm ~40 % độ gằn khi tay rung mà độ trễ vẫn < 0.1 s. `SPEED_FOR_FULL_LEAN` 15 px/frame. Chỉ chạy ở **panel mode**: Desktop Companion để OS kéo cửa sổ nên webview không nhận `mousemove`. Setting **`animeCompanion.dragMomentum.enabled`** (mặc định `true`) → `window.__DRAG_MOMENTUM__`.
- Cả hai setting inject ở panel ([src/companion-view.ts](src/companion-view.ts)) lẫn Desktop ([src/desktop-pet-bridge.ts](src/desktop-pet-bridge.ts) + [desktop-pet/web/index.html](desktop-pet/web/index.html)), nằm nhóm **Model & Diện mạo** trong trang Cài đặt. Không thêm chuỗi i18n nào (không có chữ hiển thị).

### Pre-publish checklist v0.5.9

- [x] `package.json` ở `0.5.9`
- [x] `CHANGELOG.md` có entry `## [0.5.9] - 2026-09-10`
- [x] 3 README — "What's new v0.5.9" + 2 hàng setting mới
- [x] Local `npm test` + `npm run package` pass (173 files)
- [ ] **Smoke test**: (1) mở panel, **không đụng gì ~1 phút** → thấy beat tự phát (ngáp / vươn vai / ngó quanh…), mắt có di chuyển; đợi tiếp vài lượt → **không lặp lại cùng một beat hai lần liên tiếp** — (2) `a_001`: beat ngáp phải chạy **motion `打哈欠` của model** (xem Debug log dòng `Idle life: yawn (motion 打哈欠)`), không phải chỉ đổi biểu cảm — (3) Hiyori (không có motion ngáp) → vẫn ngáp bằng biểu cảm `sleepy` + mắt nhìn xuống, không lỗi — (4) đổi giờ máy sang 23:00 rồi reload → ngáp/dụi mắt xuất hiện dày hơn rõ rệt — (5) mở side panel / chat / menu chuột phải rồi chờ → **không beat nào chạy**; đóng lại → beat quay lại sau ~12 s — (6) click vào model → beat kế tiếp bị lùi (không hiện ngay sau đó) — (7) `idleLife.enabled: false` → reload → không beat nào — (8) chuyển tab khác ~2 phút rồi quay lại → không có chuỗi beat dồn ứ chạy một loạt
- [ ] **Smoke test (quán tính)**: (9) kéo model qua trái/phải **nhanh** → người nghiêng ngược hướng kéo, **tóc và váy bay trễ lại**; kéo chậm → nghiêng ít — (10) đang kéo mà **giữ chuột đứng yên** → em **đứng yên đúng chỗ đang giữ** (không trôi về, không tự thẳng lại), vẫn thở và tóc vẫn đung đưa; thả chuột → **bật về đúng vị trí ban đầu** trong ~1 s kèm vài nhịp lắc — (10b) khung companion **không** xê dịch trong suốt quá trình; kéo rất xa → em bị chặn lại, không văng ra khỏi panel — (10c) đặt `dragMode: "panel"` → reload → kéo lại di chuyển cả khung và ở lại chỗ mới như bản cũ — (11) **thả ra sau khi kéo nhanh** → lắc **thong thả ~3 nhịp** (mỗi nhịp ~nửa giây) rồi đứng yên sau ~0.8 s; phải thấy **mượt**, không rung nhanh, không giật, không lệch vĩnh viễn — (12) trong lúc kéo, nhịp thở / idle motion **vẫn chạy** (không bị đơ) — (13) Alt+kéo (xoay đầu) vẫn hoạt động như cũ, không xung đột — (14) đổi model giữa chừng → không kẹt tư thế nghiêng — (15) `dragMomentum.enabled: false` → kéo không nghiêng — (16) Desktop Companion: kéo cửa sổ vẫn bình thường (tính năng này không áp dụng), không lỗi console — (17) rê chuột lên thân/đầu → nhãn hiện **lời em nói** ("Anh giữ chỗ này xíu đi, em thay đồ cho anh xem nha~"), không còn nhãn kiểu "Thân · giữ để thay đồ"; chữ xuống tối đa 3 dòng, không tràn, vẫn nằm ngoài model — (18) đổi messageLanguage sang English / 日本語 → nhãn đổi theo, cùng giọng thân mật
- [ ] Không stage `docs/images/Screenshot_1.png`

### Publish flow

```bash
npm run package
git add -u
git add media/webview/idle-life.js media/webview/sway.js
git commit -m "release: v0.5.9 — Idle life beats, pull-and-release drag, warmer hover captions"
git push origin main
git tag -a v0.5.9 -m "v0.5.9 — Idle life beats, pull-and-release drag, warmer hover captions"
git push origin v0.5.9
```

---

## 📦 v0.5.8 Release (2026-09-10)

### Scope

- Extension version public: `0.5.8`
- **👉 Gợi ý nhấn giữ (coach mark)**: [media/webview/hints.js](media/webview/hints.js) — sau ~60 s không tương tác (và không có panel/menu/chat mở), hiện pill nhỏ cạnh model + mũi tên nét đứt + vòng nhấp nháy đúng điểm cần giữ: thân (55 % chiều cao model, pill bên trái) → "Giữ nhẹ chỗ này để em thay đồ nha~"; đầu (18 %, pill bên phải) → "Giữ nhẹ chỗ này để em đổi biểu cảm & động tác nha~". Mũi tên dày, phát sáng, nét đứt chạy về phía điểm giữ và cả mũi tên nhích theo hướng đó; điểm giữ có vầng sáng thở, 2 vòng sóng lan lệch nhịp và chấm trắng nhấp nháy; pill cũng nhịp sáng viền. Mỗi lần hiện **40 s** (chạm model là tắt sớm), ẩn xong **~60 s** thì hiện gợi ý kế (luân phiên thân/đầu), không giới hạn số lần; đã nhấn giữ đúng vùng (hoặc bấm pill) → loại đó **nghỉ tới hết phiên** (chỉ nhớ trong bộ nhớ, reload là tính lại; bản đầu lưu bền bằng `vscode.setState` nên sau vài lượt test là im hẳn — đã bỏ, và code tự xoá key `hintsSeen` cũ). Bỏ qua loại không có gì để chỉ (không outfit / không biểu cảm & motion). Mọi pointerdown lên model ẩn pill và dời lần sau; mở side panel / menu chuột phải ẩn pill. Pill bấm được → mở thẳng panel tương ứng. **Vị trí pill** tính từ **mép** hộp bao model (`bounds.x` / `bounds.x+width`) cộng khoảng hở 12 px, không tính từ tâm như bản đầu (tâm nằm giữa người nên pill đè lên tay); chỉ lật sang phía đối diện khi phía đó thật sự đủ chỗ nằm ngoài model, còn không thì ghim sát mép panel (4 px) — panel hẹp ~286 px thì chỉ còn chồng ~30 px rìa tóc thay vì nằm giữa mặt. `max-width` pill giảm 132 → 110 px, chữ xuống dòng thêm.
- Setting **`animeCompanion.hints.enabled`** (mặc định `true`), inject `window.__HINTS_ENABLED__` ở panel + Desktop; nằm nhóm Model & Diện mạo trong trang Cài đặt. i18n `hints.holdBody/holdHead` (vi / en / ja).
- **🖐️ Phản ứng khi rê chuột theo bộ phận**: [media/webview/hover.js](media/webview/hover.js) — `noteHoverMove({x,y})` gọi từ listener `mousemove` mới trong `setupModel()` (toạ độ quy về wrapper; renderer resize 1:1 theo wrapper nên trùng hệ toạ độ `getBounds()`). Vùng: HitArea tên head/face thì ưu tiên, còn lại chia **hộp bao hình vẽ thật** của nhân vật (`modelSilhouette()`: hợp toạ độ đỉnh của mọi drawable đang hiện — `coreModel.getDrawableVertexPositions`, bỏ opacity ≤ 0.01 và drawable ẩn — rồi qua `internalModel.localTransform` → `model.worldTransform`, đúng cặp ma trận thư viện dùng cho `hitTest`; cache 120 ms; không đo được thì về `getBounds()`) theo dải chiều cao — đầu < 0.30, ngực < 0.46, thân < 0.72, váy tới đáy; hai mép trái/phải (24 % bề ngang) trong dải 0.30–0.72 là tay. Bản đầu dùng `getBounds()` = cả canvas Live2D có lề trong suốt rộng, nên cột tay nằm lửng ngoài không khí cách tay áo cả gang — đã đổi sang hộp bao hình vẽ nên cột tay ôm sát tóc/tay áo. Dừng chuột **450 ms** trên cùng một vùng mới kích; mỗi vùng cooldown **9 s** (chỉ áp cho phản ứng, nhãn/viền vẫn hiện). Phản ứng: đầu → `shy`; ngực/váy → `angry` + `focusController.focus` liếc đi rồi về; thân → `happy`; tay → `happy` + phát motion group khớp `/hand|arm|wave|tap|touch|手|腕/` nếu model có. Bỏ qua khi đang kéo / Alt-xoay / kéo panel / `pendingDrag`, khi chuột ra ngoài wrapper, và khi `isBusy()` (side panel, radial, context menu, chat, agent/voice/message/ambient panel). `pointerdown` trên model gọi `clearHover()` nên nhấn giữ không chồng lên hover. Nhãn `.companion-hover-label` (pill 8.5 px, đo ẩn rồi đặt trên con trỏ, tự lật xuống khi chạm mép) và viền `.companion-hover-outline` (nét đứt hồng, thở nhẹ) — viền **chỉ hiện trong 120 s đầu** kể từ khi model load. **Con trỏ riêng từng vùng**, cùng "gia đình" với con trỏ trái tim: giữ nguyên đầu mũi tên hồng góc trên trái (hotspot 4 4) và đuôi góc dưới phải, chỉ đổi icon giữa — đầu = **lược**, thân = **váy**, ngực = **tim gạch chéo**, váy = **nơ gạch chéo**, tay = **bàn tay mở**; SVG 32 px (viewBox 48) inline thành `--cursor-head/body/chest/skirt/arm` trong `:root` của companion.css, mỗi biến kèm keyword dự phòng (`pointer` / `not-allowed` / `grab`). hover.js gắn class `.hover-cursor-<vùng>` lên wrapper + canvas (`!important` để thắng cursor inline PIXI ghi lên canvas); `initHover` xoá class khi đổi model. Vẽ và xem thử bằng `node scripts/gen-cursors.js` → `out/cursor-preview/preview.html` (đã kiểm bằng Edge headless ở cỡ thật 32 px trên nền tối/sáng/hồng); đuôi mũi tên vẽ **trước** icon để icon che lên đuôi như trái tim gốc, gạch chéo biển cấm đi từ trên-phải xuống dưới-trái để không trùng hướng đuôi. Setting **`animeCompanion.hoverReactions.enabled`** (mặc định `true`) → `window.__HOVER_REACTIONS__` ở panel + Desktop, nhóm Model & Diện mạo. i18n `hover.head/chest/body/skirt/arm` (vi / en / ja) ([media/companion.css](media/companion.css), [media/webview/interaction.js](media/webview/interaction.js)).
- **🤭 Ba cử chỉ trên model** (cùng file [media/webview/hover.js](media/webview/hover.js), mục "Gestures"; đọc chung luồng `mousemove` với dwell, im khi `isBusy()`): **Cù lét** — đếm số lần đổi hướng ngang (≥ 5 lần, mỗi lần cách nhau < 420 ms, bước > 5 px) ở vùng `body`/`chest` → biểu cảm `happy` + bubble `bubbles.tickle` + `poke.mp3` + sparkle, gửi `tickle` → host mở thành tựu bí mật **Ticklish**; cooldown 12 s; rê thẳng một mạch không kích. **Vuốt tóc** — ở vùng `head`, mỗi lần đi được ≥ 26 px với tốc độ ≤ 2.2 px/ms và các nhát cách nhau < 1.4 s tính là một cái vuốt → gửi `hairPet` mỗi nhát (host `recordInteraction('hairPet')` + `tryUnlockByMetric('hair_pet')`), nhưng bubble `bubbles.hairPet` + biểu cảm `love` + sparkle chỉ tối đa 4 s/lần. Chuỗi thành tựu mới **Head Pat Chain**: `hair_pet_25` / `hair_pet_100` / `hair_pet_500`; stats thêm `hairPetCount`, metric `hair_pet` (cả `MetricSnapshot` + `EMPTY_SNAPSHOT`) — `DEFAULT_STATS` tự merge nên profile cũ không cần migration. **Nắm tay** — sau khi dwell xong ở vùng `arm` (lúc đó mới "mời tay"), nhích ≥ 14 px là kích → biểu cảm `happy` + bubble `bubbles.handshake` + motion tay nếu model có; cooldown 15 s. Dispatcher thêm 3 lệnh `hairPet` / `tickle` / `handshake` vào `INTERACTION_COMMANDS` (reset timer nhàn rỗi) ([src/stats.ts](src/stats.ts), [src/companion-message-dispatcher.ts](src/companion-message-dispatcher.ts)). i18n `bubbles.tickle/hairPet/handshake` (vi / en / ja).
- **Nhãn hover dời ra ngoài model**: `showLabel()` đặt pill cạnh model (bên nào rộng hơn thì dùng bên đó, canh ngang tầm vùng đang trỏ; hết chỗ hai bên thì xuống dưới model, cuối cùng mới lên trên), nền đục `rgba(36,22,34,0.9)` chữ `#ffe6f1` 9 px như pill gợi ý — bản trước để pill trong suốt đè lên tóc/váy nên không đọc được ([media/companion.css](media/companion.css)).
- **🏆 Thành tựu chuyển sang side panel hai cột** (Tiến độ › Thành tựu / lệnh `animeCompanion.showAchievements`): `showAchievementsPanel()` giờ gọi `showSidePanel(renderAchievementsColumns)` — cột trái tiêu đề "Thành tựu x/y": mỗi chuỗi một lane (header chuỗi + tiến độ, card từng bậc có chip Tier / độ hiếm, tên, mô tả, trạng thái, nút ☆ Khoe), rồi mục "Thành tựu bí mật"; cột phải tiêu đề "Nhiệm vụ · Ký ức": header Nhiệm vụ (ngày/tuần) + card nhiệm vụ, rồi header Ký ức + card ký ức. Nút ☆ Khoe đi qua click delegation của side panel (`setShowcaseAchievement` → host trả `setAchievementsData` → `updateAchievementsPanelData` chỉ redraw khi renderer đang mở là thành tựu). `showSidePanel` giữ scroll từng cột khi redraw cùng renderer (áp cho cả Trang phục / Motion). Card thu nhỏ theo cột (label 8 px, mô tả 6.5 px, chip 5.5 px), tông sakura; card đã mở khoá xanh lá, card đang khoe viền hồng. Gỡ hẳn card giữa `.companion-achievements-panel` + CSS light/dark; `busy()` của hints bỏ selector cũ. i18n `panels.questsEmpty` (vi / en / ja) ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css), [media/webview/hints.js](media/webview/hints.js)).

### Pre-publish checklist v0.5.8

- [x] `package.json` ở `0.5.8`
- [x] `CHANGELOG.md` có entry `## [0.5.8] - 2026-09-10`
- [x] 3 README — "What's new v0.5.8" + hàng setting `hints.enabled`
- [x] Local `npm test` + `npm run package` pass
- [ ] **Smoke test**: (1) reload với `a_001`, không đụng gì ~60 s → pill bên trái + mũi tên chỉ vào thân, chữ đúng tiếng Việt, đứng ~40 s rồi tự tắt; chạm model → tắt ngay — (2) ~60 s sau khi pill ẩn → pill bên phải chỉ vào đầu — (3) bấm pill → mở đúng bảng (Trang phục / Biểu cảm & Motion) và loại đó không hiện lại trong phiên — (4) nhấn giữ thân để mở Trang phục → gợi ý thân nghỉ; reload window → gợi ý hiện lại từ đầu — (5) mở chat / side panel / menu chuột phải → không có pill; đóng lại → lịch tiếp tục — (6) Hiyori (không outfit) → chỉ có gợi ý đầu — (7) `hints.enabled: false` → không bao giờ hiện — (8) Desktop Companion: pill nằm trong cửa sổ, không tràn — (9) chuột phải › Tiến độ › Thành tựu → hai cột hai bên, model vẫn thấy trọn; cột trái "Thành tựu x/y" có lane theo chuỗi + mục Bí mật, cột phải "Nhiệm vụ · Ký ức"; cuộn cột trái, × vẫn đứng đáy cột phải; Esc / × đóng, click ra ngoài **không** đóng — (10) bấm ☆ Khoe một thành tựu đã mở khoá → nút đổi "★ Đang khoe", card viền hồng, banner khoe trên header đổi theo, **cột không nhảy về đầu**; bấm lại → thôi khoe — (11) mở Thành tựu rồi hoàn thành một nhiệm vụ (vd. gõ đủ ký tự) → card đổi trạng thái tại chỗ, không cần mở lại — (12) profile mới (chưa có thành tựu) → mỗi mục hiện dòng "Chưa có…" thay vì trống — (13) rê chuột **ngang qua** model không dừng → không có gì xảy ra; dừng ~0.5 s trên đầu → nhãn "Đầu · giữ để xem biểu cảm & động tác" + viền quanh vùng đầu + mặt ngại; dừng tiếp lần nữa trong 9 s → chỉ có nhãn/viền, không đổi biểu cảm — (14) dừng ở ngực / váy → mặt giận, mắt liếc đi rồi về, con trỏ thành 🚫; dừng ở thân → nhãn "Thân · giữ để thay đồ"; dừng ở mép tay (model có motion tay như `a_001`) → con trỏ grab + chạy motion tay — (15) con trỏ trái tim vẫn giữ ở đầu/thân, chỉ đổi ở ngực/váy/tay; đổi model → con trỏ không kẹt lại kiểu cũ — (16) mở side panel / chat / menu chuột phải rồi rê lên model → không phản ứng, không nhãn — (17) Alt-kéo xoay và kéo di chuyển model → không nhãn, không viền chen vào; nhấn giữ mở panel → hover tắt ngay — (18) để model mở > 2 phút rồi rê → vẫn có nhãn và phản ứng nhưng **không còn viền** — (19) `hoverReactions.enabled: false` → reload → không nhãn, không viền, không đổi con trỏ, không phản ứng — (20) Desktop Companion: lặp lại (13) và (14), nhãn nằm trong cửa sổ không tràn — (21) nhãn luôn nằm **ngoài** model, đọc rõ chữ trên mọi bộ đồ; thu hẹp panel tới mức hai bên hết chỗ → nhãn xuống dưới model, vẫn không đè lên nhân vật — (22) rê chuột qua lại nhanh ở eo → cười + bubble "nhột quá" + mở thành tựu bí mật **Ticklish** (lần đầu); rê thẳng một mạch qua model → không kích — (23) vuốt chậm nhiều lần trên đầu → bubble "vuốt tóc" hiện nhưng không spam (tối đa ~4 s/lần); mở Thành tựu → chuỗi **Head Pat Chain** tăng dần, đủ 25 lần thì mở **Gentle Hands** — (24) dừng ở tay ~0.5 s rồi nhích chuột → bubble "nắm tay" + motion tay (`a_001`); model không có motion tay (Hiyori) → vẫn có bubble và biểu cảm, không lỗi — (25) mở side panel rồi lặp lại (22)–(24) → không cử chỉ nào kích — (26) để yên ~60 s cho gợi ý hiện → pill nằm ngoài model (panel hẹp thì sát mép panel, chỉ chạm rìa tóc), **không đè lên mặt/thân**; kéo rộng panel → pill tách hẳn khỏi model; gợi ý thân vẫn bên trái, gợi ý đầu vẫn bên phải; mũi tên vẫn nối đúng từ mép pill tới chấm sáng — (27) vùng tay ôm sát mép tóc/tay áo của `a_001` (không còn lửng ngoài không khí); rê vào khoảng trống hai bên nhân vật → không nhãn, không đổi con trỏ; kéo panel rộng/hẹp → vùng theo kịp — (28) rê chuột lần lượt lên tóc / ngực / thân / váy / tay → con trỏ đổi ngay thành lược / tim gạch / váy / nơ gạch / bàn tay, cùng đầu mũi tên hồng như con trỏ trái tim; rê ra ngoài model → về trái tim (hoặc mũi tên thường ngoài canvas); đổi model → không kẹt con trỏ cũ; Desktop Companion giống hệt
- [ ] Không stage `docs/images/Screenshot_1.png`

### Publish flow

```bash
npm run package
git add -u
git add media/webview/hints.js media/webview/hover.js scripts/gen-cursors.js
git commit -m "release: v0.5.8 — Idle hints, hover reactions and touch gestures, achievements as side columns"
git push origin main
git tag -a v0.5.8 -m "v0.5.8 — Idle hints, hover reactions and touch gestures, achievements as side columns"
git push origin v0.5.8
```

---

## 📦 v0.5.7 Release (2026-09-09)

### Scope

- Extension version public: `0.5.7`
- Tinh chỉnh side panel hai cột:
  - **Đổi Model** dùng chung side panel (Diện mạo › Đổi Model): danh sách chia đều 2 cột, model hiện tại sáng, chọn là đổi ngay như cũ. Card Model cũ (`.companion-model-panel`) và CSS đi kèm gỡ hẳn ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)).
  - Mỗi cột = **header / body cuộn / footer**; chỉ body cuộn nên nút **×** ở footer cột phải luôn nằm đáy, không bị cuộn mất; cột trái có ô đệm cùng cao để hai cột đều nhau.
  - Tiêu đề chiếm trọn bề ngang, xuống dòng khi hẹp, không còn "Mot…".
  - **Phản hồi khi bấm motion**: hàng sáng lên (`.active`) + nhấp nháy 2 nhịp (`.is-playing`), giữ sáng là "motion vừa chạy" tới khi bấm hàng khác; kèm bubble `bubbles.motionPlayed` ("Diễn … nè~ 🎬"). Model giữ nguyên kích cỡ, không thu nhỏ.
  - **Bubble kiểm kê sau khi đổi model**: `announceModelInventory()` (interaction.js, gọi từ main.js sau `loadOutfits`) báo số bộ đồ · biểu cảm · motion, nhớ theo model bằng `vscode.setState` nên reload cùng model không lặp. **Giữ 9 s**: `showBubble(text, { holdMs })` mới trong ui.js; bubble thường tới trong lúc giữ (lời chào 4 s sau render) được xếp hàng hiện sau thay vì đè lên. Bỏ bubble "Switched to model …" của extension (dispatcher). i18n `bubbles.modelInventory` (vi / en / ja).
  - **Header = tên model**: `_applyShowcaseToNativeTitle()` đặt `view.title = model.name` khi không có showcase, gọi lại trong `_renderWith` → "🌸 Anime Companion: Hiyori" ([src/companion-view.ts](src/companion-view.ts)).
- **🎡 Menu chuột phải hình tròn** (mặc định): [media/webview/radial-menu.js](media/webview/radial-menu.js) — 9 icon (Run, 7 danh mục, Cài đặt) bung thành vòng quanh con trỏ (bán kính 92 px, tự thu nhỏ/dời tâm vào trong khi gần mép); rê icon → tên hiện ở tâm; bấm danh mục → vòng đổi thành mục con, tâm thành "↩ <danh mục>"; chuột phải lần 2 / click ngoài / Esc / chọn mục → đóng. Chỉ là vỏ: cùng `data-action` và `handleMenuAction` với menu dọc; Mute/Unmute và ✅ Dõi chuột đọc trạng thái lúc mở. Setting **`animeCompanion.menuStyle`** = `radial` | `list` (giữ menu dọc), inject qua `window.__MENU_STYLE__` ở cả panel và Desktop. i18n `menu.radialTitle/radialBack` (vi / en / ja).
- **⚙️ Trang Cài đặt riêng**: [src/settings-panel.ts](src/settings-panel.ts) đọc schema `contributes.configuration` từ package.json (không khai báo lại), gom 8 nhóm theo prefix key (Model & Diện mạo, Giọng & Âm thanh, Lời nhắn & Phản ứng, Pomodoro, Chibi Cursor, Chat AI, Desktop, Khác); nhóm Ảnh nền chỉ có nút mở bảng Ảnh nền. Webview [settings-panel.js](media/webview/settings-panel.js) dựng form theo kiểu: boolean → switch, enum ≤4 → segmented, enum >4 → select, number có min/max → slider + ô số, string → text, array/object → JSON editor có kiểm tra + nút Lưu; mỗi mục có key, giá trị mặc định, chip "Đã đổi", nút ↺; ghi chú khi workspace ghi đè. Ô tìm lọc theo key/tên/mô tả; giá trị cập nhật tại chỗ (không dựng lại DOM) nên không nhảy scroll. Ghi `update(key, value, Global)` sau khi ép kiểu theo schema; reset = `update(key, undefined)`. Lệnh `animeCompanion.openSettings` (menu › Cài đặt) giờ mở panel này; header có nút mở Settings UI gốc và settings.json. i18n `settingsPanel.*` (vi / en / ja); tên mục suy từ key và mô tả lấy từ package.json nên bằng tiếng Anh.

### Pre-publish checklist v0.5.7

- [x] `package.json` ở `0.5.7`
- [x] `CHANGELOG.md` có entry `## [0.5.7] - 2026-09-09`
- [x] 3 README — "What's new v0.5.7"
- [x] Local `npm test` + `npm run package` pass
- [ ] **Smoke test**: (1) Diện mạo › Đổi Model → hai cột, model hiện tại sáng, chọn model khác → đổi và panel đóng — (2) Motion trên `a_001`: cuộn cột phải, nút × vẫn đứng ở đáy; bấm × đóng — (3) tiêu đề "Motion", "Biểu cảm", "Trang phục", "Model" hiện đủ, không "…" — (4) hai cột cao bằng nhau ở mọi panel — (5) Desktop Companion lặp lại (1)–(2) — (6) `a_001`: mở Motion, bấm `打哈欠` → hàng sáng + nhấp nháy, bubble "Diễn 打哈欠…", motion chạy; bấm hàng khác → highlight chuyển; model giữ nguyên cỡ — (7) đổi sang Mao → bubble "… 0 bộ đồ · 8 biểu cảm · 3 motion …" hiện và **đứng đủ ~9 s**, lời chào hiện sau đó chứ không đè; reload window cùng model → không hiện lại; đổi model khác → hiện — (8) header panel đọc "🌸 Anime Companion: Mao", đổi model thì đổi theo; khi có showcase thành tựu vẫn ưu tiên showcase — (9) chuột phải → vòng 9 icon bung quanh con trỏ, rê icon thấy tên ở tâm; bấm Diện mạo → vòng đổi thành 11 mục, tâm "↩ Diện mạo", bấm tâm quay lại; chuột phải lần 2 / click ngoài / Esc đóng; chuột phải sát mép panel → vòng tự dời vào trong; Mute/Unmute và ✅ Dõi chuột đúng trạng thái — (10) set `animeCompanion.menuStyle: "list"` → đổi model/reload → menu dọc như cũ; Desktop Companion thử cả hai kiểu — (11) chuột phải › Cài đặt → trang Cài đặt mở trong tab editor, 8 nhóm bên trái, bấm nhóm cuộn tới; gõ "pomodoro" vào ô tìm → chỉ còn nhóm Pomodoro; bật/tắt một switch → VS Code settings.json đổi ngay, chip "Đã đổi" + nút ↺ hiện, bấm ↺ → về mặc định; kéo slider Ambient Volume → giá trị cập nhật, scroll không nhảy; sửa JSON `customModelRoots` sai cú pháp → báo lỗi đỏ, sửa đúng → Lưu được; đổi `messageLanguage` → nhãn nhóm/nút đổi ngôn ngữ tại chỗ; nút "Mở bảng Ảnh nền" / "Settings UI của VS Code" / "settings.json" đều mở đúng — (12) khoe một thành tựu (Achievements › ☆ Khoe) rồi mở 💬 Chat → khung chat rộng bình thường, banner khoe ẩn khi chat mở, đóng chat → banner hiện lại — (13) mở một file .md bằng 🌸 → header trình sửa Markdown cao ~30 px, hoa/tiêu đề/nút nhỏ gọn, nút Save vẫn bấm được, đổi màu theme và 🌙 vẫn hoạt động; toolbar định dạng (H / B / I / danh sách / bảng…) cũng cao ~30 px, bấm nút Heading/Link mở popup đúng vị trí
- [ ] Không stage `docs/images/Screenshot_1.png`

### Publish flow

```bash
npm run package
git add -u
git add media/webview/radial-menu.js src/settings-panel.ts media/webview/settings-panel.js media/webview/settings-panel.css
git commit -m "release: v0.5.7 — Settings panel, radial right-click menu, side-column refinements, model inventory bubble"
git push origin main
git tag -a v0.5.7 -m "v0.5.7 — Settings panel, radial right-click menu, side-column refinements, model inventory bubble"
git push origin v0.5.7
```

---

## 📦 v0.5.6 Release (2026-09-09)

### Scope

- Extension version public: `0.5.6`
- Headline user-facing: **↔️ Trang phục / Biểu cảm / Motion hiện hai cột hai bên nhân vật, không che model nữa**
  - 4 popup cũ (Trang phục, Biểu cảm, Motion, bảng nhấn giữ) gộp thành **một component side panel** trong [media/webview/interaction.js](media/webview/interaction.js): hai cột mảnh (`clamp(84px, 30%, 150px)`) ở mép trái/phải, chừa 44 px đáy cho dòng trạng thái + nút chat. Danh sách đơn (mở từ menu Diện mạo hoặc giữ ở thân) chia đều nửa trước trái / nửa sau phải; giữ ở **đầu** → cột trái Biểu cảm, cột phải Motion.
  - **Không tự đóng khi chọn**: chọn xong chỉ vẽ lại highlight; đóng bằng nút **×** ở cột phải hoặc **Esc**. Bỏ hẳn cơ chế click-ngoài-đóng cho các panel này (các panel khác giữ nguyên).
  - CSS panel cũ (`.companion-outfit-panel`, `.companion-expression-panel`, `.companion-hold-panel`, `.companion-motion-panel`) gỡ; thêm `.companion-side-*`. i18n: `panels.sideClose` (vi / en / ja).

### Marketplace / Release notes pitch

- Đổi đồ, đổi mặt, chạy motion mà vẫn nhìn thấy model: danh sách nằm gọn hai bên, không còn che nhân vật.
- Chọn thử bao nhiêu lần tuỳ ý, bảng không tự tắt; xong thì bấm × hoặc Esc.

### Pre-publish checklist v0.5.6

- [x] `package.json` ở `0.5.6`
- [x] `CHANGELOG.md` có entry `## [0.5.6] - 2026-09-09`
- [x] `README.md` (EN) + `docs/README.vi.md` + `docs/README.ja.md` — "What's new v0.5.6" + bullet nhấn giữ trong 💫 Interactions
- [x] i18n `panels.sideClose` ở en / vi / ja
- [x] Local `npm test` + `npm run package` pass
- [ ] **Smoke test** trên VS Code thật với `a_001`: (1) chuột phải › Diện mạo › Trang phục → hai cột hai bên, model ở giữa vẫn thấy rõ; 4 hàng chia 2/2; bấm Đồ ngủ → đổi đồ, cột **vẫn mở**, hàng Đồ ngủ sáng; bấm Mặc định → về thường phục; bấm × → đóng — (2) giữ ở đầu ~1,6 s → cột trái Biểu cảm (thông báo "không có exp3 nhưng có 11 động tác"), cột phải 11 motion; bấm `打哈欠` chạy, cột vẫn mở; Esc → đóng — (3) click ra ngoài cột **không** đóng — (4) mở Diện mạo › Model (panel giữa) khi cột đang mở → cột tự ẩn — (5) panel VS Code hẹp (~330 px) và Desktop Companion: cột không che nút chat / dòng trạng thái — (6) Mao: Biểu cảm 8 mục chia 4/5 (kể cả Mặc định), chọn đổi mặt, cột vẫn mở
- [ ] Không stage `docs/images/Screenshot_1.png`

### Publish flow

```bash
npm run package
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension .\anime-companion-vscode-0.5.6.vsix --force
git add -u
git commit -m "release: v0.5.6 — Outfit / Expression / Motion as side columns beside the character"
git push origin main
git tag -a v0.5.6 -m "v0.5.6 — Outfit / Expression / Motion as side columns beside the character"
git push origin v0.5.6
```

> ⚠️ Nếu Marketplace lại `Request timeout`, re-run failed jobs; publish tay thì đừng re-run nữa (xem ghi chú v0.5.5).

---

## 📦 v0.5.5 Release (2026-09-09)

### Scope

- Extension version public: `0.5.5`
- Headline user-facing: **👗 Trang phục & 😊 Biểu cảm tự load từ file của model**
  - **Tự đọc `.exp3.json`:** ngay sau khi model load, [media/webview/model-expressions.js](media/webview/model-expressions.js) fetch toàn bộ file biểu cảm khai báo trong `model3.json` (không await, không chặn model hiện ra) và **phân loại theo tham số file điều khiển**: >50% là `ParamEye*/Brow*/Mouth*/Cheek*…` → **biểu cảm khuôn mặt**; còn lại (công tắc quần áo do tác giả tự đặt tên như `ParamC1`, `ParamSkirtTr`) → **trang phục**. Live2D không phân biệt 2 loại này, nên đây là thứ giữ cho "bộ pyjama" không lọt vào danh sách biểu cảm.
  - **Popup 👗 Trang phục** (chuột phải › Diện mạo › Trang phục): liệt kê các bộ mặc được + hàng **Mặc định** (về đúng `.moc3` quy định). Mặc là giữ nguyên cho tới khi đổi — đổi biểu cảm/mood không làm model "cởi đồ" ([media/webview/outfit.js](media/webview/outfit.js)).
  - **Trang phục từ tham số** khi model không có exp3 outfit: đọc `cdi3.json`, lấy tham số có id `ParamC<n>` hoặc tên gợi quần áo (bỏ công tắc chỉnh/tư thế như `裙子切换`, `毛衣挤压`), mỗi tham số = 1 bộ (Overwrite = max, các bộ cùng "họ" = min). Bộ đang mặc mặc định không liệt kê (hàng **Mặc định** chính là nó). Tên dịch qua glossary `outfits.*` (睡衣 → Đồ ngủ, 毛衣 → Đồ len, 内衣 → Nội y…), tên gốc ở tooltip. **Mặc định** ghi lại giá trị gốc của moc cho các tham số đã Overwrite (trước đây chỉ ngừng ghi → bộ cũ vẫn dính).
  - **Popup 😊 Biểu cảm** (Diện mạo › Biểu cảm): hiện trực tiếp một khuôn mặt tác giả đã vẽ, bỏ qua hệ thống mood; **Mặc định** trả quyền lại cho mood. Model không có file / toàn file là trang phục → hiện 1 dòng giải thích thay vì panel trống.
  - **2 slot áp mỗi frame**: outfit và face nằm 2 slot riêng, ghi từ PIXI ticker *sau* preset mood, tôn trọng blend mode (`Add`/`Multiply` cho mặt, `Overwrite` cho quần áo). Cố ý **không** dùng `ExpressionManager` của Cubism để tránh flicker với mood blending hiện có.
  - **Setting mới `animeCompanion.expressionMap`:** map mood (`neutral, happy, shy, angry, surprised, sleepy, love, focus`) → tên biểu cảm của model; map phẳng dùng chung hoặc theo id model (`{ "mao": { "happy": "exp_02" } }`, mục riêng thay thế map chung). Chỉ nhận mục là khuôn mặt; mood không map giữ preset. Đi qua cả init payload của Desktop Companion ([src/desktop-pet-bridge.ts](src/desktop-pet-bridge.ts), [desktop-pet/web/index.html](desktop-pet/web/index.html)) để 2 host mode giống nhau.
  - **Dev harness:** `npx electron scripts/outfit-harness.js <model dir> <model3 file>` chạy webview thật trong Electron, báo phân loại / slot / blend / mood map / menu; output vào `.harness/` (đã gitignore).
  - i18n: `menu.outfit/expression`, `bubbles.changeOutfit/outfit*/changeExpression/expression*`, `panels.outfit*/expression*` (vi / en / ja).
- Headline thứ ba: **☝️ Nhấn giữ model: thân → Trang phục, đầu → Biểu cảm & Motion**
  - Giữ qua mốc xoa đầu 0,8 s, tới **≈ 1,6 s** popup mở theo chỗ nhấn: **thân** → Trang phục; **đầu** → bảng gộp **Biểu cảm & Motion** (2 danh sách y như popup Diện mạo). Vùng đầu/thân lấy từ HitAreas của model nếu có (`Head`/`Body` ở model mẫu), không có thì 35 % trên của khung model = đầu. Xoa đầu / chọc / kéo không đổi; kéo hoặc Alt-xoay hủy popup chờ; nhả tay trong cooldown xoa đầu cũng hủy.
  - Cú nhả tay kết thúc nhấn giữ **không** tác động lên popup: nhả được bắt ở cấp `window` (không chỉ qua PIXI — nhả lên DOM popup PIXI báo `pointerupoutside`), và trong 300 ms sau đó các panel bỏ qua click (không tự đóng, không chọn nhầm hàng dưới ngón tay); sau đó bấm chọn bình thường.
  - i18n: `panels.holdTitle` (vi / en / ja).
- Headline thứ hai: **🎬 Motion đọc từ model, không còn 3 tên cứng**
  - Trước đây webview chỉ gọi `Idle` / `TapBody` / `TapHead`; model có group tên khác (vd `a_001`: `待机`, `摸头`, `打哈欠`…) → mọi lệnh no-op, **idle không bao giờ chạy**, model đứng chết ở tư thế gốc của moc (tay duỗi). [media/webview/motions.js](media/webview/motions.js) đọc `motionManager.definitions`, nhận diện idle theo tên (`Idle`, `idle`, `standby`, `loop`, `default`, `待机`, `待機`, `常态`, `アイドル`…) và gán `motionManager.groups.idle` → idle của model tự lặp lại.
  - Phản ứng map sang group thật: `TapHead` → group tên kiểu head/hair/pat (`摸头`…); `TapBody` → group body/touch/poke, không có thì random trong phần còn lại. Group có tên gợi nội dung gắn "độ thiện cảm" (skirt/chest/裙/胸/诱惑/好感) hoặc gợi đổi đồ (衣/服/outfit/dress — vd `拖拽毛衣` đổi sang áo len và dính luôn vì idle không ghi lại tham số đồ) **không bao giờ** bị tự kích — chỉ chạy từ popup Motion. Group model thật sự có dưới đúng tên yêu cầu luôn được dùng nguyên, nên model mẫu giữ hành vi cũ với các group nó có; khác biệt duy nhất: xoa đầu trên model **không có** `TapHead` (Hiyori chỉ có `Idle` + `TapBody`) giờ chạy `TapBody` thay vì không làm gì.
  - Popup Motion build lại khi mở từ group thật (đánh dấu idle); model không có motion → 1 dòng thông báo. Popup Biểu cảm khi model không có exp3 nhưng có motion → gợi ý sang Motion kèm số group.
  - i18n: `panels.motionEmpty`, `panels.motionCount`, `panels.expressionMotionsHint` (vi / en / ja).

### Marketplace / Release notes pitch

- Model của bạn có sẵn bộ đồ hay biểu cảm trong `model3.json`? Giờ companion tự đọc hết và đưa thẳng lên menu chuột phải — không cần cấu hình.
- Đổi trang phục là mặc luôn, đổi mood hay biểu cảm không bao giờ làm model "cởi đồ".
- Muốn companion vui/ngại/giận bằng đúng khuôn mặt tác giả vẽ? Một setting `expressionMap` là xong; mood chưa map vẫn chạy preset cũ.
- Model có motion group tên riêng (待机, 摸头, 打哈欠…) giờ cử động thật sự: idle tự lặp, xoa đầu/chọc chạy đúng động tác, popup Motion liệt kê đủ.
- Model giữ bộ đồ dưới dạng tham số (`ParamC0..C3`) không cần file exp3: popup Trang phục tự liệt kê Đồ ngủ / Đồ len / Nội y…, Mặc định trả về đúng diện mạo gốc.
- Nhấn giữ thân model là tới thẳng tủ đồ, nhấn giữ đầu là biểu cảm & motion của riêng model — không cần chuột phải, hợp cả cảm ứng.

### Pre-publish checklist v0.5.5

- [x] `package.json` ở `0.5.5`
- [x] `CHANGELOG.md` có entry `## [0.5.5] - 2026-09-09`
- [x] `README.md` (EN) + `docs/README.vi.md` + `docs/README.ja.md` — "What's new v0.5.5" + bullet trong 🎭 Live2D Companion + mục Appearance của menu chuột phải + section "👗 Outfits & 😊 Expressions" + hàng `expressionMap` trong bảng setting
- [x] i18n `menu.outfit/expression`, `bubbles.*outfit*/*expression*`, `panels.outfit*/expression*`, `panels.motionEmpty/motionCount/expressionMotionsHint` ở en / vi / ja
- [x] `.gitignore` thêm `.harness/`
- [x] Local `npm test` (tsc + smoke test) + `npm run package` pass
- [ ] **Smoke test** trên VS Code thật: (1) model **Mao** → chuột phải › Diện mạo › Biểu cảm thấy `exp_01…exp_08`, chọn 1 mục là đổi mặt, Mặc định về mood; › Trang phục thấy dòng "file exp3 là biểu cảm…" (Mao không có outfit); › Motion vẫn đúng 3 mục Idle/TapBody/TapHead — (2) model **Hiyori** (không có exp3) → Biểu cảm/Trang phục hiện dòng giải thích, không panel trống — (3) model local có outfit `.exp3.json` → chọn bộ, rồi chọc/xoa đầu cho mood đổi → vẫn mặc bộ đó; Mặc định → về moc — (4) set `"animeCompanion.expressionMap": { "mao": { "happy": "exp_02" } }` → reload → chọc model → mặt happy dùng `exp_02`, hết thời gian về neutral; mood khác vẫn preset — (5) bật Desktop Companion → lặp lại (1) và (4) — (6) đổi `messageLanguage` en/ja → nhãn menu/popup/bubble đúng ngôn ngữ, không còn tiếng Việt fallback — (7) model **`a_001`** (group tiếng Trung): sau reload model tự chạy idle `待机` (tay về tư thế tự nhiên, tay phải đung đưa); giữ chuột lâu (xoa đầu) → `摸头`; click → 1 trong `打哈欠` / `揉眼睛` / `拖拽毛衣`, **không bao giờ** `掀裙子` / `摸胸` / `诱惑`; Diện mạo › Motion liệt kê 11 group (待机 có ghi "Default idle"), bấm `诱惑` từ popup thì chạy; Diện mạo › Biểu cảm báo "không có exp3 nhưng có 11 động tác" — (8) vẫn `a_001`: Diện mạo › Trang phục thấy 4 hàng **Mặc định / Đồ ngủ / Đồ len / Nội y** (tooltip 睡衣 / 毛衣 / 内衣); chọn Đồ ngủ → đổi đồ ngay; chọc/xoa đầu cho motion chạy → vẫn mặc đồ ngủ; Mặc định → về thường phục (常服) — (9) menu Diện mạo tiếng Việt: 3 nhãn `Chibi Cursor` / `Chỉnh Chibi` / `Dõi chuột` không còn xuống dòng — (10) **nhấn giữ** model: giữ ở **thân** 0,8 s xoa đầu như cũ → ~1,6 s popup Trang phục hiện, nhả tay popup **vẫn mở** (kể cả khi nhả lên chính popup), bấm 1 bộ → đổi đồ; giữ ở **đầu** → ~1,6 s bảng Biểu cảm & Motion, nhả tay vẫn mở, bấm 1 motion chạy được; nhả tay ở 1,0 s (sau xoa đầu, trước 1,6 s) → **không** popup nào hiện; kéo model / Alt+kéo → không popup; thử với Hiyori (HitAreas chỉ có Body → đầu suy theo 35 % trên) và `a_001` (không HitAreas); thử cả Desktop Companion
- [ ] Không stage `docs/images/Screenshot_1.png` (ảnh app khác, có hostname/IP nội bộ — không thuộc repo này)

### Publish flow

```bash
# 1. Bump version đã xong (package.json = 0.5.5)
# 2. Build VSIX final
npm run package

# 3. (Optional) Local install test — DÙNG ĐÚNG CLI VS Code (lệnh `code` máy này có thể trỏ Cursor)
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension .\anime-companion-vscode-0.5.5.vsix --force

# 4. Commit + tag + push để trigger release workflow (.github/workflows/release.yml)
git add -u
git add media/webview/model-expressions.js media/webview/outfit.js media/webview/motions.js scripts/outfit-harness.js
git commit -m "release: v0.5.5 — Outfits & expressions from model exp3 files, expressionMap, motions discovered per model"
git push origin main
git tag -a v0.5.5 -m "v0.5.5 — Outfits & expressions from model exp3 files, expressionMap, motions discovered per model"
git push origin v0.5.5

# 5. (Nếu workflow không tự publish Open VSX) publish thủ công
npm run publish:ovsx
```

> ⚠️ Tag phải khớp `package.json` version (`0.5.5`), nếu lệch workflow fail ở bước verify.

---

## 📦 v0.5.2 Release (2026-06-13)

### Scope

- Extension version public: `0.5.2`
- Headline user-facing: **🎨 Tuỳ chỉnh giao diện cho Trình sửa Markdown** (polish tiếp nối editor v0.5.1)
  - **Đổi màu giao diện (accent):** ô chọn màu trên header đổi toàn bộ tông hồng (header / nút / viền / link / thanh cuộn) sang màu bất kỳ; nút **↺** trả về hồng sakura mặc định. Nhớ qua `globalState` (`animeCompanion.markdownEditor.accentColor`). **Màu nền KHÔNG đổi** — vẫn đi theo Dark / Light.
  - **Thanh cuộn mảnh:** shell webview không scroll (`html, body { overflow: hidden }`), scroll dồn vào pane Toast dùng `scrollbar-width: thin` + `scrollbar-color` theo accent (kèm `::-webkit-scrollbar` tự ẩn ở nền hỗ trợ). Sửa luôn thanh cuộn đen ở pane live-preview trước đây. *(Lưu ý: trên Windows, OS có thể vẫn vẽ nút mũi tên ▲▼ trên thanh mảnh — đây là style scrollbar cấp OS, không bỏ được từ trong webview.)*
  - i18n: thêm `webview.markdownEditor.accentColor` / `accentReset` (vi / en / ja); đã đổi từ bộ key `bgColor` tạm thời.

### Marketplace / Release notes pitch

- Cá nhân hoá Trình sửa Markdown: đổi cả tông màu giao diện sang màu bạn thích chỉ bằng một ô chọn màu, reset về mặc định một chạm.
- Thanh cuộn giờ mảnh và tự ẩn — gọn gàng, không mũi tên, chỉ hiện khi đang cuộn.
- Màu nền vẫn theo Dark / Light như cũ.

### Pre-publish checklist v0.5.2

- [x] `package.json` ở `0.5.2`
- [x] `CHANGELOG.md` có entry `## [0.5.2] - 2026-06-13`
- [x] `README.md` (EN) + `docs/README.vi.md` + `docs/README.ja.md` — "What's new v0.5.2" + bổ sung vào section 🌸 Markdown editor
- [x] i18n `webview.markdownEditor.accentColor` / `accentReset` ở en / vi / ja
- [x] Local `npm run compile` (tsc) + `node --check` JS + `npm run package` pass
- [ ] **Smoke test** trên VS Code thật: mở `.md` → ô màu đổi accent live + nhớ qua reload → ↺ về hồng → cuộn ở cả Markdown & WYSIWYG thấy thanh mảnh hiện-rồi-ẩn, không mũi tên → toggle Dark/Light vẫn đúng
- [ ] (Không bắt buộc) Bỏ thay đổi local `.vscode/settings.json` (đổi chat provider sang gemini) khỏi commit release nếu không muốn public

### Publish flow

```bash
# 1. Bump version đã xong (package.json = 0.5.2)
# 2. Build VSIX final
npm run package

# 3. (Optional) Local install test — DÙNG ĐÚNG CLI VS Code (lệnh `code` máy này có thể trỏ Cursor)
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension .\anime-companion-vscode-0.5.2.vsix --force

# 4. Commit + tag + push để trigger release workflow (.github/workflows/release.yml)
#    (KHÔNG add .vscode/settings.json nếu không muốn public đổi chat provider)
git add package.json CHANGELOG.md README.md PUBLIC_RELEASE_GUIDE.md docs/README.vi.md docs/README.ja.md \
        media/messages/en.json media/messages/vi.json media/messages/ja.json \
        media/webview/markdown-editor.css media/webview/markdown-editor.js \
        src/markdown/markdown-editor-panel.ts
git commit -m "release: v0.5.2 — Markdown editor theme colour + slim auto-hiding scrollbar"
git push origin main
git tag -a v0.5.2 -m "v0.5.2 — Markdown editor theme colour + slim auto-hiding scrollbar"
git push origin v0.5.2

# 5. (Nếu workflow không tự publish Open VSX) publish thủ công
npm run publish:ovsx
```

> ⚠️ Tag phải khớp `package.json` version (`0.5.2`), nếu lệch workflow fail ở bước verify.

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
