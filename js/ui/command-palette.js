/**
 * AI-Xcode IDE — Command Palette
 *
 * A VS Code / Xcode-style quick-open overlay (`Cmd+Shift+P`) that lets the
 * user fuzzy-search every IDE command and run it with a single keystroke.
 *
 * The palette is opened by `app.setupKeyboardShortcuts()` calling `open()`.
 * The overlay markup lives in `index.html` (`#cmd-overlay`, `#cmd-input`,
 * `#cmd-results`). The matching styles (`.cmd-palette-overlay.visible`,
 * `.cmd-item.selected`, …) live in `css/main.css`.
 *
 * Architecture notes:
 *  - `this.commands` holds the master list of registered commands.
 *  - On every keystroke `filter()` rebuilds `this._filtered` and `render()`
 *    repaints the list; the selection index is kept inside the filtered set.
 *  - `handleKeydown()` is attached to `#cmd-input` and handles Arrow / Enter
 *    / Escape navigation while the palette is visible.
 *
 * @module ui/command-palette
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy matching helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Case-insensitive fuzzy match: returns true if every character of `query`
 * appears in `text` in order (but not necessarily contiguously). Empty queries
 * match everything.
 *
 * @param {string} text   The haystack (e.g. a command name).
 * @param {string} query  The needle typed by the user.
 * @returns {boolean}
 */
function fuzzyMatch(text, query) {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/**
 * Heuristic relevance score (higher = better) used to order filtered results.
 * Rewards prefix matches and contiguous subsequence matches.
 *
 * @param {string} text   Lower-cased command name.
 * @param {string} query  Lower-cased query.
 * @returns {number}
 */
function fuzzyScore(text, query) {
  if (!query) return 0;
  let score = 0;
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      score += ti === 0 || text[ti - 1] === ' ' ? 5 : 1; // prefix/word-boundary bonus
      qi++;
    }
  }
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandPalette
// ─────────────────────────────────────────────────────────────────────────────

export class CommandPalette {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /** @type {Array<{category:string,name:string,shortcut:string,callback:Function}>} */
    this.commands = [];

    /** Currently highlighted index within `this._filtered`. */
    this.selectedIndex = 0;

    /** Whether the overlay is currently visible. */
    this.isVisible = false;

    /** @type {Array} The last filtered command set (subset of `this.commands`). */
    this._filtered = [];

    // Cached DOM nodes (the markup already exists in index.html).
    this._overlay = document.getElementById('cmd-overlay');
    this._input = document.getElementById('cmd-input');
    this._results = document.getElementById('cmd-results');

    this._bindEvents();
    this._registerBuiltins();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Show the overlay, clear the input, focus it, and render every command. */
  open() {
    this.isVisible = true;
    this._overlay.classList.add('visible');
    this._input.value = '';
    this.selectedIndex = 0;
    this.render('');
    // Defer focus so the visible transition has applied and the input is interactive.
    requestAnimationFrame(() => this._input.focus());
  }

