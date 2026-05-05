# 📋 Roadmap Phát Triển — Anime Companion

**Phiên bản hiện tại:** v0.1.27  
**Cập nhật:** 2026-05-05

Tài liệu này theo dõi định hướng phát triển của extension. Các tính năng đã ship được liệt kê chi tiết trong [FEATURES.md](./FEATURES.md), tiến độ task ở [CHECKLIST.md](./CHECKLIST.md), và lịch sử release ở [CHANGELOG.md](./CHANGELOG.md).

---

## 1. 📍 Tình trạng hiện tại (v0.1.27)

**Đã ship và đang hoạt động ổn định:**
- 🎭 Live2D renderer qua local HTTP server bypass CSP.
- 🌸 4 model Live2D sample an toàn để ship: **Hiyori**, **Haru**, **Mao**, **Miara**.
  - Hiyori bundled trong `.vsix`.
  - Haru / Mao / Miara lazy download khi user chọn lần đầu.
- 💫 Hệ thống tương tác: single click, multi-click, long-press headpat, spam click; expression blending mượt qua PIXI ticker.
- 🔊 Audio đa ngôn ngữ (`ja` / `vi` / `en`) + lipsync qua `model.speak()` + fallback HTML5 Audio.
- 💬 Bubble text i18n độc lập với voice qua `messageLanguage` (`vi` / `en` / `ja`).
- 🪄 `customPhrases.idle/save/error` và `customKeywords` cho phép user mở rộng message/reactive text theo phong cách riêng.
- 🤖 Reactive engine: phản ứng theo diagnostics, save spam, typing speed, build success/fail, debug session, git branch switch / commit / merge conflict / many uncommitted changes; mood system 4 trạng thái (idle/happy/angry/sleepy); time-based greetings; Easter eggs cho `TODO` / `FIXME` / `console.log`.
- 🎚️ Reactive toggles per-channel: `reactive.diagnostics`, `reactive.save`, `reactive.typing`, `reactive.git` + `quietHours`.
- 🏆 Achievements panel và stats dashboard đã có command/UI riêng trong VS Code.
- 📊 Persistent stats store theo dõi saves, commits, errors fixed, coding time today / all-time.
- 🗂️ Per-workspace model preference: model đang chọn được lưu theo workspace, có command reset về global setting.
- 🎬 Motion picker: user có thể trigger nhanh `TapBody`, `TapHead`, `Idle` từ menu/context command.
- 🍅 Pomodoro Manager với work/break cycles, custom interval, status bar countdown và visual ring overlay trên character.
- 🎧 Ambient/background audio đã có:
  - preset built-in `off`, `lofi`, `rain`, `cafe`
  - setting `animeCompanion.ambientVolume`
  - setting `animeCompanion.customAmbientTracks` cho track local
- 🖱️ Custom right-click menu đã mở rộng, gồm các nhóm thao tác chính:
  - debug / git (`Run`, `Commit`, `Pull`, `Push`)
  - personalization (`Model`, `Voice`, `Messages`, `Ambient`)
  - interaction (`Poke`, `Motion`)
  - productivity (`Pomodoro`, `Achievements`, `Stats`, `Settings`)
- 📍 Status bar hiển thị model hiện tại, countdown Pomodoro và toggle nhanh companion panel.
- 🆕 Version-change toast khi user upgrade hoặc chạy lần đầu sau update.
- 🛠️ Build/package flow local đã có `package`, `package:install`, cleanup `.vsix`, smoke test script và output channel `Anime Companion`.

**CI/CD và publish hiện tại:**
- ✅ GitHub Actions CI đã có trong [`.github/workflows/ci.yml`](./.github/workflows/ci.yml):
  - chạy trên `pull_request` vào `main`
  - chạy trên `push` lên `main`
  - gồm `npm ci`, `npm run lint`, `npm run compile`, `npm test`, `vsce package`
- ✅ Release workflow đã có trong [`.github/workflows/release.yml`](./.github/workflows/release.yml):
  - trigger khi push tag dạng `vX.Y.Z`
  - verify tag khớp `package.json.version`
  - package `.vsix`
  - auto-publish lên VS Code Marketplace qua `VSCE_PAT`
  - auto-publish lên Open VSX qua `OVSX_PAT`
  - tự tạo GitHub Release
- ✅ Bản `v0.1.27` đã publish thành công theo flow tag release.

