// WYSIWYG Markdown editor webview (Toast UI Editor). Talks to the extension
// host over postMessage. See src/markdown/markdown-editor-panel.ts.
(function () {
  const vscode = acquireVsCodeApi();
  const strings = window.__MD_STRINGS__ || {};

  const editorEl = document.getElementById('editor');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');
  const themeBtn = document.getElementById('themeBtn');
  const accentInput = document.getElementById('accentColor');
  const accentResetBtn = document.getElementById('accentResetBtn');

  // The CSS default accent (the sakura pink). Must match :root --ac-accent in
  // markdown-editor.css so the swatch shows the real colour when no override.
  const DEFAULT_ACCENT = '#ff9ec7';

  let editor = null;
  let dirty = false;
  // Guard so programmatic setMarkdown() (initial load / external refresh) does
  // not count as a user edit and trip the dirty flag.
  let applyingRemote = false;
  let warnedReformat = false;
  let currentTheme = 'dark';
  // Custom accent (brand) colour (#rrggbb), or '' to use the CSS default.
  let currentAccent = '';

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

  // ---- Custom accent (theme) colour ---------------------------------------
  // Recolours the pink chrome (header, buttons, borders, links, scrollbar). The
  // page background is intentionally left to follow dark/light mode.
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const int = parseInt(m[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function rgbToHex(rgb) {
    return '#' + [rgb.r, rgb.g, rgb.b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('');
  }

  // Perceived luminance (0..1).
  function luminance(rgb) {
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  }

  // Blend toward black (f<0) or white (f>0) keeping the hue — used to derive the
  // deeper/lighter accent shades from the single picked colour.
  function shade(rgb, f) {
    const t = f < 0 ? 0 : 255;
    const a = Math.abs(f);
    return { r: rgb.r + (t - rgb.r) * a, g: rgb.g + (t - rgb.g) * a, b: rgb.b + (t - rgb.b) * a };
  }

  function syncAccentSwatch() {
    if (accentInput) accentInput.value = currentAccent || DEFAULT_ACCENT;
  }

  // Apply (or clear, when color is falsy) the custom accent by setting the
  // accent CSS vars on <body>; every pink surface derives from them.
  function applyAccent(color) {
    const style = document.body.style;
    const vars = [
      '--ac-accent', '--ac-accent-rgb', '--ac-accent-strong',
      '--ac-accent-soft', '--ac-accent-ink',
    ];
    const rgb = color ? hexToRgb(color) : null;
    if (!rgb) {
      currentAccent = '';
      vars.forEach((p) => style.removeProperty(p));
      syncAccentSwatch();
      return;
    }
    currentAccent = rgbToHex(rgb);
    style.setProperty('--ac-accent', currentAccent);
    style.setProperty('--ac-accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    style.setProperty('--ac-accent-strong', rgbToHex(shade(rgb, -0.14)));
    style.setProperty('--ac-accent-soft', rgbToHex(shade(rgb, 0.32)));
    // Ink must read against the accent-tinted header: dark plum on a bright
    // accent, near-white on a dark one.
    style.setProperty(
      '--ac-accent-ink',
      luminance(rgb) > 0.55 ? rgbToHex(shade(rgb, -0.68)) : '#fff6fb',
    );
    syncAccentSwatch();
  }

  if (accentInput) {
    // 'input' fires continuously while dragging — live preview only. 'change'
    // fires once the colour is committed — that's when we persist it.
    accentInput.addEventListener('input', () => applyAccent(accentInput.value));
    accentInput.addEventListener('change', () => {
      applyAccent(accentInput.value);
      vscode.postMessage({ command: 'md:setAccent', color: currentAccent });
    });
  }

  if (accentResetBtn) {
    accentResetBtn.addEventListener('click', () => {
      applyAccent('');
      vscode.postMessage({ command: 'md:setAccent', color: '' });
    });
  }

  // ---- Auto-hiding scrollbars ---------------------------------------------
  // The thin scrollbar thumb is invisible at rest (see markdown-editor.css);
  // flag `body.ac-scrolling` while the user is actively scrolling so only the
  // moving thumb shows, then fade it back out shortly after scrolling stops.
  let scrollHideTimer = null;
  function flagScrolling() {
    document.body.classList.add('ac-scrolling');
    if (scrollHideTimer) clearTimeout(scrollHideTimer);
    scrollHideTimer = setTimeout(() => document.body.classList.remove('ac-scrolling'), 900);
  }
  // Capture phase: scroll events don't bubble, and the real scrollers live deep
  // inside the Toast UI panes, so listen on the way down to catch them all.
  document.addEventListener('scroll', flagScrolling, true);

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
    applyAccent(currentAccent);
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
        if (typeof msg.accentColor === 'string') currentAccent = msg.accentColor;
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
