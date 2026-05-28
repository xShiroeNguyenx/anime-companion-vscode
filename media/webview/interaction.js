import { state, vscode, debugLog } from './core.js';
import { setExpression, updateExpressionTick } from './expression.js';
import { playAudio, setAmbientPreset, setGlobalAudioMuted } from './audio.js';
import {
  showBubble,
  createSparkle,
  showQuickChatPanel,
  startBubbleStream,
  startQuickChatHistoryTurn,
} from './ui.js';

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

function hideCompanionPanels() {
  document.querySelector('.companion-voice-panel')?.classList.remove('show');
  document.querySelector('.companion-message-panel')?.classList.remove('show');
  document.querySelector('.companion-ambient-panel')?.classList.remove('show');
  document.querySelector('.companion-model-panel')?.classList.remove('show');
  document.querySelector('.companion-achievements-panel')?.classList.remove('show');
  document.querySelector('.companion-motion-panel')?.classList.remove('show');
  document.querySelector('.companion-agent-panel')?.classList.remove('show');
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
  window.addEventListener('anime-companion:layoutchange', handleViewportChange);
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
  setupAchievementsPanel();
  setupMotionPanel();
  setupAgentPanel();
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
  const overlayScaleMultiplier = state.quickChatOverlayVisible ? 0.5 : 1;

  const previousX = state.model.x;
  const previousY = state.model.y;
  const previousScale = state.model.scale.x || 1;

  const scale = Math.min(availableWidth / modelWidth, availableHeight / modelHeight) * overlayScaleMultiplier;
  const scaledWidth = modelWidth * scale;
  const scaledHeight = modelHeight * scale;

  state.model.scale.set(scale);
  // Live2D canvas origin is top-left at (0,0). Center horizontally; pin the
  // canvas bottom edge inside `bottomPadding` so the feet never get clipped.
  state.model.x = (w - scaledWidth) / 2;
  state.model.y = h - bottomPadding - scaledHeight;
  wrapper.style.setProperty(
    '--quickchat-anchor-bottom',
    `${Math.max(bottomPadding + 12, h - state.model.y + 12)}px`
  );

  if (!Number.isFinite(state.model.x) || !Number.isFinite(state.model.y)) {
    state.model.scale.set(previousScale);
    state.model.position.set(previousX, previousY);
    debugLog('Fit fallback: restored previous transform because computed position was invalid');
    return;
  }

  debugLog(
    'Fit: scale=' + scale.toFixed(4) +
    ', model=' + modelWidth + 'x' + modelHeight +
    ', overlayScale=' + overlayScaleMultiplier.toFixed(2) +
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
    <div class="companion-menu-item" data-action="quests">
      <span style="font-size: 11px;">🗂️</span> ${t('menu.quests', 'Quests')}
    </div>
    <div class="companion-menu-item" data-action="stats">
      <span style="font-size: 11px;">📊</span> ${t('menu.stats', 'Stats')}
    </div>
    <div class="companion-menu-item" data-action="profile">
      <span style="font-size: 11px;">🪪</span> ${t('menu.profile', 'Profile')}
    </div>
    <div class="companion-menu-item" data-action="export-share-card">
      <span style="font-size: 11px;">🖼️</span> ${t('menu.shareCard', 'Share Card')}
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
    } else if (action === 'quests') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showQuests' });
    } else if (action === 'stats') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showStats' });
    } else if (action === 'profile') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showProfile' });
    } else if (action === 'export-share-card') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.exportShareCard' });
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
      items: isDesktop
        ? [
          { icon: '⚡', label: t('menu.chatQuick', 'Quick Chat'), action: 'chat-quick' },
        ]
        : [
          { icon: '⚡', label: t('menu.chatQuick', 'Quick Chat'),                 action: 'chat-quick' },
          { icon: '💬', label: t('menu.chatOpen', 'Open Chat'),                   action: 'chat-open' },
          { icon: '🆕', label: t('menu.chatNew', 'New Conversation'),             action: 'chat-new' },
          { icon: '📌', label: t('menu.chatAskSelection', 'Ask About Selection'), action: 'chat-ask-selection' },
          { icon: '🔑', label: t('menu.chatConfigure', 'Configure Provider'),     action: 'chat-configure' },
          { icon: '🗑️', label: t('menu.chatClear', 'Clear All'),                  action: 'chat-clear' },
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
        { icon: '🗂️', label: t('menu.quests', 'Quests'),                  action: 'quests' },
        { icon: '🪪', label: t('menu.profile', 'Profile'),                 action: 'profile' },
        { icon: '🖼️', label: t('menu.shareCard', 'Share Card'),            action: 'export-share-card' },
      ],
    },
    {
      id: 'agent',
      icon: '🪪',
      label: t('menu.agentCategory', 'Agent Profile'),
      items: [
        { icon: '👀', label: t('menu.agentList',   'Manage Profiles…'), action: 'agent-profile-panel' },
        { icon: '🔁', label: t('menu.agentSwitch', 'Quick Switch…'),    action: 'agent-profile-switch' },
        { icon: '💾', label: t('menu.agentSave',   'Save Current as…'), action: 'agent-profile-save' },
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
    } else if (action === 'quests') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showQuests' });
    } else if (action === 'stats') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showStats' });
    } else if (action === 'profile') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showProfile' });
    } else if (action === 'export-share-card') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.exportShareCard' });
    } else if (action === 'chat-quick') {
      openQuickChatOverlay();
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
    } else if (action === 'agent-profile-panel') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.agentProfile.showPanel' });
    } else if (action === 'agent-profile-switch') {
      showAgentSwitchPanel();
    } else if (action === 'agent-profile-save') {
      showAgentSavePanel();
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

function openQuickChatOverlay() {
  vscode.postMessage({ command: 'chat:snapshot' });
  showQuickChatPanel({
    onSubmit: (prompt) => {
      const requestId = 'qc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      startQuickChatHistoryTurn(requestId, prompt);
      startBubbleStream(t('bubbles.quickChatThinking', 'Em đang suy nghĩ chút nha~ 💭'));
      vscode.postMessage({
        command: 'pet:chat:request',
        requestId,
        prompt,
        maxTokens: 200,
      });
    },
    onCancel: () => {
      // No-op — if the user already submitted, cancel happens via the bubble
      // timer. Pre-submit cancel just hides the overlay (ui.js handles that).
    },
  });
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
  hideCompanionPanels();

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
  hideCompanionPanels();

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
  hideCompanionPanels();

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
  hideCompanionPanels();

  const current = window.__MODEL_ID__ || 'hiyori';
  panel.querySelectorAll('.companion-model-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-model') === current);
  });
  panel.classList.add('show');
}

