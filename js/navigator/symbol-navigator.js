/**
 * AI-Xcode IDE — Symbol Navigator
 *
 * Displays a flat-but-sorted tree of the symbols (classes, structs, enums,
 * interfaces, functions/methods, and top-level variables/constants) declared
 * in the **active file**.  Rendered into `#navigator-content` when the user
 * selects the "Symbols" navigator tab.
 *
 * Symbol extraction is intentionally lightweight — it uses a set of
 * language-specific regular expressions rather than a full parser.  This is
 * fast, has zero dependencies, and covers the vast majority of declarations
 * you would want to navigate to in an IDE navigator panel.
 *
 * Supported languages: Swift, JavaScript/TypeScript, Python, Java, Kotlin,
 * Go, Rust, C/C++, Ruby, PHP, Dart, and a generic fallback.
 *
 * Clicking a symbol opens the file (if needed) and jumps the editor to the
 * declaration line via `app.openFile(path, line)`.
 *
 * @module navigator/symbol-navigator
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FontAwesome icon class per symbol kind (used for the leading glyph).
 * @type {Record<string, string>}
 */
const SYMBOL_ICONS = {
  class:     'fas fa-cube',
  struct:    'fas fa-cubes',
  enum:      'fas fa-list-ol',
  interface: 'fas fa-vector-square',
  protocol:  'fas fa-handshake',
  function:  'fas fa-square-root-variable',
  method:    'fas fa-bolt',
  variable:  'fas fa-diamond',
  property:  'fas fa-tag',
  constant:  'fas fa-lock',
  trait:     'fas fa-shapes',
  type:      'fas fa-sitemap',
};

/**
 * Display label per symbol kind (used in tooltips / accessibility).
 * @type {Record<string, string>}
 */
const SYMBOL_LABELS = {
  class:     'Class',
  struct:    'Struct',
  enum:      'Enumeration',
  interface: 'Interface',
  protocol:  'Protocol',
  function:  'Function',
  method:    'Method',
  variable:  'Variable',
  property:  'Property',
  constant:  'Constant',
  trait:     'Trait',
  type:      'Type Alias',
};

/**
 * Sort order for symbol kinds (lower index = higher in the list).
 * Unknown kinds sort last.
 * @type {Record<string, number>}
 */
