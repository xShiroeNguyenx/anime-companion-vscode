# ⚡ Kế hoạch tối ưu GPU / RAM cho Live2D

**Trạng thái:** bước A–F đã code, ship ở **v0.7.1** (2026-11-09): `compile`, `lint`, `npm test` xanh.
F5 một cửa sổ đã kiểm qua log: chỉ còn một vòng vẽ (`shared=0 system=0`); `run` → `slow` khi mất focus → `paused`
đúng 60 s sau; view ẩn thì dừng, hiện lại thì vẽ 30 khung/giây; mute không nạp lại; hover và click vẫn chạy.
**Chưa kiểm:** rê chuột đánh thức cửa sổ đang `paused`, 4 cửa sổ thật, chế độ desktop pet, số đo GPU sau (mục 11).
**v0.7.2 (2026-11-09), đã code, `compile` + `lint` + `npm test` xanh, CHƯA chạy thật:** mục 9 đợt 1 (một desktop pet cho
mọi cửa sổ, Quit ở tray không chạy lại pet); nhạc nền một luồng (mục 8); panel Settings bỏ `retainContextWhenHidden`;
CSP dùng nonce cho panel nhân vật và panel Agent Accounts; `scripts/measure-gpu.ps1` và số đo "trước" ở mục 11.
**Ship kèm v0.7.1, ngoài các bước A–F:** panel không chờ tải gói giọng nữa, và nhớ gói thiếu trên release (404) trong
24 h (`src/voice-asset-retry.ts`); gộp các lần nạp lại sát nhau; lời chào chỉ ở cửa sổ đang dùng; gỡ listener
`onDidChangeActiveTextEditor` bị rò.
**Sửa kèm, ngoài kế hoạch (ghi vào CHANGELOG cùng bản này):** extension từng đăng ký lệnh
`claude-vscode.terminal.open`, trùng với lệnh của extension Claude Code (`anthropic.claude-code`, cũng kích hoạt lúc
`onStartupFinished`). Bên nào kích hoạt sau thì lỗi "command already exists". Lúc F5 là extension này lỗi, và mọi
thứ sau chỗ đó trong `activate()` (`showOnStartup`, ảnh nền) không chạy. Đã gỡ lệnh này khỏi `package.json` và
`extension.ts`.
**Cập nhật 2026-11-09:** thêm phần nhiều cửa sổ VS Code, ticker thứ ba của PIXI, việc nạp lại webview khi đổi
cài đặt chung, và `showcase-sweep` trong CSS. Thêm mục 9: một desktop pet cho mọi cửa sổ (đợt riêng).
**Nguồn:** chuyển các tối ưu đã làm và đã đo ở desktop-companion v0.12.0 (file `app/js/pet-fps.js`,
`app/media/webview/main.js`, `src-tauri/src/pet_render.rs`) sang extension, kèm vài chỗ chỉ extension mới có.

**Cách dùng thật mà kế hoạch phải tối ưu cho:** thường mở 3–4 cửa sổ VS Code cùng lúc. Mỗi cửa sổ có extension
host riêng và webview Live2D riêng (texture, WebGL context, vòng vẽ riêng), nhưng mỗi lúc chỉ một cửa sổ được
focus. Mọi chi phí dưới đây **nhân theo số cửa sổ**, nên cửa sổ không focus được xử lý ngang hàng với view bị ẩn.

---

## 1. Vấn đề

1. **Live2D vẽ theo tần số quét màn hình.** [media/webview/main.js](../media/webview/main.js) tạo
   `PIXI.Application` không có `maxFPS`. Màn 120 Hz thì nhân vật vẽ 120 khung/giây, kể cả lúc chỉ đứng thở.
2. **Có ba vòng `requestAnimationFrame`, không phải hai:**
   - `state.app.ticker` vẽ canvas;
   - `PIXI.Ticker.shared` là nơi plugin `pixi-live2d-display` cộng thời gian cho model khi `autoUpdate: true`;
   - `PIXI.Ticker.system` là nơi InteractionManager của PIXI kiểm hover, vì
     [media/webview/interaction.js](../media/webview/interaction.js) đặt `state.model.interactive = true`.
     Đã kiểm trong `media/lib/pixi.min.js` (v6.5.10): có thuộc tính `useSystemTicker`, và
     `system.add(this.tickerUpdate, …, UPDATE_PRIORITY.INTERACTION)`.

   Nếu chỉ giới hạn hoặc dừng hai vòng đầu, vòng thứ ba vẫn chạy 120 lần/giây ở mỗi cửa sổ, kể cả lúc "đã dừng vẽ".
3. **Không bao giờ dừng vẽ.** View sidebar bật `retainContextWhenHidden: true`
   ([src/extension.ts](../src/extension.ts) chỗ `registerWebviewViewProvider`), nên khi bị ẩn (chuyển sang
   Explorer, thu panel) webview vẫn sống. `onDidChangeVisibility` đã có trong
   [src/companion-transport.ts](../src/companion-transport.ts), nhưng [src/companion-view.ts](../src/companion-view.ts)
   chỉ dùng nó để dừng bộ hẹn giờ tin nhắn, **không báo webview dừng Live2D**. Webview cũng không nghe
   `visibilitychange`. Chưa kiểm VS Code / Chromium có tự hạ nhịp iframe bị ẩn hay không, nên đừng dựa vào đó
   (mục 10 có bước kiểm).
4. **Cửa sổ không focus vẽ y như cửa sổ đang dùng.** Không có chỗ nào dựa vào `window.state.focused`. Bản đầu
   của kế hoạch này chỉ dừng khi "rời máy 5 phút" (`window.state.active`). Như vậy cửa sổ nền chỉ dừng sau 5 phút
   kể từ lần cuối dùng nó, và khi chuyển qua lại giữa 3–4 cửa sổ thì gần như lúc nào cả 4 cũng vẽ: khoảng
   4 × 120 khung/giây hiện nay, và vẫn khoảng 4 × 30 nếu chỉ làm bước A.
5. **Lúc nhân vật đi dạo trong editor** ([src/wander.ts](../src/wander.ts)), panel gửi
   `setModelVisible(false)`: nhân vật mờ về `opacity: 0` nhưng Live2D vẫn vẽ cho một canvas không ai thấy.
   Tính năng này đang tắt (`WANDER_AVAILABLE = false`), nhưng vẫn làm để khi bật lại không phải nhớ.
6. **Hiệu ứng CSS lặp vô hạn luôn bật.** Không chỉ có `.status-dot` (`pulse`,
   [media/companion.css](../media/companion.css)) và `.chat-toggle-btn` (`ac-toggle-bob`,
   [media/webview/chat.css](../media/webview/chat.css)). Còn có huy hiệu showcase (`showcase-pulse`,
   `showcase-sweep`, `showcase-particles-float`), gợi ý (`hint-*`), `hover-outline-breathe`, `bubblePulse`,
   `ac-thinking`… CSS animation chạy theo nhịp màn hình, **không** theo `maxFPS` của PIXI.
   Riêng `showcase-sweep` (huy hiệu legendary / mythic) đổi `background-position`, nên trình duyệt phải **vẽ lại**
   mỗi khung. `transform` / `opacity` thì compositor tự trượt, không cần vẽ lại.
7. **Đổi một cài đặt chung là nạp lại Live2D ở mọi cửa sổ.** Listener `onDidChangeConfiguration` trong
   [src/extension.ts](../src/extension.ts) gọi `host.refreshView()` khi `muted`, `ambientPreset`, `ambientVolume`,
   `customAmbientTracks`, `customModels` hoặc `customModelRoots` đổi. `refreshView()` gán lại `webview.html`, nên
   webview nạp lại từ đầu: tải model, giải mã texture (Hiyori có 2 ảnh 2048×2048, khoảng 32 MB), đẩy lên GPU,
   biên dịch shader. Sự kiện cấu hình bắn ở **mọi** cửa sổ.
   - Bấm mute trong panel: `setMuted` trong
     [src/companion-message-dispatcher.ts](../src/companion-message-dispatcher.ts) đã gửi `setMutedState` để
     webview cập nhật tại chỗ, nhưng listener cấu hình vẫn nạp lại.
   - Lệnh `animeCompanion.toggleMute` gọi thêm `host.refreshView()` sau khi ghi cấu hình, nên cửa sổ hiện tại nạp
     lại **hai lần**.
   - `setAmbientVolume` có sẵn trong [media/webview/audio.js](../media/webview/audio.js), nhưng `main.js` chưa
     nhận lệnh nào gọi tới nó.
   - Đổi model toàn cục: cả 4 cửa sổ nạp lại cùng lúc, và cửa sổ nào cũng tự chụp chibi cho cùng một model
     (`requestAutoCapture` trong [src/cursor-chibi.ts](../src/cursor-chibi.ts), hẹn 1,5 s sau `live2dReady`).