// ─── Agent profile popup (Switch + Save) ─────────────────────────────────
function setupAgentPanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-agent-panel';
  wrapper.appendChild(panel);

  // Outside-click dismiss. The action handler (Save click) clears the panel
  // itself so we don't double-dispatch from the click bubbling up.
  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

function renderAgentSwitchHtml(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return `
      <div class="companion-agent-title">${t('panels.agentSwitchTitle', '🔁 Switch Account')}</div>
      <div class="companion-agent-empty">${t('panels.agentEmpty', 'No saved profiles yet. Save the current account first.')}</div>
    `;
  }

  // Group by tool, preserve insertion order.
  const groups = new Map();
  for (const p of profiles) {
    if (!groups.has(p.tool)) {
      groups.set(p.tool, { tool: p.tool, name: p.toolDisplayName, icon: p.toolIcon, items: [] });
    }
    groups.get(p.tool).items.push(p);
  }
  const sections = Array.from(groups.values()).map((g) => {
    const rows = g.items.map((p) => `
      <button class="companion-agent-option" data-id="${escapeHtml(p.id)}">
        <span class="companion-agent-mark">${p.active ? '✓' : ''}</span>
        <span class="companion-agent-row-main">
          <span class="companion-agent-name">${escapeHtml(p.name)}</span>
          <span class="companion-agent-meta">${escapeHtml(p.identityText || '')}</span>
        </span>
      </button>
    `).join('');
    return `
      <div class="companion-agent-section-header">${escapeHtml(g.icon)} ${escapeHtml(g.name)}</div>
      ${rows}
    `;
  }).join('');

  return `
    <div class="companion-agent-title">${t('panels.agentSwitchTitle', '🔁 Switch Account')}</div>
    ${sections}
  `;
}

