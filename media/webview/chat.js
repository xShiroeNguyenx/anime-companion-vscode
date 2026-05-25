// Chat panel runtime for the Anime Companion webview.
//
// Wire protocol (extension → webview):
//   chat:snapshot          { providerId, model, requiresApiKey, hasApiKey, providers, conversations, activeId, messages }
//   chat:userMessage       { conversationId, message, title }
//   chat:assistantStart    { conversationId, streamId }
//   chat:assistantDelta    { conversationId, streamId, delta }
//   chat:assistantEnd      { conversationId, streamId, message?, usage?, error?, aborted?, title? }
//   chat:focus             (force-open panel)
//
// All API keys live in the extension host. The webview never sees them.

import { vscode } from './core.js';

const $ = (id) => document.getElementById(id);

const state = {
  providers: [],
  providerId: 'copilot',
  model: '',
  copilotAccounts: [],
  selectedCopilotAccountId: '',
  selectedCopilotAccountLabel: '',
  cursorChibi: normalizeCursorChibiState(window.__CURSOR_CHIBI_STATE__),
  requiresApiKey: false,
  hasApiKey: true,
  conversations: [],
  activeId: undefined,
  busy: false,
  // The currently-streaming assistant bubble (DOM + raw text). Buffered so we
  // can re-render the whole markdown each time a chunk arrives.
  streaming: null, // { id, element, bodyEl, text }
  stagedSelection: null, // { filePath, languageId, preview, size }
  totalTokens: { input: 0, output: 0 },
  settingsOpen: false,
  // #file mention picker state
  mention: { open: false, activeIdx: 0, items: [], rangeStart: -1, query: '' },
};

function init() {
  primeCursorOrbGlyphs();
  $('chatToggleBtn')?.addEventListener('click', () => openPanel(true));
  $('chatCloseBtn')?.addEventListener('click', () => openPanel(false));
  $('chatListToggleBtn')?.addEventListener('click', () => toggleSidebar());
  $('chatSidebarCloseBtn')?.addEventListener('click', () => toggleSidebar(false));
  $('chatSettingsBtn')?.addEventListener('click', () => toggleSettings());

  // Restore last-open state of the settings row so the user's preference
  // survives panel reloads (webview is recreated on hide/show).
  try {
    const prevOpen = vscode.getState()?.settingsOpen === true;
    if (prevOpen) toggleSettings(true);
  } catch {
    // Webview state isn't critical — fall back to default (closed).
  }
  $('chatNewBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'chat:newConversation' });
    toggleSidebar(false);
  });
  $('chatForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitPrompt();
  });
  const textarea = $('chatTextarea');
  textarea?.addEventListener('keydown', handleTextareaKeydown);
  textarea?.addEventListener('input', handleTextareaInput);
  textarea?.addEventListener('blur', () => {
    // Defer hide so a click on the picker can still fire.
    setTimeout(() => closeMentionPicker(), 100);
  });

  $('chatCancelBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'chat:cancel' });
  });
  $('chatSetKeyBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'chat:setApiKey' });
  });
  // Icon toggles for context attachments — pressed = include on next send.
  for (const id of ['chatChipSelection', 'chatChipActiveFile']) {
    $(id)?.addEventListener('click', (ev) => {
      const btn = ev.currentTarget;
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      btn.classList.toggle('active', next);
    });
  }
  $('chatCopilotAccountBtn')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'chat:pickCopilotAccount' });
  });
  $('chatStagedSelection')
    ?.querySelector('.chat-chip-staged-clear')
    ?.addEventListener('click', () => {
      vscode.postMessage({ command: 'chat:clearStagedSelection' });
    });
  $('chatProvider')?.addEventListener('change', (ev) => {
    const next = ev.target.value;
    if (next && next !== state.providerId) {
      vscode.postMessage({ command: 'chat:setProvider', providerId: next });
    }
  });
  const chatModel = $('chatModel');
  chatModel?.addEventListener('change', (ev) => {
    const next = (ev.target.value || '').trim();
    if (next !== state.model) {
      vscode.postMessage({ command: 'chat:setModel', model: next });
    }
  });
  chatModel?.addEventListener('focus', () => openModelCombo(''));
  chatModel?.addEventListener('input', (ev) => openModelCombo(ev.target.value || ''));
  chatModel?.addEventListener('keydown', handleModelComboKeydown);
  $('chatModelComboBtn')?.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    const list = $('chatModelComboList');
    if (list && !list.hidden) {
      closeModelCombo();
    } else {
      chatModel?.focus();
      openModelCombo('');
    }
  });
  document.addEventListener('mousedown', (ev) => {
    const combo = $('chatModelCombo');
    if (combo && !combo.contains(ev.target)) closeModelCombo();
  });
  $('cursorModelOrb')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    toggleCursorOrb();
  });
  $('cursorOrbPanel')?.addEventListener('click', handleCursorOrbAction);
  document.addEventListener('click', handleDocumentClick, true);

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (typeof data.command !== 'string' || !data.command.startsWith('chat:')) return;
    handleHostMessage(data);
  });

  vscode.postMessage({ command: 'chat:snapshot' });
  renderCursorOrb();
}