8. **Bộ hẹn giờ tin nhắn rảnh chạy ở mọi cửa sổ.** `_startMessageTimer` trong
   [src/companion-view.ts](../src/companion-view.ts) hiện bong bóng mỗi 10–20 s (mặc định) ở mọi cửa sổ đang hiện
   view, kể cả cửa sổ không focus. Nó chỉ dừng khi view ẩn.

**Bộ nhớ GPU:** mỗi cửa sổ giữ texture riêng. Hiyori: 2 × 2048×2048 RGBA, khoảng 32 MB (chưa tính mipmap). Bốn cửa
sổ là khoảng 128 MB, và model tải về có thể còn lớn hơn.

**Số đo ở desktop-companion** (2026-11-05, laptop Intel UHD màn 120 Hz, cùng lúc VS Code đang chạy extension):
GPU 3D của app từ ~37% xuống ~25%, CPU từ ~10% xuống ~5,6%; riêng pet ở 30 khung/giây ≈ +6 điểm GPU 3D.
**Extension chưa đo**: đo trước và sau theo mục 10, ghi số vào mục 11.

## 2. Phạm vi

| # | Việc | Ưu tiên |
|---|---|---|
| A | Gộp về **một** vòng vẽ. Giới hạn FPS: 30 lúc đứng yên, 60 trong 3 s sau lần chạm chuột / phím cuối | Phải làm |
| B | Nét mặt trộn theo thời gian thật (không theo số khung) | Phải làm, đi cùng A |
| C | Ba mức vẽ do extension host quyết định: `run` (cửa sổ đang focus), `slow` (không focus, 60 s đầu), `paused` (view ẩn, không focus lâu, rời máy). Webview tự dừng thêm khi tài liệu ẩn hoặc nhân vật đang đi dạo | Phải làm |
| D | Tạm dừng CSS lặp vô hạn ngoài mức `run`; đổi `showcase-sweep` sang `transform` | Phải làm, đi cùng C |
| E | `muted` / `ambientPreset` / `ambientVolume` cập nhật tại chỗ, không nạp lại webview; cửa sổ nền hoãn nạp lại tới khi được focus | Phải làm |
| F | Dừng bộ hẹn giờ tin nhắn rảnh khi cửa sổ không focus | Nên làm, nhỏ, đi cùng C |
| G | Bỏ `retainContextWhenHidden` ở panel Settings | Để sau (mục 8) |
| H | Chế độ desktop: một pet cho mọi cửa sổ VS Code, không phải mỗi cửa sổ một pet | Phải làm, **đợt riêng, commit riêng** (mục 9) |

**Không chuyển sang, và lý do:**
- `pet_render.rs` gọi `ICoreWebView2Controller::SetIsVisible`: extension không chạm được WebView của VS Code.
  Thay bằng tin nhắn `render` từ extension host (mục 5).
- CSS trang trí widget (`widget-deco.css` + `steps()`): extension không có widget.
- "Panel tạo khi mở, huỷ khi đóng": extension đã gọi `createWebviewPanel` theo lệnh, đóng là dispose.

**Làm thành đợt riêng** (mục 9): chọn **một** cửa sổ làm chủ desktop pet. Nhạc nền cũng chỉ nên có một luồng; nó
dùng lại cơ chế chủ đó, ghi ở mục 8.

## 3. Bước A: `media/webview/pet-fps.js` (file mới)

ES module thuần, **không import gì**, để test nạp được qua `data:` URL như
[scripts/focus-pace-test.js](../scripts/focus-pace-test.js). `package.json` đã đóng gói `media/webview/**`,
không cần sửa `files`.

```js
// How often the Live2D character is drawn, and whether at all. Pure; used by
// main.js and scripts/pet-fps-test.js.
//
// PIXI draws at the display's refresh rate by default: 120 frames a second on
// many laptops, even while she only stands and breathes. 30 is smooth enough
// for that; while the user moves, clicks or drags around her, 60 for a few
// seconds keeps the response feeling direct. A VS Code window that is open but
// not focused gets 15, and the extension host stops it altogether after a while
// (src/render-gate.ts): with three or four windows open, only one is in use.

export const IDLE_FPS = 30;
export const ACTIVE_FPS = 60;
/** Window open but not focused. */
export const BACKGROUND_FPS = 15;
/** How long after the last pointer / key event the faster pace holds (ms). */
export const ACTIVE_HOLD_MS = 3000;

/** The modes the extension host sends; anything else counts as 'run'. */
export function normalizeMode(mode) {
  return mode === 'slow' || mode === 'paused' ? mode : 'run';
}

/** Whether the last pointer / key event, at `lastActiveAt` (ms), still counts. */
export function isRecentlyActive(now, lastActiveAt) {
  if (!Number.isFinite(lastActiveAt)) return false;
  const since = now - lastActiveAt;
  return since >= 0 && since < ACTIVE_HOLD_MS;
}

/**
 * Frame-rate cap. `mode` comes from the extension host: 'run' (focused window),
 * 'slow' (open but not focused), 'paused' (draw only when the user reaches for her).
 */
export function fpsAt(now, lastActiveAt, mode = 'run') {
  if (isRecentlyActive(now, lastActiveAt)) return ACTIVE_FPS;
  return normalizeMode(mode) === 'slow' ? BACKGROUND_FPS : IDLE_FPS;
}

/**
 * Blend factor for a frame lasting `deltaMS`, chosen so that the result over
 * TIME equals blending `perFrame60` every frame at 60 fps, whatever the rate.
 */
export function blendAlpha(perFrame60, deltaMS) {
  const p = Math.min(1, Math.max(0, Number(perFrame60) || 0));
  const frames = Math.min(30, Math.max(0, Number(deltaMS) || 0) / (1000 / 60));
  return 1 - Math.pow(1 - p, frames);
}

/**
 * Whether the ticker should run. `holds` > 0 forces it on (a frame capture
 * needs the idle animation to move on even while nobody can see the panel).
 * 'paused' gives way to the pointer: a window on a second screen receives
 * pointer events without being focused, so moving the mouse over her is enough.
 */
export function shouldRun({ mode, docHidden, modelHidden, holds, recentlyActive }) {
  if (holds > 0) return true;
  if (docHidden || modelHidden) return false;
  return normalizeMode(mode) !== 'paused' || recentlyActive === true;
}

/** Whether the endless CSS loops (pulse, bob, sweep…) should stand still. */
export function cssPaused({ run, mode, recentlyActive }) {
  if (!run) return true;
  return normalizeMode(mode) !== 'run' && recentlyActive !== true;
}
```

## 4. Bước A + B: sửa `main.js`, `expression.js`, `interaction.js`

### 4.1 `media/webview/main.js`: một vòng vẽ, có giới hạn

`Live2DModel.update(dt)` trong `media/lib/cubism4.min.js` chỉ cộng dồn thời gian
(`update(t){this.deltaTime+=t,this.elapsedTime+=t}`); model chỉ thật sự được tính khi vẽ. Vì vậy có thể tắt
`autoUpdate` rồi tự gọi `update` trong `app.ticker`, gộp hai vòng làm một mà không đổi hành vi. Cập nhật và vẽ
luôn cùng nhịp, và chỉ còn một `maxFPS` phải đặt.

Trong `initLive2D()`:

```js
state.app = new PIXI.Application({ /* như cũ */ });
// Hover is checked on real pointer events anyway; without this, PIXI.Ticker.system
// keeps a requestAnimationFrame loop running in every window, even when paused.
state.app.renderer.plugins.interaction.useSystemTicker = false;
syncPetTicker();

// ...

state.model = await Live2DModel.from(modelUrl, {
  autoInteract: false,
  autoUpdate: false,
});
// One loop for everything: the model only adds up time here, the work happens
// when app.ticker draws it.
const app = state.app;
const model = state.model;
app.ticker.add(() => model.update(app.ticker.deltaMS));
```

- `useSystemTicker = false`: `pointerover` / `pointerout` vẫn bắn vì chúng đi theo sự kiện DOM. Chỉ mất việc kiểm
  hover lại khi model tự di chuyển dưới con trỏ đứng yên. Kiểm lại vùng chạm và hover khi F5.
- Gọi `syncPetTicker()` **ngay sau** `new PIXI.Application(...)`. Không có lời gọi này, app mới (sau mỗi lần đổi
  model) chạy hết tốc độ cho tới lần chạm chuột kế tiếp.
- `maxFPS` (PIXI v6.5.10 có sẵn) chỉ bỏ qua khung: `requestAnimationFrame` vẫn được gọi theo nhịp màn hình, chỉ là
  không cập nhật và không vẽ. Vòng chỉ thật sự im khi `stop()`. Ticker không còn listener nào cũng tự huỷ
  `requestAnimationFrame` (`_cancelIfNeeded`), nên sau bước này `PIXI.Ticker.shared` và `PIXI.Ticker.system`
  không còn chạy (cách kiểm ở mục 10).

Đặt ở module scope, trước `initLive2D()`:

