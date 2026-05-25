import { state, vscode, debugLog } from './core.js';
import { setExpression, updateExpressionTick } from './expression.js';
import { playAudio, setAmbientPreset, setGlobalAudioMuted } from './audio.js';
import { showBubble, createSparkle } from './ui.js';

const HEART_CURSOR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48">
  <g fill="none" fill-rule="round" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 7 24.5 21.8" stroke="#d45583" stroke-width="4.2"/>
    <path d="M4.4 4.5 14.7 7.2 8.9 12.4 4.4 4.5Z" fill="#ffa4c7" stroke="#c23d73" stroke-width="2"/>
    <path d="M27.7 21.6 38.5 34.7" stroke="#d45583" stroke-width="4.2"/>
    <path d="M35.8 31 44 42.4 31.4 38.6 35.8 31Z" fill="#ffa4c7" stroke="#c23d73" stroke-width="2"/>
    <path d="M24 38.8c-8.7-5.9-14.4-11-14.4-18 0-5.2 4.1-9.3 9.4-9.3 2.6 0 5.1 1.1 7 3.1 1.9-2 4.4-3.1 7-3.1 5.3 0 9.4 4.1 9.4 9.3 0 7-5.7 12.1-14.4 18Z" fill="#ff73ab" stroke="#ffffff" stroke-width="6"/>
    <path d="M24 38.8c-8.7-5.9-14.4-11-14.4-18 0-5.2 4.1-9.3 9.4-9.3 2.6 0 5.1 1.1 7 3.1 1.9-2 4.4-3.1 7-3.1 5.3 0 9.4 4.1 9.4 9.3 0 7-5.7 12.1-14.4 18Z" fill="#ff8cbc" stroke="#cf3f79" stroke-width="2.2"/>
    <path d="M16.2 17.2c0 0 2.3-3 5.8-3.8" stroke="#ffdbe9" stroke-width="2.2"/>
    <path d="m29.4 14.5 2.1 1.8" stroke="#fff7fb" stroke-width="2.1"/>
    <path d="m34.9 17.8.7 1.3" stroke="#fff7fb" stroke-width="1.8"/>
    <circle cx="27.3" cy="21.2" r="1.2" fill="#fff7fb" stroke="none"/>
  </g>
</svg>`;
const MODEL_HEART_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(HEART_CURSOR_SVG)}") 4 4, pointer`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

const WEBVIEW_STRINGS = window.__WEBVIEW_STRINGS__ || {};

function syncMessageLanguageDomState(messageLanguage = window.__MESSAGE_LANGUAGE__ || 'vi') {
  document.documentElement.lang = messageLanguage;
  document.body?.setAttribute('data-message-language', messageLanguage);
}

syncMessageLanguageDomState();

function getWebviewValue(path, fallback) {
  let current = WEBVIEW_STRINGS;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return fallback;
    current = current[part];
  }
  return current ?? fallback;
}

function t(path, fallback) {
  const value = getWebviewValue(path, fallback);
  return typeof value === 'string' ? value : fallback;
}

function tList(path, fallback) {
  const value = getWebviewValue(path, fallback);
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback;
}

const DBLCLICK_MESSAGES = tList('dblClickMessages', [
  'Kyaa~ combo đẹp ghê luôn á! ✨',
  'Double tap nhanh quá~ tim em lỡ nhịp luôn nè! 💖',
]);

// Pixels of mouse travel before a pending click upgrades into a drag. Tuned
// loose enough that ordinary clicks don't trip it, tight enough that the
// drag feels responsive once intent is clear.
const DRAG_THRESHOLD_PX = 6;

