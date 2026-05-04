import { state, debugLog, vscode } from './core.js';

// DOM elements — captured lazily on first use so this module can be imported
// before DOM is ready.
function $bubble() { return document.getElementById('chatBubble'); }
function $bubbleText() { return document.getElementById('bubbleText'); }
function $particles() { return document.getElementById('particles'); }
function $loading() { return document.getElementById('loading'); }
function $canvas() { return document.getElementById('live2dCanvas'); }
function $fallback() { return document.getElementById('fallbackImg'); }

let bubbleTimeout = null;
let confirmPanel = null;
let confirmRequestId = null;
let inputPanel = null;
let inputRequestId = null;

export function showBubble(text) {
  const bubble = $bubble();
  const txt = $bubbleText();
  if (!bubble || !txt) return;

  if (bubbleTimeout) clearTimeout(bubbleTimeout);
  bubble.classList.remove('visible');

  setTimeout(() => {
    txt.textContent = text;
    bubble.classList.add('visible');
    if (state.isLive2DReady) playMotion('Idle');
    createSparkle();
    bubbleTimeout = setTimeout(() => {
      bubble.classList.remove('visible');
    }, 6000);
  }, 200);
}

export function playMotion(group, index) {
  if (!state.model || !state.isLive2DReady) return;
  try {
    state.model.motion(group, index);
  } catch (e) {
    debugLog('Motion failed: ' + e.message);
  }
}

const SPARKLE_EMOJIS = ['✨', '💖', '🌸', '⭐', '💫', '🎀'];

export function createSparkle() {
  const particles = $particles();
  if (!particles) return;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const spark = document.createElement('span');
      spark.className = 'sparkle';
      spark.textContent = SPARKLE_EMOJIS[Math.floor(Math.random() * SPARKLE_EMOJIS.length)];
      spark.style.left = (20 + Math.random() * 60) + '%';
      spark.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
      spark.style.fontSize = (12 + Math.random() * 10) + 'px';
      particles.appendChild(spark);
      setTimeout(() => spark.remove(), 1600);
    }, i * 100);
  }
}

// ─── Loading / Error / Fallback ──────────────────────────────────────────

export function showLoading(text) {
  const loading = $loading();
  if (!loading) return;
  const textEl = loading.querySelector('.loading-text');
  if (textEl) {
    textEl.textContent = text || 'Loading...';
    textEl.style.color = '';
  }
  loading.style.display = 'flex';
}

export function hideLoading() {
  const loading = $loading();
  if (loading) loading.style.display = 'none';
}

export function showError(msg) {
  console.error('[AnimeCompanion] ' + msg);
  const loading = $loading();
  if (loading) {
    const textEl = loading.querySelector('.loading-text');
    if (textEl) {
      textEl.textContent = msg;
      textEl.style.color = '#ff6b6b';
    }
  }
}

// Switch to static PNG when Live2D fails to load.
export function showFallback() {
  hideLoading();
  const canvas = $canvas();
  const fallback = $fallback();
  if (canvas) canvas.style.display = 'none';
  if (fallback) fallback.style.display = 'block';
  state.isLive2DReady = false;
  debugLog('Switched to fallback');
}

function ensureConfirmPanel() {
  if (confirmPanel) return confirmPanel;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;

  confirmPanel = document.createElement('div');
  confirmPanel.className = 'companion-confirm-panel';
  confirmPanel.innerHTML = `
    <div class="companion-confirm-title">Protected Branch</div>
    <div class="companion-confirm-text"></div>
    <div class="companion-confirm-actions">
      <button class="companion-confirm-btn secondary" data-choice="cancel">Cancel</button>
      <button class="companion-confirm-btn primary" data-choice="confirm">OK, commit thẳng</button>
    </div>
  `;
  wrapper.appendChild(confirmPanel);

  confirmPanel.addEventListener('click', (e) => {
    const button = e.target.closest('.companion-confirm-btn');
    if (!button || !confirmRequestId) return;

    const approved = button.getAttribute('data-choice') === 'confirm';
    const requestId = confirmRequestId;
    confirmRequestId = null;
    confirmPanel.classList.remove('show');
    vscode.postMessage({ command: 'confirmDialogResult', requestId, approved });
  });

  return confirmPanel;
}

export function showProtectedBranchConfirm(requestId, branch) {
  showConfirmDialog(
    requestId,
    'Protected Branch',
    `Bạn đang ở branch "${branch}". Commit thẳng vào đây thường không nên. Vẫn muốn commit?`,
    'OK, commit thẳng'
  );
}

export function showStageAllConfirm(requestId, unstagedCount) {
  showConfirmDialog(
    requestId,
    'Stage Changes',
    `Có ${unstagedCount} file thay đổi nhưng chưa stage. Stage tất cả rồi commit luôn nha?`,
    'Stage all & commit'
  );
}

