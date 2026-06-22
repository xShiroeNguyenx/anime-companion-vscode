// Control panel for the workbench background image. Renders entirely from the
// state the extension posts (window.__BG_STATE__ / background:state messages)
// and the localized strings injected as window.__BG_STRINGS__.
(function () {
  const vscode = acquireVsCodeApi();
  let S = window.__BG_STRINGS__ || {};
  const t = (key, fallback) => (S[key] != null ? S[key] : fallback);

  // Reserve space at the bottom equal to the fixed footer's height so the last
  // card isn't hidden behind it (footer grows when "How this works" expands).
  function adjustFooterPadding() {
    const f = document.querySelector('.footer');
    if (f) document.body.style.paddingBottom = (f.offsetHeight + 28) + 'px';
  }

  const REGIONS = ['fullscreen', 'editor', 'sidebar', 'panel'];
  const REGION_META = {
    fullscreen: { icon: '🪟', label: () => t('regionFullscreen', 'Fullscreen (whole window)') },
    editor: { icon: '📝', label: () => t('regionEditor', 'Editor') },
    sidebar: { icon: '📁', label: () => t('regionSidebar', 'Sidebar') },
    panel: { icon: '🖥️', label: () => t('regionPanel', 'Panel') },
  };
  const SIZES = ['cover', 'contain', 'repeat', 'stretch'];
  const SIZE_LABEL = {
    cover: () => t('sizeCover', 'Cover'),
    contain: () => t('sizeContain', 'Contain'),
    repeat: () => t('sizeRepeat', 'Repeat'),
    stretch: () => t('sizeStretch', 'Stretch'),
  };
  const POSITIONS = [
    ['top left', 'top', 'top right'],
    ['left', 'center', 'right'],
    ['bottom left', 'bottom', 'bottom right'],
  ];

  const root = document.getElementById('root');
  let state = null;

  // Per-region URL box state, kept OUTSIDE `state` so it survives the full
  // re-render that every background:state broadcast triggers (e.g. dragging a
  // slider). Holds the in-progress text, loading flag, and last error.
  const urlStates = {};
  function urlState(region) {
    if (!urlStates[region]) urlStates[region] = { value: '', loading: false, error: '' };
    return urlStates[region];
  }
  function submitUrl(region) {
    const st = urlState(region);
    const value = (st.value || '').trim();
    if (!value || st.loading) return;
    st.loading = true;
    st.error = '';
    post('background:addUrl', { region, url: value });
    render();
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function post(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }

  // ---- per-region card ----
  function regionCard(region) {
    const r = state.regions[region];
    const meta = REGION_META[region];

    const enableCb = el('input', {
      type: 'checkbox', checked: r.enabled,
      onchange: (e) => post('background:setRegionEnabled', { region, value: e.target.checked }),
    });

    const thumb = el('div', {
      class: 'thumb' + (r.imageUri ? ' has-image' : ''),
      onclick: () => post('background:pickImage', { region }),
    });
    if (r.imageUri) {
      const timg = el('img', { class: 'thumb-img', src: r.imageUri, alt: '' });
      timg.addEventListener('error', () => {
        thumb.classList.add('load-error');
        thumb.textContent = t('previewFailed', 'Image failed to load');
      });
      thumb.appendChild(timg);
    } else {
      thumb.appendChild(document.createTextNode(t('noImage', 'Click to choose an image…')));
    }

    const pickBtns = el('div', { class: 'picker-buttons' }, [
      el('button', { class: 'btn', text: t('pick', 'Choose…'), onclick: () => post('background:pickImage', { region }) }),
      el('button', { class: 'btn', text: t('clear', 'Clear'), disabled: !r.imageUri, onclick: () => post('background:clearImage', { region }) }),
    ]);

    // URL box — paste a Google Drive / Dropbox / direct image link. The
    // extension downloads it, saves it like a picked file, and updates config.
    const ust = urlState(region);
    const urlInput = el('input', {
      type: 'url', class: 'url-input', value: ust.value, disabled: ust.loading,
      placeholder: t('urlPlaceholder', 'Paste image link (Google Drive, Dropbox, direct URL)…'),
    });
    const urlAddBtn = el('button', {
      class: 'btn', disabled: ust.loading || !ust.value.trim(),
      text: ust.loading ? t('urlLoading', 'Loading…') : t('urlAdd', 'Add URL'),
      onclick: () => submitUrl(region),
    });
    urlInput.addEventListener('input', (e) => {
      ust.value = e.target.value;
      urlAddBtn.disabled = ust.loading || !ust.value.trim();
    });
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitUrl(region); }
    });
    const urlRow = el('div', { class: 'url-row' }, [urlInput, urlAddBtn]);
    const urlError = ust.error ? el('div', { class: 'url-error', text: ust.error }) : null;

    const picker = el('div', { class: 'picker' }, [
      thumb,
      pickBtns,
      urlRow,
      urlError,
      el('div', { class: 'filename', text: r.imageName || '' }),
    ]);

    // sliders
    const opacityVal = el('span', { class: 'value', text: r.opacity + '%' });
    const opacity = el('input', {
      type: 'range', min: '0', max: '100', value: r.opacity,
      oninput: (e) => { opacityVal.textContent = e.target.value + '%'; },
      onchange: (e) => post('background:set', { region, key: 'opacity', value: Number(e.target.value) }),
    });
    const blurVal = el('span', { class: 'value', text: r.blur + 'px' });
    const blur = el('input', {
      type: 'range', min: '0', max: '40', value: r.blur,
      oninput: (e) => { blurVal.textContent = e.target.value + 'px'; },
      onchange: (e) => post('background:set', { region, key: 'blur', value: Number(e.target.value) }),
    });

    const seg = el('div', { class: 'segmented' }, SIZES.map((s) =>
      el('button', {
        class: r.size === s ? 'active' : '', text: SIZE_LABEL[s](),
        onclick: () => post('background:set', { region, key: 'size', value: s }),
      })));

    const posGrid = el('div', { class: 'posgrid' }, POSITIONS.flat().map((p) =>
      el('button', {
        class: r.position === p ? 'active' : '', title: p,
        onclick: () => post('background:set', { region, key: 'position', value: p }),
      })));

    const controls = el('div', { class: 'controls' }, [
      el('div', { class: 'control-row' }, [el('label', { text: t('opacity', 'Opacity') }), opacity, opacityVal]),
      el('div', { class: 'control-row' }, [el('label', { text: t('blur', 'Blur') }), blur, blurVal]),
      el('div', { class: 'control-row' }, [el('label', { text: t('sizing', 'Sizing') }), seg]),
      el('div', { class: 'control-row' }, [el('label', { text: t('position', 'Position') }), posGrid]),
    ]);

    // preview — image as a real <img> BEHIND the faux code lines (matches the
    // "behind text" look the workbench patch produces).
    const preview = el('div', { class: 'preview' });
    if (r.imageUri) {
      const pimg = el('img', { class: 'preview-img', src: r.imageUri, alt: '' });
      pimg.style.opacity = (r.opacity / 100).toString();
      if (r.blur > 0) pimg.style.filter = `blur(${r.blur}px)`;
      pimg.style.objectFit = r.size === 'contain' ? 'contain' : (r.size === 'stretch' ? 'fill' : 'cover');
      pimg.style.objectPosition = r.position;
      pimg.addEventListener('error', () => {
        const note = el('div', { class: 'preview-failed', text: t('previewFailed', 'Image failed to load') });
        preview.insertBefore(note, preview.firstChild);
      });
      preview.appendChild(pimg);
    }
    const codeLayer = el('div', { class: 'code-layer' }, [50, 80, 35, 65, 45].map((w) => {
      const line = el('div', { class: 'line' });
      line.style.width = w + '%';
      return line;
    }));
    preview.appendChild(codeLayer);
    const previewWrap = el('div', { class: 'preview-wrap' }, [
      el('div', { class: 'preview-title', text: t('previewTitle', 'Preview') }),
      preview,
      el('div', { class: 'preview-note', text: t('previewApprox', 'Approximate — the real background appears after Apply (window reload).') }),
    ]);

    const body = el('div', { class: 'card-body' }, [picker, controls, previewWrap]);

    return el('div', { class: 'card' + (r.enabled ? '' : ' disabled') }, [
      el('div', { class: 'card-header' }, [
        el('span', { class: 'region-icon', text: meta.icon }),
        el('span', { text: meta.label() }),
        el('span', { class: 'spacer' }),
        el('label', { class: 'toggle' }, [enableCb, document.createTextNode(t('regionEnable', 'Enabled'))]),
      ]),
      body,
    ]);
  }

  // ---- footer ----
  function footer() {
    const masterCb = el('input', {
      type: 'checkbox', checked: state.enabled,
      onchange: (e) => post('background:setEnabled', { value: e.target.checked }),
    });
    const checksumCb = el('input', {
      type: 'checkbox', checked: state.patchChecksums,
      onchange: (e) => post('background:setPatchChecksums', { value: e.target.checked }),
    });

    const lifecycle = el('details', { class: 'lifecycle', ontoggle: adjustFooterPadding }, [
      el('summary', { text: t('lifecycleTitle', 'How this works') }),
      el('ul', {}, [
        el('li', { text: t('lifecycleReload', 'Changes need a window reload to appear — the Apply button does this.') }),
        el('li', { text: t('lifecycleUpdate', 'After a VS Code update the background is wiped — just click Apply again.') }),
        el('li', { text: t('lifecycleAdmin', 'If VS Code is installed in Program Files, applying may need running it as Administrator once.') }),
      ]),
    ]);

    return el('div', { class: 'footer' }, [
      el('label', { class: 'toggle' }, [masterCb, document.createTextNode(t('masterEnable', 'Enable background'))]),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn', text: t('disableRestore', 'Disable & Restore'), onclick: () => post('background:disable') }),
      el('button', { class: 'btn primary', text: t('apply', 'Apply') + ' — ' + t('applyHint', 'reloads window'), onclick: () => post('background:apply') }),
      el('div', { class: 'checksum-row' }, [
        el('label', { class: 'toggle' }, [checksumCb, document.createTextNode(t('patchChecksums', 'Silence the "installation corrupt" warning'))]),
        el('div', { class: 'checksum-warning', text: t('patchChecksumsWarning', 'Patches VS Code’s integrity check — more invasive, may need re-applying after updates.') }),
      ]),
      lifecycle,
    ]);
  }

  function render() {
    if (!state) return;
    root.textContent = '';

    root.appendChild(el('h1', { text: t('title', 'Background Image') }));
    root.appendChild(el('div', { class: 'subtitle', text: t('subtitle', 'Put an image behind your editor, sidebar, and panel.') }));

    const dirty = el('div', { class: 'banner dirty' }, [
      el('span', { text: t('dirtyBanner', 'You have unapplied changes.') }),
      el('button', { class: 'btn primary', text: t('apply', 'Apply'), onclick: () => post('background:apply') }),
    ]);
    dirty.hidden = !state.dirty;
    root.appendChild(dirty);

    if (state.platformNote) {
      root.appendChild(el('div', { class: 'banner warn' }, [el('span', { text: state.platformNote })]));
    }

    REGIONS.forEach((r) => root.appendChild(regionCard(r)));
    root.appendChild(footer());
    requestAnimationFrame(adjustFooterPadding);
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.command === 'background:state') {
      if (msg.strings) S = msg.strings;
      state = msg.state;
      render();
    } else if (msg && msg.command === 'background:urlResult') {
      const st = urlState(msg.region);
      st.loading = false;
      if (msg.ok) {
        st.value = '';
        st.error = '';
      } else {
        st.error = msg.error || t('urlError', 'Could not load image from URL');
      }
      render();
    }
  });

  window.addEventListener('resize', adjustFooterPadding);

  post('background:ready');
})();