  /** Hide the overlay. */
  close() {
    this.isVisible = false;
    this._overlay.classList.remove('visible');
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a command.
   *
   * @param {string}   category  Logical grouping (e.g. "File", "Build").
   * @param {string}   name      Human-readable command name.
   * @param {string}   shortcut  Display-only shortcut (e.g. "⌘N"). May be empty.
   * @param {Function} callback  Invoked (with no args) when the command runs.
   */
  register(category, name, shortcut, callback) {
    this.commands.push({ category, name, shortcut, callback });
  }

  // ── Filtering & Rendering ──────────────────────────────────────────────────

  /**
   * Fuzzy-filter the command list by `query`, returning an ordered array.
   * Results are grouped by category, then sorted by fuzzy relevance score.
   *
   * @param {string} query  The user's search text.
   * @returns {Array} Filtered + scored commands.
   */
  filter(query) {
    const q = (query || '').trim();
    const matched = this.commands
      .filter(cmd => fuzzyMatch(cmd.name, q) || fuzzyMatch(cmd.category, q));

    if (!q) {
      // No query → keep registration order, grouped by category for readability.
      return matched.slice().sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
    }

    // Sort by descending fuzzy score; ties fall back to category then name.
    return matched
      .map(cmd => ({ cmd, score: fuzzyScore(cmd.name, q) + fuzzyScore(cmd.category, q) * 0.5 }))
      .sort((a, b) => b.score - a.score || a.cmd.name.localeCompare(b.cmd.name))
      .map(entry => entry.cmd);
  }

  /**
   * Repaint the results list for the given query. Honours `this.selectedIndex`,
   * clamping it to the filtered set.
   *
   * @param {string} query  The current search text.
   */
  render(query) {
    this._filtered = this.filter(query);
    if (this.selectedIndex >= this._filtered.length) {
      this.selectedIndex = Math.max(0, this._filtered.length - 1);
    }

    if (this._filtered.length === 0) {
      this._results.innerHTML =
        '<div class="cmd-item" style="cursor:default;color:var(--text-tertiary);justify-content:center;">No matching commands</div>';
      return;
    }

    // Build the list. Click + mouseenter handlers are bound via data attributes
    // read off the container (event delegation keeps it cheap).
    this._results.innerHTML = this._filtered
      .map((cmd, index) => {
        const selected = index === this.selectedIndex ? ' selected' : '';
        const icon = CATEGORY_ICONS[cmd.category] || 'fa-solid fa-angle-right';
        return `
          <div class="cmd-item${selected}" data-index="${index}">
            <span class="cmd-icon"><i class="${icon}"></i></span>
            <span class="cmd-label">${escapeHtml(cmd.name)}</span>
            <span class="cmd-category">${escapeHtml(cmd.category)}</span>
            ${cmd.shortcut ? `<span class="cmd-shortcut">${escapeHtml(cmd.shortcut)}</span>` : ''}
          </div>`;
      })
      .join('');

    // Ensure the highlighted row is scrolled into view.
    const sel = this._results.querySelector('.cmd-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Run the command at `index` within the currently filtered set, then close
   * the palette. Defaults to the selected index when none is given.
   *
   * @param {number} [index]  Index into `this._filtered`.
   */
  execute(index = this.selectedIndex) {
    const cmd = this._filtered[index];
    if (!cmd) return;
    this.close();
    try {
      cmd.callback();
    } catch (err) {
      console.error('[CommandPalette] command failed:', cmd.name, err);
      this.app.notifications.toast(`Command failed: ${cmd.name}`, 'error');
    }
  }

  // ── Keyboard / Mouse handling ──────────────────────────────────────────────

  /**
   * Handle a keydown event fired inside `#cmd-input`.
   *
   * - ArrowDown / ArrowUp: move the selection within the filtered set.
   * - Enter: run the selected command.
   * - Escape: close the palette.
   *
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this._filtered.length;
        this._syncSelection();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + this._filtered.length) % this._filtered.length;
        this._syncSelection();
        break;
      case 'Enter':
        e.preventDefault();
        this.execute();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Attach input/keyboard/click listeners (bound once in the constructor). */
  _bindEvents() {
    // Typing re-filters and re-renders.
    this._input.addEventListener('input', () => {
      this.selectedIndex = 0;
      this.render(this._input.value);
    });
    // In-palette keyboard navigation.
    this._input.addEventListener('keydown', (e) => this.handleKeydown(e));
    // Clicking outside the palette card closes it.
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });
    // Mouse interaction with results (delegated): hover tracks selection,
    // click executes.
    this._results.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.cmd-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10);
      if (!Number.isNaN(idx) && idx !== this.selectedIndex) {
        this.selectedIndex = idx;
        this._syncSelection();
      }
    });
    this._results.addEventListener('click', (e) => {
      const item = e.target.closest('.cmd-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10);
      if (!Number.isNaN(idx)) this.execute(idx);
    });
  }

  /** Re-render the current selection without rebuilding the whole list. */
  _syncSelection() {
    const items = this._results.querySelectorAll('.cmd-item');
    items.forEach((el, i) => el.classList.toggle('selected', i === this.selectedIndex));
    const sel = this._results.querySelector('.cmd-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  /** Register the IDE's built-in command set. */
  _registerBuiltins() {
    const app = this.app;
    const toast = (msg, type) => app.notifications.toast(msg, type);

    // ── File ────────────────────────────────────────────────────────────────
    this.register('File', 'New File', '⌘N', () => app.newFile());
    this.register('File', 'New Folder', '', () => app.newFolder());
    this.register('File', 'Open File', '', () => {
      const path = prompt('Enter file path to open:');
      if (path) app.openFile(path);
    });
    this.register('File', 'Save', '⌘S', () => {
      if (app.activeFile) {
        app.editor.save(app.activeFile);
        toast('Saved.', 'success', 1500);
      } else {
        toast('No active file to save.', 'warning');
      }
    });
    this.register('File', 'Close Tab', '⌘W', () => {
      if (app.activeFile) app.closeFile(app.activeFile);
    });

    // ── Edit ────────────────────────────────────────────────────────────────
    this.register('Edit', 'Format Document', '⇧⌥F', () => {
      if (app.editor && app.editor.monaco) {
        app.editor.monaco.getAction('editor.action.formatDocument')?.run();
        toast('Document formatted.', 'success', 1500);
      }
    });
    this.register('Edit', 'Find', '⌘F', () => {
      if (app.editor && app.editor.monaco) {
        app.editor.monaco.getAction('actions.find')?.run();
      }
    });
    this.register('Edit', 'Replace', '⌥⌘F', () => {
      if (app.editor && app.editor.monaco) {
        app.editor.monaco.getAction('editor.action.startFindReplaceAction')?.run();
      }
    });

    // ── View ────────────────────────────────────────────────────────────────
    this.register('View', 'Toggle Navigator', '⌘0', () =>
      app.togglePanel('sidebar-left', 'btn-toggle-left'));
    this.register('View', 'Toggle Inspector', '⌃⌘0', () =>
      app.togglePanel('sidebar-right', 'btn-toggle-right'));
    this.register('View', 'Toggle AI Panel', '⌃⌘A', () =>
      app.togglePanel('ai-panel', 'btn-toggle-ai'));
    this.register('View', 'Toggle Debug Area', '⌘⇧Y', () =>
      app.togglePanel('panel-bottom', 'btn-toggle-bottom'));
    this.register('View', 'Toggle Theme', '', () => {
      const next = app.settings.theme === 'dark' ? 'light' : 'dark';
      app.saveSettings({ theme: next });
      toast(`Theme: ${next}`, 'info', 1500);
    });

    // ── Build ───────────────────────────────────────────────────────────────
    this.register('Build', 'Run', '⌘R', () => app.run());
    this.register('Build', 'Stop', '⌘.', () => app.stop());
    this.register('Build', 'Build', '⌘B', () => app.buildSystem.build());

    // ── AI ──────────────────────────────────────────────────────────────────
    this.register('AI', 'Explain Code', '', () => app.aiChat.quickAction('explain'));
    this.register('AI', 'Find Bugs', '', () => app.aiChat.quickAction('bugs'));
    this.register('AI', 'Refactor', '', () => app.aiChat.quickAction('refactor'));
    this.register('AI', 'Generate Tests', '', () => app.aiChat.quickAction('tests'));
    this.register('AI', 'Code Review', '', () => app.aiChat.quickAction('review'));
    this.register('AI', 'Generate Docs', '', () => app.aiChat.quickAction('docs'));
    this.register('AI', 'Ask AI', '', () => {
      const aiInput = document.getElementById('ai-input');
      if (aiInput) {
        app.togglePanel('ai-panel', 'btn-toggle-ai');
        aiInput.focus();
      }
    });

    // ── Navigate ────────────────────────────────────────────────────────────
    this.register('Navigate', 'Go to Line', '⌃G', () => {
      if (app.editor && app.editor.monaco) {
        app.editor.monaco.getAction('editor.action.gotoLine')?.run();
      }
    });
    this.register('Navigate', 'Go to Symbol', '⌘⇧O', () => {
      if (app.editor && app.editor.monaco) {
        app.editor.monaco.getAction('editor.action.quickOutline')?.run();
      }
    });
    this.register('Navigate', 'Global Search', '⌘⇧F', () => {
      const search = document.getElementById('toolbar-search');
      if (search) search.focus();
    });

    // ── Git ─────────────────────────────────────────────────────────────────
    this.register('Git', 'Commit', '', () => {
      app.showNavigator('git');
      toast('Opened source control for commit.', 'info');
    });
    this.register('Git', 'View Changes', '', () => app.showNavigator('git'));

    // ── Help ────────────────────────────────────────────────────────────────
    this.register('Help', 'Keyboard Shortcuts', '', () =>
      toast('⌘⇧P Palette · ⌘N New · ⌘S Save · ⌘R Run · ⌘F Find', 'info', 6000));
    this.register('Help', 'About', '', () =>
      toast('AI-Xcode IDE — GLM-Powered · v1.0', 'info', 4000));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants (kept module-local to avoid pulling helpers.js at runtime)
// ─────────────────────────────────────────────────────────────────────────────

/** FontAwesome icon class per command category. */
const CATEGORY_ICONS = {
  File: 'fas fa-file',
  Edit: 'fas fa-pen',
  View: 'fas fa-eye',
  Build: 'fas fa-hammer',
  AI: 'fas fa-robot',
  Navigate: 'fas fa-location-arrow',
  Git: 'fab fa-git-alt',
  Help: 'fas fa-circle-question',
};

/**
 * Escape a string for safe insertion into `innerHTML`.
 * (Local copy so this module has no runtime dependency on utils/helpers.js.)
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