function renderAgentSaveHtml(tools, selectedToolId) {
  const safeTools = Array.isArray(tools) ? tools : [];
  let toolSection = '';
  if (safeTools.length === 0) {
    toolSection = `<div class="companion-agent-empty">${t('panels.agentNoTool', 'No logged-in CLI detected.')}</div>`;
  } else if (safeTools.length === 1) {
    const tool = safeTools[0];
    toolSection = `
      <div class="companion-agent-tool-pill">
        ${escapeHtml(tool.icon || '🪪')} ${escapeHtml(tool.displayName)}
      </div>
    `;
  } else {
    toolSection = `
      <div class="companion-agent-section-header">${t('panels.agentPickTool', 'Pick a tool')}</div>
      <div class="companion-agent-tool-row">
        ${safeTools.map((tool) => `
          <button class="companion-agent-tool-btn ${tool.id === selectedToolId ? 'active' : ''}" data-tool="${escapeHtml(tool.id)}">
            ${escapeHtml(tool.icon || '🪪')} ${escapeHtml(tool.displayName)}
          </button>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="companion-agent-title">${t('panels.agentSaveTitle', '💾 Save Current Account')}</div>
    ${toolSection}
    <input type="text" class="companion-agent-name-input" maxlength="60"
      placeholder="${t('panels.agentNamePlaceholder', 'Profile name (e.g. tk1, work, personal)')}" />
    <div class="companion-agent-actions">
      <button class="companion-agent-btn secondary" data-act="cancel">${t('panels.agentCancel', 'Cancel')}</button>
      <button class="companion-agent-btn primary" data-act="save">${t('panels.agentSaveBtn', 'Save')}</button>
    </div>
  `;
}

function showAgentSwitchPanel() {
  const panel = document.querySelector('.companion-agent-panel');
  if (!panel) return;
  hideCompanionPanels();
  panel.innerHTML = `
    <div class="companion-agent-title">${t('panels.agentSwitchTitle', '🔁 Switch Account')}</div>
    <div class="companion-agent-loading">${t('panels.agentLoading', 'Loading…')}</div>
  `;
  panel.classList.add('show');

  // Switch panel actions — re-attach on each open since innerHTML is rebuilt.
  panel.onclick = (e) => {
    const btn = e.target.closest('.companion-agent-option');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;
    panel.classList.remove('show');
    vscode.postMessage({ command: 'agentProfile:use', id });
  };

  vscode.postMessage({ command: 'agentProfile:list:request' });
}

// Holds the most recently fetched available-tools list so the renderer can
// re-paint the save panel without round-tripping again.
let agentSaveTools = [];
let agentSaveSelectedToolId = null;

function bindAgentSavePanelHandlers(panel) {
  const input = panel.querySelector('.companion-agent-name-input');
  setTimeout(() => input?.focus(), 30);

  const submit = () => {
    const value = (input?.value || '').trim();
    if (!value) return;
    if (agentSaveTools.length > 1 && !agentSaveSelectedToolId) return; // require tool pick
    panel.classList.remove('show');
    vscode.postMessage({
      command: 'agentProfile:save',
      name: value,
      toolId: agentSaveSelectedToolId || (agentSaveTools[0] && agentSaveTools[0].id) || undefined,
    });
  };
  const cancel = () => { panel.classList.remove('show'); };

  panel.onclick = (e) => {
    const toolBtn = e.target.closest('.companion-agent-tool-btn');
    if (toolBtn) {
      agentSaveSelectedToolId = toolBtn.getAttribute('data-tool');
      panel.querySelectorAll('.companion-agent-tool-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-tool') === agentSaveSelectedToolId);
      });
      return;
    }
    const btn = e.target.closest('.companion-agent-btn');
    if (!btn) return;
    if (btn.getAttribute('data-act') === 'save') submit();
    else cancel();
  };
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function showAgentSavePanel() {
  const panel = document.querySelector('.companion-agent-panel');
  if (!panel) return;
  hideCompanionPanels();
  agentSaveTools = [];
  agentSaveSelectedToolId = null;
  panel.innerHTML = `
    <div class="companion-agent-title">${t('panels.agentSaveTitle', '💾 Save Current Account')}</div>
    <div class="companion-agent-loading">${t('panels.agentLoading', 'Loading…')}</div>
  `;
  panel.classList.add('show');
  vscode.postMessage({ command: 'agentProfile:availableTools:request' });
}

// Called by main.js when host pushes available CLI tools. Repaints the open
// save panel with inline tool buttons (or auto-picks if only one).
export function renderAgentAvailableTools(tools) {
  const panel = document.querySelector('.companion-agent-panel');
  if (!panel || !panel.classList.contains('show')) return;
  agentSaveTools = Array.isArray(tools) ? tools : [];
  agentSaveSelectedToolId = agentSaveTools.length === 1 ? agentSaveTools[0].id : null;
  panel.innerHTML = renderAgentSaveHtml(agentSaveTools, agentSaveSelectedToolId);
  bindAgentSavePanelHandlers(panel);
}

// Called by main.js when the host pushes the profile list after a
// `agentProfile:list:request`. The switch popup must already be visible.
export function renderAgentProfileList(profiles) {
  const panel = document.querySelector('.companion-agent-panel');
  if (!panel || !panel.classList.contains('show')) return;
  panel.innerHTML = renderAgentSwitchHtml(profiles);
}

const SHOWCASE_RARITY_ICON = {
  common: '✨',
  rare: '💎',
  epic: '🌟',
  legendary: '👑',
  mythic: '🔥',
};

function renderShowcaseButton(item) {
  if (!item || !item.unlocked) return '';
  const active = item.isShowcased ? 'active' : '';
  const label = item.isShowcased
    ? t('panels.showcaseActive', '★ Showcasing')
    : t('panels.showcaseBtn', '☆ Showcase');
  const titleAttr = item.isShowcased
    ? t('panels.showcaseActiveHint', 'Click to stop showcasing')
    : t('panels.showcaseHint', 'Showcase this achievement in the panel header');
  return `<button type="button"
    class="companion-achievement-showcase-btn ${active}"
    data-achievement-id="${escapeHtml(item.id || '')}"
    data-active="${item.isShowcased ? '1' : '0'}"
    title="${escapeHtml(titleAttr)}">${escapeHtml(label)}</button>`;
}

export function applyShowcaseBanner(showcase) {
  window.__SHOWCASE__ = showcase || null;
  const banner = document.getElementById('companion-showcase-banner');
  if (!banner) return;
  if (!showcase || typeof showcase !== 'object') {
    banner.className = 'companion-showcase hidden';
    banner.innerHTML = '';
    return;
  }
  const rarity = String(showcase.rarity || 'common').toLowerCase();
  const icon = SHOWCASE_RARITY_ICON[rarity] || '✨';
  banner.className = `companion-showcase rarity-${rarity}`;
  banner.innerHTML = `
    <span class="companion-showcase-icon">${icon}</span>
    <span class="companion-showcase-title">${escapeHtml(showcase.title || '')}</span>
    <span class="companion-showcase-rarity">${escapeHtml(String(showcase.rarityLabel || rarity).toUpperCase())}</span>
    ${rarity === 'mythic' ? '<span class="companion-showcase-particles" aria-hidden="true"></span>' : ''}
  `;
}

function attachShowcaseHandlers(panel) {
  panel.querySelectorAll('.companion-achievement-showcase-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = btn.getAttribute('data-achievement-id') || '';
      const active = btn.getAttribute('data-active') === '1';
      const next = active ? null : id;
      vscode.postMessage({ command: 'setShowcaseAchievement', id: next });
    });
  });
}

function renderAchievementsPanel(panel) {
  const data = window.__ACHIEVEMENTS__ && typeof window.__ACHIEVEMENTS__ === 'object'
    ? window.__ACHIEVEMENTS__
    : { summary: { unlocked: 0, total: 0, secretUnlocked: 0, secretTotal: 0, dailyCompleted: 0, dailyTotal: 0, weeklyCompleted: 0, weeklyTotal: 0 }, chains: [], secrets: [], quests: { daily: [], weekly: [] }, memories: [] };
  const summary = data.summary || { unlocked: 0, total: 0, secretUnlocked: 0, secretTotal: 0, dailyCompleted: 0, dailyTotal: 0, weeklyCompleted: 0, weeklyTotal: 0 };
  const chains = Array.isArray(data.chains) ? data.chains : [];
  const secrets = Array.isArray(data.secrets) ? data.secrets : [];
  const quests = data.quests && typeof data.quests === 'object' ? data.quests : { daily: [], weekly: [] };
  const memories = Array.isArray(data.memories) ? data.memories : [];

  const chainHtml = chains.map((chain) => {
    const nodes = Array.isArray(chain.nodes) ? chain.nodes : [];
    const nodesHtml = nodes.map((item) => {
      const stateClass = item.unlocked ? 'unlocked' : 'locked';
      const rarityClass = `rarity-${String(item.rarity || 'common').toLowerCase()}`;
      const showcaseClass = item.isShowcased ? 'showcased' : '';
      return `
        <div class="companion-achievement-node ${stateClass} ${rarityClass} ${showcaseClass}">
          <span class="companion-achievement-tier">Tier ${escapeHtml(item.tier || 0)}</span>
          <span class="companion-achievement-rarity">${escapeHtml(item.rarityLabel || '')}</span>
          <span class="companion-achievement-label">${escapeHtml(item.title || '')}</span>
          <span class="companion-achievement-desc">${escapeHtml(item.description || '')}</span>
          <span class="companion-achievement-status">${escapeHtml(item.statusText || '')}</span>
          ${renderShowcaseButton(item)}
        </div>
      `;
    }).join('');

    return `
      <section class="companion-achievement-chain">
        <div class="companion-achievement-chain-header">
          <span class="companion-achievement-chain-title">${escapeHtml(chain.title || '')}</span>
          <span class="companion-achievement-chain-progress">${escapeHtml(chain.unlockedCount || 0)}/${escapeHtml(chain.totalCount || 0)}</span>
        </div>
        <div class="companion-achievement-lane">${nodesHtml}</div>
      </section>
    `;
  }).join('');

  const secretHtml = secrets.map((item) => {
    const stateClass = item.unlocked ? 'unlocked' : 'locked secret';
    const rarityClass = `rarity-${String(item.rarity || 'mythic').toLowerCase()}`;
    const showcaseClass = item.isShowcased ? 'showcased' : '';
    return `
      <div class="companion-achievement-option ${stateClass} ${rarityClass} ${showcaseClass}">
        <span class="companion-achievement-rarity">${escapeHtml(item.rarityLabel || '')}</span>
        <span class="companion-achievement-label">${escapeHtml(item.title || '')}</span>
        <span class="companion-achievement-desc">${escapeHtml(item.description || '')}</span>
        <span class="companion-achievement-status">${escapeHtml(item.statusText || '')}</span>
        ${renderShowcaseButton(item)}
      </div>
    `;
  }).join('');

  const renderQuestList = (items, periodLabel) => items.map((item) => `
    <div class="companion-quest-card ${item.completed ? 'completed' : 'active'}">
      <span class="companion-quest-period">${escapeHtml(periodLabel)}</span>
      <span class="companion-achievement-label">${escapeHtml(item.title || '')}</span>
      <span class="companion-achievement-desc">${escapeHtml(item.description || '')}</span>
      <span class="companion-achievement-status">${escapeHtml(item.statusText || '')}</span>
    </div>
  `).join('');

  const dailyHtml = renderQuestList(Array.isArray(quests.daily) ? quests.daily : [], t('panels.questsDaily', 'Daily'));
  const weeklyHtml = renderQuestList(Array.isArray(quests.weekly) ? quests.weekly : [], t('panels.questsWeekly', 'Weekly'));
  const memoryHtml = memories.map((memory) => `
    <div class="companion-memory-card">
      <span class="companion-achievement-desc">${escapeHtml(memory.text || '')}</span>
    </div>
  `).join('');

  panel.innerHTML = `
    <div class="companion-achievements-title">
      ${t('panels.achievementsTitle', 'Achievements')} (${summary.unlocked || 0}/${summary.total || 0})
    </div>
    <section class="companion-achievement-chain">
      <div class="companion-achievement-chain-header">
        <span class="companion-achievement-chain-title">${t('panels.questsTitle', 'Quests')}</span>
        <span class="companion-achievement-chain-progress">${summary.dailyCompleted || 0}/${summary.dailyTotal || 0} · ${summary.weeklyCompleted || 0}/${summary.weeklyTotal || 0}</span>
      </div>
      <div class="companion-quest-list">
        ${dailyHtml}
        ${weeklyHtml}
      </div>
    </section>
    ${chainHtml || `<div class="companion-achievement-empty">${t('panels.achievementsEmpty', 'No achievements yet.')}</div>`}
    <section class="companion-achievement-chain companion-achievement-secret-lane">
      <div class="companion-achievement-chain-header">
        <span class="companion-achievement-chain-title">${t('panels.achievementsSecretTitle', 'Secret Achievements')}</span>
        <span class="companion-achievement-chain-progress">${summary.secretUnlocked || 0}/${summary.secretTotal || 0}</span>
      </div>
      <div class="companion-achievement-secret-list">
        ${secretHtml || `<div class="companion-achievement-empty">${t('panels.achievementsEmpty', 'No achievements yet.')}</div>`}
      </div>
    </section>
    <section class="companion-achievement-chain companion-achievement-memory-lane">
      <div class="companion-achievement-chain-header">
        <span class="companion-achievement-chain-title">${t('panels.memoriesTitle', 'Memories')}</span>
        <span class="companion-achievement-chain-progress">${memories.length || 0}</span>
      </div>
      <div class="companion-memory-list">
        ${memoryHtml || `<div class="companion-achievement-empty">${t('panels.memoriesEmpty', 'No memories yet.')}</div>`}
      </div>
    </section>
  `;

  attachShowcaseHandlers(panel);
}

function setupAchievementsPanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-achievements-panel';
  renderAchievementsPanel(panel);
  wrapper.appendChild(panel);
  applyShowcaseBanner(window.__SHOWCASE__ || null);

  window.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) {
      panel.classList.remove('show');
    }
  }, true);
}

export function updateAchievementsPanelData(achievements) {
  window.__ACHIEVEMENTS__ = achievements && typeof achievements === 'object'
    ? achievements
    : { summary: { unlocked: 0, total: 0, secretUnlocked: 0, secretTotal: 0, dailyCompleted: 0, dailyTotal: 0, weeklyCompleted: 0, weeklyTotal: 0 }, chains: [], secrets: [], quests: { daily: [], weekly: [] }, memories: [] };
  if (achievements && typeof achievements === 'object' && 'showcase' in achievements) {
    applyShowcaseBanner(achievements.showcase || null);
  }
  const panel = document.querySelector('.companion-achievements-panel');
  if (!panel) return;
  renderAchievementsPanel(panel);
}

export function showAchievementsPanel() {
  const panel = document.querySelector('.companion-achievements-panel');
  if (!panel) return;
  renderAchievementsPanel(panel);
  hideCompanionPanels();
  panel.classList.add('show');
}

let achievementToast = null;
let achievementToastTimer = null;

export function showAchievementUnlockEffect(payload) {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;
  if (!achievementToast) {
    achievementToast = document.createElement('div');
    achievementToast.className = 'companion-achievement-toast';
    wrapper.appendChild(achievementToast);
  }

  const rarity = String(payload?.achievement?.rarity || payload?.quest?.rarity || 'rare').toLowerCase();
  const title = payload?.achievement?.title || payload?.quest?.title || 'Unlocked';
  const kicker = payload?.achievement
    ? `${payload.achievement.secret ? 'Secret' : 'Achievement'} • ${payload.achievement.rarity || ''}`
    : `${payload?.quest?.period === 'weekly' ? 'Weekly' : 'Daily'} Quest`;

  achievementToast.className = `companion-achievement-toast show rarity-${rarity}`;
  achievementToast.innerHTML = `
    <span class="companion-achievement-toast-kicker">${escapeHtml(kicker)}</span>
    <span class="companion-achievement-toast-title">${escapeHtml(title)}</span>
  `;

  const sparkleCount = ({
    common: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    mythic: 6
  })[rarity] || 3;
  for (let i = 0; i < sparkleCount; i += 1) {
    createSparkle();
  }

  if (achievementToastTimer) clearTimeout(achievementToastTimer);
  achievementToastTimer = setTimeout(() => {
    achievementToast?.classList.remove('show');
  }, 2600);
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    if (ctx.measureText(probe).width <= maxWidth) {
      current = probe;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  const visibleLines = typeof maxLines === 'number' ? lines.slice(0, maxLines) : lines;
  visibleLines.forEach((line, index) => {
    const isLastTrimmed = typeof maxLines === 'number' && index === visibleLines.length - 1 && lines.length > visibleLines.length;
    const rendered = isLastTrimmed ? `${line}…` : line;
    ctx.fillText(rendered, x, y + (index * lineHeight));
  });
}

function drawStatPill(ctx, label, value, x, y, width) {
  fillRoundedRect(ctx, x, y, width, 54, 18, 'rgba(255,255,255,0.16)');
  ctx.fillStyle = '#ffe8f2';
  ctx.font = '600 18px Segoe UI';
  ctx.fillText(label, x + 16, y + 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 26px Segoe UI';
  ctx.fillText(String(value), x + 16, y + 42);
}

const RARITY_PALETTE = {
  common:    { fill: '#cfd8e8', glow: 'rgba(207,216,232,0.55)' },
  rare:      { fill: '#7ad7ff', glow: 'rgba(122,215,255,0.65)' },
  epic:      { fill: '#c08cff', glow: 'rgba(192,140,255,0.7)' },
  legendary: { fill: '#ffd166', glow: 'rgba(255,209,102,0.75)' },
  mythic:    { fill: '#ff6fa5', glow: 'rgba(255,111,165,0.85)' },
};

function drawTitleFx(ctx, text, x, y) {
  ctx.save();
  ctx.font = '900 64px Segoe UI';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(text);
  const width = metrics.width;

  // Holographic shimmer offsets
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#3df4ff';
  ctx.fillText(text, x - 3, y);
  ctx.fillStyle = '#ff4dd1';
  ctx.fillText(text, x + 3, y);

  // Outer glow
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'rgba(255,128,210,0.85)';
  ctx.shadowBlur = 28;
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.strokeText(text, x, y);

  // Gradient fill
  ctx.shadowBlur = 0;
  const grad = ctx.createLinearGradient(x, y - 56, x + width, y);
  grad.addColorStop(0, '#fff6c8');
  grad.addColorStop(0.5, '#ff9ad6');
  grad.addColorStop(1, '#7dd5ff');
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);

  // Sparkles around the title
  const sparkleCount = 8;
  for (let i = 0; i < sparkleCount; i++) {
    const sx = x + (width + 40) * Math.random() - 20;
    const sy = y - 70 + Math.random() * 80;
    const r = 1.5 + Math.random() * 3.5;
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    ctx.fillStyle = i % 2 ? '#fff7c2' : '#bdf3ff';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFeaturedAchievement(ctx, featured, x, y, width, height) {
  fillRoundedRect(ctx, x, y, width, height, 28, 'rgba(255,255,255,0.13)');
  if (!featured) {
    ctx.fillStyle = '#ffd7e7';
    ctx.font = '700 20px Segoe UI';
    ctx.fillText('Top achievement', x + 24, y + 36);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Segoe UI';
    drawWrappedText(ctx, 'No major title yet', x + 24, y + 78, width - 48, 36, 2);
    return;
  }
  const palette = RARITY_PALETTE[featured.rarity] || RARITY_PALETTE.common;

  fillRoundedRect(ctx, x + 16, y + 16, 96, 28, 14, palette.glow);
  ctx.fillStyle = '#15182a';
  ctx.font = '800 16px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(String(featured.rarity || 'common').toUpperCase(), x + 64, y + 35);
  ctx.textAlign = 'start';

  ctx.fillStyle = '#ffd7e7';
  ctx.font = '700 18px Segoe UI';
  ctx.fillText('Featured achievement', x + 128, y + 36);

  ctx.save();
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = palette.fill;
  ctx.font = '900 30px Segoe UI';
  drawWrappedText(ctx, featured.title || 'Untitled', x + 24, y + 86, width - 48, 34, 2);
  ctx.restore();

  if (featured.description) {
    ctx.fillStyle = '#ffeef6';
    ctx.font = '500 18px Segoe UI';
    drawWrappedText(ctx, featured.description, x + 24, y + 156, width - 48, 24, 2);
  }
}

function renderShareCardCanvas(profile, featured) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#1f2747');
  gradient.addColorStop(0.55, '#633a63');
  gradient.addColorStop(1, '#f17cab');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  fillRoundedRect(ctx, 42, 42, 1116, 546, 34, 'rgba(16, 22, 46, 0.26)');
  fillRoundedRect(ctx, 62, 62, 1076, 506, 30, 'rgba(255,255,255,0.08)');

  ctx.fillStyle = '#ffd9e8';
  ctx.font = '700 22px Segoe UI';
  ctx.fillText((profile.companionName || 'Companion') + '  •  Profile', 92, 110);

  drawTitleFx(ctx, 'Anime Companion', 92, 170);

  ctx.fillStyle = '#ffeef6';
  ctx.font = '700 26px Segoe UI';
  ctx.fillText(profile.title || 'Fresh Pair', 92, 210);

  fillRoundedRect(ctx, 92, 240, 268, 92, 24, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = '#ffd7e7';
  ctx.font = '700 20px Segoe UI';
  ctx.fillText('Affinity', 116, 274);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 42px Segoe UI';
  ctx.fillText(`${profile.affinityPercent || 0}%`, 116, 316);

  fillRoundedRect(ctx, 380, 240, 240, 92, 24, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = '#ffd7e7';
  ctx.font = '700 20px Segoe UI';
  ctx.fillText('Level', 404, 274);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 42px Segoe UI';
  ctx.fillText(`Lv.${profile.level || 1}`, 404, 316);

  drawFeaturedAchievement(ctx, featured, 92, 362, 528, 182);

  drawStatPill(ctx, 'Achievements', `${profile.achievementUnlocked || 0}/${profile.achievementTotal || 0}`, 660, 110, 196);
  drawStatPill(ctx, 'Daily quests', profile.dailyQuestCompleted || 0, 880, 110, 196);
  drawStatPill(ctx, 'Weekly quests', profile.weeklyQuestCompleted || 0, 660, 182, 196);
  drawStatPill(ctx, 'Memories', profile.summary?.memories || 0, 880, 182, 196);
  drawStatPill(ctx, 'Gems', profile.inventory?.gems || 0, 660, 254, 196);
  drawStatPill(ctx, 'Tickets', profile.inventory?.tickets || 0, 880, 254, 196);

  fillRoundedRect(ctx, 660, 326, 438, 218, 28, 'rgba(255,255,255,0.13)');
  ctx.fillStyle = '#ffd7e7';
  ctx.font = '700 20px Segoe UI';
  ctx.fillText('Unlocks', 684, 362);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px Segoe UI';
  const cosmetics = Array.isArray(profile.inventory?.cosmetics) && profile.inventory.cosmetics.length
    ? profile.inventory.cosmetics.join(', ')
    : 'No cosmetics unlocked yet';
  const voicePacks = Array.isArray(profile.inventory?.voicePacks) && profile.inventory.voicePacks.length
    ? profile.inventory.voicePacks.join(', ')
    : 'No voice packs unlocked yet';
  drawWrappedText(ctx, `Cosmetics: ${cosmetics}`, 684, 398, 390, 26, 3);
  drawWrappedText(ctx, `Voice packs: ${voicePacks}`, 684, 482, 390, 26, 2);

  ctx.fillStyle = '#ffeef6';
  ctx.font = '700 18px Segoe UI';
  ctx.fillText(`Exported ${new Date(profile.exportedAt || Date.now()).toLocaleDateString()}`, 92, 580);

  return canvas;
}

let _shareCardState = null;

function _canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas.toBlob returned null.'));
    }, 'image/png');
  });
}

function _pickInitialFeatured(profile) {
  const list = Array.isArray(profile.unlockedAchievements) ? profile.unlockedAchievements : [];
  if (!list.length) return null;
  if (profile.topAchievementId) {
    const match = list.find((item) => item.id === profile.topAchievementId);
    if (match) return match;
  }
  return list[0];
}

function _refreshShareCardPreview() {
  if (!_shareCardState) return;
  const { profile, featuredId, previewImg, canvasHolder } = _shareCardState;
  const list = Array.isArray(profile.unlockedAchievements) ? profile.unlockedAchievements : [];
  const featured = list.find((item) => item.id === featuredId) || null;
  const canvas = renderShareCardCanvas(profile, featured);
  _shareCardState.canvas = canvas;
  if (previewImg) {
    previewImg.src = canvas.toDataURL('image/png');
  }
  if (canvasHolder && !previewImg) {
    canvasHolder.innerHTML = '';
    canvasHolder.appendChild(canvas);
  }
}

function _closeShareCardModal() {
  if (!_shareCardState) return;
  const { backdrop, keyHandler } = _shareCardState;
  document.removeEventListener('keydown', keyHandler, true);
  backdrop?.remove();
  _shareCardState = null;
}

function _setShareCardStatus(text, kind) {
  if (!_shareCardState?.statusEl) return;
  _shareCardState.statusEl.textContent = text || '';
  _shareCardState.statusEl.dataset.kind = kind || '';
}

export function openShareCardPreview(profile) {
  _closeShareCardModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'share-card-backdrop';
  backdrop.innerHTML = `
    <div class="share-card-modal" role="dialog" aria-modal="true" aria-label="${t('shareCard.title', 'Share card preview')}">
      <div class="share-card-header">
        <span class="share-card-title">${t('shareCard.title', 'Share card preview')}</span>
        <button type="button" class="share-card-close" aria-label="${t('shareCard.close', 'Close')}">×</button>
      </div>
      <div class="share-card-body">
        <div class="share-card-preview"><img class="share-card-preview-img" alt="share card preview" /></div>
        <div class="share-card-controls">
          <label class="share-card-label">${t('shareCard.featuredLabel', 'Featured achievement')}</label>
          <select class="share-card-picker"></select>
          <div class="share-card-actions">
            <button type="button" class="share-card-btn share-card-btn-copy">${t('shareCard.copy', '📋 Copy image')}</button>
            <button type="button" class="share-card-btn share-card-btn-save">${t('shareCard.save', '💾 Save as PNG…')}</button>
            <button type="button" class="share-card-btn share-card-btn-cancel">${t('shareCard.close', 'Close')}</button>
          </div>
          <div class="share-card-status" role="status"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const picker = backdrop.querySelector('.share-card-picker');
  const previewImg = backdrop.querySelector('.share-card-preview-img');
  const statusEl = backdrop.querySelector('.share-card-status');

  const unlocked = Array.isArray(profile.unlockedAchievements) ? profile.unlockedAchievements : [];
  if (!unlocked.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('shareCard.noneUnlocked', 'No achievement unlocked yet');
    picker.appendChild(opt);
    picker.disabled = true;
  } else {
    for (const ach of unlocked) {
      const opt = document.createElement('option');
      opt.value = ach.id;
      opt.textContent = `${String(ach.rarity || 'common').toUpperCase()} · ${ach.title}`;
      picker.appendChild(opt);
    }
  }

  const initialFeatured = _pickInitialFeatured(profile);
  const initialFeaturedId = initialFeatured ? initialFeatured.id : '';
  if (initialFeaturedId) picker.value = initialFeaturedId;

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      _closeShareCardModal();
    }
  };
  document.addEventListener('keydown', keyHandler, true);

  _shareCardState = {
    profile,
    featuredId: initialFeaturedId,
    backdrop,
    previewImg,
    canvasHolder: null,
    canvas: null,
    statusEl,
    keyHandler,
    pendingSaveRequestId: null,
  };

  picker.addEventListener('change', () => {
    if (!_shareCardState) return;
    _shareCardState.featuredId = picker.value;
    _refreshShareCardPreview();
  });

  backdrop.querySelector('.share-card-close').addEventListener('click', _closeShareCardModal);
  backdrop.querySelector('.share-card-btn-cancel').addEventListener('click', _closeShareCardModal);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) _closeShareCardModal();
  });

  backdrop.querySelector('.share-card-btn-copy').addEventListener('click', async () => {
    if (!_shareCardState?.canvas) return;
    _setShareCardStatus(t('shareCard.copying', 'Copying…'), 'pending');
    try {
      const blob = await _canvasToBlob(_shareCardState.canvas);
      if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
        throw new Error('Clipboard image write is not supported in this environment.');
      }
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      _setShareCardStatus(t('shareCard.copied', '✓ Copied to clipboard'), 'success');
      vscode.postMessage({ command: 'shareCardCopied' });
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      _setShareCardStatus(t('shareCard.copyFailed', 'Copy failed: ') + reason, 'error');
      vscode.postMessage({ command: 'shareCardCopyFailed', reason });
    }
  });

  backdrop.querySelector('.share-card-btn-save').addEventListener('click', () => {
    if (!_shareCardState?.canvas) return;
    const requestId = `share-card-save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    _shareCardState.pendingSaveRequestId = requestId;
    _setShareCardStatus(t('shareCard.saving', 'Opening save dialog…'), 'pending');
    vscode.postMessage({
      command: 'shareCardRequestSave',
      requestId,
      dataUrl: _shareCardState.canvas.toDataURL('image/png'),
    });
  });

  _refreshShareCardPreview();
}

export function receiveShareCardSaveResult(payload) {
  if (!_shareCardState) return;
  if (payload?.requestId && payload.requestId !== _shareCardState.pendingSaveRequestId) return;
  _shareCardState.pendingSaveRequestId = null;
  if (payload?.ok) {
    _setShareCardStatus(t('shareCard.saved', '✓ Saved'), 'success');
  } else if (payload?.cancelled) {
    _setShareCardStatus('', '');
  } else {
    _setShareCardStatus(
      t('shareCard.saveFailed', 'Save failed: ') + String(payload?.error || 'unknown error'),
      'error'
    );
  }
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
  hideCompanionPanels();
  panel.classList.add('show');
}
