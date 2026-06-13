/**
 * AI-Xcode IDE — Search Navigator
 *
 * A Xcode-style global find-and-replace navigator that searches across every
 * file in the Virtual File System.  Rendered into `#navigator-content` when
 * the user selects the "Search" navigator tab (or presses `⌘⇧F` and types in
 * the toolbar search box, which calls `searchNav.search()`).
 *
 * Features:
 *  - Search input with **case-sensitive**, **whole-word**, and **regex**
 *    toggle buttons.
 *  - Replace mode (reveals a replace input + "Replace All" button).
 *  - Results grouped by file, each file showing a count badge.
 *  - Each result row shows the line number and a snippet of the matched line
 *    with the match highlighted.
 *  - Clicking a result opens the file at that line via `app.openFile()`.
 *  - Summary line: total matches / total files.
 *
 * The actual content search is delegated to `app.vfs.searchInFiles(query,
 * options)`, which returns an array of `{ file, line, lineNum, match }`.
 *
 * @module navigator/search
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of result rows rendered per file (prevents UI jank on huge hits). */
const MAX_RESULTS_PER_FILE = 200;

/** Maximum number of files rendered before a "too many results" truncation notice. */
const MAX_FILES_RENDERED = 500;

/** How many characters of context to show on each side of a match. */
const SNIPPET_PADDING = 60;

// ─────────────────────────────────────────────────────────────────────────────
// SearchNavigator
// ─────────────────────────────────────────────────────────────────────────────

export class SearchNavigator {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /** The last executed search query (raw string). */
    this.query = '';

    /** The last executed search options snapshot. */
    this.options = { caseSensitive: false, wholeWord: false, regex: false };

    /** Whether replace mode is currently visible. */
    this.replaceMode = false;

    /**
     * Search results as returned by `vfs.searchInFiles`.
     * @type {Array<{file:string,line:string,lineNum:number,match:string}>}
     */
    this.results = [];

