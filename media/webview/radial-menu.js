/**
 * Radial right-click menu.
 *
 * Instead of a vertical list at the cursor, the entries fan out on a ring
 * around the click point — icons only, with the hovered entry's name shown
 * in a pill at the centre. A category (Appearance, Git…) replaces the ring
 * with its own entries and turns the centre pill into a back button, so the
 * whole menu stays one ring deep: the panel is ~330 px wide and a second,
 * outer ring would not fit.
 *
 * Purely a shell — every entry carries the same `action` id the list menu
 * uses, and the caller's `onAction` is the same dispatcher. The list menu
 * stays available through the `animeCompanion.menuStyle` setting.
 */

const ITEM_SIZE = 34;
const RADIUS = 92;
const MIN_RADIUS = 56;
const MARGIN = 8;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function clamp(value, min, max) {
  return max < min ? (min + max) / 2 : Math.min(Math.max(value, min), max);
}

/**
 * @param {object} options
 * @param {() => Array<{icon:string,label:string,action?:string,id?:string,items?:Array}>} options.getItems
 *   Fresh entries for the root ring, read on every open so state-dependent
 *   labels (Mute / Unmute) are current.
 * @param {(action: string) => void} options.onAction
 * @param {{title:string, back:string, close:string}} options.labels
 */
export function createRadialMenu({ getItems, onAction, labels }) {
  const root = document.createElement('div');
  root.className = 'companion-radial';
  root.innerHTML =
    '<div class="companion-radial-ring"></div>' +
    '<button type="button" class="companion-radial-center"></button>';
  document.body.appendChild(root);

  const ring = root.querySelector('.companion-radial-ring');
  const center = root.querySelector('.companion-radial-center');

  let open = false;
  /** Drill-down stack: root ring first, the open category (if any) last. */
  let levels = [];

  function isOpen() {
    return open;
  }

  function contains(node) {
    return node instanceof Node && root.contains(node);
  }

  /** Puts the ring's centre at the click, pulled in so the whole ring fits. */
  function place(x, y) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // A small window (the desktop pet, a squeezed panel) gets a smaller ring
    // rather than one that runs off the edge.
    const radius = Math.max(
      MIN_RADIUS,
      Math.min(RADIUS, (Math.min(vw, vh) - 2 * MARGIN - ITEM_SIZE) / 2)
    );
    const reach = radius + ITEM_SIZE / 2 + MARGIN;
    root.style.setProperty('--radial-x', clamp(x, reach, vw - reach) + 'px');
    root.style.setProperty('--radial-y', clamp(y, reach, vh - reach) + 'px');
    root.style.setProperty('--radial-radius', radius + 'px');
  }

  function currentLevel() {
    return levels[levels.length - 1];
  }

  function showCenter(text) {
    center.textContent = text;
  }

  function render(level) {
    const isBack = levels.length > 1;
    center.classList.toggle('is-back', isBack);
    center.title = isBack ? labels.back : labels.close;
    showCenter(isBack ? '↩ ' + level.title : level.title);

    // Collapse to the centre, then let the transition carry each entry out
    // to its slot — the "burst" — with a small stagger down the ring.
    ring.classList.remove('is-out');
    ring.innerHTML = level.items
      .map((item, index) => {
        const angle = -90 + (360 / level.items.length) * index;
        const target = item.items
          ? `data-category="${escapeHtml(item.id)}"`
          : `data-action="${escapeHtml(item.action)}"`;
        return (
          `<button type="button" class="companion-radial-item" style="--angle:${angle}deg;--i:${index}" ` +
          `${target} data-label="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}">` +
          `<span class="companion-radial-icon">${item.icon}</span></button>`
        );
      })
      .join('');
    requestAnimationFrame(() => {
      if (open) ring.classList.add('is-out');
    });
  }

  function openAt(x, y) {
    const items = getItems();
    if (!Array.isArray(items) || items.length === 0) return;
    levels = [{ title: labels.title, items }];
    place(x, y);
    open = true;
    root.classList.add('show');
    render(levels[0]);
  }

  function close() {
    if (!open) return;
    open = false;
    levels = [];
    root.classList.remove('show');
    ring.classList.remove('is-out');
    ring.innerHTML = '';
  }

  function toggle(x, y) {
    if (open) close();
    else openAt(x, y);
  }

  ring.addEventListener('click', (e) => {
    const item = e.target.closest('.companion-radial-item');
    if (!item) return;
    const categoryId = item.getAttribute('data-category');
    if (categoryId) {
      const category = currentLevel().items.find((entry) => entry.id === categoryId);
      if (!category || !category.items) return;
      levels.push({ title: category.label, items: category.items });
      render(currentLevel());
      return;
    }
    const action = item.getAttribute('data-action');
    if (!action) return;
    close();
    onAction(action);
  });

  // The hovered entry's name shows in the centre; leaving restores the title.
  ring.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.companion-radial-item');
    if (item) showCenter(item.getAttribute('data-label') || '');
  });
  ring.addEventListener('mouseout', (e) => {
    const item = e.target.closest('.companion-radial-item');
    if (!item || !open) return;
    const level = currentLevel();
    if (level) showCenter(levels.length > 1 ? '↩ ' + level.title : level.title);
  });

  center.addEventListener('click', () => {
    if (levels.length > 1) {
      levels.pop();
      render(currentLevel());
    } else {
      close();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) close();
  });

  return { openAt, close, toggle, isOpen, contains };
}
