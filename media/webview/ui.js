import { state, debugLog, vscode } from './core.js';

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
let bubbleStreaming = false;
let bubbleClickHandler = null;
const STREAM_BUBBLE_MAX_CHARS = 600;

function removeBubbleClickHandler() {
  const bubble = $bubble();
  if (bubble && bubbleClickHandler) {
    bubble.removeEventListener('click', bubbleClickHandler);
  }
  bubbleClickHandler = null;
}

// Hard-reset the chat bubble: cancel timers, clear streaming state, drop any
// click handler. Used when opening Quick Chat again so a lingering long reply
// bubble can't overlap the freshly-opened input panel.
export function forceDismissBubble() {
  const bubble = $bubble();
  if (!bubble) return;
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  clearStreamWatchdog();
  removeBubbleClickHandler();
  bubble.classList.remove('visible');
  bubble.classList.remove('streaming');
  bubble.classList.remove('pinned');
  bubble.style.cursor = '';
  bubbleStreaming = false;
  streamAccumulated = '';
}

export function showBubble(text) {
  const bubble = $bubble();
  const txt = $bubbleText();
  if (!bubble || !txt) return;
  if (bubbleStreaming) return;

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

let streamAccumulated = '';
let streamWatchdog = null;
const STREAM_WATCHDOG_MS = 30000;

function clearStreamWatchdog() {
  if (streamWatchdog) {
    clearTimeout(streamWatchdog);
    streamWatchdog = null;
  }
}

export function startBubbleStream(initialText) {
  const bubble = $bubble();
  const txt = $bubbleText();
  if (!bubble || !txt) return;
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  bubble.classList.remove('pinned');
  bubble.style.cursor = 'default';
  bubbleStreaming = true;
  streamAccumulated = initialText || '';
  txt.textContent = streamAccumulated;
  bubble.classList.add('visible');
  bubble.classList.add('streaming');
  if (state.isLive2DReady) playMotion('Idle');
  clearStreamWatchdog();
  streamWatchdog = setTimeout(() => {
    streamWatchdog = null;
    errorBubbleStream('Không nhận được phản hồi. Thử lại nha~ ⏳');
  }, STREAM_WATCHDOG_MS);
}

export function appendBubbleStream(chunk) {
  const txt = $bubbleText();
  if (!txt || !bubbleStreaming) return;
  clearStreamWatchdog();
  streamAccumulated += chunk || '';
  const display =
    streamAccumulated.length > STREAM_BUBBLE_MAX_CHARS
      ? '...' + streamAccumulated.slice(-(STREAM_BUBBLE_MAX_CHARS - 3))
      : streamAccumulated;
  txt.textContent = display;
}

export function finishBubbleStream(opts) {
  const bubble = $bubble();
  if (!bubble) return;
  clearStreamWatchdog();
  const autoDismissMs = (opts && opts.autoDismissMs) || 12000;
  bubble.classList.remove('streaming');
  bubble.style.cursor = 'pointer';

  const hardDismiss = () => {
    if (bubbleTimeout) {
      clearTimeout(bubbleTimeout);
      bubbleTimeout = null;
    }
    bubble.classList.remove('visible');
    bubble.classList.remove('pinned');
    bubble.style.cursor = '';
    removeBubbleClickHandler();
    bubbleStreaming = false;
    streamAccumulated = '';
  };

  const onClick = (e) => {
    e.stopPropagation();
    if (bubble.classList.contains('pinned')) {
      if (bubbleTimeout) clearTimeout(bubbleTimeout);
      bubble.classList.remove('pinned');
      bubbleTimeout = setTimeout(hardDismiss, 1500);
    } else {
      if (bubbleTimeout) {
        clearTimeout(bubbleTimeout);
        bubbleTimeout = null;
      }
      bubble.classList.add('pinned');
    }
  };
  // Each stream finishes with a fresh handler; ditch any prior one so a long
  // sequence of replies doesn't pile up click listeners and double-toggle pin.
  removeBubbleClickHandler();
  bubbleClickHandler = onClick;
  bubble.addEventListener('click', onClick);

  bubbleTimeout = setTimeout(hardDismiss, autoDismissMs);
}

export function errorBubbleStream(errorText) {
  const bubble = $bubble();
  const txt = $bubbleText();
  if (!bubble || !txt) return;
  clearStreamWatchdog();
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  bubble.classList.remove('streaming');
  bubble.style.cursor = '';
  txt.textContent = errorText;
  bubble.classList.add('visible');
  bubbleTimeout = setTimeout(() => {
    bubble.classList.remove('visible');
    bubbleStreaming = false;
    streamAccumulated = '';
  }, 6000);
}

let quickChatPanel = null;
let quickChatHandlers = null;
let quickChatConversationHistory = [];
let quickChatSessionHistory = [];
const QUICK_CHAT_PENDING_TEXT = 'Em đang suy nghĩ chút nha~';

function syncQuickChatOverlayState(visible) {
  state.quickChatOverlayVisible = Boolean(visible);
  const wrapper = document.getElementById('characterWrapper');
  wrapper?.classList.toggle('quickchat-compact', state.quickChatOverlayVisible);
  window.dispatchEvent(
    new CustomEvent('anime-companion:layoutchange', {
      detail: {
        source: 'quickchat',
        visible: state.quickChatOverlayVisible,
      },
    })
  );
}

function getQuickChatMergedHistory() {
  return [...quickChatConversationHistory, ...quickChatSessionHistory];
}

function renderQuickChatHistory() {
  if (!quickChatPanel) return;
  const history = quickChatPanel.querySelector('.companion-quickchat-history');
  const empty = quickChatPanel.querySelector('.companion-quickchat-empty');
  if (!history || !empty) return;

  const items = getQuickChatMergedHistory();
  history.innerHTML = '';
  empty.hidden = items.length > 0;

  for (const item of items) {
    const row = document.createElement('div');
    row.className = `companion-quickchat-message companion-quickchat-message--${item.role || 'assistant'}`;
    if (item.pending) row.classList.add('is-pending');
    if (item.error) row.classList.add('is-error');

    const badge = document.createElement('span');
    badge.className = 'companion-quickchat-message-role';
    badge.textContent = item.role === 'user' ? 'You' : item.error ? 'Status' : 'Companion';

    const body = document.createElement('div');
    body.className = 'companion-quickchat-message-body';
    body.textContent = item.content || '';

    row.appendChild(badge);
    row.appendChild(body);
    history.appendChild(row);
  }

  history.scrollTop = history.scrollHeight;
}

function updateQuickChatSessionMessage(requestId, updater) {
  const index = quickChatSessionHistory.findIndex(
    (item) => item.requestId === requestId && item.role === 'assistant'
  );
  if (index < 0) return;
  quickChatSessionHistory[index] = updater(quickChatSessionHistory[index]);
  renderQuickChatHistory();
}

function ensureQuickChatPanel() {
  if (quickChatPanel) return quickChatPanel;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;

  quickChatPanel = document.createElement('div');
  quickChatPanel.className = 'companion-quickchat-panel';
  quickChatPanel.innerHTML = `
    <div class="companion-quickchat-title">💬 Quick Chat</div>
    <div class="companion-quickchat-history-wrap">
      <div class="companion-quickchat-history"></div>
      <div class="companion-quickchat-empty">Chưa có history nào cả. Hỏi em một câu trước nha~</div>
    </div>
    <textarea class="companion-quickchat-field" rows="2" maxlength="400"
      placeholder="Hỏi gì đó nhanh nha~ (Enter để gửi, Shift+Enter xuống dòng)"></textarea>
    <div class="companion-quickchat-actions">
      <button class="companion-confirm-btn secondary" data-choice="cancel">Cancel</button>
      <button class="companion-confirm-btn primary" data-choice="send">Send</button>
    </div>
  `;
  wrapper.appendChild(quickChatPanel);

  const field = quickChatPanel.querySelector('.companion-quickchat-field');

  const submit = () => {
    const value = (field?.value || '').trim();
    if (!value) return;
    quickChatPanel.classList.remove('show');
    syncQuickChatOverlayState(false);
    if (quickChatHandlers && quickChatHandlers.onSubmit) {
      quickChatHandlers.onSubmit(value);
    }
    if (field) field.value = '';
  };

  const cancel = () => {
    quickChatPanel.classList.remove('show');
    syncQuickChatOverlayState(false);
    if (quickChatHandlers && quickChatHandlers.onCancel) {
      quickChatHandlers.onCancel();
    }
    if (field) field.value = '';
  };

  quickChatPanel.addEventListener('click', (e) => {
    const button = e.target.closest('.companion-confirm-btn');
    if (!button) return;
    const choice = button.getAttribute('data-choice');
    if (choice === 'send') submit();
    else cancel();
  });

  field?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  renderQuickChatHistory();
  return quickChatPanel;
}

export function showQuickChatPanel(handlers) {
  const panel = ensureQuickChatPanel();
  if (!panel) return;
  // A previous reply's bubble may still be visible (12s auto-dismiss, or
  // pinned). On the small desktop pet window a long bubble overlaps the
  // freshly-opened input panel and the layout breaks. Drop it first so the
  // user sees a clean quick-chat surface.
  forceDismissBubble();
  quickChatHandlers = handlers || {};
  panel.classList.add('show');
  syncQuickChatOverlayState(true);
  renderQuickChatHistory();
  const field = panel.querySelector('.companion-quickchat-field');
  setTimeout(() => field?.focus(), 30);
}

export function hideQuickChatPanel() {
  if (!quickChatPanel) return;
  quickChatPanel.classList.remove('show');
  syncQuickChatOverlayState(false);
}

export function syncQuickChatConversationHistory(messages) {
  quickChatConversationHistory = Array.isArray(messages)
    ? messages
      .filter((item) => item && typeof item.content === 'string' && item.content.trim())
      .map((item, index) => ({
        id: `conv-${index}`,
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.content.trim(),
      }))
    : [];
  renderQuickChatHistory();
}

export function startQuickChatHistoryTurn(requestId, prompt) {
  if (!requestId || typeof prompt !== 'string') return;
  quickChatSessionHistory.push(
    {
      id: `${requestId}-user`,
      requestId,
      role: 'user',
      content: prompt.trim(),
      pending: false,
      error: false,
    },
    {
      id: `${requestId}-assistant`,
      requestId,
      role: 'assistant',
      content: QUICK_CHAT_PENDING_TEXT,
      pending: true,
      error: false,
    }
  );
  renderQuickChatHistory();
}

export function appendQuickChatHistoryDelta(requestId, delta) {
  if (!requestId || typeof delta !== 'string' || !delta) return;
  updateQuickChatSessionMessage(requestId, (current) => ({
    ...current,
    content:
      current.pending && current.content === QUICK_CHAT_PENDING_TEXT
        ? delta
        : `${current.content}${delta}`,
  }));
}

export function finishQuickChatHistoryTurn(requestId, text) {
  if (!requestId) return;
  updateQuickChatSessionMessage(requestId, (current) => ({
    ...current,
    content: typeof text === 'string' && text.trim() ? text.trim() : current.content,
    pending: false,
  }));
}

export function failQuickChatHistoryTurn(requestId, text) {
  if (!requestId) return;
  updateQuickChatSessionMessage(requestId, (current) => ({
    ...current,
    content: typeof text === 'string' && text.trim() ? text.trim() : current.content,
    pending: false,
    error: true,
  }));
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

let pomodoroRing = null;

function ensurePomodoroRing() {
  if (pomodoroRing) return pomodoroRing;
  const wrapper = document.getElementById('characterWrapper');
  if (!wrapper) return null;

  pomodoroRing = document.createElement('div');
  pomodoroRing.className = 'companion-pomodoro-ring';
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