```js
import {
  ACTIVE_HOLD_MS, normalizeMode, isRecentlyActive, fpsAt, shouldRun, cssPaused,
} from './pet-fps.js';

let petLastActive = NaN;
let petWakeTimer = 0;
// mode: set by the extension host ('render' message), 'run' until it says otherwise.
const gate = { mode: 'run', modelHidden: false, holds: 0 };

// Read state.app each time: a model reload destroys and recreates it.
function syncPetTicker() {
  const now = performance.now();
  const recentlyActive = isRecentlyActive(now, petLastActive);
  const run = shouldRun({ ...gate, docHidden: document.hidden, recentlyActive });
  const t = state.app && state.app.ticker;
  if (t) {
    if (run) t.maxFPS = fpsAt(now, petLastActive, gate.mode);
    if (run && !t.started) t.start();
    else if (!run && t.started) t.stop();
  }
  // Bước D.
  document.body.classList.toggle('render-paused', cssPaused({ run, mode: gate.mode, recentlyActive }));
}

function markPetActive() {
  const wasActive = isRecentlyActive(performance.now(), petLastActive);
  petLastActive = performance.now();
  if (!wasActive) syncPetTicker();
  clearTimeout(petWakeTimer);
  // When the hold runs out: back to 30, 15, or stopped, whatever the mode says.
  petWakeTimer = setTimeout(syncPetTicker, ACTIVE_HOLD_MS + 50);
}

for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) {
  window.addEventListener(ev, markPetActive, { passive: true, capture: true });
}

document.addEventListener('visibilitychange', syncPetTicker);
```

### 4.2 Nét mặt theo thời gian thật

[media/webview/expression.js](../media/webview/expression.js) `updateExpressionTick()` cộng
`BLEND_SPEED` mỗi khung. Hạ xuống 30 khung/giây (hay 15 ở cửa sổ nền) mà không sửa thì nét mặt đổi chậm gấp 2
(hay gấp 4).

```js
import { blendAlpha } from './pet-fps.js';

// deltaMS = length of the frame just drawn: blending by real time, so the face
// changes at the same speed at 15, 30 or 120 fps.
export function updateExpressionTick(deltaMS = 1000 / 60) {
  // ...
  const k = blendAlpha(BLEND_SPEED, deltaMS);
  // trong vòng lặp: const blended = current + (target - current) * k;
}
```

[media/webview/interaction.js](../media/webview/interaction.js) (chỗ `state.app.ticker.add`):
gọi `updateExpressionTick(state.app.ticker.deltaMS)`.

### 4.3 Đã kiểm: không cần sửa

| Module | Vì sao không bị ảnh hưởng bởi FPS |
|---|---|
| `focus-pace.js` / focus controller | `update(dt)` tính theo thời gian |
| `idle-life.js` | so với `Date.now()` |
| `model-expressions.js` | Overwrite / Add / Multiply đặt giá trị, không tích luỹ theo khung |
| `sway.js` | Hằng số tính theo khung (`PULL_FOLLOW`, `HOME_SPRING`, `HOME_DAMPING`), nhưng chỉ chạy lúc kéo và lúc bật về sau khi thả. Ước tính bật về xong trong ~1,2 s ở 60 khung/giây, nằm trong 3 s giữ nhịp nhanh tính từ `pointerup`. Desktop cũng giữ nguyên. **Nếu đổi các hằng số này thì kiểm lại.** |

Sau một lần dừng lâu (mức `paused`), `idle-life.js` thấy `Date.now()` đã nhảy một đoạn dài, nên có thể chạy hành
động rảnh ngay khi vẽ lại. Có lẽ chấp nhận được, nhưng chưa đọc kỹ: nhìn lại khi F5.

## 5. Bước C + D + F: chỉ vẽ cho người đang nhìn

### 5.1 Phía extension host: `src/render-gate.ts` (file mới)

Logic quyết định là **hàm thuần**. Test nạp `out/render-gate.js` giống
[scripts/theme-test.js](../scripts/theme-test.js).

```ts
// Whether the companion view should draw, and how fast. Pure; used by
// companion-view.ts and scripts/render-gate-test.js.
//
// With three or four VS Code windows open, only one is in use at a time, but
// each draws its own Live2D character. 'slow' keeps a window just left
// breathing (alt-tabbing back and forth should not freeze and restart her);
// 'paused' stops drawing until something changes.

export type RenderMode = 'run' | 'slow' | 'paused';

/** Focused, but no activity in VS Code for this long: stop drawing. Same as desktop-companion. */
export const AWAY_MS = 5 * 60 * 1000;
/** Not focused for this long: stop drawing (slow until then). */
export const BACKGROUND_PAUSE_MS = 60 * 1000;

export interface RenderInputs {
  viewVisible: boolean;
  focused: boolean;
  /** When the window lost focus (ms); undefined while focused. */
  blurredSince?: number;
  /** When `window.state.active` turned false (ms); undefined while active, or when this VS Code has no `active`. */
  inactiveSince?: number;
  now: number;
}

export function renderMode(s: RenderInputs): RenderMode {
  if (!s.viewVisible) return 'paused';
  if (!s.focused) {
    const long = s.blurredSince !== undefined && s.now - s.blurredSince >= BACKGROUND_PAUSE_MS;
    return long ? 'paused' : 'slow';
  }
  if (s.inactiveSince !== undefined && s.now - s.inactiveSince >= AWAY_MS) return 'paused';
  return 'run';
}

/** Ms until renderMode() changes with no new event; undefined when only an event can change it. */
export function msUntilNextChange(s: RenderInputs): number | undefined {
  if (!s.viewVisible) return undefined;
  const since = s.focused ? s.inactiveSince : s.blurredSince;
  if (since === undefined) return undefined;
  const left = (s.focused ? AWAY_MS : BACKGROUND_PAUSE_MS) - (s.now - since);
  return left > 0 ? left : undefined;
}
```

Trong `companion-view.ts` (**chỉ** provider sidebar):
- Giữ `_blurredSince`, `_inactiveSince`, `_sentMode` và một hẹn giờ. Mỗi lần có sự kiện:
  1. tính `renderMode(...)`;
  2. gửi `{ command: 'render', mode }` **chỉ khi khác lần gửi trước** (giống `Applied` trong `pet_render.rs`);
  3. huỷ hẹn giờ cũ, rồi hẹn đánh giá lại sau `msUntilNextChange(...)` nếu hàm này trả về một số.
- Các sự kiện cần nghe:
  - `onVisibilityChange` của transport;
  - `vscode.window.onDidChangeWindowState`: `focused` về `false` thì ghi `_blurredSince = Date.now()`, về `true`
    thì xoá. `active` (nếu có) làm tương tự với `_inactiveSince`;
  - `live2dReady`: đặt `_sentMode = undefined` rồi đánh giá lại, vì webview mới nạp luôn bắt đầu ở `run`.
- Lúc `resolveWebviewView`, nếu cửa sổ đã không focus sẵn thì ghi `_blurredSince = Date.now()` luôn (VS Code khởi
  động mở lại 4 cửa sổ, chỉ một cái được focus). Không làm vậy thì cửa sổ đó đứng ở `slow` mãi.
- `focused` có ở mọi bản trong dải `engines.vscode: ^1.85`, nên dùng làm tín hiệu chính.
- `window.state.active` thì **không** có ở các bản cũ (`@types/vscode` của repo là 1.116 nên vẫn compile qua).
  - Kiểm `typeof vscode.window.state.active === 'boolean'`. Không có thì để `_inactiveSince` là `undefined`: chỉ
    mất phần "rời máy trong lúc cửa sổ vẫn focus".
  - `active` về `true` là vẽ lại ngay.
- **Bước F:** `_startMessageTimer` chỉ chạy khi view hiện **và** cửa sổ được focus. Trong
  `onDidChangeWindowState`, mất focus thì gọi `_stopMessageTimer()`, có lại focus (và view đang hiện) thì gọi
  `_startMessageTimer()`. Bước này còn giúp bước C: nếu không làm, `showMessage` mỗi 10–20 s sẽ đánh thức cửa sổ
  nền (mục 5.2).
- Đánh đổi đã chấp nhận:
  - Cửa sổ trên màn hình phụ: sau 60 s không focus, nhân vật đứng hình ở khung cuối (không biến mất). Rê chuột qua
    là cô ấy cử động lại trong 3 s, không cần focus cửa sổ đó.
  - Rời VS Code sang app khác (trình duyệt…) thì mọi cửa sổ VS Code đều không focus: nhân vật dừng sau 60 s, chứ
    không phải 5 phút như bản đầu. `AWAY_MS` giờ chỉ còn cho trường hợp VS Code vẫn focus mà người dùng không
    thao tác.
- **Chế độ desktop pet** (`window.__DESKTOP_PET_MODE__`, sidecar `desktop-pet/` nạp cùng `main.js`):
  [src/desktop-pet-bridge.ts](../src/desktop-pet-bridge.ts) **không** gửi `render`, nên `gate.mode` ở đó luôn là
  `run`. Giới hạn FPS (bước A) vẫn có tác dụng. Dừng vẽ khi sidecar ẩn nằm ngoài phạm vi: Tauri ẩn cửa sổ thì
  `document.hidden` vẫn là `false` (desktop-companion đã gặp, xem `pet_render.rs`).