// Fits the model into the panel and wires up pointer interaction + context menu.
export function setupModel() {
  if (!state.model || !state.app) return;

  state.app.stage.addChild(state.model);
  fitModel();

  let clickCount = 0;
  let clickTimer = null;
  let longPressTimer = null;
  let isLongPress = false;
  let isCooldown = false;
  let isWindowDragging = false;

  // Drag-vs-click decision state. Populated on mousedown, watched by a
  // window-level mousemove listener; once the cursor has moved past the
  // threshold we cancel the pending click logic and hand off to either
  // Tauri's window drag or the panel's CSS reposition.
  let pendingDrag = null;
  let panelDragState = null;

  const canvas = document.getElementById('live2dCanvas');
  const isDesktopPet = document.body.classList.contains('desktop-pet-mode');
  const tauriWindow = isDesktopPet ? (
    window.__TAURI__?.window?.getCurrentWindow?.() ||
    window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.() ||
    window.__TAURI__?.webviewWindow?.getCurrent?.()
  ) : null;
  debugLog(
    'Drag init: desktopPet=' + isDesktopPet +
    ', canvas=' + Boolean(canvas) +
    ', tauriWindow=' + Boolean(tauriWindow) +
    ', startDragging=' + Boolean(tauriWindow?.startDragging)
  );

  // Cancel the pending-click bookkeeping when a drag actually starts so we
  // don't fire a poke / longpress / spam reaction on mouseup.
  function cancelClickBookkeeping() {
    clearTimeout(longPressTimer);
    clearTimeout(clickTimer);
    clickCount = 0;
    isLongPress = false;
  }

  // Promote a pending click into an active drag. Called from the window-level
  // mousemove listener once the cursor has moved past DRAG_THRESHOLD_PX.
  function beginDrag(clientX, clientY) {
    cancelClickBookkeeping();
    isWindowDragging = true;
    debugLog('beginDrag: desktopPet=' + isDesktopPet + ', x=' + clientX + ', y=' + clientY);

    if (tauriWindow?.startDragging) {
      // OS owns the drag from here on. Our mousemove/mouseup may not fire
      // again until the user releases; clear pending state.
      pendingDrag = null;
      debugLog('Calling tauriWindow.startDragging()');
      void tauriWindow.startDragging().then(() => {
        debugLog('tauriWindow.startDragging() resolved');
      }).catch((err) => {
        debugLog('tauriWindow.startDragging() failed: ' + (err?.message || String(err)));
        isWindowDragging = false;
      });
      return;
    }

    // Panel mode: switch the container into absolute positioning so we can
    // move it freely. Remember the offset between cursor and container origin
    // so the drag feels anchored to where the user grabbed.
    const container = document.querySelector('.companion-container');
    if (!container) {
      pendingDrag = null;
      isWindowDragging = false;
      return;
    }
    const rect = container.getBoundingClientRect();
    panelDragState = {
      container,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
    };
    container.classList.add('companion-container--dragging');
    // Pin via fixed positioning so subsequent left/top are viewport-relative
    // and don't fight with the flex parent layout.
    container.style.position = 'fixed';
    container.style.width = rect.width + 'px';
    container.style.height = rect.height + 'px';
    container.style.left = rect.left + 'px';
    container.style.top = rect.top + 'px';
    pendingDrag = null;
  }

  // Track every potential drag origin so the global mousemove watcher can
  // decide. Both PIXI's pointerdown on the model AND a raw canvas mousedown
  // (transparent areas of the canvas) feed into this.
  function recordPotentialDragStart(clientX, clientY) {
    pendingDrag = { startX: clientX, startY: clientY };
    debugLog('recordPotentialDragStart: x=' + clientX + ', y=' + clientY);
  }

  state.model.on('pointerdown', (e) => {
    const btn = e?.data?.button ?? e?.data?.originalEvent?.button;
    const altKey = !!(e?.data?.originalEvent?.altKey ?? e?.altKey);
    debugLog('pointerdown: btn=' + btn + ', alt=' + altKey + ', cooldown=' + isCooldown + ', dragging=' + isWindowDragging);
    if (btn === 2) return;
    if (isCooldown) return;
    if (isWindowDragging) return;

    const oe = e?.data?.originalEvent;
    if (oe && typeof oe.clientX === 'number') {
      recordPotentialDragStart(oe.clientX, oe.clientY);
    }

    debugLog('Pointer down');
    isLongPress = false;

    longPressTimer = setTimeout(() => {
      isLongPress = true;
      isCooldown = true;
      setTimeout(() => { isCooldown = false; }, 4000);

      debugLog('Long press detected!');
      try { state.model.motion('TapHead'); } catch (err) {
        try { state.model.motion('Idle'); } catch (_) { /* ignore */ }
      }

      setExpression('shy', 2000);
      setTimeout(() => setExpression('love', 3000), 2000);

      showBubble(t('bubbles.headpat', 'Ehehe~ vuốt đầu dịu dàng quá đi~ 😚'));
      playAudio('headpat.mp3');
      vscode.postMessage({ command: 'headpat' });
      createSparkle();
      createSparkle();
    }, 800);
  });

  state.model.on('pointerup', (e) => {
    const btn = e?.data?.button ?? e?.data?.originalEvent?.button;
    if (btn === 2) return;
    if (isCooldown) return;
    if (isWindowDragging) {
      isWindowDragging = false;
      return;
    }
    clearTimeout(longPressTimer);

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clickCount++;
    clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      isCooldown = true;
      setTimeout(() => { isCooldown = false; }, 3000);

      if (clickCount >= 5) {
        debugLog('Spam click: ' + clickCount);
        try { state.model.motion('TapBody'); } catch (_) { /* ignore */ }
        setExpression('angry', 3000);
        showBubble(t('bubbles.spamClick', 'Eee đừng chọc liên tục nữa mà~ em chóng mặt mất! 😵'));
        playAudio('spam.mp3');
        vscode.postMessage({ command: 'spamClick', count: clickCount });
        createSparkle();
        createSparkle();
        createSparkle();
      } else if (clickCount >= 2) {
        debugLog('Multi-click: ' + clickCount);
        try { state.model.motion('TapBody'); } catch (_) {
          try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
        }
        setExpression('happy', 2500);
        showBubble(DBLCLICK_MESSAGES[Math.floor(Math.random() * DBLCLICK_MESSAGES.length)]);
        vscode.postMessage({ command: 'multiClick', count: clickCount });
        createSparkle();
        createSparkle();
      } else {
        debugLog('Single click');
        try { state.model.motion('TapBody'); } catch (_) {
          try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
        }
        setExpression('surprised', 2000);
        showBubble(t('bubbles.singleClick', 'Eh~ chạm nhẹ vậy làm em giật mình đó nha! 🥺'));
        playAudio('poke.mp3');
        vscode.postMessage({ command: 'poke' });
        createSparkle();
      }
      clickCount = 0;
    }, 400);
  });

  state.model.interactive = true;
  state.model.buttonMode = true;
  state.model.cursor = MODEL_HEART_CURSOR;
  applyModelHoverCursor();

  const wrapper = document.getElementById('characterWrapper');

  // Drag also from transparent areas of the canvas (where Live2D's hit
  // detection won't fire pointerdown on the model). Same threshold rules.
  if (canvas) {
    canvas.addEventListener('mousedown', (event) => {
      debugLog('canvas mousedown: btn=' + event.button + ', alt=' + event.altKey + ', x=' + event.clientX + ', y=' + event.clientY);
      if (event.button !== 0) return;
      if (isCooldown || isWindowDragging) return;
      recordPotentialDragStart(event.clientX, event.clientY);
    }, true);
  }

  // Single global drag watcher. Promotes a pending mousedown into a real
  // drag once the cursor crosses the threshold; live-updates panel mode
  // until mouseup.
  window.addEventListener('mousemove', (event) => {
    if (panelDragState) {
      const c = panelDragState.container;
      const newLeft = event.clientX - panelDragState.offsetX;
      const newTop = event.clientY - panelDragState.offsetY;
      // Constrain to the viewport so the model can't be lost off-screen.
      const rect = c.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      const x = Math.min(Math.max(0, newLeft), maxLeft);
      const y = Math.min(Math.max(0, newTop), maxTop);
      c.style.left = x + 'px';
      c.style.top = y + 'px';
      return;
    }
    if (!pendingDrag) return;
    const dx = event.clientX - pendingDrag.startX;
    const dy = event.clientY - pendingDrag.startY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      beginDrag(event.clientX, event.clientY);
    }
  }, true);

  // Reset on mouseup. In Tauri mode the OS may eat events until release —
  // the listener still fires when control returns, clearing the flag.
  // In panel mode this is also where we persist the final position.
  window.addEventListener('mouseup', () => {
    debugLog(
      'mouseup: panelDrag=' + Boolean(panelDragState) +
      ', pendingDrag=' + Boolean(pendingDrag) +
      ', isWindowDragging=' + isWindowDragging
    );
    if (panelDragState) {
      const c = panelDragState.container;
      c.classList.remove('companion-container--dragging');
      const rect = c.getBoundingClientRect();
      vscode.postMessage({
        command: 'setCompanionPosition',
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      });
      panelDragState = null;
    }
    pendingDrag = null;
    // Defer slightly so a click event fired by the same release is suppressed
    // by the existing isWindowDragging guards in pointerup.
    setTimeout(() => { isWindowDragging = false; }, 50);
  }, true);

  // Apply any persisted position right away so the user's chosen spot
  // survives reloads. Bridge mode injects this via the init payload; panel
  // mode injects via the HTML inline script.
  applyStoredPanelPosition();

  if (wrapper) {
    const resizeObserver = new ResizeObserver(() => fitModel());
    resizeObserver.observe(wrapper);
  }

  // When the user drags the companion, the container gets pinned with
  // position:fixed + explicit width/height (see beginDrag / applyStoredPanelPosition).
  // After pinning, the wrapper inside has frozen pixel dimensions, so the
  // ResizeObserver above never fires when the parent panel is resized.
  // Re-sync the pinned size to the viewport on window resize AND on body
  // resize (VS Code's bottom-panel drag doesn't always emit window.resize),
  // then explicitly refit the model — belt-and-suspenders so the model keeps
  // following live regardless of which observer chain ends up triggering.
  const handleViewportChange = () => {
    syncPinnedContainerSize();
    fitModel();
  };
  window.addEventListener('resize', handleViewportChange);
  if (typeof ResizeObserver === 'function') {
    const bodyObserver = new ResizeObserver(handleViewportChange);
    bodyObserver.observe(document.body);
  }

  state.app.ticker.add(() => updateExpressionTick());
  debugLog('Expression system started');

  setupCompactContextMenu();
  setupVoicePanel();
  setupMessagePanel();
  setupAmbientPanel();
  setupModelPanel();
  setupMotionPanel();
}