**Codebase hiện tại đã được tách module ở mức ổn:**
- [`src/extension.ts`](./src/extension.ts) giữ vai trò activate + orchestration chính.
- [`src/companion-view.ts`](./src/companion-view.ts) xử lý webview view, panel state, ambient/model UI bridge.
- Webview runtime đã tách module trong [`media/webview/`](./media/webview/): `main.js`, `core.js`, `interaction.js`, `audio.js`, `expression.js`, `ui.js`.
- `tsconfig.json` đã bật `"strict": true`.

---

## 2. 🚧 Sprint hiện tại (1 tuần)

Mục tiêu: dọn debt còn lại sau mốc publish và làm cứng chất lượng cho các bản release tiếp theo.

### 2.1 Polish & cleanup còn nợ
- [ ] Verify autoplay activation cho right-click audio ở interaction đầu tiên (Chromium policy), tránh case click mở menu mà audio chưa unlock đúng lúc.
- [ ] Dọn comment/text tiếng Việt bị lỗi encoding còn sót trong codebase và tài liệu cũ.
- [ ] Bổ sung/verify MIME `audio/mpeg` trong `ModelFileServer` cho `media/audio/*.mp3` nếu vẫn còn chỗ thiếu.
- [ ] Verify/xóa launch config cũ trong `.vscode/launch.json` nếu không còn dùng.
- [ ] Rà lại ambient UX: fallback khi track local lỗi, messaging khi URL/file không phát được, và hành vi khi user đang mute.

### 2.2 CI / test hardening
- [ ] Siết `npm run lint` để không còn `continue-on-error` trong CI khi rule set đã đủ sạch.
- [ ] Mở rộng smoke test activation + command registration để cover thêm các command mới như stats / achievements / motion / ambient.
- [ ] Cập nhật GitHub Actions đang chạy Node.js 20 sang version/action phù hợp hơn trước mốc deprecation trên GitHub-hosted runners.

---

## 3. 📝 Roadmap ngắn (2–4 tuần)

Các hướng mở rộng tiếp theo nên tận dụng nền hiện có, ưu tiên nâng giá trị sử dụng thay vì mở thêm infrastructure lớn.

### 3.1 UX customization tiếp theo
- **Custom reactive presets import/export**: cho user chia sẻ bộ phrase/keyword config của riêng mình.
- **Per-workspace message personality**: cho mỗi project có thể dùng style câu thoại khác nhau, không chỉ model khác nhau.
- **Better onboarding cho custom local models / custom ambient tracks**: thêm helper UI hoặc command để validate path và preview metadata trước khi dùng.

### 3.2 Reveal more value
- **Achievements/stats UX polish**: làm UI dễ đọc hơn, có grouping theo milestone / coding habits.
- **Stats breakdown theo ngày/tuần**: ngoài all-time, cho xem xu hướng gần đây.
- **Contextual recommendations**: companion gợi ý hành động phù hợp hơn dựa trên trạng thái hiện tại, ví dụ nhiều lỗi liên tục, Pomodoro break đến hạn, hoặc repo bẩn quá lâu.

### 3.3 Ambient follow-up
- **Richer ambient library**: thêm nhiều preset/playlist hơn ngoài `lofi`, `rain`, `cafe`.
- **Background/theme sync theo ambient preset**: đổi background hoặc visual treatment của companion theo track đang phát.
- **Pomodoro-aware ambient behavior**: auto-pause / ducking / switch preset giữa work và break nếu UX hợp lý.

---

## 4. 🎯 Roadmap trung hạn (1–3 tháng)

### 4.1 Publish & release maturity

Marketplace publish đã hoạt động, nên trọng tâm không còn là “có publish được hay không” mà là “publish ổn định và dễ bảo trì”.

- [ ] **CI/CD hardening**
  - bỏ `continue-on-error` cho lint khi repo đã sạch
  - thêm artifact/step summary rõ hơn cho package size và publish outputs
  - cập nhật action/runtime để tránh warning Node.js 20 deprecation
- [ ] **Marketplace polish tiếp**
  - README dạng marketplace: hero image, GIF demo, screenshots tốt hơn
  - icon / banner / gallery visuals chỉn chu hơn
  - tối ưu `categories`, `keywords`, copywriting để dễ discover hơn
- [ ] **Release process hygiene**
  - checklist rõ ràng cho bump version → changelog → tag → verify publish
  - cân nhắc release notes template ngắn gọn, nhất quán hơn
- [ ] **Build optimization**
  - cân nhắc chuyển từ `tsc` sang `esbuild` nếu giúp bundle nhanh hơn / nhỏ hơn mà không tăng complexity quá mức