### 5.2 Phía webview (`main.js`)

Thêm vào `switch` trong `window.addEventListener('message', ...)`:

```js
case 'render':
  // Extension host (src/render-gate.ts): 'run' | 'slow' | 'paused'.
  gate.mode = normalizeMode(event.data.mode);
  syncPetTicker();
  break;
```

**Rê chuột đánh thức mức `paused`:** `shouldRun` cho chạy khi `recentlyActive`, và `markPetActive` hẹn gọi
`syncPetTicker` lúc hết 3 s. Cửa sổ không focus vẫn nhận `pointermove`, nên ở màn hình phụ chỉ cần rê chuột qua.

**Lệnh có hình cũng đánh thức.** Cửa sổ nền vẫn nhận sự kiện (git, achievement, Pomodoro). Gọi `markPetActive()`
ở đầu các case `showMessage`, `playMotion`, `tapBody`, `achievementUnlocked`, `pomodoroStart`, `pomodoroBreak`,
`pomodoroStop`, để motion và hiệu ứng chạy hết thay vì đứng ở khung đầu (xem bẫy ở 5.3).
**Không** đánh thức ở `pomodoroTick`: lệnh này đến mỗi giây, sẽ giữ cửa sổ nền vẽ suốt.

Trong `setModelVisible(visible, fadeMs)` (nhân vật đi dạo):
- `visible === false`: **sau** `fadeMs` (để hiệu ứng mờ và thu nhỏ chạy xong) đặt
  `gate.modelHidden = true; syncPetTicker()`.
- `visible === true`: đặt `gate.modelHidden = false; syncPetTicker()` **trước** khi bắt đầu hiện lại.
- Huỷ hẹn giờ cũ nếu `setModelVisible` được gọi lại giữa chừng.

**Bẫy: chụp khung.** `handleCaptureWanderFrames` chụp 4 tư thế cách nhau `gapMs` để có nhịp thở. Nhưng
`state.app.render()` chỉ vẽ lại trạng thái hiện tại; thời gian của model chỉ tăng khi `app.ticker` chạy (sau bước A,
`model.update` nằm trong `app.ticker`). Nếu ticker đang dừng thì cả 4 khung giống hệt nhau và nhân vật trong editor
đứng im. Bọc cả hai đường chụp (`handleCaptureWanderFrames`, `handleCaptureModelChibi`) như sau:

```js
gate.holds++; syncPetTicker();
try { /* chụp như cũ */ } finally { gate.holds--; syncPetTicker(); }
```

Đã làm thành hàm `withTickerHeld(capture)` trong `main.js`, bọc ở hai case `captureModelChibi` và
`captureWanderFrames`.

**Bẫy thêm, thấy lúc code: đổi kích thước canvas khi đang dừng.** `fitModel()` gọi `renderer.resize`, và resize thì
canvas bị xoá trắng. Nếu ticker đang dừng (cửa sổ `paused`, view ẩn) thì không có gì vẽ lại, nên nhân vật biến mất
tới lần vẽ sau. Đã thêm `drawIfStopped()` ở cuối `fitModel()` trong
[media/webview/interaction.js](../media/webview/interaction.js): ticker đang dừng thì vẽ đúng một khung.

### 5.3 Bước D: CSS

Cuối [media/companion.css](../media/companion.css):

```css
/* main.js syncPetTicker(): outside 'run', or with nothing drawn, nothing should
   keep the page producing frames either. */
body.render-paused *,
body.render-paused *::before,
body.render-paused *::after {
  animation-play-state: paused !important;
}
```

Ở mức `run`, `pulse`, `ac-toggle-bob` và phần lớn các animation khác chỉ đổi `transform` / `opacity`: compositor
tự trượt, không vẽ lại, nên để nguyên. Ngoại lệ là `showcase-sweep`, xem bên dưới.

**Bẫy: animation chạy một lần cũng bị dừng.** Quy tắc trên dừng **mọi** animation, không chỉ loại lặp vô hạn. Ví
dụ: `.companion-container` (`fadeIn … both`), `.companion-achievement-toast.show` (`achievement-pulse`),
`.companion-context-menu.show`.
- Animation bắt đầu trong lúc dừng sẽ đứng ở khung đầu tới khi hết dừng. Nếu animation dùng `fill-mode: both` và
  khung đầu là `opacity: 0` thì phần tử vô hình. Đó là lý do lệnh có hình phải đánh thức (5.2).
- Bong bóng chữ dùng `transition` (lớp `.visible`), không bị ảnh hưởng.
- Webview mới nạp bắt đầu ở `run`, extension host chỉ gửi `mode` sau `live2dReady`, nên `fadeIn` 0,5 s của khung
  ngoài kịp chạy xong.
- JS của webview không nghe `animationend` / `transitionend` (đã grep), nên không có gì treo chờ animation kết thúc.

**`showcase-sweep`: chuyển sang `transform`.** Hiện nay gradient nằm trên chính `.companion-showcase` và chạy bằng
`background-position`. Chuyển gradient sang `::before` rộng gấp 3 (mythic: gấp 4) rồi trượt nó bằng `transform`.
Kết quả trông như cũ: `background-position` 0% → 100% với `background-size: 300%` chính là dịch ảnh sang trái 2/3
bề rộng của ảnh.

```css
.companion-showcase.rarity-legendary,
.companion-showcase.rarity-mythic {
  background: none;      /* moved to ::before */
  isolation: isolate;    /* ::before sits under the text, inside the badge */
}
.companion-showcase.rarity-legendary::before,
.companion-showcase.rarity-mythic::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  z-index: -1;
  pointer-events: none;
}
.companion-showcase.rarity-legendary::before {
  width: 300%;
  background: linear-gradient(90deg, #9c5d09, #e6a542, #ffd874, #e6a542, #9c5d09);
  animation: showcase-slide-3 4s linear infinite;
}
.companion-showcase.rarity-mythic::before {
  width: 400%;
  background: linear-gradient(90deg, #a03066, #d44896, #6845c9, #4a8fde, #d44896, #a03066);
  animation: showcase-slide-4 3s linear infinite;
}
@keyframes showcase-slide-3 { to { transform: translateX(-66.667%); } }
@keyframes showcase-slide-4 { to { transform: translateX(-75%); } }
```

- Bỏ `showcase-sweep` khỏi `animation` của hai lớp gốc (chỉ giữ `showcase-pulse`) và xoá `@keyframes showcase-sweep`.
- `.companion-showcase` đã có sẵn `position: relative` và `overflow: hidden` (đã kiểm), nên `::before` không tràn ra
  ngoài huy hiệu.
- Thêm hai `::before` mới vào khối `@media (prefers-reduced-motion: reduce)` có sẵn (hiện khối này chỉ tắt animation
  của `.companion-showcase` và `.companion-showcase-particles`).
- Nếu cách này vướng gì khi F5 thì cách tạm là `showcase-sweep … steps(24)`.

## 6. Bước E: cài đặt chung không nạp lại webview

1. Trong listener `onDidChangeConfiguration` ở [src/extension.ts](../src/extension.ts), tách ba khoá khỏi nhóm
   gọi `refreshView()`:

   | Khoá | Thay bằng |
   |---|---|
   | `animeCompanion.muted` | `host.postMessage({ command: 'setMutedState', muted })` |
   | `animeCompanion.ambientPreset` | `host.postMessage({ command: 'setAmbientPreset', preset })`, chuẩn hoá bằng `getAmbientPreset(…)` như dispatcher |
   | `animeCompanion.ambientVolume` | `host.postMessage({ command: 'setAmbientVolume', volume })`, kèm case mới trong `main.js` gọi `setAmbientVolume` của `audio.js` |

   - Vẫn gọi `statusBar.refresh()`.
   - `customAmbientTracks`, `customModels`, `customModelRoots` vẫn cần nạp lại (đổi `localResourceRoots`, danh
     sách model), nhưng đi qua đường hoãn ở bước 3.
   - `host` có thể là provider hoặc bridge. Cả hai đều có `postMessage`, và sidecar nạp cùng `main.js` nên nhận
     được cùng lệnh. Vẫn phải kiểm lại khi F5 ở chế độ desktop.
2. Bỏ `void host.refreshView()` trong lệnh `animeCompanion.toggleMute`, vì listener ở bước 1 đã lo việc này.
   Trong `setMuted` của dispatcher, giữ `.then` để hiện bong bóng; `setMutedState` bị gửi hai lần là vô hại.