function showConfirmDialog(requestId, title, text, confirmLabel) {
  const panel = ensureConfirmPanel();
  if (!panel) return;

  confirmRequestId = requestId;
  const titleEl = panel.querySelector('.companion-confirm-title');
  const textEl = panel.querySelector('.companion-confirm-text');
  const confirmBtn = panel.querySelector('.companion-confirm-btn.primary');
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  if (confirmBtn) confirmBtn.textContent = confirmLabel;
  panel.classList.add('show');
}

function ensureInputPanel() {
  if (inputPanel) return inputPanel;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;

  inputPanel = document.createElement('div');
  inputPanel.className = 'companion-input-panel';
  inputPanel.innerHTML = `
    <div class="companion-input-title">Commit Message</div>
    <div class="companion-input-text"></div>
    <input class="companion-input-field" type="text" maxlength="200" />
    <div class="companion-input-error"></div>
    <div class="companion-input-actions">
      <button class="companion-confirm-btn secondary" data-choice="cancel">Cancel</button>
      <button class="companion-confirm-btn primary" data-choice="confirm">Commit</button>
    </div>
  `;
  wrapper.appendChild(inputPanel);

  const field = inputPanel.querySelector('.companion-input-field');
  const error = inputPanel.querySelector('.companion-input-error');

  function submitInput() {
    if (!inputRequestId) return;
    const value = field.value.trim();
    if (!value) {
      if (error) error.textContent = 'Message không được để trống';
      return;
    }

    const requestId = inputRequestId;
    inputRequestId = null;
    if (error) error.textContent = '';
    inputPanel.classList.remove('show');
    vscode.postMessage({ command: 'inputDialogResult', requestId, value });
  }

  inputPanel.addEventListener('click', (e) => {
    const button = e.target.closest('.companion-confirm-btn');
    if (!button || !inputRequestId) return;
    const choice = button.getAttribute('data-choice');
    if (choice === 'cancel') {
      const requestId = inputRequestId;
      inputRequestId = null;
      if (error) error.textContent = '';
      inputPanel.classList.remove('show');
      vscode.postMessage({ command: 'inputDialogResult', requestId, value: undefined });
      return;
    }
    submitInput();
  });

  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitInput();
    } else if (e.key === 'Escape' && inputRequestId) {
      e.preventDefault();
      const requestId = inputRequestId;
      inputRequestId = null;
      if (error) error.textContent = '';
      inputPanel.classList.remove('show');
      vscode.postMessage({ command: 'inputDialogResult', requestId, value: undefined });
    }
  });

  return inputPanel;
}

// ─── Pomodoro ring overlay ─────────────────────────────────────────────

let pomodoroRing = null;

function ensurePomodoroRing() {
  if (pomodoroRing) return pomodoroRing;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;

  pomodoroRing = document.createElement('div');
  pomodoroRing.className = 'companion-pomodoro-ring';
  // SVG circumference for r=22 → 2*pi*22 ≈ 138.23
  pomodoroRing.innerHTML = `
    <svg viewBox="0 0 50 50" class="companion-pomodoro-svg">
      <circle class="companion-pomodoro-track" cx="25" cy="25" r="22"></circle>
      <circle class="companion-pomodoro-progress" cx="25" cy="25" r="22"
        stroke-dasharray="138.23" stroke-dashoffset="0"></circle>
    </svg>
    <div class="companion-pomodoro-label">
      <span class="companion-pomodoro-icon">🍅</span>
      <span class="companion-pomodoro-time">00:00</span>
    </div>
  `;
  wrapper.appendChild(pomodoroRing);
  return pomodoroRing;
}

export function updatePomodoroRing(pState, secondsLeft, totalSeconds) {
  const ring = ensurePomodoroRing();
  if (!ring) return;

  const pct = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const circumference = 138.23;
  const progress = ring.querySelector('.companion-pomodoro-progress');
  if (progress) {
    progress.style.strokeDashoffset = String(circumference * (1 - pct));
  }
  const icon = ring.querySelector('.companion-pomodoro-icon');
  if (icon) icon.textContent = pState === 'break' ? '☕' : '🍅';

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const time = ring.querySelector('.companion-pomodoro-time');
  if (time) time.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  ring.classList.toggle('break', pState === 'break');
  ring.classList.add('show');
}

export function hidePomodoroRing() {
  if (pomodoroRing) pomodoroRing.classList.remove('show');
}

export function showCommitMessageInput(requestId, stagedCount) {
  const panel = ensureInputPanel();
  if (!panel) return;

  inputRequestId = requestId;
  const textEl = panel.querySelector('.companion-input-text');
  const field = panel.querySelector('.companion-input-field');
  const error = panel.querySelector('.companion-input-error');
  if (textEl) textEl.textContent = `Commit message (${stagedCount} file đã staged)`;
  if (field) {
    field.value = '';
    field.placeholder = 'Nhập message rõ ràng nha~ vd: "fix login bug"';
  }
  if (error) error.textContent = '';
  panel.classList.add('show');
  setTimeout(() => field?.focus(), 30);
}