function primeCursorOrbGlyphs() {
  const glyphs = {
    up: '↑',
    right: '→',
    down: '↓',
    left: '←',
    reset: '↺',
    'size-down': '−',
    'size-up': '+',
  };
  document.querySelectorAll('[data-cursor-action]').forEach((el) => {
    const action = el.getAttribute('data-cursor-action');
    if (action && glyphs[action]) {
      el.textContent = glyphs[action];
    }
  });
}

function submitPrompt() {
  const textarea = $('chatTextarea');
  if (!textarea) return;
  const value = (textarea.value || '').trim();
  if (!value || state.busy) return;

  const includeSelection = $('chatChipSelection')?.getAttribute('aria-pressed') === 'true';
  const includeActiveFile = $('chatChipActiveFile')?.getAttribute('aria-pressed') === 'true';
  const fileMentions = extractMentions(value);

  vscode.postMessage({
    command: 'chat:send',
    prompt: value,
    includeSelection,
    includeActiveFile,
    fileMentions,
  });
  textarea.value = '';
  closeMentionPicker();
}

function extractMentions(text) {
  const out = [];
  const re = /(^|\s)#([\w./\\-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[2]) out.push(m[2]);
  }
  return out;
}

function openPanel(open) {
  const panel = $('chatPanel');
  const toggleBtn = $('chatToggleBtn');
  if (!panel || !toggleBtn) return;
  panel.hidden = !open;
  toggleBtn.style.display = open ? 'none' : 'block';
  // Toggle a class on the container so CSS can switch to the split layout —
  // character on the left, chat on the right (or stacked on narrow panels).
  document.querySelector('.companion-container')?.classList.toggle('chat-open', open);
  if (open) requestAnimationFrame(() => $('chatTextarea')?.focus());
}

function toggleSidebar(force) {
  const sidebar = $('chatSidebar');
  if (!sidebar) return;
  if (typeof force === 'boolean') {
    sidebar.hidden = !force;
  } else {
    sidebar.hidden = !sidebar.hidden;
  }
}

function toggleSettings(force) {
  const metaRow = document.querySelector('.chat-panel-header-meta');
  const btn = $('chatSettingsBtn');
  if (!metaRow) return;
  const open = typeof force === 'boolean' ? force : metaRow.hasAttribute('hidden');
  state.settingsOpen = open;
  if (open) metaRow.removeAttribute('hidden');
  else metaRow.setAttribute('hidden', '');
  updateAccountRowVisibility();
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn?.classList.toggle('chat-icon-btn-active', open);
  try {
    const s = vscode.getState() || {};
    vscode.setState({ ...s, settingsOpen: open });
  } catch {
    // ignore — state persistence is best-effort
  }
}

// The GitHub account row only makes sense when the active provider is
// Copilot (the existing renderCopilotAccountButton already manages the button
// itself). Tie the *row's* visibility to gear-open AND copilot so the row
// doesn't sit there as empty space when collapsed or on BYOK providers.
function updateAccountRowVisibility() {
  const acctRow = document.querySelector('.chat-panel-header-account');
  if (!acctRow) return;
  const shouldShow = !!state.settingsOpen && state.providerId === 'copilot';
  if (shouldShow) acctRow.removeAttribute('hidden');
  else acctRow.setAttribute('hidden', '');
}

// ───────────────────────────────────── host messages ─────────────────────────────────────

function handleHostMessage(data) {
  switch (data.command) {
    case 'chat:snapshot':
      applySnapshot(data);
      break;
    case 'chat:userMessage':
      appendMessage(data.message, data.attachedContext);
      updateActiveTitle(data.title);
      clearStagedSelectionChip();
      uncheckChips();
      break;
    case 'chat:assistantStart':
      beginStreaming(data.streamId);
      setBusy(true);
      break;
    case 'chat:assistantDelta':
      appendStreamingDelta(data.delta);
      break;
    case 'chat:assistantEnd':
      finishStreaming(data);
      setBusy(false);
      if (data.error && !data.aborted) {
        showStatus(data.error, true);
      } else if (data.usage) {
        addToTotalTokens(data.usage);
        showStatus(
          `Tokens this turn: in ${data.usage.inputTokens ?? '?'} / out ${data.usage.outputTokens ?? '?'}`,
          false
        );
      } else {
        clearStatus();
      }
      updateActiveTitle(data.title);
      break;
    case 'chat:focus':
      openPanel(true);
      break;
    case 'chat:focusCursorOrb':
      toggleCursorOrb(true);
      break;
    case 'chat:stagedSelection':
      applyStagedSelection(data);
      break;
    case 'chat:fileSearchResults':
      applyMentionResults(data);
      break;
  }
}

function uncheckChips() {
  for (const id of ['chatChipSelection', 'chatChipActiveFile']) {
    const btn = $(id);
    if (!btn) continue;
    btn.setAttribute('aria-pressed', 'false');
    btn.classList.remove('active');
  }
}