3. **Hoãn nạp lại ở cửa sổ nền.**
   - Trong `refreshView()` của provider: nếu view đang ẩn hoặc `vscode.window.state.focused === false` thì chỉ đặt
     `_pendingRefresh = true`.
   - Khi view hiện lại hoặc cửa sổ có lại focus (cùng chỗ nghe sự kiện ở 5.1), nếu `_pendingRefresh` đang bật thì
     nạp lại.
   - Thao tác của người dùng trong chính cửa sổ đó (nút Retry, đổi ngôn ngữ, đổi model) xảy ra lúc cửa sổ đang
     focus, nên vẫn nạp ngay.
   - Lợi thêm: chỉ cửa sổ đang dùng nạp model mới và chụp chibi trước. Tới lượt cửa sổ khác thì `requestAutoCapture`
     thấy file đã có và bỏ qua.
   - `onModelChanged` (`wander.forgetFrames`, `themeManager.onModelChanged`, `cursorChibi.onModelChanged`) vẫn chạy
     ngay: các việc này nhẹ, và frame đi dạo của model cũ phải bỏ ngay.

## 7. Test

Thêm vào script `test` trong `package.json`, cạnh `focus-pace-test.js`.

`scripts/pet-fps-test.js` nạp `media/webview/pet-fps.js` qua `data:` URL như `focus-pace-test.js`:
- `normalizeMode`: `'run'`, `'slow'`, `'paused'` giữ nguyên; `undefined`, `''`, `'fast'`, `42` → `'run'`.
- `isRecentlyActive`:
  - chưa tương tác (`NaN`, `undefined`) → `false`;
  - ngay sau và tới `ACTIVE_HOLD_MS - 1` → `true`;
  - đúng `ACTIVE_HOLD_MS` → `false`;
  - đồng hồ lùi (`now < lastActiveAt`) → `false`.
- `fpsAt`:
  - chưa tương tác: `IDLE_FPS` ở `run`, `BACKGROUND_FPS` ở `slow`;
  - vừa tương tác: `ACTIVE_FPS` ở mọi mode;
  - mode lạ hoặc thiếu: như `run`;
  - `BACKGROUND_FPS < IDLE_FPS <= 30`.
- `blendAlpha`:
  - trộn 1 s ở 15 / 30 / 120 / 144 khung/giây cho cùng kết quả như ở 60 (sai số `< 1e-9`). Không dùng 0,5 s: ở
    15 khung/giây đó là 7,5 khung, và nửa khung lẻ làm lệch kết quả dù hàm đúng;
  - ở 60 khung/giây trả đúng hệ số cũ;
  - luôn nằm trong `[0, 1]` với `deltaMS` âm, `0`, `1e9`, `NaN` và hệ số `2`, `-1`, `NaN`.
- `shouldRun`:
  - `holds > 0` thắng mọi điều kiện;
  - `docHidden` hoặc `modelHidden` đều tắt, kể cả khi `recentlyActive`;
  - `paused` thì tắt, nhưng `paused` + `recentlyActive` thì bật;
  - `run` và `slow` bật.
- `cssPaused`:
  - không chạy → luôn `true`;
  - `run` và đang chạy → `false`;
  - `slow` / `paused` → `true`, trừ khi `recentlyActive`.

`scripts/render-gate-test.js` nạp `out/render-gate.js`:
- `renderMode`:
  - view ẩn → `paused`, kể cả khi đang focus;
  - focus và đang hoạt động → `run`;
  - focus, không hoạt động `AWAY_MS - 1` → `run`; đúng `AWAY_MS` → `paused`;
  - không focus, chưa có `blurredSince` → `slow`;
  - không focus `BACKGROUND_PAUSE_MS - 1` → `slow`; đúng `BACKGROUND_PAUSE_MS` → `paused`;
  - không focus thì bỏ qua `inactiveSince`.
- `msUntilNextChange`:
  - trả đúng thời gian còn lại ở cả hai nhánh;
  - `undefined` khi chỉ một sự kiện mới đổi được kết quả (view ẩn, đang hoạt động, đã quá ngưỡng);
  - không bao giờ trả số `<= 0`.

Cổng chất lượng trước khi commit: `npm run compile`, `npm run lint`, `npm test` đều xanh.
Ngoài ra phải chạy thật bằng Extension Development Host (F5), vì test không thấy được GPU.

## 8. Để sau, và kế hoạch riêng

- ✅ **Bỏ `retainContextWhenHidden` ở panel Settings** (v0.7.2, [src/settings-panel.ts](../src/settings-panel.ts)):
  chỉ tiết kiệm RAM khi panel đang mở nhưng tab bị che. Form vốn lưu mỗi thay đổi ngay, nên chỉ cần giữ ô tìm kiếm,
  bản nháp JSON và vị trí cuộn bằng `getState` / `setState`. `reveal(..., section)` khi tab đang ẩn không broadcast
  ngay nữa: trang chưa nạp thì tin nhắn mất, kéo theo mất luôn section cần cuộn tới; trang tự xin bằng
  `settings:ready`. Giữ nguyên ở Markdown editor (chữ chưa lưu) và sidebar (nạp lại Live2D chậm).
- ✅ **CSP** (v0.7.2): panel nhân vật và panel Agent Accounts bỏ `'unsafe-inline'` ở `script-src`, dùng nonce. Giữ
  `'unsafe-eval'` vì PIXI 6 dùng `new Function`. Vi phạm CSP được ghi ra Output qua `securitypolicyviolation`.
  - **Chưa làm: trang desktop pet** ([desktop-pet/web/index.html](../desktop-pet/web/index.html)) chưa có CSP nào. Cần
    hash cho script bootstrap inline, `connect-src` cho `ws://127.0.0.1:*` **và IPC của Tauri** (`ipc:` /
    `http://ipc.localhost`). Chặn nhầm IPC thì pet không kéo được, mất click-through. Chỉ làm khi thử được trong Tauri.
- **Nhịp đứng yên 20–24, tuỳ chọn tắt `antialias` (MSAA, viền tóc răng cưa):** chờ số đo bên
  desktop-companion; nếu làm thì làm cùng lúc cả hai repo để hai bên giữ cùng một bộ hằng số.
- **Giải phóng hẳn PIXI + texture khi `paused` lâu:** đáng làm hơn khi mở nhiều cửa sổ (xem phần bộ nhớ GPU ở
  mục 1).
  - Để người dùng không thấy khác gì: chụp canvas thành `<img>` (như `snapshotCanvas` đang dùng khi chụp khung
    đi dạo) rồi mới huỷ app.
  - Khi về `run`, nạp lại model phía sau ảnh tĩnh, xong thì đổi sang canvas.
  - Chỉ làm nếu số đo bộ nhớ GPU ở mục 11 cho thấy đáng.
- ✅ **Nhạc nền chỉ một luồng** (v0.7.2, [src/ambient-owner.ts](../src/ambient-owner.ts)): `ambientPreset` là cài đặt
  Global và mỗi webview tự phát nhạc của nó, nên 4 cửa sổ có thể phát 4 luồng chồng lên nhau. Làm đơn giản hơn file
  chủ của 9.3, vì ở đây không cần nhịp tim:
  - `<globalStorage>/ambient-owner.json` = `{ ownerId, at }`. Cửa sổ **nhận** khi được focus **và** trang của nó đã
    được bấm ít nhất một lần từ lúc nạp (`audio.js` gửi `ambientUnlocked`). Trang chưa bấm thì không được tự phát âm
    thanh, nên nhận về nó chỉ làm im cả hai nơi.
  - Chỉ cửa sổ đang phát đọc file (2 s một lần); thấy tên cửa sổ khác thì `setAmbientActive(false)`: tạm dừng, không
    tua về đầu. Các cửa sổ khác không đọc gì.
  - Đóng cửa sổ đang phát thì xoá file nếu còn tên mình. Nhạc ở im tới khi một cửa sổ đã bấm được focus.
  - Desktop pet không nhận `setAmbientActive` nên luôn phát; mục 9 đã bảo đảm chỉ có một pet.

## 9. Đợt riêng: một desktop pet cho mọi cửa sổ VS Code

Làm sau các bước A–F, **commit riêng**: phần này đụng vào vòng đời của bridge, không liên quan tới vòng vẽ.

### 9.1 Hiện trạng

Rút ra từ đọc code, **chưa chạy thật** với nhiều cửa sổ.

- `desktopCompanion.enabled` là cài đặt Global, đọc một lần lúc `activate()`. Cửa sổ nào thấy bật cũng tạo một
  `DesktopPetBridge` rồi gọi `bridge.start()` ([src/extension.ts](../src/extension.ts), nhánh `if (desktopPetEnabled)`).
- Mỗi bridge tự chạy một `anime-companion-pet.exe`, với cổng và token riêng (`_spawnSidecar` trong
  [src/desktop-pet-bridge.ts](../src/desktop-pet-bridge.ts)). Không có khoá nào giữa các cửa sổ, và
  [desktop-pet/src/main.rs](../desktop-pet/src/main.rs) không có single-instance.
- Mọi bản sidecar đọc chung `desktop-pet-window-position.json` (trong `app_config_dir`), nên mở ra ở **cùng một chỗ**.

