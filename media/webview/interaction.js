import { state, vscode, debugLog } from './core.js';
import { setExpression, updateExpressionTick } from './expression.js';
import { playAudio } from './audio.js';
import { showBubble, createSparkle } from './ui.js';

const DBLCLICK_MESSAGES = [
  "Wow! Special move! ✨",
  "Double tap! Bạn nhanh ghê! ⚡",
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
    if (btn === 2) return; // right-click handled by mousedown listener below
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

      showBubble("Dễ chịu quá nha~ 😊");
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
        showBubble("Đừng bấm nữa, chóng mặt quá đi! 😵");
        playAudio('spam.mp3');
        vscode.postMessage({ command: 'spamClick', count: clickCount });
        createSparkle(); createSparkle(); createSparkle();
      } else if (clickCount >= 2) {
        debugLog('Multi-click: ' + clickCount);
        try { state.model.motion('TapBody'); } catch (_) {
          try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
        }
        setExpression('happy', 2500);
        showBubble(DBLCLICK_MESSAGES[Math.floor(Math.random() * DBLCLICK_MESSAGES.length)]);
        vscode.postMessage({ command: 'multiClick', count: clickCount });
        createSparkle(); createSparkle();
      } else {
        debugLog('Single click');
        try { state.model.motion('TapBody'); } catch (_) {
          try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
        }
        setExpression('surprised', 2000);
        showBubble("Ơ, chạm vào mình làm gì vậy? 👀");
        playAudio('poke.mp3');
        vscode.postMessage({ command: 'poke' });
        createSparkle();
      }
      clickCount = 0;
    }, 400);
  });

  state.model.interactive = true;
  state.model.buttonMode = true;

  const wrapper = document.getElementById('characterWrapper');
  if (wrapper) {
    const resizeObserver = new ResizeObserver(() => fitModel());
    resizeObserver.observe(wrapper);
  }

  state.app.ticker.add(() => updateExpressionTick());
  debugLog('Expression system started');

  setupContextMenu();
  setupVoicePanel();
  setupModelPanel();
}

// ─── Fit model to wrapper ────────────────────────────────────────────────
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

// ─── Context menu ────────────────────────────────────────────────────────
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
    <div class="companion-menu-item" data-action="toggle-mute">
      <span class="companion-mute-icon" style="font-size: 11px;">🔇</span> <span class="companion-mute-label">Mute</span>
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="poke">
      <span style="font-size: 11px;">👉</span> Poke
    </div>
    <div class="companion-menu-item" data-action="pomodoro">
      <span style="font-size: 11px;">🍅</span> Pomodoro
    </div>
    <div class="companion-menu-separator"></div>
    <div class="companion-menu-item" data-action="settings">
      <span style="font-size: 11px;">⚙️</span> Settings
    </div>
  `;
  document.body.appendChild(menu);

  // Right-click side effects (audio + bubble + expression + motion).
  // Fired in mousedown so audio.play() runs while user activation is fresh —
  // contextmenu alone may not satisfy Chromium's autoplay policy.
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    showBubble("Onii-chan cần em giúp đỡ hả? Em luôn sẳn sàng nè~ ♡");
    try { playAudio('help.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
    setExpression('shy', 2500);
    if (state.model) {
      try { state.model.motion('TapBody'); } catch (_) {
        try { state.model.motion('Idle'); } catch (__) { /* ignore */ }
      }
    }
    createSparkle();
  }, true);

  // Show menu, flipping to the cursor's other side if it would overflow.
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
      showBubble("Dang bam F5 cho ban ne~");
      try { playAudio('server.mp3'); } catch (err) { console.error('[AnimeCompanion] playAudio err', err); }
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.runProject' });
    } else if (action === 'commit') {
      showBubble("Commit that gon gang nha~");
      vscode.postMessage({ command: 'runCommand', action: 'git.commit' });
    } else if (action === 'pull') {
      showBubble("Keo code moi ve nao~");
      vscode.postMessage({ command: 'runCommand', action: 'git.pull' });
    } else if (action === 'push') {
      showBubble("Push code len cloud thoi~");
      vscode.postMessage({ command: 'runCommand', action: 'git.push' });
    } else if (action === 'pomodoro') {
      showBubble("Bat dau Pomodoro nhe~");
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.startPomodoro' });
    } else if (action === 'poke') {
      if (state.model) { try { state.model.motion('TapBody'); } catch (_) { /* ignore */ } }
      vscode.postMessage({ command: 'poke' });
    } else if (action === 'change-model') {
      showBubble("Đổi model ngay trên companion nha~ 🌸");
      showModelPanel();
    } else if (action === 'change-voice') {
      showBubble("Đổi giọng ngay trên model nha~ 🗣️");
      showVoicePanel();
    } else if (action === 'toggle-mute') {
      const nextMuted = !window.__AUDIO_MUTED__;
      window.__AUDIO_MUTED__ = nextMuted;
      showBubble(nextMuted ? "Mute rồi nha, em sẽ im lặng~ 🔇" : "Bật tiếng lại rồi nè~ 🔊");
      vscode.postMessage({ command: 'setMuted', muted: nextMuted });
    } else if (action === 'settings') {
      showBubble("Mở Settings cho bạn nè~ ⚙️");
      vscode.postMessage({ command: 'runCommand', action: 'animeCompanion.openSettings' });
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
  const modelPanel = document.querySelector('.companion-model-panel');
  if (modelPanel) modelPanel.classList.remove('show');

  const current = window.__VOICE_LANGUAGE__ || 'ja';
  panel.querySelectorAll('.companion-voice-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-voice') === current);
  });
  panel.classList.add('show');
}

function setupModelPanel() {
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return;

  const panel = document.createElement('div');
  panel.className = 'companion-model-panel';
  panel.innerHTML = `
    <div class="companion-model-title">Model</div>
    <button class="companion-model-option" data-model="hiyori"><span class="companion-model-label">Hiyori</span><span class="companion-model-desc">Live2D Sample</span></button>
    <button class="companion-model-option" data-model="cheshire"><span class="companion-model-label">Cheshire</span><span class="companion-model-desc">Azur Lane</span></button>
    <button class="companion-model-option" data-model="icegirl"><span class="companion-model-label">Ice Girl</span><span class="companion-model-desc">TianYeLuLu</span></button>
    <button class="companion-model-option" data-model="tsubaki"><span class="companion-model-label">Tsubaki</span><span class="companion-model-desc">November Camellia</span></button>
    <button class="companion-model-option" data-model="whiteangel"><span class="companion-model-label">White Angel</span><span class="companion-model-desc">White Hair Angel</span></button>
    <button class="companion-model-option" data-model="vivian"><span class="companion-model-label">Vivian</span><span class="companion-model-desc">Vivian</span></button>
    <button class="companion-model-option" data-model="changli"><span class="companion-model-label">Changli</span><span class="companion-model-desc">Changli</span></button>
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
  const voicePanel = document.querySelector('.companion-voice-panel');
  if (voicePanel) voicePanel.classList.remove('show');

  const current = window.__MODEL_ID__ || 'hiyori';
  panel.querySelectorAll('.companion-model-option').forEach((option) => {
    option.classList.toggle('active', option.getAttribute('data-model') === current);
  });
  panel.classList.add('show');
}