function applyStagedSelection(data) {
  state.stagedSelection = data.filePath
    ? { filePath: data.filePath, languageId: data.languageId, preview: data.preview, size: data.size }
    : null;
  const chip = $('chatStagedSelection');
  if (!chip) return;
  if (!state.stagedSelection) {
    chip.hidden = true;
    return;
  }
  const label = chip.querySelector('.chat-chip-staged-label');
  if (label) {
    const name = data.filePath.split(/[\\/]/).pop();
    label.textContent = `📌 ${name} (${data.size} chars)`;
    label.title = data.preview || '';
  }
  chip.hidden = false;
  openPanel(true);
}

function clearStagedSelectionChip() {
  state.stagedSelection = null;
  const chip = $('chatStagedSelection');
  if (chip) chip.hidden = true;
}

function addToTotalTokens(usage) {
  if (usage.inputTokens) state.totalTokens.input += usage.inputTokens;
  if (usage.outputTokens) state.totalTokens.output += usage.outputTokens;
  renderTokenTotal();
}

function renderTokenTotal() {
  const el = $('chatTokenTotal');
  if (!el) return;
  const t = state.totalTokens;
  if (!t.input && !t.output) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = `Σ in ${t.input} / out ${t.output}`;
}

function applySnapshot(data) {
  state.providers = data.providers || [];
  state.providerId = data.providerId || 'copilot';
  state.model = data.model || '';
  state.requiresApiKey = !!data.requiresApiKey;
  state.hasApiKey = !!data.hasApiKey;
  state.copilotAccounts = data.copilotAccounts || [];
  state.selectedCopilotAccountId = data.selectedCopilotAccountId || '';
  state.selectedCopilotAccountLabel = data.selectedCopilotAccountLabel || '';
  state.conversations = data.conversations || [];
  state.activeId = data.activeId;

  // Provider dropdown
  const providerSel = $('chatProvider');
  if (providerSel) {
    providerSel.innerHTML = '';
    for (const p of state.providers) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      if (p.id === state.providerId) opt.selected = true;
      providerSel.appendChild(opt);
    }
  }

  // Model input + click-to-expand combo dropdown for the active provider.
  // The user can still type a custom id (preview models etc.) — the list
  // only suggests, it doesn't restrict.
  const modelInput = $('chatModel');
  const info = state.providers.find((p) => p.id === state.providerId);
  if (modelInput) {
    modelInput.value = state.model || (info?.defaultModel ?? '');
    modelInput.placeholder = info?.defaultModel || 'AI model id';
  }
  state.modelOptions = collectModelOptions(info);
  state.modelComboActive = -1;
  renderCursorOrb();
  renderCopilotAccountButton();
  // Provider may have changed in this snapshot — refresh whether the
  // account row should be visible (only when gear is open AND copilot).
  updateAccountRowVisibility();

  // Conversation list
  renderConvList();

  // Active conversation title
  const activeMeta = state.conversations.find((c) => c.id === state.activeId);
  updateActiveTitle(activeMeta?.title);

  // Chat log
  const log = $('chatLog');
  if (log) {
    log.innerHTML = '';
    state.streaming = null;
    const msgs = data.messages || [];
    if (msgs.length === 0) {
      renderEmptyState();
    } else {
      for (const m of msgs) appendMessage(m);
    }
  }

  // Token totals are per-conversation in this UI — reset when switching
  // (the per-turn `chat:assistantEnd` events will accumulate from here).
  state.totalTokens = { input: 0, output: 0 };
  renderTokenTotal();
  clearStagedSelectionChip();

  // API key gating
  if (state.requiresApiKey && !state.hasApiKey) {
    showStatus(`No API key set for ${state.providerId}. Click 🔑 to add one, or switch to Copilot.`, true);
  } else {
    clearStatus();
  }

  // Always show the key button. Even when the current provider is Copilot
  // (no key needed), the user may want to proactively add keys for other
  // providers — clicking opens a QuickPick that lets them choose which one.
  const setKeyBtn = $('chatSetKeyBtn');
  if (setKeyBtn) {
    setKeyBtn.style.display = '';
    setKeyBtn.title = state.requiresApiKey && !state.hasApiKey
      ? `Set API key for ${state.providerId}`
      : 'Manage API keys for BYOK providers';
  }
}

function renderCopilotAccountButton() {
  const btn = $('chatCopilotAccountBtn');
  if (!btn) return;
  const visible = state.providerId === 'copilot';
  btn.hidden = !visible;
  if (!visible) return;

  const selected = state.selectedCopilotAccountLabel || '';
  const fallback = state.copilotAccounts.length > 0
    ? `${state.copilotAccounts.length} GitHub account${state.copilotAccounts.length > 1 ? 's' : ''}`
    : 'Choose GitHub account';
  btn.textContent = selected ? `GitHub: ${selected}` : fallback;
  btn.title = selected
    ? `Anime Companion will use ${selected} for Copilot. Click to change account.`
    : 'Choose which GitHub account Anime Companion should use for Copilot.';
}