Hệ quả khi mở 4 cửa sổ:
- 4 pet, 4 WebView2, 4 Live2D, 4 bộ texture, chồng khít lên nhau. Trông như một con; kéo con trên cùng ra mới thấy
  con bên dưới.
- Mỗi con chỉ nghe cửa sổ sinh ra nó (lỗi, lưu file, commit, Pomodoro). Bong bóng của 4 cửa sổ hiện ở cùng một chỗ.
- Bridge không gửi `render` (mục 5.1), nên cả 4 con vẽ ở mức `run` mãi. Bước A chỉ làm mỗi con rẻ đi.

**Lỗi liên quan, thấy lúc đọc:** chọn **Quit** ở tray thì sidecar gọi `app.exit(0)`. Handler `exit` trong bridge chạy
lại sidecar sau **mọi** lần thoát khi bridge chưa dispose, nên khoảng 1 s sau pet hiện lại. Quit tới lần thứ 4 trong
60 s thì bridge bỏ cuộc và báo "keeps crashing".

**Kiểm trước khi sửa, ghi kết quả vào đây:**
1. Bật chế độ desktop, mở 2 cửa sổ VS Code, đếm tiến trình `anime-companion-pet.exe` trong Task Manager.
2. Kéo pet ra chỗ khác, xem bên dưới còn con nữa không.
3. Quit ở tray, xem pet có hiện lại không.

### 9.2 Phương án

| # | Cách | Được | Mất |
|---|---|---|---|
| 1 | Một cửa sổ làm chủ (file chủ trong `globalStorageUri`); chỉ chủ chạy sidecar | Một pet. Chỉ sửa extension, không sửa Rust | Pet chỉ phản ứng với cửa sổ chủ |
| 2 | Như cách 1, thêm việc các cửa sổ khác gửi sự kiện sang chủ | Một pet, nghe mọi cửa sổ | Thêm kênh WebSocket giữa các cửa sổ; phải xử lý trùng (Pomodoro, bong bóng rảnh) |
| 3 | Chỉ thêm single-instance vào sidecar | Nhanh | Hỏng ngầm, xem dưới |

- **Loại cách 3.** Bản thứ hai mở lên là thoát ngay với mã 0. Bridge của cửa sổ đó coi là thoát bất thường, 1 s sau
  chạy lại, rồi lại thoát. Tới lần thứ 4 trong 60 s thì mọi cửa sổ (trừ cửa sổ đầu) báo "keeps crashing". Khi cửa sổ
  đầu đóng, các cửa sổ kia đã bỏ cuộc nên không ai chạy pet lại.
- **Loại "pet đi theo cửa sổ đang focus".** Trang của pet do `ModelFileServer` của chủ phục vụ, nên đổi chủ là nạp lại
  Live2D (vài giây, GPU nhảy) mỗi lần alt-tab.

Làm **đợt 1 bằng cách 1**. Đợt 2 (cách 2) chỉ làm nếu cần.

### 9.3 Đợt 1: một cửa sổ làm chủ

**File chủ** là `<globalStorageUri>/desktop-pet-owner.json`. `globalStorageUri` dùng chung giữa mọi cửa sổ của cùng
một bản VS Code. Thư mục có thể chưa tồn tại, nên tạo bằng `fs.mkdirSync(dir, { recursive: true })`.

```json
{ "ownerId": "<uuid, sinh mỗi lần activate>", "pid": 12345, "heartbeatAt": 1762650000000 }
```

**Logic quyết định là hàm thuần**, đặt trong file mới `src/pet-owner.ts`:

```ts
// Which VS Code window runs the desktop pet. Pure; used by pet-owner-lock.ts
// and scripts/pet-owner-test.js.
//
// Every window reads the same global setting, and each used to start its own
// pet: four windows, four pets stacked on one spot. One window owns the pet;
// the others follow, and one of them takes over when the owner goes away.

export const HEARTBEAT_MS = 5_000;
/** An owner that has not written for this long is gone (three missed heartbeats). */
export const STALE_MS = 15_000;
/** How often every window looks at the files: one small read. */
export const POLL_MS = 1_000;

export interface OwnerRecord { ownerId: string; pid: number; heartbeatAt: number; }
/** "Bring the pet to this window": written by a follower, honoured by the owner. */
export interface TakeoverRequest { by: string; at: number; }

export type OwnerAction = 'own' | 'release' | 'follow' | 'claim';

export function decide(s: {
  me: string;
  record?: OwnerRecord;
  /** Whether record.pid still runs; ignored when the record is mine. */
  ownerAlive: boolean;
  takeover?: TakeoverRequest;
  now: number;
}): OwnerAction {
  const t = s.takeover;
  // A request from the future (clock changed) is not fresh.
  const someoneElseAsked = !!t && t.by !== s.me && s.now - t.at >= 0 && s.now - t.at < STALE_MS;
  if (s.record?.ownerId === s.me) return someoneElseAsked ? 'release' : 'own';
  const free = !s.record || !s.ownerAlive || s.now - s.record.heartbeatAt >= STALE_MS;
  if (!free) return 'follow';
  // A free spot goes to whoever asked for it, while the request is fresh.
  return someoneElseAsked ? 'follow' : 'claim';
}

/**
 * Whether the bridge should start the sidecar again after it exited.
 * Exit code 0 with no signal is the tray's Quit: the user wants her gone.
 */
export function shouldRestart(s: {
  disposed: boolean; wasOurs: boolean; code: number | null; signal: string | null;
}): boolean {
  if (s.disposed || !s.wasOurs) return false;
  return !(s.code === 0 && !s.signal);
}
```

**Phần I/O** là file mới `src/pet-owner-lock.ts`. File này mỏng và không tự quyết định gì. Cho phép truyền hàm `fs`
vào, để test giả được lỗi.

- **Đọc file chủ:**
  - lỗi `ENOENT` nghĩa là chưa có chủ;
  - lỗi khác (`EPERM` hay `EBUSY` do antivirus giữ file) thì **giữ trạng thái cũ** và thử lại ở lượt sau. Coi lỗi
    đọc là "chưa có chủ" chính là cách sinh ra hai pet;
  - JSON hỏng thì coi như bản ghi của người khác, với `heartbeatAt` lấy bằng `mtime` của file: hết `STALE_MS` là bị
    nhận lại, không kẹt mãi.
- **`ownerAlive`:** gọi `process.kill(pid, 0)`. Không ném lỗi, hoặc ném `EPERM` (tiến trình có, nhưng không có quyền),
  thì còn sống; ném `ESRCH` thì đã chết. Hệ điều hành có thể cấp lại PID cũ cho tiến trình khác, nên vẫn cần `STALE_MS`.
- **Nhận chủ (`claim`) phải nguyên tử**, vì VS Code khởi động mở lại 4 cửa sổ cùng lúc:
  - Chưa có file: `fs.writeFileSync(file, json, { flag: 'wx' })`. Lỗi `EEXIST` nghĩa là cửa sổ khác đã nhận trước,
    nên chuyển sang theo.
  - File cũ (chủ chết hoặc quá hạn): trước tiên `fs.renameSync(file, file + '.' + me + '.stale')`. Chỉ một cửa sổ đổi tên
    được; các cửa sổ khác nhận `ENOENT` và đọc lại ở lượt sau. Rồi tạo file bằng `wx` như trên, rồi xoá file `.stale`.
- **Nhịp tim:**
  - Chủ ghi lại file mỗi `HEARTBEAT_MS`: ghi ra file tạm rồi `fs.renameSync` đè lên. Phép đổi tên là nguyên tử, nên
    người đọc không bao giờ thấy file viết dở.
  - Trước mỗi lần ghi, chủ đọc lại file. Nếu file không còn mang `ownerId` của mình thì đã mất chủ (ví dụ máy ngủ lâu
    hơn `STALE_MS` và cửa sổ khác đã nhận): dừng sidecar, chuyển sang theo.
  - Vẫn có một kẽ hở nhỏ giữa lúc đọc và lúc ghi đè: có thể có hai pet trong một nhịp, rồi tự hết ở nhịp sau.
- **Thả chủ** lúc `dispose` (đóng cửa sổ, reload, tắt chế độ desktop): xoá file nếu nó còn mang `ownerId` của mình.
  - Cửa sổ crash thì không kịp xoá; `ownerAlive` hoặc `STALE_MS` sẽ lo phần đó.
  - Sidecar được kỳ vọng chết theo extension host, vì `spawn` dùng `detached: false`. Chưa thử khi extension host crash.

**Trong `activate()`** ([src/extension.ts](../src/extension.ts), nhánh desktop):
- **Không tạo `DesktopPetBridge` ngay.** Tạo `PetOwnerLock` trước. Chỉ khi lock báo đã thành chủ mới tạo bridge rồi
  `start()`, giữ đúng thứ tự hiện có: `setChatManager` trước `start()`.
