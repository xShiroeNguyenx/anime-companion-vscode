// WYSIWYG Markdown editor webview (Toast UI Editor). Talks to the extension
// host over postMessage. See src/markdown/markdown-editor-panel.ts.
(function () {
  const vscode = acquireVsCodeApi();
  const strings = window.__MD_STRINGS__ || {};

  const editorEl = document.getElementById('editor');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');
  const themeBtn = document.getElementById('themeBtn');

  let editor = null;
  let dirty = false;
  // Guard so programmatic setMarkdown() (initial load / external refresh) does
  // not count as a user edit and trip the dirty flag.
  let applyingRemote = false;
  let warnedReformat = false;
  let currentTheme = 'dark';

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  // Dark/light is driven entirely by classes: `theme-dark`/`theme-light` on the
  // body (our pink palette) plus Toast UI's own `toastui-editor-dark` on its
  // root, so we can flip it live without rebuilding the editor.
  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-dark', currentTheme === 'dark');
    document.body.classList.toggle('theme-light', currentTheme === 'light');
    const root = editorEl.querySelector('.toastui-editor-defaultUI');
    if (root) root.classList.toggle('toastui-editor-dark', currentTheme === 'dark');
    if (themeBtn) {
      // Show the icon of the mode you'd switch TO.
      themeBtn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
      themeBtn.title = currentTheme === 'dark'
        ? (strings.lightMode || 'Light mode')
        : (strings.darkMode || 'Dark mode');
    }
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
      vscode.postMessage({ command: 'md:setTheme', theme: currentTheme });
    });
  }

  // Surface any failure right in the panel so a blank editor is never a mystery.
  function showError(message) {
    editorEl.innerHTML =
      '<div class="md-error"><strong>Markdown editor failed to load</strong><pre></pre></div>';
    const pre = editorEl.querySelector('pre');
    if (pre) pre.textContent = String(message || 'Unknown error');
    setStatus('');
  }

  window.addEventListener('error', (e) => {
    showError(e && e.error ? (e.error.stack || e.error.message) : e.message);
  });

  function setDirty(value) {
    dirty = value;
    saveBtn.disabled = !value;
    if (value) {
      setStatus(strings.unsaved || 'Unsaved changes');
    }
  }

  function onUserEdit() {
    if (applyingRemote) return;
    if (!dirty) {
      // Surface the round-trip caveat once, the first time the user edits.
      if (!warnedReformat && strings.reformatWarning) {
        setStatus(strings.reformatWarning);
      }
      warnedReformat = true;
      vscode.postMessage({ command: 'md:dirty' });
    }
    setDirty(true);
  }

  function createEditor(initial) {
    if (typeof toastui === 'undefined' || !toastui.Editor) {
      showError('Toast UI Editor bundle did not load (toastui.Editor is undefined).');
      return;
    }
    editor = new toastui.Editor({
      el: editorEl,
      height: '100%',
      initialEditType: 'wysiwyg',
      previewStyle: 'vertical',
      initialValue: initial || '',
      usageStatistics: false,
      autofocus: false,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'image', 'link'],
        ['code', 'codeblock'],
        ['scrollSync'],
      ],
    });
    editor.on('change', onUserEdit);
  }

  function applyContent(content) {
    applyingRemote = true;
    try {
      if (!editor) {
        createEditor(content);
      } else {
        editor.setMarkdown(content || '', false);
      }
    } catch (err) {
      showError(err && err.stack ? err.stack : err);
      return;
    } finally {
      applyingRemote = false;
    }
    if (!editor) return;
    applyTheme(currentTheme);
    setDirty(false);
    warnedReformat = false;
    setStatus('');
  }

  function save() {
    if (!editor || !dirty) return;
    vscode.postMessage({ command: 'md:save', markdown: editor.getMarkdown() });
    setStatus(strings.saving || 'Saving…');
  }

  saveBtn.addEventListener('click', save);

  // Ctrl/Cmd+S inside the webview saves too.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    switch (msg.command) {
      case 'md:setContent':
        if (msg.strings) Object.assign(strings, msg.strings);
        if (msg.theme) currentTheme = msg.theme === 'light' ? 'light' : 'dark';
        applyContent(msg.content);
        break;
      case 'md:externalChange':
        // File changed elsewhere while we had no pending edits — refresh.
        applyContent(msg.content);
        break;
      case 'md:saved':
        setDirty(false);
        setStatus(strings.saved || 'Saved');
        break;
    }
  });

  vscode.postMessage({ command: 'md:ready' });
})();