// Reads window.__COMPANION_POSITION__ (set by extension when persisted) and
// pins the container at that x/y. Skipped on desktop pet mode where the
// position is OS window position, not intra-window coords.
function applyStoredPanelPosition() {
  if (document.body.classList.contains('desktop-pet-mode')) return;
  const pos = window.__COMPANION_POSITION__;
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
  const container = document.querySelector('.companion-container');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width);
  const maxTop = Math.max(0, window.innerHeight - rect.height);
  const x = Math.min(Math.max(0, pos.x), maxLeft);
  const y = Math.min(Math.max(0, pos.y), maxTop);
  container.style.position = 'fixed';
  container.style.width = rect.width + 'px';
  container.style.height = rect.height + 'px';
  container.style.left = x + 'px';
  container.style.top = y + 'px';
}

// Keep a pinned (position:fixed) container's width/height in sync with the
// viewport so the inner wrapper — and the Live2D model rendered into it —
// follow live panel resize. No-op when the container is still in its default
// flex layout (rest of CSS handles that case naturally).
function syncPinnedContainerSize() {
  const container = document.querySelector('.companion-container');
  if (!container) return;
  if (container.style.position !== 'fixed') return;

  const parent = container.parentElement || document.body;
  const parentRect = parent.getBoundingClientRect();
  const newWidth = Math.max(1, Math.round(parentRect.width));
  const newHeight = Math.max(1, Math.round(parentRect.height));

  container.style.width = newWidth + 'px';
  container.style.height = newHeight + 'px';

  // Clamp left/top so the companion stays inside the viewport after shrink.
  const left = parseFloat(container.style.left) || 0;
  const top = parseFloat(container.style.top) || 0;
  const maxLeft = Math.max(0, window.innerWidth - newWidth);
  const maxTop = Math.max(0, window.innerHeight - newHeight);
  container.style.left = Math.min(Math.max(0, left), maxLeft) + 'px';
  container.style.top = Math.min(Math.max(0, top), maxTop) + 'px';

  // ResizeObserver on the wrapper picks up the dimension change and triggers
  // fitModel — no explicit call needed.
}

function applyModelHoverCursor() {
  const wrapper = document.getElementById('characterWrapper');
  const canvas = document.getElementById('live2dCanvas');
  if (!wrapper || !canvas || !state.model) return;

  const setHover = (hovering) => {
    wrapper.classList.toggle('model-hover-active', hovering);
    canvas.classList.toggle('model-hover-active', hovering);
  };

  setHover(false);
  state.model.on('pointerover', () => setHover(true));
  state.model.on('pointerout', () => setHover(false));
  state.model.on('pointerupoutside', () => setHover(false));
}

export function fitModel() {
  if (!state.model || !state.app) return;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  if (w <= 0 || h <= 0) return;

  state.app.renderer.resize(w, h);

  // Use the Live2D-designed canvas (originalWidth/Height) as the size source.
  // PIXI's getLocalBounds() reports the rigging-bone bounds, which under-counts
  // physics-driven parts (hair sway, skirt, breathing chest motion). Scaling
  // to those smaller bounds makes the actual rendered character overflow the
  // panel — most visibly chopping the feet at the bottom when the panel is short.
  const internal = state.model.internalModel;
  const modelWidth = internal ? (internal.originalWidth || internal.width || 1) : 1;
  const modelHeight = internal ? (internal.originalHeight || internal.height || 1) : 1;

  // Small breathing margin so animation sway (breathing, idle motion) doesn't
  // poke past the edges. Bottom margin matters most — that's where feet sit.
  const horizontalPadding = Math.max(8, w * 0.04);
  const topPadding = Math.max(4, h * 0.015);
  const bottomPadding = Math.max(6, h * 0.02);
  const availableWidth = Math.max(1, w - horizontalPadding * 2);
  const availableHeight = Math.max(1, h - topPadding - bottomPadding);

  const previousX = state.model.x;
  const previousY = state.model.y;
  const previousScale = state.model.scale.x || 1;

  const scale = Math.min(availableWidth / modelWidth, availableHeight / modelHeight);
  const scaledWidth = modelWidth * scale;
  const scaledHeight = modelHeight * scale;

  state.model.scale.set(scale);
  // Live2D canvas origin is top-left at (0,0). Center horizontally; pin the
  // canvas bottom edge inside `bottomPadding` so the feet never get clipped.
  state.model.x = (w - scaledWidth) / 2;
  state.model.y = h - bottomPadding - scaledHeight;

  if (!Number.isFinite(state.model.x) || !Number.isFinite(state.model.y)) {
    state.model.scale.set(previousScale);
    state.model.position.set(previousX, previousY);
    debugLog('Fit fallback: restored previous transform because computed position was invalid');
    return;
  }

  debugLog(
    'Fit: scale=' + scale.toFixed(4) +
    ', model=' + modelWidth + 'x' + modelHeight +
    ', pos=(' + state.model.x.toFixed(2) + ',' + state.model.y.toFixed(2) + ')'
  );
}