function normalizeCursorChibiState(raw) {
  const size = Number(raw?.sizePx);
  return {
    enabled: !!raw?.enabled,
    offsetX: Number.isFinite(Number(raw?.offsetX)) ? Number(raw.offsetX) : 0,
    offsetY: Number.isFinite(Number(raw?.offsetY)) ? Number(raw.offsetY) : 0,
    sizePx: Number.isFinite(size) && size > 0 ? size : 12,
  };
}

function renderCursorOrb() {
  const companionModelName = getCompanionModelName();
  const modelName = $('cursorModelOrbName');
  if (modelName) {
    modelName.textContent = companionModelName;
    modelName.title = companionModelName;
  }
  const summary = $('cursorOrbSummary');
  if (summary) {
    const s = state.cursorChibi;
    summary.textContent = `${s.enabled ? 'on' : 'off'} · x ${s.offsetX} · y ${s.offsetY}`;
  }
  const stats = $('cursorOrbStats');
  if (stats) {
    const s = state.cursorChibi;
    stats.textContent = `x ${s.offsetX} · y ${s.offsetY} · ${s.sizePx}px`;
  }
}

function getCompanionModelName() {
  const modelId = window.__MODEL_ID__ || 'hiyori';
  const models = Array.isArray(window.__VISIBLE_MODELS__) ? window.__VISIBLE_MODELS__ : [];
  const match = models.find((m) => m && m.id === modelId);
  return match?.name || modelId;
}

function toggleCursorOrb(force, opts = {}) {
  const shell = $('cursorOrbShell');
  const orb = $('cursorModelOrb');
  const panel = $('cursorOrbPanel');
  if (!shell || !orb || !panel) return;
  const open = typeof force === 'boolean' ? force : !shell.classList.contains('open');
  shell.hidden = false;
  shell.classList.toggle('open', open);
  panel.hidden = !open;
  orb.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open && opts.hideShell) shell.hidden = true;
}

function handleDocumentClick(ev) {
  const shell = $('cursorOrbShell');
  if (!shell || !shell.classList.contains('open')) return;
  if (!shell.contains(ev.target)) {
    toggleCursorOrb(false, { hideShell: true });
  }
}

function handleCursorOrbAction(ev) {
  const button = ev.target.closest('[data-cursor-action]');
  if (!button) return;
  ev.preventDefault();
  const action = button.getAttribute('data-cursor-action');
  const POS_STEP = 4;
  const SIZE_STEP = 2;

  switch (action) {
    case 'up':
      state.cursorChibi.enabled = true;
      state.cursorChibi.offsetY -= POS_STEP;
      vscode.postMessage({ command: 'cursorChibi:nudge', dx: 0, dy: -POS_STEP });
      break;
    case 'right':
      state.cursorChibi.enabled = true;
      state.cursorChibi.offsetX += POS_STEP;
      vscode.postMessage({ command: 'cursorChibi:nudge', dx: POS_STEP, dy: 0 });
      break;
    case 'down':
      state.cursorChibi.enabled = true;
      state.cursorChibi.offsetY += POS_STEP;
      vscode.postMessage({ command: 'cursorChibi:nudge', dx: 0, dy: POS_STEP });
      break;
    case 'left':
      state.cursorChibi.enabled = true;
      state.cursorChibi.offsetX -= POS_STEP;
      vscode.postMessage({ command: 'cursorChibi:nudge', dx: -POS_STEP, dy: 0 });
      break;
    case 'size-up':
      state.cursorChibi.enabled = true;
      state.cursorChibi.sizePx = Math.min(160, state.cursorChibi.sizePx + SIZE_STEP);
      vscode.postMessage({ command: 'cursorChibi:size', delta: SIZE_STEP });
      break;
    case 'size-down':
      state.cursorChibi.enabled = true;
      state.cursorChibi.sizePx = Math.max(1, state.cursorChibi.sizePx - SIZE_STEP);
      vscode.postMessage({ command: 'cursorChibi:size', delta: -SIZE_STEP });
      break;
    case 'reset':
      state.cursorChibi.enabled = true;
      state.cursorChibi.offsetX = 0;
      state.cursorChibi.offsetY = 0;
      state.cursorChibi.sizePx = 12;
      vscode.postMessage({ command: 'cursorChibi:reset' });
      break;
    case 'done':
      toggleCursorOrb(false, { hideShell: true });
      return;
    default:
      return;
  }

  renderCursorOrb();
}

function updateActiveTitle(title) {
  const el = $('chatPanelTitle');
  if (el) el.textContent = title || 'Chat';
}