- **`host` cần chuyển được.** Hiện `host` được gán một lần rồi truyền đi nhiều chỗ. Thay bằng `SwitchableHost`: nó cài
  `CompanionHost` và chuyển tiếp tới đích hiện tại. Nhờ vậy, khi đổi giữa làm chủ và theo, không phải tìm mọi chỗ còn
  giữ `host` cũ.
  - Đích khi theo là `FollowerHost`: `postMessage`, `updatePomodoroTick` và `refreshView` không làm gì. Đợt 2 sẽ cho
    chúng chuyển tiếp sang chủ.
  - Kiểm cả `chatHostRef`, vì nó cũng đang giữ `host`.
- Cửa sổ theo vẫn ẩn view panel như hiện nay (`animeCompanion.visible = false`), nên cửa sổ đó không có Live2D nào.
- **Thanh trạng thái ở cửa sổ theo** hiện "🐾 Pet is in another window". Bấm vào thì chạy lệnh mới
  `animeCompanion.desktopPet.bringHere`. Chuỗi viết tiếng Anh như các thông báo khác: extension chưa có
  `package.nls` / `l10n`.
  1. Lệnh ghi `<globalStorageUri>/desktop-pet-takeover.json`, nội dung `{ by: me, at: now }`.
  2. Ở lượt kiểm kế tiếp, chủ nhận `release`: gọi `_killSidecar()`, dispose bridge, xoá file chủ, chuyển sang theo.
  3. Cửa sổ yêu cầu thấy chỗ trống nên `claim`, chạy pet, rồi xoá file takeover. Cửa sổ thứ ba thấy yêu cầu còn mới
     nên nhường (`follow`).
  4. Pet đổi cửa sổ mất khoảng 1–2 s, cộng thời gian nạp Live2D.
- **Thả chủ phải đi qua `_killSidecar()` hoặc `dispose()`**, không kill thẳng `proc`. `_killSidecar()` đặt
  `this._sidecar = null` **trước** khi kill, nên handler `exit` thấy `wasOurs = false` và không chạy lại.

**Sửa luôn Quit ở tray.** Handler `exit` trong bridge dùng `shouldRestart(...)`.
- Thoát với mã 0 và không có signal thì không chạy lại.
- Chủ vẫn giữ quyền chủ và vẫn ghi nhịp tim. Nếu không, cửa sổ khác thấy chỗ trống và chạy lại pet.
- Thanh trạng thái của chủ hiện "🐾 Pet is off"; bấm vào thì chạy lại.
- Khi chạy thật cần kiểm: `app.exit(0)` của Tauri có thật sự trả mã 0, không signal, về cho Node không.

**Đã làm ở v0.7.2, khác hoặc thêm so với phác thảo trên:**
- **Xác nhận ở lượt kiểm sau mới chạy pet.** Nhận chủ xong, cửa sổ chỉ báo `owned` (và chạy sidecar) khi lượt kiểm kế
  tiếp vẫn thấy file mang tên mình. Hai cửa sổ cùng đổi tên một file quá hạn có thể cùng nghĩ mình thắng; bên thua
  thấy file của bên thắng trước khi kịp chạy sidecar. Pet ra chậm hơn khoảng 1 s, đổi lại không bao giờ có hai
  sidecar mở rồi tắt. Có test tái hiện đúng cuộc đua này.
- **Ân hạn sau khi ngủ dậy** (`WAKE_GAP_MS`, `WAKE_GRACE_MS`, tham số `justWoke` của `decide`). Sau khi máy ngủ, mọi
  nhịp tim đều trông quá hạn, và cửa sổ theo nào dậy trước sẽ giành pet của một chủ vẫn sống. Một lượt kiểm trễ
  ≥ 3 s nghĩa là cửa sổ đó vừa không chạy, nên trong 7 s sau đó, chủ còn sống không bị coi là quá hạn. Chủ đã chết
  thì vẫn bị thay ngay.
- **Bridge gỡ listener `upgrade`** khỏi HTTP server dùng chung lúc dispose. Trước đây không gỡ, vì mỗi cửa sổ chỉ tạo
  một bridge. Giờ một cửa sổ có thể nhường pet rồi nhận lại: listener của bridge cũ sẽ trả 401 cho kết nối của bridge mới.
- **Bridge không khởi động được** (server file của model hỏng) thì cửa sổ thả quyền chủ và báo lỗi, để cửa sổ khác nhận.
- Lệnh `animeCompanion.desktopPet.bringHere` chỉ hiện trong Command Palette khi `desktopCompanion.enabled` bật. Ở cửa
  sổ chủ, nếu pet đang tắt (Quit) thì lệnh chạy lại pet.
- Thanh trạng thái: "🐾 Pet: other window" ở cửa sổ theo, "🐾 Pet is off" ở chủ sau khi Quit. Ẩn khi pet đang chạy ở
  cửa sổ này.
- **Chưa kiểm:** `app.exit(0)` của Tauri có thật sự trả mã 0, không signal, về cho Node không. Nếu không, Quit vẫn chạy
  lại pet như cũ. Log `DesktopPet: sidecar exited code=... signal=...` cho biết.
- **Vẫn như cũ:** Windows không tự giết tiến trình con khi extension host chết (`detached: false` không gắn vòng đời).
  Extension host crash thì có thể còn sidecar mồ côi trong khi cửa sổ khác chạy pet mới.

### 9.4 Đợt 2: pet nghe mọi cửa sổ

Mới là phác thảo, chưa thiết kế xong:
- Chủ mở thêm endpoint WebSocket `/peer` trên `ModelFileServer` của mình, với token riêng.
  - Cổng và token ghi vào file chủ.
  - File nằm trong thư mục dữ liệu của người dùng. Mức tin cậy ngang với token hiện đang truyền cho sidecar qua biến
    môi trường.
- Cửa sổ theo nối vào `/peer`, và `FollowerHost.postMessage` gửi tin sang chủ. Chủ chuyển tiếp cho sidecar.
- **Chỉ chuyển tiếp phản ứng theo sự kiện**: lỗi, lưu file, commit, build, debug, achievement.
  - Bong bóng rảnh (`_startMessageTimer`) không chuyển tiếp, vì chủ đã có.
  - Pomodoro chỉ lấy của cửa sổ đang focus. Không thì 4 bộ đếm giành nhau một vòng tròn.
- Tin nhắn từ pet (bấm, chat nhanh, menu) vẫn chỉ về chủ.
- Cửa sổ theo nối lại khi đổi chủ, đọc cổng mới từ file chủ.

### 9.5 Test

`scripts/pet-owner-test.js` nạp `out/pet-owner.js`, thêm vào script `test`.

`decide`:
- Không có file:
  - không có yêu cầu takeover → `claim`;
  - yêu cầu còn mới của cửa sổ khác → `follow`;
  - yêu cầu của chính mình, hoặc yêu cầu đã quá `STALE_MS` → `claim`.
- File của mình:
  - không có yêu cầu → `own`;
  - có yêu cầu còn mới của cửa sổ khác → `release`;
  - yêu cầu của chính mình, hoặc yêu cầu đã cũ → `own`.
- File của cửa sổ khác:
  - chủ còn sống, nhịp tim mới → `follow`;
  - `heartbeatAt` cũ đúng `STALE_MS` → `claim`; cũ `STALE_MS - 1` → `follow`;
  - `ownerAlive = false` → `claim`, dù nhịp tim còn mới.
- Thời điểm ở tương lai (đồng hồ bị chỉnh):
  - `heartbeatAt` ở tương lai không bị coi là quá hạn;
  - takeover có `at` ở tương lai không được coi là mới.

`shouldRestart`:
- mã 0, không signal → `false`;
- mã khác 0, hoặc có signal → `true`;
- `disposed`, hoặc `!wasOurs` → `false`.

Phần I/O, chạy trong thư mục tạm (`fs.mkdtempSync`):
- hai lock cùng `claim` một thư mục trống → đúng một chủ;
- hai lock cùng nhận một file quá hạn → đúng một chủ;
- đọc ném `EPERM` (qua `fs` giả) → giữ trạng thái cũ, không `claim`;
- JSON hỏng → bị nhận lại sau `STALE_MS`, tính theo `mtime`.

### 9.6 Checklist đợt này

- [ ] Kiểm hiện trạng ở 9.1 (đếm tiến trình, thử Quit), ghi kết quả vào 9.1. **Bỏ qua:** đã sửa trước khi chạy thật
      được; bản cũ (v0.7.1) vẫn cài lại được nếu cần đối chiếu
- [x] `src/pet-owner.ts` (`decide`, `shouldRestart`) + `scripts/pet-owner-test.js` (17 test, gồm cả phần I/O),
      thêm vào `npm test`
- [x] `src/pet-owner-lock.ts`: nhận chủ nguyên tử, nhịp tim, thả chủ; lỗi đọc không bị coi là "chưa có chủ"
- [x] `extension.ts`: `SwitchableHost` / `FOLLOWER_HOST`; tạo bridge khi thành chủ, dispose khi thả; `chatHostRef` trỏ
      vào `SwitchableHost`
