/**
 * AI-Xcode IDE — Inspector Panel (Right Sidebar)
 *
 * Renders the Xcode-style right-hand inspector, composed of four collapsible
 * sections:
 *
 *   1. **File Inspector** — static file attributes (name, path, type, size,
 *      line count, encoding, last-modified).
 *   2. **Quick Help** — a concise summary of the active file or the symbol
 *      under the cursor (declaration kind, name, language, location).
 *   3. **Identity Inspector** — Interface-Builder identity fields (custom
 *      class, module, storyboard ID, restoration ID).
 *   4. **Attributes Inspector** — context-sensitive attributes shown only when
 *      the Interface Builder canvas is active (i.e. an `.xib`/`.storyboard`
 *      file is open or `app.interfaceBuilder` is present and active).
 *
 * The panel is instantiated once in {@link AIXcodeApp.init} and re-renders
 * every time `app.openFile()` calls `inspector.updateFile(path)`.
 *
 * @module ui/inspector-panel
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map Monaco language id → human-readable label for the File Inspector.
 * @type {Record<string, string>}
 */
const LANGUAGE_LABELS = {
  swift:       'Swift',
  javascript:  'JavaScript',
  typescript:  'TypeScript',
  python:      'Python',
  html:        'HTML',
  htm:         'HTML',
  css:         'CSS',
  scss:        'SCSS',
  less:        'Less',
  json:        'JSON',
  markdown:    'Markdown',
  xml:         'XML',
  plist:       'Property List',
  cpp:         'C++',
  c:           'C',
  rust:        'Rust',
  go:          'Go',
  java:        'Java',
  kotlin:      'Kotlin',
  shell:       'Shell Script',
  sql:         'SQL',
  yaml:        'YAML',
  toml:        'TOML',
  ini:         'INI',
  php:         'PHP',
  dart:        'Dart',
  ruby:        'Ruby',
  plaintext:   'Plain Text',
};

/**
 * File extensions that belong to the Interface Builder family. When one of
 * these is active, the Identity and Attributes inspectors become visible.
 */
const IB_EXTENSIONS = new Set(['.xib', '.storyboard', '.nib']);

/**
 * Default Identity Inspector field set (mimics Xcode's IB Identity section).
 * Values are read from `this.identity` and fall back to placeholders.
 */
const IDENTITY_FIELDS = [
  { key: 'customClass', label: 'Custom Class', placeholder: '—' },
  { key: 'module',      label: 'Module',       placeholder: 'Current' },
  { key: 'storyboardId', label: 'Storyboard ID', placeholder: '—' },
  { key: 'restorationId', label: 'Restoration ID', placeholder: '—' },
];

// ─────────────────────────────────────────────────────────────────────────────
// InspectorPanel
// ─────────────────────────────────────────────────────────────────────────────

export class InspectorPanel {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /** Path of the file currently displayed in the inspector. */
    this.currentFile = null;

    /** Cached file metadata gathered by {@link updateFile}. */
    this._meta = null;

    /** Identity values for the Interface Builder Identity inspector. */
    this.identity = {};

    /** Attribute rows for the Interface Builder Attributes inspector. */
    this.attributes = [];

    /** Set of collapsed section ids, persisted across renders. */
    this._collapsed = new Set();