function setupContextMenu() {
  const menu = document.createElement('div');
  menu.className = 'companion-context-menu';
  menu.innerHTML = `
    <div class="companion-menu-item" data-action="start-server">
      <span style="font-size: 11px;">🚀</span> ${t('menu.run', 'Run')}
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="commit">
      <span style="font-size: 11px;">📦</span> ${t('menu.commit', 'Commit')}
    </div>
    <div class="companion-menu-item" data-action="pull">
      <span style="font-size: 11px;">⬇️</span> ${t('menu.pull', 'Pull')}
    </div>
    <div class="companion-menu-item" data-action="push">
      <span style="font-size: 11px;">⬆️</span> ${t('menu.push', 'Push')}
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="change-model">
      <span style="font-size: 11px;">🌸</span> ${t('menu.model', 'Model')}
    </div>
    <div class="companion-menu-item" data-action="play-motion">
      <span style="font-size: 11px;">🎬</span> ${t('menu.motion', 'Motion')}
    </div>
    <div class="companion-menu-item" data-action="poke">
      <span style="font-size: 11px;">👉</span> ${t('menu.poke', 'Poke')}
    </div>
    <div class="companion-menu-item" data-action="switch-host-mode">
      <span style="font-size: 11px;">${window.__DESKTOP_PET_MODE__ ? '🪟' : '🖥️'}</span>
      ${window.__DESKTOP_PET_MODE__ ? t('menu.panel', 'Panel') : t('menu.desktop', 'Desktop')}
    </div>
    <div class="companion-menu-item" data-action="change-voice">
      <span style="font-size: 11px;">🗣️</span> ${t('menu.voice', 'Voice')}
    </div>
    <div class="companion-menu-item" data-action="change-message-language">
      <span style="font-size: 11px;">💬</span> ${t('menu.messages', 'Messages')}
    </div>
    <div class="companion-menu-item" data-action="ambient">
      <span style="font-size: 11px;">🎧</span> ${t('menu.ambient', 'Ambient')}
    </div>
    <div class="companion-menu-item" data-action="toggle-mute">
      <span class="companion-mute-icon" style="font-size: 11px;">🔇</span> <span class="companion-mute-label">${t('menu.mute', 'Mute')}</span>
    </div>
    ${window.__DESKTOP_PET_MODE__ ? `
    <div class="companion-menu-item" data-action="toggle-click-through">
      <span class="companion-clickthrough-icon" style="font-size: 11px;">🖱️</span> <span class="companion-clickthrough-label">${t('menu.clickThrough', 'Click-through')}</span>
    </div>
    ` : ''}
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="pomodoro">
      <span style="font-size: 11px;">🍅</span> ${t('menu.pomodoro', 'Pomodoro')}
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="achievements">
      <span style="font-size: 11px;">🏆</span> ${t('menu.achievements', 'Achievements')}
    </div>
    <div class="companion-menu-item" data-action="stats">
      <span style="font-size: 11px;">📊</span> ${t('menu.stats', 'Stats')}
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="settings">
      <span style="font-size: 11px;">⚙️</span> ${t('menu.settings', 'Settings')}
    </div>
  `;
  document.body.appendChild(menu);

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    showBubble(t('bubbles.contextHint', 'Onii-chan cần em giúp gì hả~ em luôn sẵn sàng nè! 💕'));
    try { playAudio('help.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
    setExpression('shy', 2500);
    if (state.model) {
      try { state.model.motion('TapBody'); } catch (_) {
        try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
      }
    }
    createSparkle();
  }, true);

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    syncMuteMenuLabel(menu);
    menu.classList.add('show');

    let left = e.clientX;
    let top = e.clientY;
    const margin = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    if (left + mw + margin > vw) left = Math.max(margin, e.clientX - mw);
    if (top + mh + margin > vh) top = Math.max(margin, e.clientY - mh);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }, true);

  window.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.classList.remove('show');
  }, true);

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.companion-menu-item');
    if (!item) return;
    const action = item.getAttribute('data-action');
    console.log('[AnimeCompanion] menu click action=' + action);
    menu.classList.remove('show');

    if (action === 'start-server') {
      showBubble(t('bubbles.startServer', 'Để em khởi động lại cho Onii-chan liền nha~ 🚀'));
      try { playAudio('server.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.runProject' });
    } else if (action === 'commit') {
      showBubble(t('bubbles.commit', 'Commit gọn gàng một cái cho xinh nha~ ✨'));
      vscode.postMessage({ command: 'runCommand', action: 'git.commit' });
    } else if (action === 'pull') {
      showBubble(t('bubbles.pull', 'Mình kéo code mới về thôi nào~ 📦'));
      vscode.postMessage({ command: 'runCommand', action: 'git.pull' });
    } else if (action === 'push') {
      showBubble(t('bubbles.push', 'Push code lên remote cho an tâm nha~ ☁️'));
      vscode.postMessage({ command: 'runCommand', action: 'git.push' });
    } else if (action === 'pomodoro') {
      showBubble(t('bubbles.pomodoro', 'Bắt đầu Pomodoro nha~ em canh giờ giúp Onii-chan! 🍅'));
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.startPomodoro' });
    } else if (action === 'poke') {
      if (state.model) { try { state.model.motion('TapBody'); } catch (_) { /* ignore */ } }
      vscode.postMessage({ command: 'poke' });
    } else if (action === 'change-model') {
      showBubble(t('bubbles.changeModel', 'Đổi model ngay trên companion luôn nha~ 🌸'));
      showModelPanel();
    } else if (action === 'switch-host-mode') {
      if (window.__DESKTOP_PET_MODE__) {
        showBubble(t('bubbles.switchToPanel', 'Chuyển về Panel nha~ 🪟'));
        vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.switchToPanel' });
      } else {
        showBubble(t('bubbles.switchToDesktop', 'Chuyển sang Desktop nha~ 🖥️'));
        vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.switchToDesktop' });
      }
    } else if (action === 'change-voice') {
      showBubble(t('bubbles.changeVoice', 'Đổi giọng dễ thương hơn một chút nha~ 🗣️'));
      showVoicePanel();
    } else if (action === 'change-message-language') {
      showBubble(t('bubbles.changeMessages', 'Đổi ngôn ngữ chữ nha~ em sẽ nói kiểu khác đó! 💬'));
      showMessagePanel();
    } else if (action === 'ambient') {
      showBubble(t('bubbles.ambient', 'Bật ambient nha~'));
      showAmbientPanel();
    } else if (action === 'toggle-mute') {
      const nextMuted = !window.__AUDIO_MUTED__;
      setGlobalAudioMuted(nextMuted);
      showBubble(nextMuted
        ? t('bubbles.muteOn', 'Em sẽ im lặng một chút nha~ 🤫')
        : t('bubbles.muteOff', 'Em ríu rít lại rồi nè~ 🎀'));
      vscode.postMessage({ command: 'setMuted', muted: nextMuted });
    } else if (action === 'toggle-click-through') {
      const nextClickThrough = !window.__CLICK_THROUGH__;
      window.__CLICK_THROUGH__ = nextClickThrough;
      showBubble(nextClickThrough
        ? t('bubbles.clickThroughOn', 'Em ẩn dạng thôi nha~ click vào em sẽ xuyên qua app phía sau! 👻')
        : t('bubbles.clickThroughOff', 'Em quay lại rồi nè~ click được lên em rồi! ✨'));
      vscode.postMessage({ command: 'setClickThrough', value: nextClickThrough });
    } else if (action === 'settings') {
      showBubble(t('bubbles.settings', 'Mở Settings ra cho Onii-chan liền nha~ ⚙️'));
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.openSettings' });
    } else if (action === 'play-motion') {
      showBubble(t('bubbles.motion', 'Chọn motion cho em diễn nha~ 🎬'));
      showMotionPanel();
    } else if (action === 'achievements') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showAchievements' });
    } else if (action === 'stats') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showStats' });
    }
  });
}