function renderConvList() {
  const list = $('chatConvList');
  if (!list) return;
  list.innerHTML = '';

  if (state.conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-conv-empty';
    empty.textContent = 'No conversations yet';
    list.appendChild(empty);
    return;
  }

  for (const c of state.conversations) {
    const item = document.createElement('div');
    item.className = 'chat-conv-item' + (c.id === state.activeId ? ' active' : '');
    item.setAttribute('role', 'option');
    item.title = `${c.title}\n${c.providerId}/${c.model}`;

    const title = document.createElement('span');
    title.className = 'chat-conv-item-title';
    title.textContent = c.title || 'Untitled';

    const actions = document.createElement('span');
    actions.className = 'chat-conv-item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'chat-conv-item-action';
    renameBtn.title = 'Rename';
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Browser `prompt()` is blocked inside VS Code webviews, so we ask the
      // extension host to drive the input box instead.
      vscode.postMessage({
        command: 'chat:requestRename',
        id: c.id,
        currentTitle: c.title,
      });
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'chat-conv-item-action';
    delBtn.title = 'Delete';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Same reason: `confirm()` is blocked in the webview. Host shows a
      // modal warning, then deletes if user clicks "Delete".
      vscode.postMessage({
        command: 'chat:requestDelete',
        id: c.id,
        title: c.title,
      });
    });

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    item.appendChild(title);
    item.appendChild(actions);

    // Whole item is clickable to load the conversation (except clicks on
    // the action buttons, which stopPropagation above).
    item.addEventListener('click', () => {
      if (c.id !== state.activeId) {
        vscode.postMessage({ command: 'chat:loadConversation', id: c.id });
      }
      // Always close the sidebar after picking — gives the chat log full
      // width again, which matters most on narrow panels.
      toggleSidebar(false);
    });

    list.appendChild(item);
  }
}

// ───────────────────────────────────── message rendering ─────────────────────────────────────

function appendMessage(msg, attachedContext) {
  const log = $('chatLog');
  if (!log || !msg) return;
  // Drop the empty-state coach if it's the only child.
  log.querySelector('.chat-empty')?.remove();
  const el = buildMessageEl(msg.role, msg.content || '');
  if (Array.isArray(attachedContext) && attachedContext.length > 0) {
    const row = document.createElement('div');
    row.className = 'chat-msg-attached';
    for (const a of attachedContext) {
      const chip = document.createElement('span');
      chip.className = 'chat-msg-attached-chip';
      chip.textContent = a.label;
      chip.title = `${a.sourceKind} (${a.size} chars)`;
      row.appendChild(chip);
    }
    el.querySelector('.chat-msg-content')?.appendChild(row);
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ───────────────────────────────────── model combo dropdown ─────────────────────────────────────

function collectModelOptions(providerInfo) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  if (providerInfo?.defaultModel) push(providerInfo.defaultModel);
  for (const m of providerInfo?.modelExamples ?? []) push(m);
  return out;
}

function openModelCombo(filterValue) {
  const list = $('chatModelComboList');
  const input = $('chatModel');
  if (!list || !input) return;
  const options = state.modelOptions || [];
  const filter = (filterValue || '').trim().toLowerCase();
  const visible = filter
    ? options.filter((o) => o.toLowerCase().includes(filter))
    : options;
  if (visible.length === 0) {
    list.hidden = true;
    return;
  }
  list.innerHTML = '';
  visible.forEach((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'chat-model-combo-item' + (idx === state.modelComboActive ? ' active' : '');
    li.textContent = opt;
    li.setAttribute('role', 'option');
    li.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      acceptModelComboItem(opt);
    });
    list.appendChild(li);
  });
  list.hidden = false;
  state.modelComboVisible = visible;
  if (state.modelComboActive >= visible.length) state.modelComboActive = -1;
}

function closeModelCombo() {
  const list = $('chatModelComboList');
  if (list) list.hidden = true;
  state.modelComboActive = -1;
  state.modelComboVisible = [];
}

function acceptModelComboItem(value) {
  const input = $('chatModel');
  if (!input) return;
  input.value = value;
  closeModelCombo();
  if (value !== state.model) {
    vscode.postMessage({ command: 'chat:setModel', model: value });
  }
  input.blur();
}

function handleModelComboKeydown(ev) {
  const visible = state.modelComboVisible || [];
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    if (visible.length === 0) openModelCombo($('chatModel')?.value || '');
    else {
      state.modelComboActive = (state.modelComboActive + 1) % visible.length;
      openModelCombo($('chatModel')?.value || '');
    }
    return;
  }
  if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    if (visible.length === 0) return;
    state.modelComboActive = (state.modelComboActive - 1 + visible.length) % visible.length;
    openModelCombo($('chatModel')?.value || '');
    return;
  }
  if (ev.key === 'Enter') {
    if (state.modelComboActive >= 0 && visible[state.modelComboActive]) {
      ev.preventDefault();
      acceptModelComboItem(visible[state.modelComboActive]);
    }
    return;
  }
  if (ev.key === 'Escape') {
    closeModelCombo();
  }
}

function renderEmptyState() {
  const log = $('chatLog');
  if (!log) return;
  log.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  empty.innerHTML = `
    <span class="chat-empty-emoji">🌸</span>
    <div>Say hi to your companion!</div>
    <div class="chat-empty-hint">Type <code>#</code> to mention a file, toggle 📌/📄 chips to attach context, or right-click code in the editor → "Ask Companion About Selection".</div>
  `;
  log.appendChild(empty);
}