    /** Cached references to DOM elements created during the last `render()`. */
    this._els = null;
  }

  // ─── render ─────────────────────────────────────────────────────────────

  /**
   * Render the search navigator UI into the supplied container element.
   *
   * The UI consists of a search header (input + option toggles + replace
   * toggle), an optional replace row, a summary line, and the grouped results
   * list.
   *
   * @param {HTMLElement} container  The `#navigator-content` element.
   * @returns {void}
   */
  render(container) {
    if (!container) return;

    container.innerHTML = '';
    container.classList.add('search-navigator');

    // ── Search header ───────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'search-header';
    header.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--border);';

    // Search input row with toggle buttons.
    const inputRow = document.createElement('div');
    inputRow.style.cssText =
      'display:flex;align-items:center;gap:4px;margin-bottom:6px;';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Search in project…';
    searchInput.value = this.query;
    searchInput.style.cssText =
      'flex:1;background:var(--bg-tertiary);border:1px solid var(--border);' +
      'border-radius:5px;padding:5px 8px;color:var(--text-primary);font-size:12px;outline:none;';

    // Focus styling.
    searchInput.addEventListener('focus', () => {
      searchInput.style.borderColor = 'var(--accent)';
    });
    searchInput.addEventListener('blur', () => {
      searchInput.style.borderColor = 'var(--border)';
    });

    // Option toggle buttons.
    const caseBtn = this._buildToggle('Aa', 'Match Case', this.options.caseSensitive);
    const wordBtn = this._buildToggle('\\b', 'Whole Word', this.options.wholeWord);
    const regexBtn = this._buildToggle('.*', 'Regular Expression', this.options.regex);

    // Replace-mode reveal button.
    const replaceToggleBtn = document.createElement('button');
    replaceToggleBtn.className = 'search-icon-btn';
    replaceToggleBtn.title = 'Show Replace';
    replaceToggleBtn.innerHTML = '<i class="fas fa-right-left" style="font-size:11px;"></i>';
    replaceToggleBtn.style.cssText = this._iconBtnStyle(this.replaceMode);

    inputRow.appendChild(searchInput);
    inputRow.appendChild(caseBtn);
    inputRow.appendChild(wordBtn);
    inputRow.appendChild(regexBtn);
    inputRow.appendChild(replaceToggleBtn);
    header.appendChild(inputRow);

    // ── Replace row (conditionally visible) ─────────────────────────────────
    const replaceRow = document.createElement('div');
    replaceRow.style.cssText =
      'display:flex;align-items:center;gap:4px;margin-bottom:6px;' +
      (this.replaceMode ? '' : 'display:none;');

    const replaceInput = document.createElement('input');
    replaceInput.type = 'text';
    replaceInput.className = 'replace-input';
    replaceInput.placeholder = 'Replace with…';
    replaceInput.style.cssText =
      'flex:1;background:var(--bg-tertiary);border:1px solid var(--border);' +
      'border-radius:5px;padding:5px 8px;color:var(--text-primary);font-size:12px;outline:none;';

    const replaceAllBtn = document.createElement('button');
    replaceAllBtn.className = 'search-replace-btn';
    replaceAllBtn.textContent = 'All';
    replaceAllBtn.title = 'Replace all occurrences';
    replaceAllBtn.style.cssText =
      'background:var(--accent);color:#fff;border:none;border-radius:5px;' +
      'padding:5px 12px;font-size:11px;cursor:pointer;white-space:nowrap;';

    replaceRow.appendChild(replaceInput);
    replaceRow.appendChild(replaceAllBtn);
    header.appendChild(replaceRow);

    // ── Summary line ────────────────────────────────────────────────────────
    const summary = document.createElement('div');
    summary.className = 'search-summary';
    summary.style.cssText =
      'padding:4px 12px;font-size:11px;color:var(--text-tertiary);' +
      'border-bottom:1px solid var(--border);';
    summary.textContent = this._summaryText();

    header.appendChild(summary);
    container.appendChild(header);

    // ── Results list ────────────────────────────────────────────────────────
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'search-results';
    resultsContainer.style.cssText = 'overflow-y:auto;flex:1;';
    container.appendChild(resultsContainer);

    this._renderResults(resultsContainer);

    // Cache element references for later updates.
    this._els = {
      searchInput,
      replaceInput,
      replaceRow,
      replaceToggleBtn,
      replaceAllBtn,
      caseBtn,
      wordBtn,
      regexBtn,
      summary,
      resultsContainer,
    };

    // ── Event wiring ────────────────────────────────────────────────────────

    // Enter in the search input triggers a search.
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = searchInput.value;
        if (value.trim()) {
          this.search(value);
        } else {
          this.clear();
        }
      }
    });

    // Toggle buttons update the options and re-run the search if there is a query.
    caseBtn.addEventListener('click', () => {
      this.options.caseSensitive = !this.options.caseSensitive;
      this._syncToggleStyle(caseBtn, this.options.caseSensitive);
      if (this.query) this.search(this.query);
    });

    wordBtn.addEventListener('click', () => {
      this.options.wholeWord = !this.options.wholeWord;
      this._syncToggleStyle(wordBtn, this.options.wholeWord);
      if (this.query) this.search(this.query);
    });

    regexBtn.addEventListener('click', () => {
      this.options.regex = !this.options.regex;
      this._syncToggleStyle(regexBtn, this.options.regex);
      if (this.query) this.search(this.query);
    });

    // Replace-mode toggle.
    replaceToggleBtn.addEventListener('click', () => {
      this.replaceMode = !this.replaceMode;
      replaceRow.style.display = this.replaceMode ? 'flex' : 'none';
      replaceToggleBtn.style.background = this.replaceMode
        ? 'var(--accent)'
        : 'transparent';
      replaceToggleBtn.style.color = this.replaceMode ? '#fff' : 'var(--text-tertiary)';
      if (this.replaceMode) {
        replaceInput.focus();
      }
    });

    // Replace All.
    replaceAllBtn.addEventListener('click', () => {
      const replacement = replaceInput.value;
      this.replace(this.query, replacement, this.options);
    });

    // Enter in the replace input also triggers replace-all.
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.replace(this.query, replaceInput.value, this.options);
      }
    });

    // Auto-focus the search input.
    requestAnimationFrame(() => searchInput.focus());
  }

  // ─── search ─────────────────────────────────────────────────────────────

  /**
   * Execute a project-wide search via `app.vfs.searchInFiles()` and display
   * the results grouped by file.
   *
   * @param {string} query                    Search query string.
   * @param {object} [options]                Search options.
   * @param {boolean} [options.caseSensitive] Case-sensitive matching.
   * @param {boolean} [options.wholeWord]     Whole-word matching.
   * @param {boolean} [options.regex]         Treat `query` as a regex.
   * @returns {Promise<void>}
   */
  async search(query, options) {
    if (options) {
      this.options = {
        caseSensitive: !!options.caseSensitive,
        wholeWord: !!options.wholeWord,
        regex: !!options.regex,
      };
    }

    this.query = query || '';

    // Sync the input field if it exists.
    if (this._els?.searchInput) {
      this._els.searchInput.value = this.query;
      this._syncToggleStyle(this._els.caseBtn, this.options.caseSensitive);
      this._syncToggleStyle(this._els.wordBtn, this.options.wholeWord);
      this._syncToggleStyle(this._els.regexBtn, this.options.regex);
    }

    if (!this.query.trim()) {
      this.clear();
      return;
    }

    // Show a loading indicator.
    if (this._els?.summary) {
      this._els.summary.textContent = 'Searching…';
    }
    if (this._els?.resultsContainer) {
      this._els.resultsContainer.innerHTML =
        '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Searching…</div>';
    }

    try {
      this.results = await this.app.vfs.searchInFiles(this.query, this.options);
    } catch (err) {
      console.error('[SearchNavigator] search failed:', err);
      this.results = [];
      if (this._els?.summary) {
        this._els.summary.textContent = `Error: ${err.message}`;
        this._els.summary.style.color = 'var(--error)';
      }
      if (this._els?.resultsContainer) {
        this._els.resultsContainer.innerHTML =
          '<div style="padding:16px;color:var(--error);font-size:12px;">' +
          `<i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>${_escapeHtml(err.message)}</div>`;
      }
      return;
    }

    // Update summary + results.
    if (this._els?.summary) {
      this._els.summary.textContent = this._summaryText();
      this._els.summary.style.color = 'var(--text-tertiary)';
    }
    if (this._els?.resultsContainer) {
      this._renderResults(this._els.resultsContainer);
    }

    // Notify via toast only when results are unexpectedly empty.
    if (this.results.length === 0) {
      this.app.notifications?.toast('No results found.', 'info', 1500);
    }
  }

  // ─── replace ────────────────────────────────────────────────────────────

  /**
   * Replace all occurrences of `query` with `replacement` across the entire
   * project.  Re-runs the search afterwards to refresh the results list.
   *
   * @param {string} query       The search query (same one used in `search()`).
   * @param {string} replacement The replacement text.
   * @param {object} [options]   Search options (same shape as `search()`).
   * @returns {Promise<number>} The number of replacements made.
   */
  async replace(query, replacement, options) {
    if (!query || !query.trim()) {
      this.app.notifications?.toast('Enter a search term first.', 'warning');
      return 0;
    }

    // Ensure options are current.
    if (options) {
      this.options = {
        caseSensitive: !!options.caseSensitive,
        wholeWord: !!options.wholeWord,
        regex: !!options.regex,
      };
    }

    // Collect the set of files that have matches.
    let affected = [];
    try {
      const matches = await this.app.vfs.searchInFiles(query, this.options);
      affected = [...new Set(matches.map((m) => m.file))];
    } catch (err) {
      console.error('[SearchNavigator] replace (scan) failed:', err);
      this.app.notifications?.toast(`Replace failed: ${err.message}`, 'error');
      return 0;
    }

    if (affected.length === 0) {
      this.app.notifications?.toast('Nothing to replace.', 'info', 1500);
      return 0;
    }

    // Build the replacement regex (mirroring VFS logic for consistency).
    let pattern;
    try {
      let q = this.options.regex
        ? query
        : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (this.options.wholeWord) q = `\\b${q}\\b`;
      pattern = new RegExp(q, this.options.caseSensitive ? 'g' : 'gi');
    } catch (err) {
      this.app.notifications?.toast(`Invalid pattern: ${err.message}`, 'error');
      return 0;
    }

    let totalReplacements = 0;

    for (const filePath of affected) {
      const node = this.app.vfs._cache.get(filePath);
      if (!node || node.isFolder || !node.content) continue;

      const before = node.content;
      // Count replacements in this file.
      const count = (before.match(pattern) || []).length;
      if (count === 0) continue;

      pattern.lastIndex = 0;
      const after = before.replace(pattern, replacement);

      // Write back to the VFS.
      this.app.vfs.writeFile(filePath, after);

      // Update the editor model if this file is open.
      if (this.app.editor?.models?.has(filePath)) {
        const model = this.app.editor.models.get(filePath);
        if (model && model.getValue() !== after) {
          model.setValue(after);
        }
      }

      totalReplacements += count;
    }

    this.app.notifications?.toast(
      `Replaced ${totalReplacements} occurrence${totalReplacements === 1 ? '' : 's'} ` +
      `in ${affected.length} file${affected.length === 1 ? '' : 's'}.`,
      'success',
      2500,
    );

    // Re-run the search to refresh results.
    await this.search(query, this.options);

    return totalReplacements;
  }

  // ─── clear ──────────────────────────────────────────────────────────────

  /**
   * Clear all search results and reset the query.  Re-renders the empty
   * results list and summary.
   *
   * @returns {void}
   */
  clear() {
    this.query = '';
    this.results = [];

    if (this._els?.searchInput) {
      this._els.searchInput.value = '';
    }
    if (this._els?.summary) {
      this._els.summary.textContent = 'Type to search across all project files.';
      this._els.summary.style.color = 'var(--text-tertiary)';
    }
    if (this._els?.resultsContainer) {
      this._els.resultsContainer.innerHTML =
        '<div style="padding:24px 16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-magnifying-glass" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4;"></i>' +
        'Enter a search query to find text across your project.</div>';
    }
  }

  // ─── Internals: results rendering ───────────────────────────────────────

  /**
   * Render the grouped results list into the given container.
   *
   * Results are grouped by file path.  Each file header shows the file name,
   * the parent path, and a badge with the number of matches in that file.
   * Each result row shows the line number and a snippet of the matched line
   * with the match highlighted.
   *
   * @param {HTMLElement} container
   * @private
   */
  _renderResults(container) {
    container.innerHTML = '';

    if (this.results.length === 0) {
      if (this.query.trim()) {
        container.innerHTML =
          '<div style="padding:24px 16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
          '<i class="fas fa-circle-info" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4;"></i>' +
          'No matches found.</div>';
      } else {
        container.innerHTML =
          '<div style="padding:24px 16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
          '<i class="fas fa-magnifying-glass" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4;"></i>' +
          'Enter a search query to find text across your project.</div>';
      }
      return;
    }

    // Group results by file, preserving first-seen order.
    /** @type {Map<string, Array>} */
    const grouped = new Map();
    for (const r of this.results) {
      if (!grouped.has(r.file)) grouped.set(r.file, []);
      grouped.get(r.file).push(r);
    }

    let fileCount = 0;

    for (const [filePath, fileResults] of grouped) {
      if (fileCount >= MAX_FILES_RENDERED) {
        const notice = document.createElement('div');
        notice.style.cssText =
          'padding:10px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;text-align:center;';
        notice.textContent =
          `… and ${grouped.size - fileCount} more files. Refine your search to see them.`;
        container.appendChild(notice);
        break;
      }
      fileCount++;

      container.appendChild(
        this._buildFileGroup(filePath, fileResults),
      );
    }
  }

  /**
   * Build the DOM for a single file group (header + result rows).
   *
   * @param {string} filePath
   * @param {Array} fileResults  Array of `{ file, line, lineNum, match }`.
   * @returns {HTMLElement}
   * @private
   */
  _buildFileGroup(filePath, fileResults) {
    const group = document.createElement('div');
    group.className = 'search-file-group';
    group.style.cssText = 'border-bottom:1px solid var(--border);';

    // ── File header ────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'search-file-header';
    header.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;' +
      'background:var(--bg-secondary);';
    header.title = filePath;

    const icon = document.createElement('span');
    icon.className = 'search-file-icon';
    icon.innerHTML = `<i class="fas fa-file-lines" style="font-size:11px;color:var(--text-tertiary);"></i>`;

    const fileName = _basename(filePath);
    const dirPath = filePath.includes('/')
      ? filePath.slice(0, filePath.lastIndexOf('/'))
      : '';

    const nameWrap = document.createElement('span');
    nameWrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;';
    const nameEl = document.createElement('span');
    nameEl.textContent = fileName;
    nameEl.style.cssText =
      'font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;';
    const dirEl = document.createElement('span');
    dirEl.textContent = dirPath;
    dirEl.style.cssText =
      'font-size:10px;color:var(--text-tertiary);white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;';
    nameWrap.appendChild(nameEl);
    if (dirPath) nameWrap.appendChild(dirEl);

    const badge = document.createElement('span');
    badge.className = 'search-count-badge';
    badge.textContent = String(fileResults.length);
    badge.style.cssText =
      'flex-shrink:0;background:var(--bg-tertiary);color:var(--text-secondary);' +
      'font-size:10px;padding:1px 7px;border-radius:10px;min-width:18px;text-align:center;';

    header.appendChild(icon);
    header.appendChild(nameWrap);
    header.appendChild(badge);

    // Clicking the file header opens the file.
    header.addEventListener('click', () => {
      this.app.openFile(filePath);
    });

    group.appendChild(header);

    // ── Result rows ────────────────────────────────────────────────────────
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'search-file-rows';

    const shown = fileResults.slice(0, MAX_RESULTS_PER_FILE);
    for (const result of shown) {
      rowsContainer.appendChild(this._buildResultRow(filePath, result));
    }

    if (fileResults.length > MAX_RESULTS_PER_FILE) {
      const more = document.createElement('div');
      more.style.cssText =
        'padding:4px 24px;font-size:11px;color:var(--text-tertiary);font-style:italic;';
      more.textContent = `… ${fileResults.length - MAX_RESULTS_PER_FILE} more matches in this file.`;
      rowsContainer.appendChild(more);
    }

    group.appendChild(rowsContainer);
    return group;
  }

  /**
   * Build a single result row: line number + snippet with the match
   * highlighted.  Clicking opens the file at that line.
   *
   * @param {string} filePath
   * @param {{line:string,lineNum:number,match:string}} result
   * @returns {HTMLElement}
   * @private
   */
  _buildResultRow(filePath, result) {
    const row = document.createElement('div');
    row.className = 'search-result-row';
    row.style.cssText =
      'display:flex;align-items:flex-start;gap:8px;padding:3px 10px 3px 28px;' +
      'cursor:pointer;font-size:11px;line-height:1.4;';
    row.title = `${filePath}:${result.lineNum}`;

    // Highlight on hover.
    row.addEventListener('mouseenter', () => {
      row.style.background = 'var(--bg-tertiary)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });

    // Line number.
    const lineNum = document.createElement('span');
    lineNum.textContent = String(result.lineNum);
    lineNum.style.cssText =
      'flex-shrink:0;min-width:28px;text-align:right;color:var(--text-tertiary);' +
      'font-family:var(--mono-font);font-size:10px;padding-top:1px;';

    // Snippet with highlighted match.
    const snippet = document.createElement('span');
    snippet.className = 'search-snippet';
    snippet.style.cssText =
      'flex:1;font-family:var(--mono-font);white-space:pre;overflow:hidden;' +
      'text-overflow:ellipsis;direction:ltr;';
    snippet.innerHTML = this._highlightMatch(result.line, result.match);

    row.appendChild(lineNum);
    row.appendChild(snippet);

    // Click → open file at the matched line.
    row.addEventListener('click', () => {
      this.app.openFile(filePath, result.lineNum);
    });

    return row;
  }

  /**
   * Build an HTML snippet of the matched line with the match portion
   * wrapped in a `<mark>` tag.  The line is trimmed and truncated with
   * ellipses when it is very long.
   *
   * @param {string} line    The full source line.
   * @param {string} match   The exact matched substring.
   * @returns {string} Escaped HTML string.
   * @private
   */
  _highlightMatch(line, match) {
    if (!line) return '';

    let text = line.replace(/\t/g, ' ').trim();

    // Truncate around the match position when the line is very long.
    if (text.length > SNIPPET_PADDING * 2 + match.length) {
      const idx = text.indexOf(match);
      if (idx !== -1) {
        const start = Math.max(0, idx - SNIPPET_PADDING);
        const end = Math.min(text.length, idx + match.length + SNIPPET_PADDING);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < text.length ? '…' : '';
        text = prefix + text.slice(start, end) + suffix;
      }
    }

    // Escape first, then wrap the match.
    const escaped = _escapeHtml(text);
    const escapedMatch = _escapeHtml(match);

    if (!escapedMatch) return escaped;

    // Use a case-insensitive replace so the highlight captures the actual
    // occurrence regardless of search options.
    const re = new RegExp(
      escapedMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'gi',
    );
    return escaped.replace(
      re,
      '<mark style="background:rgba(255,214,10,.35);color:inherit;border-radius:2px;padding:0 1px;">$&</mark>',
    );
  }

  // ─── Internals: toggle buttons ──────────────────────────────────────────

  /**
   * Build a small toggle button for a search option.
   *
   * @param {string} label   Visible label/icon text.
   * @param {string} title   Tooltip text.
   * @param {boolean} active Whether the toggle starts active.
   * @returns {HTMLButtonElement}
   * @private
   */
  _buildToggle(label, title, active) {
    const btn = document.createElement('button');
    btn.className = 'search-toggle-btn';
    btn.textContent = label;
    btn.title = title;
    btn.type = 'button';
    btn.style.cssText = this._iconBtnStyle(active);
    return btn;
  }

  /**
   * Return the inline style string for an icon/toggle button, reflecting
   * whether it is currently active.
   *
   * @param {boolean} active
   * @returns {string}
   * @private
   */
  _iconBtnStyle(active) {
    const base =
      'flex-shrink:0;min-width:26px;height:26px;border:1px solid var(--border);' +
      'border-radius:5px;font-size:11px;cursor:pointer;display:flex;' +
      'align-items:center;justify-content:center;padding:0 5px;' +
      'font-family:var(--mono-font);transition:background .1s,color .1s;';
    if (active) {
      return base + 'background:var(--accent);color:#fff;border-color:var(--accent);';
    }
    return base + 'background:transparent;color:var(--text-tertiary);';
  }

  /**
   * Update the visual style of a toggle button to reflect its active state.
   *
   * @param {HTMLButtonElement} btn
   * @param {boolean} active
   * @private
   */
  _syncToggleStyle(btn, active) {
    if (!btn) return;
    btn.style.cssText = this._iconBtnStyle(active);
  }

  // ─── Internals: helpers ─────────────────────────────────────────────────

  /**
   * Build the summary text for the current results set.
   *
   * @returns {string}
   * @private
   */
  _summaryText() {
    if (!this.query.trim()) {
      return 'Type to search across all project files.';
    }
    if (this.results.length === 0) {
      return 'No results.';
    }
    const fileCount = new Set(this.results.map((r) => r.file)).size;
    return `${this.results.length} result${this.results.length === 1 ? '' : 's'} ` +
      `in ${fileCount} file${fileCount === 1 ? '' : 's'} for "${this.query}"`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers (kept module-local to avoid a runtime import dependency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape HTML-significant characters for safe `innerHTML` interpolation.
 * @param {string} text
 * @returns {string}
 */
function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extract the basename (last path segment) from a path string.
 * @param {string} path
 * @returns {string}
 */
function _basename(path) {
  if (typeof path !== 'string') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}