function setupCompactContextMenu() {
  const isDesktop = !!window.__DESKTOP_PET_MODE__;

  // Functional categories per roadmap v0.4.0 §4.1. Each category produces one
  // submenu; the main menu just lists categories + a couple of quick actions.
  const categories = [
    {
      id: 'git',
      icon: '🔧',
      label: t('menu.gitCategory', 'Git'),
      items: [
        { icon: '📦', label: t('menu.commit', 'Commit'),  action: 'commit' },
        { icon: '⬇️', label: t('menu.pull', 'Pull'),     action: 'pull' },
        { icon: '⬆️', label: t('menu.push', 'Push'),     action: 'push' },
      ],
    },
    {
      id: 'chat',
      icon: '💬',
      label: t('menu.chatCategory', 'AI Chat'),
      items: [
        { icon: '💬', label: t('menu.chatOpen', 'Open Chat'),                 action: 'chat-open' },
        { icon: '🆕', label: t('menu.chatNew', 'New Conversation'),           action: 'chat-new' },
        { icon: '📌', label: t('menu.chatAskSelection', 'Ask About Selection'), action: 'chat-ask-selection' },
        { icon: '🔑', label: t('menu.chatConfigure', 'Configure Provider'),   action: 'chat-configure' },
        { icon: '🗑️', label: t('menu.chatClear', 'Clear All'),                action: 'chat-clear' },
      ],
    },
    {
      id: 'appearance',
      icon: '🌸',
      label: t('menu.appearanceCategory', 'Appearance'),
      items: [
        { icon: '🌸', label: t('menu.model', 'Model'),                          action: 'change-model' },
        { icon: '📸', label: t('menu.captureChibi', 'Capture Chibi'),           action: 'capture-chibi' },
        { icon: '🐾', label: t('menu.toggleCursorChibi', 'Toggle Cursor Chibi'),action: 'toggle-cursor-chibi' },
        { icon: '🎯', label: t('menu.tuneCursorChibi', 'Tune Cursor Chibi'),    action: 'tune-cursor-chibi' },
        { icon: '📍', label: t('menu.resetPosition', 'Reset Position'),         action: 'reset-position' },
        { icon: '🎬', label: t('menu.motion', 'Motion'),                        action: 'play-motion' },
        { icon: '👉', label: t('menu.poke', 'Poke'),                            action: 'poke' },
      ],
    },
    {
      id: 'voice',
      icon: '🔊',
      label: t('menu.voiceCategory', 'Voice & Sound'),
      items: [
        { icon: '🗣️', label: t('menu.voice', 'Voice'),                     action: 'change-voice' },
        { icon: '💬', label: t('menu.messages', 'Messages'),               action: 'change-message-language' },
        { icon: '🎧', label: t('menu.ambient', 'Ambient'),                 action: 'ambient' },
        { icon: '🔇', label: t('menu.mute', 'Mute'),                       action: 'toggle-mute', mute: true },
      ],
    },
    {
      id: 'workflow',
      icon: '🍅',
      label: t('menu.workflowCategory', 'Workflow'),
      items: [
        { icon: '▶️', label: t('menu.startPomodoro', 'Start Pomodoro'),  action: 'start-pomodoro' },
        { icon: '⏹️', label: t('menu.stopPomodoro', 'Stop Pomodoro'),    action: 'stop-pomodoro' },
        { icon: '📊', label: t('menu.stats', 'Stats'),                    action: 'stats' },
        { icon: '🏆', label: t('menu.achievements', 'Achievements'),      action: 'achievements' },
      ],
    },
    {
      id: 'desktop',
      icon: '🖥️',
      label: t('menu.desktopCategory', 'Desktop Companion'),
      items: [
        {
          icon: isDesktop ? '🪟' : '🖥️',
          label: isDesktop ? t('menu.switchToPanel', 'Switch to Panel') : t('menu.switchToDesktop', 'Switch to Desktop'),
          action: 'switch-host-mode',
        },
        ...(isDesktop ? [{
          icon: '🖱️',
          label: t('menu.clickThrough', 'Toggle Click-Through'),
          action: 'toggle-click-through',
        }] : []),
        { icon: '🔄', label: t('menu.resetWorkspaceModel', 'Reset Workspace Model'), action: 'reset-workspace-model' },
      ],
    },
  ];

  const mainMenu = document.createElement('div');
  mainMenu.className = 'companion-context-menu';

  const categoryRowsHtml = categories.map((cat) => `
    <div class="companion-menu-item" data-category="${cat.id}">
      <span style="font-size: 11px;">${cat.icon}</span> ${cat.label}
      <span class="companion-submenu-arrow">&#x203A;</span>
    </div>
  `).join('');

  mainMenu.innerHTML = `
    <div class="companion-menu-item" data-action="start-server">
      <span style="font-size: 11px;">🚀</span> ${t('menu.run', 'Run')}
    </div>
    ${categoryRowsHtml}
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="open-all-settings">
      <span style="font-size: 11px;">⚙️</span> ${t('menu.allSettings', 'All Settings')}
    </div>
  `;

  // Append main menu FIRST, then submenus, so submenus paint on top when they
  // overlap. Both share z-index 1000 — stacking falls back to DOM order, and
  // narrow-panel layouts almost always force the submenu to overlap the main.
  document.body.appendChild(mainMenu);

  const submenus = {};
  for (const cat of categories) {
    const submenu = document.createElement('div');
    submenu.className = 'companion-context-menu companion-context-submenu';
    submenu.innerHTML = cat.items.map((item) => {
      const iconClass = item.mute ? 'companion-mute-icon' : '';
      const labelClass = item.mute ? 'companion-mute-label' : '';
      return `
        <div class="companion-menu-item" data-action="${item.action}">
          <span class="${iconClass}" style="font-size: 11px;">${item.icon}</span>
          <span class="${labelClass}">${item.label}</span>
        </div>
      `;
    }).join('');
    document.body.appendChild(submenu);
    submenus[cat.id] = submenu;
  }

  const allMenus = [mainMenu, ...Object.values(submenus)];

  const closeContextMenus = () => {
    for (const m of allMenus) m.classList.remove('show');
  };

  const positionMenu = (targetMenu, left, top) => {
    const margin = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = targetMenu.offsetWidth;
    const mh = targetMenu.offsetHeight;
    let nextLeft = left;
    let nextTop = top;
    if (nextLeft + mw + margin > vw) nextLeft = Math.max(margin, vw - mw - margin);
    if (nextTop + mh + margin > vh) nextTop = Math.max(margin, vh - mh - margin);
    targetMenu.style.left = nextLeft + 'px';
    targetMenu.style.top = nextTop + 'px';
  };

  const openSubmenu = (categoryId) => {
    const submenu = submenus[categoryId];
    if (!submenu) return;
    syncMuteMenuLabel(submenu);
    const trigger = mainMenu.querySelector(`[data-category="${categoryId}"]`);
    const mainRect = mainMenu.getBoundingClientRect();
    const itemRect = trigger ? trigger.getBoundingClientRect() : mainRect;
    for (const cat of categories) {
      if (cat.id !== categoryId) submenus[cat.id].classList.remove('show');
    }
    // Reveal off-screen so offsetWidth is measurable, then decide a cascade
    // direction. Narrow panel webviews (~250 px) often can't fit a submenu to
    // the right of the main menu — flip to the left side when needed.
    submenu.style.left = '-9999px';
    submenu.style.top = '-9999px';
    submenu.classList.add('show');
    const submenuWidth = submenu.offsetWidth;
    const gap = 6;
    const vw = window.innerWidth;
    let left = mainRect.right + gap;
    if (left + submenuWidth + 4 > vw) {
      const leftSide = mainRect.left - submenuWidth - gap;
      left = leftSide >= 4 ? leftSide : left;
    }
    positionMenu(submenu, left, itemRect.top);
  };

  const handleMenuAction = (action) => {
    if (!action) return;
    closeContextMenus();

    if (action === 'start-server') {
      showBubble(t('bubbles.startServer', 'Để em khởi động lại cho Onii-chan liền nha~ 🚀'));
      try { playAudio('server.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.runProject' });
    } else if (action === 'commit') {
      showBubble(t('bubbles.commit', 'Commit gọn gàng một cái cho xinh nha~ ✨'));
      vscode.postMessage({ command: 'runCommand', action: 'git.commit' });
    } else if (action === 'pull') {
      showBubble(t('bubbles.pull', 'Mình kéo code mới về thôi nào~ 📦'));
      vscode.postMessage({ command: 'runCommand', action: 'git.pull' });
    } else if (action === 'push') {
      showBubble(t('bubbles.push', 'Push code lên remote cho an tâm nha~ ☁️'));
      vscode.postMessage({ command: 'runCommand', action: 'git.push' });
    } else if (action === 'start-pomodoro') {
      showBubble(t('bubbles.pomodoro', 'Bắt đầu Pomodoro nha~ em canh giờ giúp Onii-chan! 🍅'));
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.startPomodoro' });
    } else if (action === 'stop-pomodoro') {
      showBubble(t('bubbles.stopPomodoro', 'Dừng Pomodoro nha~ nghỉ tay một chút đi! ☕'));
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.stopPomodoro' });
    } else if (action === 'poke') {
      if (state.model) { try { state.model.motion('TapBody'); } catch (_) { /* ignore */ } }
      vscode.postMessage({ command: 'poke' });
    } else if (action === 'change-model') {
      showBubble(t('bubbles.changeModel', 'Đổi model ngay trên companion luôn nha~ 🌸'));
      showModelPanel();
    } else if (action === 'switch-host-mode') {
      if (window.__DESKTOP_PET_MODE__) {
        showBubble(t('bubbles.switchToPanel', 'Chuyển về Panel nha~ 🪟'));
        vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.switchToPanel' });
      } else {
        showBubble(t('bubbles.switchToDesktop', 'Chuyển sang Desktop nha~ 🖥️'));
        vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.switchToDesktop' });
      }
    } else if (action === 'change-voice') {
      showBubble(t('bubbles.changeVoice', 'Đổi giọng dễ thương hơn một chút nha~ 🗣️'));
      showVoicePanel();
    } else if (action === 'change-message-language') {
      showBubble(t('bubbles.changeMessages', 'Đổi ngôn ngữ chữ nha~ em sẽ nói kiểu khác đó! 💬'));
      showMessagePanel();
    } else if (action === 'ambient') {
      showBubble(t('bubbles.ambient', 'Bật ambient nha~'));
      showAmbientPanel();
    } else if (action === 'toggle-mute') {
      const nextMuted = !window.__AUDIO_MUTED__;
      setGlobalAudioMuted(nextMuted);
      showBubble(nextMuted
        ? t('bubbles.muteOn', 'Em sẽ im lặng một chút nha~ 🤫')
        : t('bubbles.muteOff', 'Em ríu rít lại rồi nè~ 🎀'));
      vscode.postMessage({ command: 'setMuted', muted: nextMuted });
    } else if (action === 'toggle-click-through') {
      const nextClickThrough = !window.__CLICK_THROUGH__;
      window.__CLICK_THROUGH__ = nextClickThrough;
      showBubble(nextClickThrough
        ? t('bubbles.clickThroughOn', 'Em ẩn dạng thôi nha~ click vào em sẽ xuyên qua app phía sau! 👻')
        : t('bubbles.clickThroughOff', 'Em quay lại rồi nè~ click được lên em rồi! ✨'));
      vscode.postMessage({ command: 'setClickThrough', value: nextClickThrough });
    } else if (action === 'open-all-settings') {
      showBubble(t('bubbles.settings', 'Mở Settings ra cho Onii-chan liền nha~ ⚙️'));
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.openSettings' });
    } else if (action === 'play-motion') {
      showBubble(t('bubbles.motion', 'Chọn motion cho em diễn nha~ 🎬'));
      showMotionPanel();
    } else if (action === 'achievements') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showAchievements' });
    } else if (action === 'stats') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showStats' });
    } else if (action === 'chat-open') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.chat.open' });
    } else if (action === 'chat-new') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.chat.newConversation' });
    } else if (action === 'chat-ask-selection') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.chat.askSelection' });
    } else if (action === 'chat-configure') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.chat.setApiKey' });
    } else if (action === 'chat-clear') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.chat.clearHistory' });
    } else if (action === 'capture-chibi') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.captureModelToChibi' });
    } else if (action === 'toggle-cursor-chibi') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.toggleCursorChase' });
    } else if (action === 'tune-cursor-chibi') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.tuneCursorChibi' });
    } else if (action === 'reset-position') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.resetPosition' });
    } else if (action === 'reset-workspace-model') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.resetWorkspaceModel' });
    }
  };

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    showBubble(t('bubbles.contextHint', 'Onii-chan cần em giúp gì hả~ em luôn sẵn sàng nè! 💕'));
    try { playAudio('help.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
    setExpression('shy', 2500);
    if (state.model) {
      try { state.model.motion('TapBody'); } catch (_) {
        try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
      }
    }
    createSparkle();
  }, true);

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    syncMuteMenuLabel(mainMenu);
    for (const id of Object.keys(submenus)) syncMuteMenuLabel(submenus[id]);
    closeContextMenus();
    mainMenu.classList.add('show');
    positionMenu(mainMenu, e.clientX, e.clientY);
  }, true);

  window.addEventListener('click', (e) => {
    if (allMenus.some((m) => m.contains(e.target))) return;
    closeContextMenus();
  }, true);

  mainMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.companion-menu-item');
    if (!item) return;
    const categoryId = item.getAttribute('data-category');
    if (categoryId) {
      openSubmenu(categoryId);
      return;
    }
    const action = item.getAttribute('data-action');
    if (!action) return;
    console.log('[AnimeCompanion] main menu action=' + action);
    handleMenuAction(action);
  });

  for (const cat of categories) {
    submenus[cat.id].addEventListener('click', (e) => {
      const item = e.target.closest('.companion-menu-item');
      if (!item) return;
      const action = item.getAttribute('data-action');
      if (!action) return;
      console.log('[AnimeCompanion] submenu ' + cat.id + ' action=' + action);
      handleMenuAction(action);
    });
  }
}