function buildMessageEl(role, content) {
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;

  // Avatar — assistant uses the captured chibi for the active Live2D model
  // (falls back to bundled character.png if no chibi has been captured),
  // user gets a simple emoji disc so the layout still reads as a real chat.
  const avatar = document.createElement('div');
  avatar.className = 'chat-msg-avatar';
  if (role === 'assistant') {
    const img = document.createElement('img');
    img.src = window.__COMPANION_AVATAR_CHIBI__ || window.__COMPANION_AVATAR_DEFAULT__ || '';
    img.alt = '';
    img.onerror = () => {
      // Captured chibi got deleted between snapshots — fall back to default.
      const fallback = window.__COMPANION_AVATAR_DEFAULT__;
      if (fallback && img.src !== fallback) img.src = fallback;
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = '🧑';
  }

  const content_wrap = document.createElement('div');
  content_wrap.className = 'chat-msg-content';
  const roleLabel = document.createElement('div');
  roleLabel.className = 'chat-msg-role';
  // Display the active Live2D model's name (Hiyori / Haru / Miara …) instead
  // of the generic "Companion" — gives the chat a sense of *who* is replying.
  roleLabel.textContent = role === 'user' ? 'You' : (window.__COMPANION_DISPLAY_NAME__ || 'Companion');
  const body = document.createElement('div');
  body.className = 'chat-msg-body';
  renderInto(body, content);

  // Small copy button at the bottom-right of every finalized assistant reply.
  // Hidden during streaming (CSS toggles via `.chat-msg.streaming`) so it can't
  // be tapped while the text is still arriving. The raw markdown source is
  // stashed on the message element so the button copies plain text (no code-
  // block button labels, no rendered HTML noise).
  if (role === 'assistant') {
    el.dataset.copySource = content || '';
    body.appendChild(buildMessageCopyButton(el));
  }

  content_wrap.appendChild(roleLabel);
  content_wrap.appendChild(body);
  el.appendChild(avatar);
  el.appendChild(content_wrap);
  return el;
}

// Codicon-style clipboard glyph (default state).
const COPY_ICON_CLIPBOARD =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'
  + '<path fill="currentColor" d="M4 1.5A1.5 1.5 0 0 1 5.5 0h5A1.5 1.5 0 0 1 12 1.5V2h1.5A1.5 1.5 0 0 1 15 3.5v11A1.5 1.5 0 0 1 13.5 16h-9A1.5 1.5 0 0 1 3 14.5V3.5A1.5 1.5 0 0 1 4.5 2H5v-.5h-1zm1 .5v1h6v-1h-6zm-.5 2A.5.5 0 0 0 4 4.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-10a.5.5 0 0 0-.5-.5h-9z"/>'
  + '</svg>';
// Bold checkmark for the "copied" confirmation flash.
const COPY_ICON_CHECK =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
  + '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5l3.2 3.2L13 5"/>'
  + '</svg>';

function buildMessageCopyButton(messageEl) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-msg-copy';
  btn.title = 'Copy reply';
  btn.setAttribute('aria-label', 'Copy reply');
  btn.innerHTML = COPY_ICON_CLIPBOARD;
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const src = messageEl.dataset.copySource
      || messageEl.querySelector('.chat-msg-body')?.innerText
      || '';
    if (!src.trim()) return;
    try {
      await navigator.clipboard.writeText(src);
      btn.classList.add('copied');
      btn.innerHTML = COPY_ICON_CHECK;
      btn.title = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = COPY_ICON_CLIPBOARD;
        btn.title = 'Copy reply';
      }, 1400);
    } catch {
      btn.classList.add('failed');
      btn.title = 'Copy failed';
      setTimeout(() => {
        btn.classList.remove('failed');
        btn.title = 'Copy reply';
      }, 1500);
    }
  });
  return btn;
}

function beginStreaming(streamId) {
  const log = $('chatLog');
  if (!log) return;
  log.querySelector('.chat-empty')?.remove();
  const el = buildMessageEl('assistant', '');
  el.classList.add('streaming');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  const bodyEl = el.querySelector('.chat-msg-body');
  // Render thinking dots until the first chunk arrives so the user has
  // immediate visual feedback that the companion is composing a reply.
  if (bodyEl) {
    bodyEl.innerHTML = '<div class="chat-thinking-dots"><span></span><span></span><span></span></div>';
  }
  state.streaming = {
    id: streamId,
    element: el,
    bodyEl,
    text: '',
    receivedFirstChunk: false,
  };
}