    // Default-collapse the Attributes section until IB is active.
    this._collapsed.add('attributes');
  }

  // ─── updateFile ─────────────────────────────────────────────────────────

  /**
   * Update the inspector to reflect a new active file. Gathers lightweight
   * metadata from the VFS cache and triggers a full re-render.
   *
   * @param {string} path  Normalised VFS path of the newly-active file.
   * @returns {void}
   */
  updateFile(path) {
    this.currentFile = path || null;
    this._meta = path ? this._collectMeta(path) : null;
    this.render();
  }

  /**
   * Gather file metadata from the VFS cache for display in the inspector.
   *
   * @param {string} path
   * @returns {object|null} Metadata object or null when the file is missing.
   * @private
   */
  _collectMeta(path) {
    const vfs = this.app.vfs;
    const node = vfs._cache.get(path);
    if (!node || node.isFolder) return null;

    const content = node.content || '';
    const lines = content ? content.split('\n').length : 0;
    const size = new Blob([content]).size;
    const language = node.language || vfs.getFileLanguage(path);
    const fileName = node.name || _basename(path);
    const ext = _extname(fileName);

    return {
      path,
      name: fileName,
      language,
      languageLabel: LANGUAGE_LABELS[language] || 'Unknown',
      ext,
      isInterfaceBuilder: IB_EXTENSIONS.has(ext.toLowerCase()),
      size,
      lines,
      encoding: 'UTF-8',
      modified: this.app.editor ? this.app.editor.isModified(path) : false,
    };
  }

  // ─── render ─────────────────────────────────────────────────────────────

  /**
   * Render the full inspector into `#inspector-content`.
   *
   * Composes the File, Quick Help, Identity, and Attributes sections in
   * Xcode order. When no file is selected a friendly placeholder is shown.
   *
   * @returns {void}
   */
  render() {
    const container = document.getElementById('inspector-content');
    if (!container) return;

    container.innerHTML = '';

    if (!this.currentFile || !this._meta) {
      container.innerHTML =
        '<div style="padding:24px 16px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-info-circle" style="font-size:28px;display:block;margin-bottom:10px;opacity:.5;"></i>' +
        'No selection.<br>Select a file to inspect its properties.' +
        '</div>';
      return;
    }

    container.appendChild(this.renderFileInspector());
    container.appendChild(this.renderQuickHelp());
    container.appendChild(this.renderIdentityInspector());
    container.appendChild(this.renderAttributesInspector());
  }

  // ─── renderFileInspector ────────────────────────────────────────────────

  /**
   * Render the **File Inspector** section: name, full path, type, size, line
   * count, encoding, and a modified indicator.
   *
   * @returns {HTMLElement} Section wrapper element.
   */
  renderFileInspector() {
    const m = this._meta;
    const rows = [
      { label: 'Name',     value: m.name },
      { label: 'Type',     value: m.languageLabel },
      { label: 'Full Path', value: m.path, mono: true },
      { label: 'Size',     value: _formatBytes(m.size) },
      { label: 'Lines',    value: String(m.lines) },
      { label: 'Encoding', value: m.encoding },
    ];

    if (m.modified) {
      rows.push({ label: 'Status', value: 'Modified', badge: true });
    }

    return this._buildSection('file', 'File Inspector', 'fa-file-lines', rows);
  }

  // ─── renderQuickHelp ────────────────────────────────────────────────────

  /**
   * Render the **Quick Help** section: a concise summary of the active file
   * or, when available, the symbol under the editor cursor.
   *
   * @returns {HTMLElement} Section wrapper element.
   */
  renderQuickHelp() {
    const m = this._meta;

    // Try to obtain the symbol under the cursor from Monaco's word-at-position.
    let symbolName = null;
    let symbolKind = null;
    try {
      const editor = this.app.editor?.monaco;
      const model = editor?.getModel();
      const pos = editor?.getPosition();
      if (model && pos) {
        const word = model.getWordAtPosition(pos);
        if (word && word.word) {
          symbolName = word.word;
        }
      }
    } catch {
      /* Monaco not ready — fall back to file-level help */
    }

    const title = symbolName || m.name;
    const summary = symbolName
      ? `${symbolKind || 'Symbol'} in ${m.name}`
      : `${m.languageLabel} source file`;
    const detail = `Located at ${m.path}`;

    const rows = [
      { label: 'Declaration', value: symbolName ? (symbolKind || 'Symbol') : 'File' },
      { label: 'Name',        value: title },
      { label: 'Summary',     value: summary },
      { label: 'Location',    value: detail },
      { label: 'Language',    value: m.languageLabel },
    ];

    return this._buildSection('quickhelp', 'Quick Help', 'fa-circle-question', rows);
  }

  // ─── renderIdentityInspector ────────────────────────────────────────────

  /**
   * Render the **Identity Inspector** section (Interface Builder identity).
   *
   * Always rendered but disabled (greyed-out placeholders) unless an Interface
   * Builder file (`.xib` / `.storyboard`) is active.
   *
   * @returns {HTMLElement} Section wrapper element.
   */
  renderIdentityInspector() {
    const m = this._meta;
    const ibActive = m.isInterfaceBuilder;

    const rows = IDENTITY_FIELDS.map((f) => ({
      label: f.label,
      value: this.identity[f.key] || f.placeholder,
      editable: ibActive,
      placeholder: f.placeholder,
    }));

    const section = this._buildSection(
      'identity',
      'Identity',
      'fa-fingerprint',
      rows,
    );

    if (!ibActive) {
      // Append a hint that the section is only meaningful for IB files.
      const hint = document.createElement('div');
      hint.className = 'inspector-hint';
      hint.style.cssText =
        'padding:0 12px 10px;font-size:11px;color:var(--text-tertiary);font-style:italic;';
      hint.textContent = 'Open a .xib or .storyboard to edit identity.';
      section.querySelector('.inspector-section-body').appendChild(hint);
    }

    return section;
  }

  // ─── renderAttributesInspector ──────────────────────────────────────────

  /**
   * Render the **Attributes Inspector** section. Only meaningful when the
   * Interface Builder is active. When inactive, the section is collapsed and
   * shows a disabled hint.
   *
   * @returns {HTMLElement} Section wrapper element.
   */
  renderAttributesInspector() {
    const m = this._meta;
    const ibActive = m.isInterfaceBuilder;

    // Build a small set of representative attribute rows when IB is active.
    let rows;
    if (ibActive) {
      rows = this.attributes.length > 0
        ? this.attributes
        : [
            { label: 'Background', value: 'System Background', editable: true },
            { label: 'Alpha',      value: '1.0',               editable: true },
            { label: 'Hidden',     value: 'No',                editable: true },
            { label: 'Opaque',     value: 'Yes',               editable: true },
          ];
    } else {
      rows = [
        { label: 'Status', value: 'No attributes', badge: true },
      ];
    }

    const section = this._buildSection(
      'attributes',
      'Attributes',
      'fa-sliders',
      rows,
    );

    // Force-collapse when IB is not active.
    if (!ibActive && !this._collapsed.has('attributes')) {
      this._collapsed.add('attributes');
      section.classList.add('collapsed');
    }

    if (!ibActive) {
      const hint = document.createElement('div');
      hint.className = 'inspector-hint';
      hint.style.cssText =
        'padding:0 12px 10px;font-size:11px;color:var(--text-tertiary);font-style:italic;';
      hint.textContent = 'Attributes are available for Interface Builder files.';
      section.querySelector('.inspector-section-body').appendChild(hint);
    }

    return section;
  }

  // ─── Internals: section builder ─────────────────────────────────────────

  /**
   * Build a collapsible inspector section with a header and a list of
   * label/value rows.
   *
   * @param {string} id        Unique section id (used for collapse tracking).
   * @param {string} title     Human-readable section title.
   * @param {string} iconClass FontAwesome icon class (without the `fas ` prefix
   *                            — it is added automatically).
   * @param {Array<{label:string,value:string,mono?:boolean,badge?:boolean,editable?:boolean,placeholder?:string}>} rows
   * @returns {HTMLElement}
   * @private
   */
  _buildSection(id, title, iconClass, rows) {
    const section = document.createElement('div');
    section.className = 'inspector-section';
    section.dataset.section = id;
    if (this._collapsed.has(id)) {
      section.classList.add('collapsed');
    }

    // ── Header ─────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'inspector-section-header';
    header.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:8px 12px;' +
      'cursor:pointer;user-select:none;font-size:11px;font-weight:600;' +
      'text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);' +
      'border-bottom:1px solid var(--border);';

    const chevron = document.createElement('span');
    chevron.className = 'inspector-chevron';
    chevron.innerHTML = '<i class="fas fa-chevron-down" style="font-size:9px;width:10px;"></i>';
    chevron.style.cssText = 'transition:transform .15s ease;flex-shrink:0;';

    const icon = document.createElement('span');
    icon.className = 'inspector-section-icon';
    icon.innerHTML = `<i class="fas ${iconClass}" style="font-size:11px;width:14px;text-align:center;"></i>`;
    icon.style.color = 'var(--accent)';

    const label = document.createElement('span');
    label.className = 'inspector-section-title';
    label.textContent = title;
    label.style.flex = '1';

    header.appendChild(chevron);
    header.appendChild(icon);
    header.appendChild(label);

    // Toggle collapse on header click.
    header.addEventListener('click', () => {
      const isCollapsed = section.classList.toggle('collapsed');
      chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      if (isCollapsed) {
        this._collapsed.add(id);
      } else {
        this._collapsed.delete(id);
      }
    });

    // Sync chevron rotation with initial collapse state.
    if (this._collapsed.has(id)) {
      chevron.style.transform = 'rotate(-90deg)';
    }

    section.appendChild(header);

    // ── Body ───────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'inspector-section-body';
    body.style.cssText = 'padding:4px 0;';

    for (const row of rows) {
      body.appendChild(this._buildRow(row));
    }

    section.appendChild(body);
    return section;
  }

  /**
   * Build a single label/value row for an inspector section.
   *
   * @param {object} row  Row descriptor.
   * @returns {HTMLElement}
   * @private
   */
  _buildRow(row) {
    const el = document.createElement('div');
    el.className = 'inspector-row';
    el.style.cssText =
      'display:flex;align-items:flex-start;gap:8px;padding:4px 12px;font-size:12px;';

    const labelEl = document.createElement('span');
    labelEl.className = 'inspector-row-label';
    labelEl.textContent = row.label;
    labelEl.style.cssText =
      'min-width:90px;flex-shrink:0;color:var(--text-tertiary);';

    const valueEl = document.createElement('span');
    valueEl.className = 'inspector-row-value';
    valueEl.style.flex = '1';
    valueEl.style.wordBreak = 'break-all';

    if (row.badge) {
      valueEl.innerHTML =
        '<span class="badge badge-accent" style="' +
        'display:inline-block;padding:1px 8px;border-radius:10px;' +
        'font-size:10px;background:var(--accent);color:#fff;">' +
        _escapeHtml(row.value) + '</span>';
    } else if (row.mono) {
      valueEl.textContent = row.value;
      valueEl.style.fontFamily = 'var(--mono-font)';
      valueEl.style.color = 'var(--text-secondary)';
    } else {
      valueEl.textContent = row.value;
      valueEl.style.color = 'var(--text-primary)';
    }

    el.appendChild(labelEl);
    el.appendChild(valueEl);
    return el;
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

/**
 * Extract the file extension (lowercase, with leading dot) from a name.
 * @param {string} name
 * @returns {string}
 */
function _extname(name) {
  if (typeof name !== 'string') return '';
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx).toLowerCase();
}

/**
 * Format a byte count into a human-readable file-size string.
 * @param {number} bytes
 * @returns {string}
 */
function _formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (!Number.isFinite(bytes)) return '—';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(1))} ${units[i]}`;
}