function syncMuteMenuLabel(menu) {
  const icon = menu.querySelector('.companion-mute-icon');
  const label = menu.querySelector('.companion-mute-label');
  if (!label || !icon) return;
  icon.textContent = window.__AUDIO_MUTED__ ? '🔊' : '🔇';
  label.textContent = window.__AUDIO_MUTED__
    ? t('menu.unmute', 'Unmute')
    : t('menu.mute', 'Mute');
}

function setupVoicePanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-voice-panel';
  panel.innerHTML = `
    <div class="companion-voice-title">${t('panels.voiceTitle', 'Voice')}</div>
    <button class="companion-voice-option" data-voice="ja">
      <span class="companion-voice-label">${t('panels.voiceJaLabel', 'Japanese')}</span>
      <span class="companion-voice-desc">${t('panels.voiceJaDesc', 'VoiceVox anime')}</span>
    </button>
    <button class="companion-voice-option" data-voice="vi">
      <span class="companion-voice-label">${t('panels.voiceViLabel', 'Tiếng Việt')}</span>
      <span class="companion-voice-desc">${t('panels.voiceViDesc', 'Google TTS')}</span>
    </button>
    <button class="companion-voice-option" data-voice="en">
      <span class="companion-voice-label">${t('panels.voiceEnLabel', 'English')}</span>
      <span class="companion-voice-desc">${t('panels.voiceEnDesc', 'Google TTS')}</span>
    </button>
  `;
  wrapper.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.companion-voice-option');
    if (!option) return;
    const voiceLanguage = option.getAttribute('data-voice');
    if (!voiceLanguage) return;

    panel.classList.remove('show');
    vscode.postMessage({ command: 'setVoiceLanguage', voiceLanguage });
  });

  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

