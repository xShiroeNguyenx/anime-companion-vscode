import { state, vscode, debugLog } from './core.js';
import { setExpression, updateExpressionTick } from './expression.js';
import { playAudio } from './audio.js';
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

const DBLCLICK_MESSAGES = [
  'Kyaa~ combo đẹp ghê luôn á! ✨',
  'Double tap nhanh quá~ tim em lỡ nhịp luôn nè! 💖',
];

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

  state.model.on('pointerdown', (e) => {
    const btn = e?.data?.button ?? e?.data?.originalEvent?.button;
    if (btn === 2) return;
    if (isCooldown) return;
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

      showBubble('Ehehe~ vuốt đầu dịu dàng quá đi~ 😊');
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
        showBubble('Eee đừng chọc liên tục nữa mà~ em chóng mặt mất! 😵');
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
        showBubble('Eh~ chạm nhẹ vậy làm em giật mình đó nha! 🥺');
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
  if (wrapper) {
    const resizeObserver = new ResizeObserver(() => fitModel());
    resizeObserver.observe(wrapper);
  }

  state.app.ticker.add(() => updateExpressionTick());
  debugLog('Expression system started');

  setupContextMenu();
  setupVoicePanel();
  setupMessagePanel();
  setupModelPanel();
  setupMotionPanel();
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

  const internal = state.model.internalModel;
  const originalWidth = internal ? (internal.originalWidth || internal.width || 1) : 1;
  const originalHeight = internal ? (internal.originalHeight || internal.height || 1) : 1;

  const scaleX = w / originalWidth;
  const scaleY = h / originalHeight;
  const scale = Math.min(scaleX, scaleY) * 0.9;

  state.model.scale.set(scale);
  state.model.x = w / 2;
  state.model.y = h;
  state.model.anchor.set(0.5, 1.0);

  debugLog('Fit: scale=' + scale.toFixed(4) + ', pos=(' + state.model.x + ',' + state.model.y + ')');
}

function setupContextMenu() {
  const menu = document.createElement('div');
  menu.className = 'companion-context-menu';
  menu.innerHTML = `
    <div class="companion-menu-item" data-action="start-server">
      <span style="font-size: 11px;">🚀</span> Run
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="commit">
      <span style="font-size: 11px;">📦</span> Commit
    </div>
    <div class="companion-menu-item" data-action="pull">
      <span style="font-size: 11px;">⬇️</span> Pull
    </div>
    <div class="companion-menu-item" data-action="push">
      <span style="font-size: 11px;">⬆️</span> Push
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="change-model">
      <span style="font-size: 11px;">🌸</span> Model
    </div>
    <div class="companion-menu-item" data-action="change-voice">
      <span style="font-size: 11px;">🗣️</span> Voice
    </div>
    <div class="companion-menu-item" data-action="change-message-language">
      <span style="font-size: 11px;">💬</span> Messages
    </div>
    <div class="companion-menu-item" data-action="toggle-mute">
      <span class="companion-mute-icon" style="font-size: 11px;">🔇</span> <span class="companion-mute-label">Mute</span>
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="poke">
      <span style="font-size: 11px;">👉</span> Poke
    </div>
    <div class="companion-menu-item" data-action="play-motion">
      <span style="font-size: 11px;">🎬</span> Motion
    </div>
    <div class="companion-menu-item" data-action="pomodoro">
      <span style="font-size: 11px;">🍅</span> Pomodoro
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="achievements">
      <span style="font-size: 11px;">🏆</span> Achievements
    </div>
    <div class="companion-menu-item" data-action="stats">
      <span style="font-size: 11px;">📊</span> Stats
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="settings">
      <span style="font-size: 11px;">⚙️</span> Settings
    </div>
  `;
  document.body.appendChild(menu);

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    showBubble('Onii-chan cần em giúp gì hả~ em luôn sẵn sàng nè! 💕');
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
      showBubble('Để em khởi động lại cho Onii-chan liền nha~ 🚀');
      try { playAudio('server.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.runProject' });
    } else if (action === 'commit') {
      showBubble('Commit gọn gàng một cái cho xinh nha~ ✨');
      vscode.postMessage({ command: 'runCommand', action: 'git.commit' });
    } else if (action === 'pull') {
      showBubble('Mình kéo code mới về thôi nào~ 📦');
      vscode.postMessage({ command: 'runCommand', action: 'git.pull' });
    } else if (action === 'push') {
      showBubble('Push code lên remote cho an tâm nha~ ☁️');
      vscode.postMessage({ command: 'runCommand', action: 'git.push' });
    } else if (action === 'pomodoro') {
      showBubble('Bắt đầu Pomodoro nha~ em canh giờ giúp Onii-chan! 🍅');
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.startPomodoro' });
    } else if (action === 'poke') {
      if (state.model) { try { state.model.motion('TapBody'); } catch (_) { /* ignore */ } }
      vscode.postMessage({ command: 'poke' });
    } else if (action === 'change-model') {
      showBubble('Đổi model ngay trên companion luôn nha~ 🌸');
      showModelPanel();
    } else if (action === 'change-voice') {
      showBubble('Đổi giọng dễ thương hơn một chút nha~ 🗣️');
      showVoicePanel();
    } else if (action === 'change-message-language') {
      showBubble('Đổi ngôn ngữ chữ nha~ em sẽ nói kiểu khác đó! 💬');
      showMessagePanel();
    } else if (action === 'toggle-mute') {
      const nextMuted = !window.__AUDIO_MUTED__;
      window.__AUDIO_MUTED__ = nextMuted;
      showBubble(nextMuted ? 'Em sẽ im lặng một chút nha~ 🤫' : 'Em ríu rít lại rồi nè~ 🎀');
      vscode.postMessage({ command: 'setMuted', muted: nextMuted });
    } else if (action === 'settings') {
      showBubble('Mở Settings ra cho Onii-chan liền nha~ ⚙️');
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.openSettings' });
    } else if (action === 'play-motion') {
      showBubble('Chọn motion cho em diễn nha~ 🎬');
      showMotionPanel();
    } else if (action === 'achievements') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showAchievements' });
    } else if (action === 'stats') {
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.showStats' });
    }
  });
}