const SYMBOL_ORDER = {
  class: 0,
  struct: 1,
  interface: 2,
  protocol: 3,
  enum: 4,
  trait: 5,
  type: 6,
  function: 7,
  method: 8,
  property: 9,
  constant: 10,
  variable: 11,
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-language regex patterns
// ─────────────────────────────────────────────────────────────────────────────
//
// Each entry is an array of rule objects:
//   { kind, re }
//
// `re` is anchored to match a single line (the `m` flag is set).  Capture
// group 1 should hold the symbol name.  A line is only matched once (the
// first matching rule wins), which avoids double-counting.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, Array<{kind:string,re:RegExp}>>} */
const LANGUAGE_PATTERNS = {
  // ── Swift ──────────────────────────────────────────────────────────────
  swift: [
    { kind: 'class',     re: /^\s*(?:@\w+\s+)*(?:final\s+|open\s+|public\s+|internal\s+|private\s+|fileprivate\s+)*class\s+([A-Za-z_]\w*)/m },
    { kind: 'struct',    re: /^\s*(?:@\w+\s+)*(?:final\s+|open\s+|public\s+|internal\s+|private\s+|fileprivate\s+)*struct\s+([A-Za-z_]\w*)/m },
    { kind: 'enum',      re: /^\s*(?:@\w+\s+)*(?:final\s+|open\s+|public\s+|internal\s+|private\s+|fileprivate\s+)*enum\s+([A-Za-z_]\w*)/m },
    { kind: 'protocol',  re: /^\s*(?:@\w+\s+)*(?:public\s+|internal\s+|private\s+|fileprivate\s+)*protocol\s+([A-Za-z_]\w*)/m },
    { kind: 'type',      re: /^\s*(?:public\s+|internal\s+|private\s+|fileprivate\s+)*typealias\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:@\w+\s+)*(?:public\s+|private\s+|fileprivate\s+|internal\s+|static\s+|class\s+|mutating\s+|nonmutating\s+|@discardableResult\s+)*func\s+([A-Za-z_]\w*)/m },
    { kind: 'variable',  re: /^\s*(?:public\s+|private\s+|fileprivate\s+|internal\s+|static\s+|let\s+|var\s+)([A-Za-z_]\w*)\s*[:=]/m },
  ],

  // ── JavaScript / TypeScript ────────────────────────────────────────────
  javascript: [
    { kind: 'class',     re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'interface', re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'enum',      re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'type',      re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'function',  re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/m },
    { kind: 'function',  re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/m },
    { kind: 'constant',  re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/m },
    { kind: 'variable',  re: /^\s*(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=/m },
  ],
  typescript: [
    { kind: 'class',     re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'interface', re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'enum',      re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'type',      re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/m },
    { kind: 'function',  re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/m },
    { kind: 'function',  re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/m },
    { kind: 'constant',  re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/m },
    { kind: 'variable',  re: /^\s*(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=/m },
  ],

  // ── Python ─────────────────────────────────────────────────────────────
  python: [
    { kind: 'class',    re: /^class\s+([A-Za-z_]\w*)/m },
    { kind: 'function', re: /^(?:async\s+)?def\s+([A-Za-z_]\w*)/m },
    { kind: 'constant', re: /^([A-Z][A-Z0-9_]*)\s*=/m },
    { kind: 'variable', re: /^([a-z_]\w*)\s*=/m },
  ],

  // ── Java / Kotlin ──────────────────────────────────────────────────────
  java: [
    { kind: 'class',     re: /^\s*(?:public|protected|private|abstract|final|static|\s)*(?:class|interface|enum)\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:public|protected|private|abstract|final|static|synchronized|native|\s)+[\w<>\[\],\s]+\s+([A-Za-z_]\w*)\s*\(/m },
    { kind: 'constant',  re: /^\s*(?:public|protected|private|static|final|\s)*[A-Za-z_][\w<>\[\]]*\s+([A-Z][A-Z0-9_]*)\s*=/m },
  ],
  kotlin: [
    { kind: 'class',     re: /^\s*(?:public|private|protected|internal|abstract|open|sealed|data|final|\s)*(?:class|interface|object|enum class)\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:public|private|protected|internal|abstract|open|final|override|suspend|inline|\s)*fun\s+([A-Za-z_]\w*)/m },
    { kind: 'constant',  re: /^\s*(?:public|private|protected|internal|const|val|\s)*val\s+([A-Z][A-Z0-9_]*)/m },
    { kind: 'property',  re: /^\s*(?:public|private|protected|internal|override|lateinit|\s)*(?:val|var)\s+([a-z_]\w*)/m },
  ],

  // ── Go ─────────────────────────────────────────────────────────────────
  go: [
    { kind: 'struct',    re: /^type\s+([A-Za-z_]\w*)\s+struct\b/m },
    { kind: 'interface', re: /^type\s+([A-Za-z_]\w*)\s+interface\b/m },
    { kind: 'type',      re: /^type\s+([A-Za-z_]\w*)\s+/m },
    { kind: 'function',  re: /^func\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)\s*\(/m },
    { kind: 'constant',  re: /^const\s+([A-Za-z_]\w*)/m },
    { kind: 'variable',  re: /^var\s+([A-Za-z_]\w*)/m },
  ],

  // ── Rust ───────────────────────────────────────────────────────────────
  rust: [
    { kind: 'struct',    re: /^\s*(?:pub\s+)?(?:struct|union)\s+([A-Za-z_]\w*)/m },
    { kind: 'enum',      re: /^\s*(?:pub\s+)?enum\s+([A-Za-z_]\w*)/m },
    { kind: 'trait',     re: /^\s*(?:pub\s+)?trait\s+([A-Za-z_]\w*)/m },
    { kind: 'type',      re: /^\s*(?:pub\s+)?type\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:pub\s+)?(?:async\s+|unsafe\s+|const\s+|extern\s+[\w\s"()]*)*(?:fn)\s+([A-Za-z_]\w*)/m },
    { kind: 'constant',  re: /^\s*(?:pub\s+)?const\s+([A-Za-z_]\w*)/m },
    { kind: 'variable',  re: /^\s*(?:pub\s+)?(?:static|let)\s+(?:mut\s+)?([A-Za-z_]\w*)/m },
  ],

  // ── C / C++ ────────────────────────────────────────────────────────────
  c: [
    { kind: 'type',      re: /^\s*(?:typedef\s+)?(?:struct|union|enum)\s+([A-Za-z_]\w*)/m },
    { kind: 'type',      re: /^\s*typedef\s+.*?\s+([A-Za-z_]\w*)\s*;/m },
    { kind: 'function',  re: /^\s*(?:static\s+|inline\s+|extern\s+)*[\w\s\*]+\b([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/m },
    { kind: 'constant',  re: /^\s*#define\s+([A-Za-z_]\w*)/m },
  ],
  cpp: [
    { kind: 'class',     re: /^\s*(?:template\s*<[^>]*>\s*)?(?:class|struct)\s+([A-Za-z_]\w*)/m },
    { kind: 'enum',      re: /^\s*enum\s+(?:class\s+|struct\s+)?([A-Za-z_]\w*)/m },
    { kind: 'type',      re: /^\s*(?:using|typedef)\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:[\w\s\*:~&]+\s+)([A-Za-z_]\w*(?:::[A-Za-z_]\w*)?)\s*\([^;]*\)\s*(?:const\s*)?(?:\{|--)/m },
    { kind: 'constant',  re: /^\s*(?:const|constexpr|static const)\s+.*?\s+([A-Z_][A-Z0-9_]*)\s*=/m },
  ],

  // ── Ruby ───────────────────────────────────────────────────────────────
  ruby: [
    { kind: 'class',    re: /^\s*(?:module\s+)?class\s+(?:[A-Za-z_]\w*::)*([A-Za-z_]\w*)/m },
    { kind: 'function', re: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/m },
    { kind: 'constant', re: /^\s*([A-Z][A-Z0-9_]*)\s*=/m },
  ],

  // ── PHP ────────────────────────────────────────────────────────────────
  php: [
    { kind: 'class',     re: /^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/m },
    { kind: 'interface', re: /^\s*interface\s+([A-Za-z_]\w*)/m },
    { kind: 'trait',     re: /^\s*trait\s+([A-Za-z_]\w*)/m },
    { kind: 'enum',      re: /^\s*enum\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:public|protected|private|static|abstract|final|\s)*function\s+([A-Za-z_]\w*)/m },
    { kind: 'constant',  re: /^\s*const\s+([A-Za-z_]\w*)/m },
  ],

  // ── Dart ───────────────────────────────────────────────────────────────
  dart: [
    { kind: 'class',     re: /^\s*(?:abstract\s+|sealed\s+|base\s+|final\s+|interface\s+)?class\s+([A-Za-z_]\w*)/m },
    { kind: 'enum',      re: /^\s*enum\s+([A-Za-z_]\w*)/m },
    { kind: 'type',      re: /^\s*typedef\s+([A-Za-z_]\w*)/m },
    { kind: 'function',  re: /^\s*(?:static\s+|async\s+|external\s+|factory\s+|\s)*[\w<>\[\],\s]+\s+([A-Za-z_]\w*)\s*\(/m },
    { kind: 'constant',  re: /^\s*const\s+([A-Za-z_]\w*)/m },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SymbolNavigator
// ─────────────────────────────────────────────────────────────────────────────

export class SymbolNavigator {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /**
     * Parsed symbols for the active file.
     * @type {Array<{name:string,type:string,line:number,icon:string}>}
     */
    this.symbols = [];

    /** Filter query typed in the symbol navigator's filter box. */
    this._filter = '';
  }

  // ─── render ─────────────────────────────────────────────────────────────

  /**
   * Render the symbol navigator into the supplied container.
   *
   * Reads the active file's content from the VFS cache (falling back to the
   * editor model), parses its symbols via {@link parseSymbols}, applies an
   * optional filter, and renders a scrollable list.  A filter input at the top
   * narrows the list as the user types.
   *
   * @param {HTMLElement} container  The `#navigator-content` element.
   * @returns {void}
   */
  render(container) {
    if (!container) return;

    container.innerHTML = '';
    container.classList.add('symbol-navigator');

    // ── Filter input ───────────────────────────────────────────────────────
    const filterWrap = document.createElement('div');
    filterWrap.style.cssText =
      'padding:8px 10px;border-bottom:1px solid var(--border);';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'symbol-filter-input';
    filterInput.placeholder = 'Filter symbols…';
    filterInput.value = this._filter;
    filterInput.style.cssText =
      'width:100%;box-sizing:border-box;background:var(--bg-tertiary);' +
      'border:1px solid var(--border);border-radius:5px;padding:5px 8px;' +
      'color:var(--text-primary);font-size:12px;outline:none;';

    filterInput.addEventListener('focus', () => {
      filterInput.style.borderColor = 'var(--accent)';
    });
    filterInput.addEventListener('blur', () => {
      filterInput.style.borderColor = 'var(--border)';
    });

    filterWrap.appendChild(filterInput);
    container.appendChild(filterWrap);

    // ── List container ─────────────────────────────────────────────────────
    const listContainer = document.createElement('div');
    listContainer.className = 'symbol-list';
    listContainer.style.cssText = 'overflow-y:auto;flex:1;';
    container.appendChild(listContainer);

    // ── Parse symbols from the active file ─────────────────────────────────
    const activePath = this.app.activeFile;
    let fileNode = null;
    let content = '';
    let language = 'plaintext';

    if (activePath) {
      fileNode = this.app.vfs._cache.get(activePath);
      if (fileNode && !fileNode.isFolder) {
        content = fileNode.content || '';
        language = fileNode.language || this.app.vfs.getFileLanguage(activePath);
      } else {
        // Try the editor model as a fallback (unsaved / unsynced content).
        if (this.app.editor?.getContent) {
          content = this.app.editor.getContent(activePath) || '';
        }
        language = this.app.vfs.getFileLanguage(activePath);
      }
    }

    if (!activePath || (!content && !fileNode)) {
      listContainer.innerHTML =
        '<div style="padding:24px 16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-diagram-project" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4;"></i>' +
        'No file selected.<br>Open a file to view its symbols.</div>';
      return;
    }

    this.symbols = this.parseSymbols(content, language);

    // Render the (possibly filtered) list.
    const renderList = () => {
      const q = this._filter.trim().toLowerCase();
      const filtered = q
        ? this.symbols.filter((s) => s.name.toLowerCase().includes(q))
        : this.symbols;
      this._renderList(listContainer, filtered);
    };

    renderList();

    // Filter as the user types.
    filterInput.addEventListener('input', () => {
      this._filter = filterInput.value;
      renderList();
    });

    // Keyboard: Enter jumps to the first filtered symbol.
    filterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = this._filter.trim().toLowerCase();
        const list = q
          ? this.symbols.filter((s) => s.name.toLowerCase().includes(q))
          : this.symbols;
        if (list.length > 0) {
          this.onSymbolClick(list[0].line);
        }
      }
    });

    // Auto-focus the filter input.
    requestAnimationFrame(() => filterInput.focus());
  }

  // ─── parseSymbols ───────────────────────────────────────────────────────

  /**
   * Extract symbols from source code using language-specific regex patterns.
   *
   * The method splits the content into lines and tests each non-comment line
   * against the appropriate pattern set.  The first matching rule for a line
   * determines the symbol kind and name.  Results are sorted by kind (classes
   * first, then structs, interfaces, etc.) and then by line number.
   *
   * @param {string} content   Full source text.
   * @param {string} language  Monaco language id (e.g. "swift", "javascript").
   * @returns {Array<{name:string,type:string,line:number,icon:string}>}
   */
  parseSymbols(content, language) {
    if (!content || typeof content !== 'string') return [];

    const patterns = LANGUAGE_PATTERNS[language] || LANGUAGE_PATTERNS.javascript;
    const lines = content.split('\n');
    /** @type {Array<{name:string,type:string,line:number}>} */
    const found = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      // Skip blank lines quickly.
      if (!raw.trim()) continue;

      // Skip comment-only lines for common languages.
      const trimmed = raw.trimStart();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('--') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('<!--')
      ) {
        continue;
      }

      // Try each pattern; the first match wins for this line.
      for (const rule of patterns) {
        // Reset lastIndex for stateful regexes.
        rule.re.lastIndex = 0;
        const m = rule.re.exec(raw);
        if (m && m[1]) {
          const name = m[1].trim();
          // Guard against false positives from keywords used as names.
          if (_KEYWORDS.has(name)) continue;
          found.push({ name, type: rule.kind, line: i + 1 });
          break; // Only one symbol per line.
        }
      }
    }

    // Sort: by kind priority, then by line number.
    found.sort((a, b) => {
      const ordA = SYMBOL_ORDER[a.type] ?? 99;
      const ordB = SYMBOL_ORDER[b.type] ?? 99;
      if (ordA !== ordB) return ordA - ordB;
      return a.line - b.line;
    });

    // Map to the final shape with icon.
    return found.map((s) => ({
      name: s.name,
      type: s.type,
      line: s.line,
      icon: SYMBOL_ICONS[s.type] || 'fas fa-code',
    }));
  }

  // ─── onSymbolClick ──────────────────────────────────────────────────────

  /**
   * Open the active file (if needed) and jump the editor to the given line.
   * Delegates to `app.openFile(path, line)`.
   *
   * @param {number} line  1-based line number of the symbol declaration.
   * @returns {void}
   */
  onSymbolClick(line) {
    const path = this.app.activeFile;
    if (!path) return;
    this.app.openFile(path, line);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Render the (possibly filtered) symbol list into `container`.
   *
   * Symbols are visually grouped under collapsible kind headers when there
   * are multiple kinds; otherwise a flat list is shown.
   *
   * @param {HTMLElement} container
   * @param {Array<{name:string,type:string,line:number,icon:string}>} symbols
   * @private
   */
  _renderList(container, symbols) {
    container.innerHTML = '';

    if (symbols.length === 0) {
      container.innerHTML =
        '<div style="padding:20px 16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-circle-info" style="font-size:22px;display:block;margin-bottom:6px;opacity:.4;"></i>' +
        (this._filter.trim()
          ? 'No matching symbols.'
          : 'No symbols found in this file.') +
        '</div>';
      return;
    }

    // Group by kind to render kind headers.
    const grouped = new Map();
    for (const sym of symbols) {
      if (!grouped.has(sym.type)) grouped.set(sym.type, []);
      grouped.get(sym.type).push(sym);
    }

    for (const [kind, groupSymbols] of grouped) {
      // Kind header.
      const header = document.createElement('div');
      header.className = 'symbol-kind-header';
      header.style.cssText =
        'display:flex;align-items:center;gap:5px;padding:4px 12px;' +
        'font-size:10px;font-weight:600;text-transform:uppercase;' +
        'letter-spacing:.04em;color:var(--text-tertiary);background:var(--bg-secondary);';
      header.innerHTML =
        `<i class="${SYMBOL_ICONS[kind] || 'fas fa-code'}" style="font-size:9px;"></i>` +
        `<span>${SYMBOL_LABELS[kind] || kind}</span>` +
        `<span style="margin-left:auto;font-weight:400;opacity:.7;">${groupSymbols.length}</span>`;
      container.appendChild(header);

      // Symbol rows.
      for (const sym of groupSymbols) {
        container.appendChild(this._buildSymbolRow(sym));
      }
    }
  }

  /**
   * Build a single clickable symbol row.
   *
   * @param {{name:string,type:string,line:number,icon:string}} sym
   * @returns {HTMLElement}
   * @private
   */
  _buildSymbolRow(sym) {
    const row = document.createElement('div');
    row.className = 'symbol-item';
    row.style.cssText =
      'display:flex;align-items:center;gap:7px;padding:3px 12px;cursor:pointer;font-size:12px;';
    row.title = `${SYMBOL_LABELS[sym.type] || sym.type} — line ${sym.line}`;

    // Highlight on hover.
    row.addEventListener('mouseenter', () => {
      row.style.background = 'var(--bg-tertiary)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });

    // Icon.
    const iconEl = document.createElement('span');
    iconEl.className = 'symbol-icon';
    iconEl.innerHTML = `<i class="${sym.icon}" style="font-size:10px;color:var(--accent);width:14px;text-align:center;flex-shrink:0;"></i>`;

    // Name.
    const nameEl = document.createElement('span');
    nameEl.className = 'symbol-name';
    nameEl.textContent = sym.name;
    nameEl.style.cssText =
      'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary);';

    // Line number badge.
    const lineEl = document.createElement('span');
    lineEl.className = 'symbol-line';
    lineEl.textContent = String(sym.line);
    lineEl.style.cssText =
      'flex-shrink:0;font-size:10px;color:var(--text-tertiary);font-family:var(--mono-font);';

    row.appendChild(iconEl);
    row.appendChild(nameEl);
    row.appendChild(lineEl);

    // Click → open file at the symbol's line.
    row.addEventListener('click', () => {
      this.onSymbolClick(sym.line);
    });

    return row;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A set of reserved keywords that should never be treated as a symbol name.
 * This guards against regex false positives (e.g. `class extends` matching
 * "extends" as a class name).
 * @type {Set<string>}
 */
const _KEYWORDS = new Set([
  // JS/TS
  'extends', 'implements', 'constructor', 'prototype', 'default', 'from',
  'export', 'import', 'return', 'typeof', 'instanceof', 'new', 'delete',
  'void', 'in', 'of', 'as', 'async', 'await', 'yield', 'this', 'super',
  // Swift
  'didSet', 'willSet', 'get', 'set', 'subscript', 'init', 'deinit',
  'extension', 'where', 'guard', 'defer', 'repeat', 'fallthrough',
  // Python
  'self', 'cls', 'lambda', 'pass', 'with', 'elif', 'None', 'True', 'False',
  // Go / Rust / C
  'func', 'ret', 'nil', 'true', 'false', 'NULL', 'sizeof', 'typedef',
]);

/**
 * Extract the basename (last path segment) from a path string.
 * (Kept module-local to avoid a runtime import dependency.)
 * @param {string} path
 * @returns {string}
 */
function _basename(path) {
  if (typeof path !== 'string') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}