function appendStreamingDelta(delta) {
  if (!state.streaming || !state.streaming.bodyEl || typeof delta !== 'string') return;
  // First chunk: swap thinking dots for real content.
  if (!state.streaming.receivedFirstChunk) {
    state.streaming.receivedFirstChunk = true;
    state.streaming.bodyEl.innerHTML = '';
  }
  state.streaming.text += delta;
  renderInto(state.streaming.bodyEl, state.streaming.text);
  const log = $('chatLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function finishStreaming(data) {
  if (!state.streaming) return;
  const el = state.streaming.element;
  const bodyEl = state.streaming.bodyEl;
  if (el) el.classList.remove('streaming');
  // Use authoritative content from the host (may include "(cancelled)" suffix
  // or extra punctuation that didn't come through deltas).
  if (data?.message?.content && bodyEl) {
    state.streaming.text = data.message.content;
    renderInto(bodyEl, state.streaming.text);
  } else if (data?.error && !state.streaming.text && el) {
    // Errored before any chunk arrived — drop the empty bubble entirely so
    // the user doesn't see a misleading "(empty response)" placeholder. The
    // error itself surfaces in the status bar below.
    el.remove();
    state.streaming = null;
    return;
  }
  // Stash the raw markdown source so the copy button yields plain text instead
  // of the rendered DOM (which would interleave code-block "Copy" labels).
  // Then re-attach the copy button — every appendStreamingDelta / renderInto
  // call above wipes the body's children, including any previously attached
  // button.
  if (el && bodyEl && state.streaming.text) {
    el.dataset.copySource = state.streaming.text;
    bodyEl.appendChild(buildMessageCopyButton(el));
  }
  state.streaming = null;
}

// ───────────────────────────────────── minimal markdown ─────────────────────────────────────

// Renders fenced ```code``` blocks (with a Copy button) and inline `code`.
// Everything else is plain text — CSS `white-space: pre-wrap` handles newlines.
function renderInto(container, text) {
  container.textContent = '';
  const parts = splitFencedCode(text);
  for (const part of parts) {
    if (part.type === 'code') {
      container.appendChild(buildCodeBlock(part.text, part.lang));
    } else {
      renderInlineCode(container, part.text);
    }
  }
}

function buildCodeBlock(text, lang) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-code-wrap';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (lang) code.className = `language-${lang}`;
  code.textContent = text;
  pre.appendChild(code);
  wrap.appendChild(pre);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'chat-code-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 1200);
    } catch {
      copyBtn.textContent = 'Failed';
    }
  });
  wrap.appendChild(copyBtn);
  return wrap;
}

function splitFencedCode(text) {
  const out = [];
  const re = /```([\w+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ type: 'text', text: text.slice(lastIndex, m.index) });
    }
    out.push({ type: 'code', lang: m[1] || '', text: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ type: 'text', text: text.slice(lastIndex) });
  }
  // Streaming half-open block — render whatever's after the opening fence
  // as a code block so the user sees code being typed instead of broken text.
  if (out.length === 0 || out[out.length - 1].type === 'text') {
    const tail = out.length === 0 ? text : out[out.length - 1].text;
    const openIdx = tail.lastIndexOf('```');
    if (openIdx >= 0 && tail.indexOf('\n', openIdx) > openIdx) {
      const lang = tail.slice(openIdx + 3, tail.indexOf('\n', openIdx)).trim();
      const code = tail.slice(tail.indexOf('\n', openIdx) + 1);
      const before = tail.slice(0, openIdx);
      if (out.length > 0) out.pop();
      if (before) out.push({ type: 'text', text: before });
      out.push({ type: 'code', lang, text: code });
    }
  }
  return out;
}

// Anime-companion personas often emit narrative actions like
// `*blushes softly and smiles warmly*`. Asterisks render as raw text in our
// minimal markdown so we substitute the whole block with a single emoji that
// stands in for the action. Keywords are matched in declaration order — list
// the more specific verbs first so e.g. "headpat" wins over "pat".
const ROLEPLAY_ACTION_EMOJI = [
  { keywords: ['headpat', 'pat head', 'pat the', "pats your", 'pats anh'], emoji: '🫳' },
  { keywords: ['hug', 'embrace', 'cuddle', 'snuggle', 'ôm'], emoji: '🤗' },
  { keywords: ['kiss', 'hôn'], emoji: '😘' },
  { keywords: ['blush', 'flush', 'redden', 'đỏ mặt'], emoji: '☺️' },
  { keywords: ['giggle', 'laugh', 'chuckle', 'cười'], emoji: '😄' },
  { keywords: ['smile', 'grin', 'beam', 'mỉm cười'], emoji: '🙂' },
  { keywords: ['wink', 'nháy mắt'], emoji: '😉' },
  { keywords: ['pout', 'sulk', 'huff', 'phụng phịu'], emoji: '😤' },
  { keywords: ['cry', 'sob', 'tear', 'khóc'], emoji: '🥺' },
  { keywords: ['gasp'], emoji: '😮' },
  { keywords: ['sigh', 'thở dài'], emoji: '😮‍💨' },
  { keywords: ['yawn', 'ngáp'], emoji: '🥱' },
  { keywords: ['nod', 'gật đầu'], emoji: '🙆' },
  { keywords: ['wave', 'vẫy'], emoji: '👋' },
  { keywords: ['whisper', 'murmur', 'thì thầm'], emoji: '🤫' },
  { keywords: ['think', 'ponder', 'wonder', 'tilt', 'nghĩ'], emoji: '🤔' },
  { keywords: ['jump', 'bounce', 'excited', 'nhảy'], emoji: '✨' },
  { keywords: ['shy', 'bashful', 'nervous', 'ngại'], emoji: '😳' },
  { keywords: ['heart', 'love', 'tim', 'yêu'], emoji: '💖' },
  { keywords: ['sparkle', 'shine', 'glow', 'lấp lánh'], emoji: '✨' },
  { keywords: ['look', 'gaze', 'stare', 'watch', 'nhìn'], emoji: '👀' },
  { keywords: ['clap', 'vỗ tay'], emoji: '👏' },
  { keywords: ['bow', 'cúi'], emoji: '🙇' },
  { keywords: ['point', 'chỉ'], emoji: '👉' },
  { keywords: ['warm', 'soft', 'gentle', 'dịu'], emoji: '🌸' },
];