function syncMuteMenuLabel(menu) {
  const icon = menu.querySelector('.companion-mute-icon');
  const label = menu.querySelector('.companion-mute-label');
  if (!label || !icon) return;
  icon.textContent = window.__AUDIO_MUTED__ ? '🔊' : '🔇';
  label.textContent = window.__AUDIO_MUTED__ ? 'Unmute' : 'Mute';
}

function setupVoicePanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-voice-panel';
  panel.innerHTML = `
    <div class="companion-voice-title">Voice</div>
    <button class="companion-voice-option" data-voice="ja">
      <span class="companion-voice-label">Japanese</span>
      <span class="companion-voice-desc">VoiceVox anime</span>
    </button>
    <button class="companion-voice-option" data-voice="vi">
      <span class="companion-voice-label">Tiếng Việt</span>
      <span class="companion-voice-desc">Google TTS</span>
    </button>
    <button class="companion-voice-option" data-voice="en">
      <span class="companion-voice-label">English</span>
      <span class="companion-voice-desc">Google TTS</span>
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
    <div class="companion-message-title">Messages</div>
    <button class="companion-message-option" data-message-language="vi">
      <span class="companion-message-label">Tiếng Việt</span>
      <span class="companion-message-desc">Vietnamese bubble text</span>
    </button>
    <button class="companion-message-option" data-message-language="en">
      <span class="companion-message-label">English</span>
      <span class="companion-message-desc">English bubble text</span>
    </button>
    <button class="companion-message-option" data-message-language="ja">
      <span class="companion-message-label">日本語</span>
      <span class="companion-message-desc">Japanese bubble text</span>
    </button>
  `;
  wrapper.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.companion-message-option');
    if (!option) return;
    const messageLanguage = option.getAttribute('data-message-language');
    if (!messageLanguage) return;

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
  document.querySelector('.companion-motion-panel')?.classList.remove('show');

  const current = window.__MESSAGE_LANGUAGE__ || 'vi';
  panel.querySelectorAll('.companion-message-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-message-language') === current);
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
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const buttons = models.map((m) =>
    `<button class="companion-model-option" data-model="${escapeHtml(m.id)}">` +
    `<span class="companion-model-label">${escapeHtml(m.name)}</span>` +
    `<span class="companion-model-desc">${escapeHtml(m.description || '')}</span>` +
    `</button>`
  ).join('');
  panel.innerHTML = `
    <div class="companion-model-title">Model</div>
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
    <div class="companion-motion-title">Motion</div>
    <button class="companion-motion-option" data-motion="TapBody"><span class="companion-motion-label">TapBody</span><span class="companion-motion-desc">Body tap</span></button>
    <button class="companion-motion-option" data-motion="TapHead"><span class="companion-motion-label">TapHead</span><span class="companion-motion-desc">Head pat</span></button>
    <button class="companion-motion-option" data-motion="Idle"><span class="companion-motion-label">Idle</span><span class="companion-motion-desc">Default idle</span></button>
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
  document.querySelector('.companion-model-panel')?.classList.remove('show');
  panel.classList.add('show');
}