- [x] Thanh trạng thái + lệnh `animeCompanion.desktopPet.bringHere` (khai trong `contributes.commands` của `package.json`)
- [x] Bridge: `exit` dùng `shouldRestart`; Quit ở tray không chạy lại pet
- [x] `compile` + `lint` + `test` xanh (2026-11-09)
- [ ] Chạy thật:
  - mở lại VS Code với 4 cửa sổ cùng lúc → đúng 1 tiến trình sidecar;
  - đóng cửa sổ chủ → pet hiện lại ở cửa sổ khác trong vài giây;
  - kill extension host của chủ (Process Explorer) → pet hiện lại trong khoảng `STALE_MS`, và không còn sidecar mồ côi;
  - `bringHere` → pet chuyển sang cửa sổ yêu cầu;
  - Quit ở tray → pet không hiện lại, không cửa sổ nào tự chạy lại pet;
  - tắt chế độ desktop rồi reload → file chủ bị xoá
- [x] CHANGELOG (tiếng Anh) cho đợt này, ở version sẽ thật sự ship nó (0.7.2)

## 10. Cách đo (trước và sau)

**Đo bằng script:** [scripts/measure-gpu.ps1](../scripts/measure-gpu.ps1) đọc đúng các bộ đếm Task Manager dùng, mỗi
giây một lần, rồi tách GPU 3D theo tiến trình GPU của VS Code (mọi cửa sổ và webview của VS Code đều vẽ qua đây), desktop
pet, `dwm` và app khác (kể tên app nặng nhất). Script cũng in bộ nhớ GPU và một dòng sẵn để dán vào mục 11:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/measure-gpu.ps1 -Seconds 30 -Label "4 windows, 1 focused, minute 2"
```

Cột "VS Code" đáng tin hơn cột tổng, vì nó không bị app khác (desktop-companion, trình duyệt) làm lệch.

1. Đóng desktop-companion và desktop pet. Khi GPU tích hợp gần kín việc, % GPU gán cho từng tiến trình
   bị đội lên, nên đo **GPU 3D tổng** ở tab Performance của Task Manager. Process Explorer của VS Code chỉ thấy
   cửa sổ của nó, nên số tổng của nhiều cửa sổ phải đọc ở Task Manager.
2. **Một cửa sổ:** cùng một model, màn 120 Hz nếu có, sidebar mở, không rê chuột vào panel, chờ 1 phút rồi đọc:
   - Task Manager → Performance → GPU → biểu đồ **3D**;
   - VS Code → Help → Open Process Explorer → dòng webview của companion (CPU, bộ nhớ).

   Lặp lại khi: rê chuột liên tục trên nhân vật; chuyển sidebar sang Explorer (view ẩn); nhân vật đang đi dạo
   trong editor (bỏ qua khi `WANDER_AVAILABLE = false`).
3. **Bốn cửa sổ:** view companion hiện ở cả 4, cùng model. Đọc GPU 3D tổng và bộ nhớ GPU (Task Manager →
   Performance → GPU, với GPU tích hợp là "Shared GPU memory"):
   - 1 cửa sổ focus, không chạm chuột: đọc ở giây 30 (3 cửa sổ nền đang `slow`) và ở phút thứ 2 (đã `paused`);
   - cả 4 không focus (đang ở trình duyệt), sau 2 phút;
   - bấm mute trong panel: trước bước E cả 4 nạp lại (GPU nhảy, nhân vật diễn lại cảnh xuất hiện), sau bước E thì
     không cửa sổ nào nạp lại.
4. **`document.hidden` ở cửa sổ thu nhỏ / bị che kín**, đo **trước** khi sửa:
   1. mở DevTools của webview đó (lệnh `Developer: Open Webview Developer Tools`);
   2. chọn frame `active-frame` ở ô context của Console;
   3. xem `document.hidden`.

   Kết quả cho biết Chromium có tự báo ẩn hay không, tức là `visibilitychange` có giúp được gì không.
5. Sau bước A, trong Console đó: `PIXI.Ticker.shared.count` và `PIXI.Ticker.system.count` phải là `0`.
6. Ghi vào các bảng ở mục 11.

## 11. Kết quả đo

**Lần đo đầu (2026-11-09), bằng `scripts/measure-gpu.ps1`, 30 s.** 4 cửa sổ VS Code cài bản **0.7.0** (trước bước A–F),
một cửa sổ được focus. Không biết chắc cửa sổ nào đang hiện view companion. Đang có Claude Code trả lời trong cửa sổ
được focus, và desktop-companion.exe (app khác) đang chạy.

| Đo | Trước (0.7.0) | Sau (0.7.1+) |
|---|---|---|
| GPU 3D, tiến trình GPU của VS Code | 42,8 % | |
| GPU 3D, tổng (gồm desktop-companion.exe 27,4 %, dwm 18,3 %) | 95,0 % | |
| Bộ nhớ GPU chia sẻ của VS Code | 1575 MB | |

Đo "sau" trong **đúng điều kiện đó**: cập nhật cả 4 cửa sổ lên bản mới, nạp lại, chờ 2 phút cho cửa sổ nền về
`paused`, rồi chạy lại script với cùng nhãn. Chênh lệch ở dòng đầu là phần extension tiết kiệm được.

**Một cửa sổ**

| Tình huống | GPU 3D trước | GPU 3D sau | CPU webview trước | CPU webview sau |
|---|---|---|---|---|
| Đứng yên, view hiện | | | | |
| Đang rê chuột | | | | |
| View ẩn | | | | |
| Đang đi dạo trong editor | | | | |

**Bốn cửa sổ**

| Tình huống | GPU 3D trước | GPU 3D sau | Bộ nhớ GPU trước | Bộ nhớ GPU sau |
|---|---|---|---|---|
| 1 focus, giây 30 | | | | |
| 1 focus, phút thứ 2 | | | | |
| Cả 4 không focus | | | | |
| Bấm mute (đỉnh) | | | | |

**Chromium tự báo ẩn?**

| Tình huống | `document.hidden` |
|---|---|
| Cửa sổ thu nhỏ | |
| Cửa sổ bị che kín | |

## 12. Checklist (bước A–F)

- [x] `media/webview/pet-fps.js` + `scripts/pet-fps-test.js`, thêm vào `npm test`
- [x] `main.js`: `useSystemTicker = false`; `autoUpdate: false` + `model.update` trong `app.ticker`;
      `syncPetTicker` sau `new PIXI.Application`; `markPetActive`; `visibilitychange`
- [x] `expression.js` + `interaction.js`: trộn theo `deltaMS`
- [x] `main.js`: lệnh `render` (`mode`); lệnh có hình gọi `markPetActive` (trừ `pomodoroTick`);
      `setModelVisible` → `modelHidden`; `holds` quanh hai đường chụp khung
- [x] `interaction.js`: `fitModel()` vẽ một khung khi ticker đang dừng (thêm ngoài kế hoạch, xem 5.2)
- [x] `companion.css`: `body.render-paused`; `showcase-sweep` → `::before` + `transform`, thêm vào khối reduced-motion
- [x] `src/render-gate.ts` + `scripts/render-gate-test.js`; `companion-view.ts` gửi `render` theo
      visibility / `focused` / `active`, gửi lại sau `live2dReady`, ghi `_blurredSince` lúc resolve nếu đã không focus
- [x] Kiểm tra `window.state.active` tồn tại trước khi dùng
- [x] `companion-view.ts`: bộ hẹn giờ tin nhắn rảnh chạy theo focus (bước F)
- [x] `extension.ts`: `muted` / `ambientPreset` / `ambientVolume` gửi tin nhắn thay vì nạp lại; bỏ `refreshView`
      thừa ở `toggleMute`; `main.js` nhận `setAmbientVolume` (bước E)
- [x] `companion-view.ts`: `_pendingRefresh` cho cửa sổ nền và view ẩn (bước E)
- [x] `compile` + `lint` + `test` xanh (2026-11-09)
- [ ] F5, một cửa sổ: đổi model vẫn 30 khung/giây; nét mặt đổi cùng tốc độ như trước; vùng chạm và hover vẫn đúng
      sau `useSystemTicker = false`; đi dạo vẫn có nhịp thở; ẩn rồi hiện view thì vẽ lại ngay; chế độ desktop pet
      không bị đứng hình và vẫn nhận mute / ambient
- [ ] F5, nhiều cửa sổ: cửa sổ nền 15 khung/giây rồi dừng sau 60 s; rê chuột qua cửa sổ nền thì nhân vật cử động;
      focus lại thì vẽ ngay; bấm mute không làm cửa sổ nào nạp lại; đổi model thì chỉ cửa sổ đang dùng nạp ngay,
      cửa sổ khác nạp khi được focus
- [ ] Điền các bảng ở mục 11 (đã có số "trước" cho 4 cửa sổ; còn thiếu số "sau" và các bảng chi tiết)
- [x] CHANGELOG (tiếng Anh, như các mục khác) ở version **sẽ thật sự ship**: kiểm bằng
      `git tag --sort=-v:refname` trước khi chọn số (ship ở v0.7.1)