### 4.2 Real-time TTS (chỉ làm nếu khả thi)

Voice hiện tại đã usable, nhưng vẫn có dư địa để tiến tới câu thoại động hơn.

- Auto-detect VoiceVox local lúc activate.
- Có fallback service khi user không cài local runtime.
- Phrase template system kiểu `{filename}`, `{branch}`, `{error_count}` để sinh audio runtime cho message động.
- Giữ bundled MP3 như fallback cuối cùng để extension vẫn hoạt động offline/cơ bản.

### 4.3 Custom content ecosystem nhẹ
- Trải nghiệm thêm model local và ambient local cần mượt hơn, ít cấu hình tay hơn.
- Cân nhắc command scan/rescan assets hoặc diagnostics panel mini cho custom content.
- Nếu sau này có catalog mở rộng, ưu tiên metadata đơn giản và local-first, tránh backend nặng sớm.

---

## 5. 🌌 Vision dài hạn (chưa cam kết)

Các mục này có giá trị cao nhưng scope lớn hoặc risk cao. Không đưa vào sprint gần.

- **Floating Desktop Pet**: companion chạy ngoài VS Code, dạng Tauri sidecar + IPC bridge với extension.
- **AI/LLM chat (BYOK)**: tích hợp Anthropic/OpenAI/Gemini, user dán API key, companion thành chat assistant.
- **Multi-character interaction**: 2 model trên cùng panel tương tác lẫn nhau.
- **Live2D motion editor**: UI cho user tự gán motion vào event.

---

## 6. ❌ Đã loại / Re-scope

Để tài liệu không phình ra, các mục dưới đây đã được loại khỏi roadmap hoặc scope-down rõ ràng.

- **Leaderboard so sánh giờ code giữa user**: cần backend public, vướng privacy/GDPR, ROI thấp.
- **Asset Store mua skin bằng EXP**: cần backend, moderation, payment; quá nặng so với scope hiện tại.
- **Hệ thống cấp độ RPG full**: scope-down, giữ achievements primitive + stats là đủ ở giai đoạn này.
- **Legacy voice option `ja-vi`**: đã migrate runtime sang `en`; không định revive lại flow cũ.

---

## 7. 🧹 Technical debt

Trạng thái cập nhật theo codebase và workflow hiện tại của v0.1.27.

| Khoản nợ | Mức độ | Ghi chú |
|---|---|---|
| `eslint` chưa enforce chặt trong CI | 🟡 Trung | `npm run lint` vẫn đang `continue-on-error` trong workflow CI. |
| Smoke test coverage còn mỏng | 🟡 Trung | Đã có `npm test`, nhưng coverage cho command/UI mới vẫn còn hạn chế. |
| Warning Node.js 20 trong GitHub Actions | 🟡 Trung | Release vừa chạy OK, nhưng action/runtime hiện tại đã có warning deprecation từ GitHub. |
| `reactive.ts` còn ôm nhiều concern | 🟡 Trung | Diagnostics, save, typing, build, debug, git, achievements, mood, greetings, Easter eggs vẫn nằm khá dày trong một module. |
| `companion-view.ts` tiếp tục phình | 🟡 Trung | Đã gánh thêm ambient/model/menu bridge; nên để mắt nếu tiếp tục thêm UI panel logic. |
| Comment/text tiếng Việt bị lỗi encoding còn sót | 🟢 Thấp | Dọn dần khi chạm vào các file liên quan. |
| Audio MIME / local file edge cases cần verify kỹ hơn | 🟢 Thấp | Nhất là với ambient/custom local tracks và fallback playback path. |
| Launch config cũ có thể đã lỗi thời | 🟢 Thấp | Cần xác minh rồi xóa nếu không còn giá trị. |

**Đã trả nợ đáng kể từ các mốc trước:**
- ~~Bundle size ~130 MB block marketplace publish~~ → đã chuyển sang flow 4 model sample an toàn để ship + lazy download; bản `0.1.27` đóng gói thực tế nhỏ hơn nhiều.
- ~~Chưa có CI/CD~~ → đã có `ci.yml` và `release.yml`.
- ~~Chưa có publish theo tag~~ → đã auto-publish thành công với `v0.1.27`.
- ~~Roadmap ambient còn ở mức ý tưởng~~ → ambient/background audio đã ship bản đầu, còn lại là polish và follow-up.

---

*Quy ước: ✅ done · 🚧 đang làm · 📝 lên lịch · 🌌 vision · ❌ đã loại*
