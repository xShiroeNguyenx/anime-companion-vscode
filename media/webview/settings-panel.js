// Anime Companion settings panel. Builds the form from the schema the
// extension posts (settings:state) — grouped sections, one control per type —
// and writes each change back as settings:set. Localized chrome comes from
// window.__SETTINGS_STRINGS__ and travels with every state message.
(function () {
  const vscode = acquireVsCodeApi();
  let S = window.__SETTINGS_STRINGS__ || {};
  const t = (key, fallback) => (S[key] != null ? S[key] : fallback);
  const root = document.getElementById('root');

  let state = null;
  let filter = '';
  let builtSignature = '';
  /** key -> { row, sync(item) } for in-place updates without a rebuild. */
  const controls = {};
  /** key -> textarea draft for JSON items; survives rebuilds and broadcasts. */
  const drafts = {};
  const SECTION_LABEL = {
    model: () => t('sectionModel', 'Model & Appearance'),
    sound: () => t('sectionSound', 'Voice & Sound'),
    messages: () => t('sectionMessages', 'Messages & Reactions'),
    pomodoro: () => t('sectionPomodoro', 'Pomodoro'),
    chibi: () => t('sectionChibi', 'Cursor Chibi'),
    chat: () => t('sectionChat', 'AI Chat'),
    desktop: () => t('sectionDesktop', 'Desktop Companion'),
    background: () => t('sectionBackground', 'Background Image'),
    other: () => t('sectionOther', 'Other'),
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const name in attrs) {
        const value = attrs[name];
        if (name === 'class') node.className = value;
        else if (name === 'text') node.textContent = value;
        else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value);
        else if (value === true) node.setAttribute(name, '');
        else if (value != null && value !== false) node.setAttribute(name, value);
      }
    }
    (children || []).forEach((child) => {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function post(command, payload) {
    vscode.postMessage(Object.assign({ command }, payload || {}));
  }

  function setValue(key, value) {
    post('settings:set', { key, value });
  }

  /** "chat.ollamaEndpoint" → "Chat: Ollama Endpoint", the way the native UI titles keys. */
  function titleFromKey(key) {
    const words = (segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
    const parts = key.split('.');
    if (parts.length === 1) return words(parts[0]);
    return parts.slice(0, -1).map(words).join(' › ') + ': ' + words(parts[parts.length - 1]);
  }

  function formatDefault(value) {
    if (value === undefined) return '—';
    if (typeof value === 'string') return value === '' ? '""' : value;
    if (typeof value === 'object') {
      const json = JSON.stringify(value);
      return json.length > 40 ? json.slice(0, 37) + '…' : json;
    }
    return String(value);
  }

  function matches(item) {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      item.key.toLowerCase().includes(q) ||
      titleFromKey(item.key).toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q)
    );
  }

  // ---- controls --------------------------------------------------------------

  function booleanControl(item) {
    let current = !!item.value;
    const button = el('button', {
      type: 'button',
      class: 'switch',
      role: 'switch',
      'aria-checked': String(current),
      onclick: () => setValue(item.key, !current),
    }, [el('span', { class: 'switch-knob' })]);
    return {
      node: button,
      sync(next) {
        current = !!next.value;
        button.setAttribute('aria-checked', String(current));
      },
    };
  }

  function enumControl(item) {
    const options = item.enum || [];
    if (options.length <= 4) {
      const buttons = options.map((option, index) =>
        el('button', {
          type: 'button',
          class: 'seg-btn',
          'data-value': String(option),
          title: item.enumDescriptions && item.enumDescriptions[index] ? item.enumDescriptions[index] : null,
          onclick: () => setValue(item.key, option),
        }, [String(option)])
      );
      const seg = el('div', { class: 'seg' }, buttons);
      const sync = (next) => {
        buttons.forEach((button) => button.classList.toggle('active', button.getAttribute('data-value') === String(next.value)));
      };
      sync(item);
      return { node: seg, sync };
    }
    const select = el('select', {
      class: 'select',
      onchange: () => setValue(item.key, select.value),
    }, options.map((option, index) =>
      el('option', {
        value: String(option),
        title: item.enumDescriptions && item.enumDescriptions[index] ? item.enumDescriptions[index] : null,
      }, [String(option)])
    ));
    select.value = String(item.value);
    return {
      node: select,
      sync(next) {
        if (document.activeElement !== select) select.value = String(next.value);
      },
    };
  }

  function numberControl(item) {
    const hasRange =
      typeof item.minimum === 'number' && typeof item.maximum === 'number' && item.maximum - item.minimum <= 400;
    const input = el('input', {
      type: 'number',
      class: 'num',
      min: typeof item.minimum === 'number' ? String(item.minimum) : null,
      max: typeof item.maximum === 'number' ? String(item.maximum) : null,
      step: 'any',
      onchange: () => {
        const n = Number(input.value);
        if (Number.isFinite(n)) setValue(item.key, n);
      },
    });
    input.value = String(item.value ?? '');
    const parts = [];
    let range = null;
    if (hasRange) {
      range = el('input', {
        type: 'range',
        class: 'range',
        min: String(item.minimum),
        max: String(item.maximum),
        step: '1',
        oninput: () => { input.value = range.value; },
        onchange: () => setValue(item.key, Number(range.value)),
      });
      range.value = String(item.value ?? item.minimum);
      parts.push(range);
    }
    parts.push(input);
    return {
      node: el('div', { class: 'num-wrap' }, parts),
      sync(next) {
        if (document.activeElement !== input) input.value = String(next.value ?? '');
        if (range && document.activeElement !== range) range.value = String(next.value ?? item.minimum);
      },
    };
  }

  function stringControl(item) {
    const input = el('input', {
      type: 'text',
      class: 'text',
      spellcheck: 'false',
      onchange: () => setValue(item.key, input.value),
      onkeydown: (e) => { if (e.key === 'Enter') input.blur(); },
    });
    input.value = item.value == null ? '' : String(item.value);
    return {
      node: input,
      sync(next) {
        if (document.activeElement !== input) input.value = next.value == null ? '' : String(next.value);
      },
    };
  }

  function jsonControl(item) {
    const pretty = (value) => JSON.stringify(value === undefined ? (item.type === 'array' ? [] : {}) : value, null, 2);
    const area = el('textarea', { class: 'json', rows: '4', spellcheck: 'false' });
    const error = el('div', { class: 'json-error', hidden: true });
    const save = el('button', { type: 'button', class: 'btn btn-primary btn-small', text: t('save', 'Save') });
    save.hidden = true;

    const refreshButtons = () => {
      const draft = drafts[item.key];
      save.hidden = draft === undefined || draft === pretty(item.value);
    };
    area.value = drafts[item.key] !== undefined ? drafts[item.key] : pretty(item.value);
    area.addEventListener('input', () => {
      drafts[item.key] = area.value;
      error.hidden = true;
      refreshButtons();
    });
    save.addEventListener('click', () => {
      let parsed;
      try {
        parsed = JSON.parse(area.value);
      } catch (err) {
        error.textContent = t('invalidJson', 'Invalid JSON: {error}').replace('{error}', err && err.message ? err.message : String(err));
        error.hidden = false;
        return;
      }
      const okType = item.type === 'array' ? Array.isArray(parsed) : parsed && typeof parsed === 'object' && !Array.isArray(parsed);
      if (!okType) {
        error.textContent = t('invalidJson', 'Invalid JSON: {error}').replace('{error}', item.type === 'array' ? 'expected an array' : 'expected an object');
        error.hidden = false;
        return;
      }
      delete drafts[item.key];
      setValue(item.key, parsed);
    });
    refreshButtons();
    return {
      node: el('div', { class: 'json-wrap' }, [area, el('div', { class: 'json-foot' }, [error, save])]),
      sync(next) {
        item.value = next.value;
        if (drafts[item.key] === undefined && document.activeElement !== area) area.value = pretty(next.value);
        refreshButtons();
      },
    };
  }

  function controlFor(item) {
    if (item.type === 'boolean') return booleanControl(item);
    if (item.enum && item.enum.length > 0) return enumControl(item);
    if (item.type === 'number') return numberControl(item);
    if (item.type === 'array' || item.type === 'object') return jsonControl(item);
    return stringControl(item);
  }

  // ---- rows / sections -------------------------------------------------------

  function itemRow(item) {
    const control = controlFor(item);
    const wide = item.type === 'array' || item.type === 'object' || (item.type === 'string' && !item.enum);
    const modified = el('span', { class: 'chip chip-modified', text: t('modified', 'Modified') });
    const workspace = el('div', { class: 'note note-workspace', text: t('workspaceNote', 'Overridden by this workspace — changes here go to user settings.') });
    const reset = el('button', {
      type: 'button',
      class: 'reset',
      title: t('reset', 'Reset to default'),
      'aria-label': t('reset', 'Reset to default'),
      onclick: () => { delete drafts[item.key]; post('settings:reset', { key: item.key }); },
    }, ['↺']);
    const defaultNote = el('span', { class: 'default', text: t('defaultValue', 'Default: {value}').replace('{value}', formatDefault(item.default)) });

    const row = el('div', { class: 'item' + (wide ? ' item-wide' : ''), 'data-key': item.key }, [
      el('div', { class: 'item-head' }, [
        el('div', { class: 'item-title-wrap' }, [
          el('div', { class: 'item-title', text: titleFromKey(item.key) }),
          el('div', { class: 'item-meta' }, [
            el('code', { class: 'key', text: 'animeCompanion.' + item.key }),
            defaultNote,
            modified,
          ]),
        ]),
        el('div', { class: 'item-actions' }, [reset]),
      ]),
      item.description ? el('div', { class: 'item-desc', text: item.description }) : null,
      el('div', { class: 'item-control' }, [control.node]),
      workspace,
    ]);

    const applyFlags = (next) => {
      row.classList.toggle('modified', !next.isDefault);
      modified.hidden = next.isDefault;
      reset.hidden = next.isDefault;
      workspace.hidden = next.source !== 'workspace';
    };
    applyFlags(item);

    controls[item.key] = {
      row,
      sync(next) {
        control.sync(next);
        applyFlags(next);
      },
    };
    return row;
  }

  function sectionCard(section) {
    const label = (SECTION_LABEL[section.id] || (() => section.id))();
    const head = el('div', { class: 'section-head' }, [
      el('span', { class: 'section-icon', text: section.icon }),
      el('h2', { class: 'section-title', text: label }),
      section.command ? null : el('span', { class: 'section-count', text: t('count', '{count} settings').replace('{count}', String(section.items.length)) }),
    ]);
    const body = section.command
      ? el('div', { class: 'section-link' }, [
          el('p', { class: 'section-hint', text: t('backgroundHint', 'The workbench background has its own control panel with image pickers, sliders and a live preview.') }),
          el('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: t('openBackground', 'Open Background panel'),
            onclick: () => post('settings:openSection', { id: section.id }),
          }),
        ])
      : el('div', { class: 'section-body' }, section.items.map(itemRow));
    return el('section', { class: 'section', id: 'section-' + section.id, 'data-section': section.id }, [head, body]);
  }

  function navButton(section) {
    const label = (SECTION_LABEL[section.id] || (() => section.id))();
    return el('button', {
      type: 'button',
      class: 'nav-btn',
      'data-section': section.id,
      onclick: () => {
        const target = document.getElementById('section-' + section.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        root.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.getAttribute('data-section') === section.id));
      },
    }, [
      el('span', { class: 'nav-icon', text: section.icon }),
      el('span', { class: 'nav-label', text: label }),
      section.command ? null : el('span', { class: 'nav-count', text: String(section.items.length) }),
    ]);
  }

  function build() {
    for (const key in controls) delete controls[key];
    root.innerHTML = '';

    const search = el('input', {
      type: 'search',
      class: 'search',
      placeholder: t('search', 'Search settings…'),
      'aria-label': t('search', 'Search settings…'),
      oninput: () => { filter = search.value.trim(); applyFilter(); },
    });
    search.value = filter;

    const header = el('header', { class: 'header' }, [
      el('div', { class: 'header-text' }, [
        el('h1', { text: '🌸 ' + t('title', 'Anime Companion Settings') }),
        el('p', { class: 'subtitle', text: t('subtitle', 'Every setting, grouped and searchable. Changes save to your user settings as you go.') }),
      ]),
      el('div', { class: 'header-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('openNative', 'VS Code Settings UI'), onclick: () => post('settings:openNative') }),
        el('button', { type: 'button', class: 'btn', text: t('openJson', 'settings.json'), onclick: () => post('settings:openJson') }),
      ]),
    ]);

    const nav = el('nav', { class: 'nav' }, state.sections.map(navButton));
    const content = el('div', { class: 'content' }, [
      search,
      el('div', { class: 'empty', hidden: true, text: '' }),
      ...state.sections.map(sectionCard),
    ]);

    root.appendChild(header);
    root.appendChild(el('div', { class: 'layout' }, [nav, content]));
    applyFilter();
    const first = root.querySelector('.nav-btn');
    if (first) first.classList.add('active');
  }

  function applyFilter() {
    let visible = 0;
    for (const section of state.sections) {
      const card = document.getElementById('section-' + section.id);
      if (!card) continue;
      if (section.command) {
        card.hidden = !!filter && !(SECTION_LABEL[section.id] || (() => ''))().toLowerCase().includes(filter.toLowerCase());
        if (!card.hidden) visible++;
        continue;
      }
      let shown = 0;
      for (const item of section.items) {
        const entry = controls[item.key];
        if (!entry) continue;
        const show = matches(item);
        entry.row.hidden = !show;
        if (show) shown++;
      }
      card.hidden = shown === 0;
      const nav = root.querySelector('.nav-btn[data-section="' + section.id + '"]');
      if (nav) nav.classList.toggle('dim', shown === 0);
      visible += shown;
    }
    const empty = root.querySelector('.empty');
    if (empty) {
      empty.hidden = visible > 0;
      empty.textContent = t('empty', 'No settings match “{query}”.').replace('{query}', filter);
    }
  }

  function signatureOf(next) {
    return JSON.stringify([
      next.sections.map((section) => [section.id, section.items.map((item) => item.key)]),
      S,
    ]);
  }

  function sync() {
    for (const section of state.sections) {
      for (const item of section.items) {
        const entry = controls[item.key];
        if (entry) entry.sync(item);
      }
    }
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || msg.command !== 'settings:state') return;
    if (msg.strings) S = msg.strings;
    state = { sections: msg.sections || [] };
    const signature = signatureOf(state);
    if (signature !== builtSignature) {
      builtSignature = signature;
      build();
    } else {
      sync();
      applyFilter();
    }
  });

  post('settings:ready');
})();