function showVoicePanel() {
  const panel = document.querySelector('.companion-voice-panel');
  if (!panel) return;
  document.querySelector('.companion-model-panel')?.classList.remove('show');
  document.querySelector('.companion-message-panel')?.classList.remove('show');
  document.querySelector('.companion-ambient-panel')?.classList.remove('show');
  document.querySelector('.companion-motion-panel')?.classList.remove('show');

  const current = window.__VOICE_LANGUAGE__ || 'ja';
  panel.querySelectorAll('.companion-voice-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-voice') === current);
  });
  panel.classList.add('show');
}

function setupMessagePanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-message-panel';
  panel.innerHTML = `
    <div class="companion-message-title">${t('panels.messageTitle', 'Messages')}</div>
    <button class="companion-message-option" data-message-language="vi">
      <span class="companion-message-label">${t('panels.messageViLabel', 'Tiếng Việt')}</span>
      <span class="companion-message-desc">${t('panels.messageViDesc', 'Vietnamese bubble text')}</span>
    </button>
    <button class="companion-message-option" data-message-language="en">
      <span class="companion-message-label">${t('panels.messageEnLabel', 'English')}</span>
      <span class="companion-message-desc">${t('panels.messageEnDesc', 'English bubble text')}</span>
    </button>
    <button class="companion-message-option" data-message-language="ja">
      <span class="companion-message-label">${t('panels.messageJaLabel', '日本語')}</span>
      <span class="companion-message-desc">${t('panels.messageJaDesc', 'Japanese bubble text')}</span>
    </button>
  `;
  wrapper.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.companion-message-option');
    if (!option) return;
    const messageLanguage = option.getAttribute('data-message-language');
    if (!messageLanguage) return;

    window.__MESSAGE_LANGUAGE__ = messageLanguage;
    syncMessageLanguageDomState(messageLanguage);
    panel.classList.remove('show');
    vscode.postMessage({ command: 'setMessageLanguage', messageLanguage });
  });

  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