function roleplayActionToEmoji(action) {
  const lower = action.toLowerCase();
  for (const entry of ROLEPLAY_ACTION_EMOJI) {
    for (const k of entry.keywords) {
      if (lower.includes(k)) return entry.emoji;
    }
  }
  return '🌸';
}

function renderInlineCode(container, text) {
  // Single pass: find inline code `…` and roleplay actions *…*. Action must
  // start with a letter (avoids matching markdown bold `**…**` or stray
  // asterisks on bullet lines) and stay on one line.
  const re = /(`[^`\n]+`)|(\*[A-Za-zÀ-ỹ][^*\n]*?\*)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
    }
    if (m[1]) {
      const code = document.createElement('code');
      code.textContent = m[1].slice(1, -1);
      container.appendChild(code);
    } else if (m[2]) {
      const inner = m[2].slice(1, -1);
      const span = document.createElement('span');
      span.className = 'chat-roleplay-emoji';
      span.textContent = roleplayActionToEmoji(inner);
      // Tooltip exposes the original action so the user can still read what
      // the model actually wrote when they're curious.
      span.title = inner;
      container.appendChild(span);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function setBusy(busy) {
  state.busy = busy;
  const sendBtn = $('chatSendBtn');
  const cancelBtn = $('chatCancelBtn');
  if (sendBtn) sendBtn.disabled = busy;
  if (cancelBtn) cancelBtn.hidden = !busy;
}

// ───────────────────────────────────── #file mention picker ─────────────────────────────────────

function handleTextareaKeydown(ev) {
  if (state.mention.open) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      moveMentionSelection(1);
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveMentionSelection(-1);
      return;
    }
    if (ev.key === 'Tab' || ev.key === 'Enter') {
      const item = state.mention.items[state.mention.activeIdx];
      if (item) {
        ev.preventDefault();
        acceptMention(item);
        return;
      }
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeMentionPicker();
      return;
    }
  }
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    submitPrompt();
  }
}

function handleTextareaInput(ev) {
  const textarea = ev.target;
  const caret = textarea.selectionStart;
  const value = textarea.value;
  // Look back for a `#` token at or before caret. Token continues while we
  // see word chars / path chars; spaces or new # close it.
  let start = -1;
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === '#') {
      const prev = i > 0 ? value[i - 1] : '';
      if (i === 0 || /\s/.test(prev)) {
        start = i;
      }
      break;
    }
    if (!/[\w./\\-]/.test(ch)) break;
  }
  if (start < 0) {
    closeMentionPicker();
    return;
  }
  const query = value.slice(start + 1, caret);
  state.mention.rangeStart = start;
  state.mention.query = query;
  vscode.postMessage({ command: 'chat:searchFiles', query });
}

function applyMentionResults(data) {
  // Stale query — user already moved on.
  if (data.query !== state.mention.query) return;
  state.mention.items = data.results || [];
  state.mention.activeIdx = 0;
  if (state.mention.items.length === 0) {
    closeMentionPicker();
    return;
  }
  openMentionPicker();
}

function openMentionPicker() {
  state.mention.open = true;
  renderMentionPicker();
}

function closeMentionPicker() {
  state.mention.open = false;
  const picker = $('chatMentionPicker');
  if (picker) picker.hidden = true;
}

function renderMentionPicker() {
  const picker = $('chatMentionPicker');
  if (!picker) return;
  picker.innerHTML = '';
  state.mention.items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'chat-mention-item' + (idx === state.mention.activeIdx ? ' active' : '');
    el.setAttribute('role', 'option');
    const name = document.createElement('div');
    name.className = 'chat-mention-item-name';
    name.textContent = item.basename;
    const p = document.createElement('div');
    p.className = 'chat-mention-item-path';
    p.textContent = item.path;
    el.appendChild(name);
    el.appendChild(p);
    el.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      acceptMention(item);
    });
    picker.appendChild(el);
  });
  picker.hidden = false;
}

function moveMentionSelection(delta) {
  const len = state.mention.items.length;
  if (len === 0) return;
  state.mention.activeIdx = (state.mention.activeIdx + delta + len) % len;
  renderMentionPicker();
}

function acceptMention(item) {
  const textarea = $('chatTextarea');
  if (!textarea || state.mention.rangeStart < 0) return;
  const before = textarea.value.slice(0, state.mention.rangeStart);
  const afterCaret = textarea.value.slice(textarea.selectionStart);
  const insert = `#${item.path} `;
  textarea.value = before + insert + afterCaret;
  const newCaret = before.length + insert.length;
  textarea.setSelectionRange(newCaret, newCaret);
  textarea.focus();
  closeMentionPicker();
}

function showStatus(text, isError) {
  const el = $('chatStatus');
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}
function clearStatus() {
  const el = $('chatStatus');
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
  el.classList.remove('error');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