function showMessagePanel() {
  const panel = document.querySelector('.companion-message-panel');
  if (!panel) return;
  document.querySelector('.companion-voice-panel')?.classList.remove('show');
  document.querySelector('.companion-model-panel')?.classList.remove('show');
  document.querySelector('.companion-ambient-panel')?.classList.remove('show');
  document.querySelector('.companion-motion-panel')?.classList.remove('show');

  const current = window.__MESSAGE_LANGUAGE__ || 'vi';
  panel.querySelectorAll('.companion-message-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-message-language') === current);
  });
  panel.classList.add('show');
}

function setupAmbientPanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-ambient-panel';
  const tracks = Array.isArray(window.__AMBIENT_TRACKS__) ? window.__AMBIENT_TRACKS__ : [];
  panel.innerHTML = `
    <div class="companion-ambient-title">${t('panels.ambientTitle', 'Ambient')}</div>
    ${tracks.map((track) => `
      <button class="companion-ambient-option" data-ambient-preset="${escapeHtml(track.id)}">
        <span class="companion-ambient-label">${escapeHtml(track.label)}</span>
        <span class="companion-ambient-desc">${escapeHtml(track.description)}</span>
      </button>
    `).join('')}
    <div class="companion-ambient-footnote">${t('panels.ambientFootnote', 'Volume: <code>animeCompanion.ambientVolume</code> | custom files: <code>animeCompanion.customAmbientTracks</code>')}</div>
  `;
  wrapper.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.companion-ambient-option');
    if (!option) return;
    const preset = option.getAttribute('data-ambient-preset');
    if (!preset) return;

    panel.classList.remove('show');
    setAmbientPreset(preset);
    vscode.postMessage({ command: 'setAmbientPreset', preset });
  });

  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

function showAmbientPanel() {
  const panel = document.querySelector('.companion-ambient-panel');
  if (!panel) return;
  document.querySelector('.companion-voice-panel')?.classList.remove('show');
  document.querySelector('.companion-message-panel')?.classList.remove('show');
  document.querySelector('.companion-model-panel')?.classList.remove('show');
  document.querySelector('.companion-motion-panel')?.classList.remove('show');

  const current = window.__AMBIENT_PRESET__ || 'off';
  panel.querySelectorAll('.companion-ambient-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-ambient-preset') === current);
  });
  panel.classList.add('show');
}

function setupModelPanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-model-panel';
  // Source of truth is `window.__VISIBLE_MODELS__` injected by companion-view.ts.
  // The provider already merges built-in models with user-configured local
  // models, so the UI only needs the final display list.
  const models = Array.isArray(window.__VISIBLE_MODELS__) && window.__VISIBLE_MODELS__.length > 0
    ? window.__VISIBLE_MODELS__
    : [{ id: 'hiyori', name: 'Hiyori', description: 'Live2D Sample' }];
  const buttons = models.map((m) =>
    `<button class="companion-model-option" data-model="${escapeHtml(m.id)}">` +
    `<span class="companion-model-label">${escapeHtml(m.name)}</span>` +
    `<span class="companion-model-desc">${escapeHtml(m.description || '')}</span>` +
    `</button>`
  ).join('');
  panel.innerHTML = `
    <div class="companion-model-title">${t('panels.modelTitle', 'Model')}</div>
    ${buttons}
  `;
  wrapper.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.companion-model-option');
    if (!option) return;
    const modelId = option.getAttribute('data-model');
    if (!modelId) return;

    panel.classList.remove('show');
    vscode.postMessage({ command: 'setModel', modelId });
  });

  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

function showModelPanel() {
  const panel = document.querySelector('.companion-model-panel');
  if (!panel) return;
  document.querySelector('.companion-voice-panel')?.classList.remove('show');
  document.querySelector('.companion-message-panel')?.classList.remove('show');
  document.querySelector('.companion-ambient-panel')?.classList.remove('show');
  document.querySelector('.companion-motion-panel')?.classList.remove('show');

  const current = window.__MODEL_ID__ || 'hiyori';
  panel.querySelectorAll('.companion-model-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-model') === current);
  });
  panel.classList.add('show');
}

function setupMotionPanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-motion-panel';
  panel.innerHTML = `
    <div class="companion-motion-title">${t('panels.motionTitle', 'Motion')}</div>
    <button class="companion-motion-option" data-motion="TapBody"><span class="companion-motion-label">TapBody</span><span class="companion-motion-desc">${t('panels.motionTapBodyDesc', 'Body tap')}</span></button>
    <button class="companion-motion-option" data-motion="TapHead"><span class="companion-motion-label">TapHead</span><span class="companion-motion-desc">${t('panels.motionTapHeadDesc', 'Head pat')}</span></button>
    <button class="companion-motion-option" data-motion="Idle"><span class="companion-motion-label">Idle</span><span class="companion-motion-desc">${t('panels.motionIdleDesc', 'Default idle')}</span></button>
  `;
  wrapper.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.companion-motion-option');
    if (!option) return;
    const motionId = option.getAttribute('data-motion');
    if (!motionId) return;

    panel.classList.remove('show');
    if (state.model) {
      try {
        state.model.motion(motionId);
      } catch (err) {
        console.warn('[AnimeCompanion] motion failed:', err);
      }
    }
    createSparkle();
  });

  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

function showMotionPanel() {
  const panel = document.querySelector('.companion-motion-panel');
  if (!panel) return;
  document.querySelector('.companion-voice-panel')?.classList.remove('show');
  document.querySelector('.companion-message-panel')?.classList.remove('show');
  document.querySelector('.companion-ambient-panel')?.classList.remove('show');
  document.querySelector('.companion-model-panel')?.classList.remove('show');
  panel.classList.add('show');
}
