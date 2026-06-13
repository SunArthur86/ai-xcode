/**
 * AI-Xcode IDE — Project Navigator File Tree
 *
 * Renders the project navigator file tree from the Virtual File System.
 * Supports folder expand/collapse, file open, right-click context menu
 * (Rename, Delete, Duplicate, New File), file-type icons, and a modified
 * indicator (dot) for unsaved files.
 *
 * @module navigator/file-tree
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emoji icons mapped by file extension (lowercase, no dot).
 * Folders are handled separately.
 */
const FILE_ICONS = {
  swift:  '🦅',
  js:     '📜',
  mjs:    '📜',
  jsx:    '📜',
  ts:     '📘',
  tsx:    '📘',
  py:     '🐍',
  html:   '🌐',
  htm:    '🌐',
  css:    '🎨',
  scss:   '🎨',
  less:   '🎨',
  json:   '⚙️',
  md:     '📝',
  markdown: '📝',
  plist:  '📋',
  xml:    '📋',
  yml:    '📦',
  yaml:   '📦',
  toml:   '📦',
  txt:    '📄',
  sh:     '⚙️',
  sql:    '🗄️',
  cpp:    '⚡',
  cc:     '⚡',
  cxx:    '⚡',
  c:      '⚡',
  h:      '⚡',
  hpp:    '⚡',
  rs:     '🦀',
  go:     '🐹',
  java:   '☕',
  kt:     '🟣',
  rb:     '💎',
  php:    '🐘',
  dart:   '🎯',
};

/** Fallback icon for unknown file types. */
const DEFAULT_FILE_ICON = '📄';

// ─────────────────────────────────────────────────────────────────────────────
// FileTree
// ─────────────────────────────────────────────────────────────────────────────

export class FileTree {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /** Set of currently-expanded folder paths. @type {Set<string>} */
    this.expandedFolders = new Set();

    /** Reference to the context menu DOM element (when open). */
    this._contextMenu = null;

    /** Path of the node that the context menu was invoked on. */
    this._contextNode = null;

    // Bind the global click-away handler for the context menu
    this._onDocClick = null;

    /** Current filter query (#1) */
    this._filterQuery = '';

    /** Set of selected file paths for bulk ops (#8) */
    this._selectedFiles = new Set();

    /** Whether bulk selection mode is active (#8) */
    this._bulkMode = false;

    /** Recent files section collapsed state (#2) */
    this._recentCollapsed = false;
  }

  // ─── render ─────────────────────────────────────────────────────────────

  /**
   * Render the full file tree into `#navigator-content`.
   *
   * Fetches the tree from `app.vfs.getTree()` and recursively renders each
   * node with proper indentation, file-type icons, and interactive handlers.
   */
  async render() {
    const container = document.getElementById('navigator-content');
    if (!container) return;

    // Show a loading placeholder
    container.innerHTML =
      '<div style="padding:12px;color:var(--text-tertiary);font-size:12px;">Loading...</div>';

    let tree;
    try {
      tree = await this.app.vfs.getTree();
    } catch (err) {
      console.error('[FileTree] Failed to get tree:', err);
      container.innerHTML =
        '<div style="padding:12px;color:var(--error);font-size:12px;">Failed to load project.</div>';
      return;
    }

    container.innerHTML = '';
    container.classList.add('file-tree');

    // ── Bulk action bar (#8) ──
    this._renderBulkBar(container);

    // ── Recent files section (#2) ──
    this._renderRecentFiles(container);

    if (!tree || tree.length === 0) {
      container.innerHTML +=
        '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-folder-open" style="font-size:24px;display:block;margin-bottom:8px;"></i>' +
        'Empty project. Create a new file to get started.</div>';
      return;
    }

    // ── Filtered or full tree (#1) ──
    if (this._filterQuery) {
      // Filter mode: show all matching files flat
      const results = [];
      this._collectMatching(tree, this._filterQuery.toLowerCase(), results);
      if (results.length === 0) {
        container.innerHTML +=
          '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
          '<i class="fas fa-search" style="font-size:18px;display:block;margin-bottom:6px;"></i>' +
          `No files matching "${this._filterQuery}"</div>`;
      } else {
        for (const node of results) {
          this.renderNode(node, 0, container);
        }
      }
    } else {
      for (const node of tree) {
        this.renderNode(node, 0, container);
      }
    }

    // ── Update stats footer (#9) ──
    this._renderStats();
  }

  // ─── filterFiles (#1) ─────────────────────────────────────────────────

  /**
   * Set the filter query and re-render the tree.
   * @param {string} query  Filter text (empty = clear filter).
   */
  filterFiles(query) {
    this._filterQuery = (query || '').trim();
    this.render();
  }

  /**
   * Recursively collect all file nodes matching the query.
   * @param {object[]} nodes
   * @param {string} queryLower
   * @param {object[]} results
   * @private
   */
  _collectMatching(nodes, queryLower, results) {
    for (const node of nodes) {
      if (!node.isFolder && node.name.toLowerCase().includes(queryLower)) {
        results.push(node);
      }
      if (node.children && node.children.length > 0) {
        this._collectMatching(node.children, queryLower, results);
      }
    }
  }

  // ─── _renderBulkBar (#8) ──────────────────────────────────────────────

  /**
   * Render the bulk action bar if any files are selected.
   * @private
   */
  _renderBulkBar(container) {
    if (this._selectedFiles.size === 0) return;

    const bar = document.createElement('div');
    bar.className = 'bulk-action-bar visible';
    bar.innerHTML = `
      <span class="bulk-action-count">${this._selectedFiles.size} selected</span>
      <button class="bulk-action-btn danger" data-action="delete">
        <i class="fas fa-trash-alt"></i> Delete
      </button>
      <button class="bulk-action-btn" data-action="move">
        <i class="fas fa-folder-tree"></i> Move
      </button>
      <button class="bulk-action-btn" data-action="clear">
        <i class="fas fa-times"></i> Clear
      </button>
    `;
    bar.querySelector('[data-action="delete"]').addEventListener('click', () => this._bulkDelete());
    bar.querySelector('[data-action="move"]').addEventListener('click', () => this._bulkMove());
    bar.querySelector('[data-action="clear"]').addEventListener('click', () => {
      this._selectedFiles.clear();
      this._bulkMode = false;
      this.render();
    });
    container.appendChild(bar);
  }

  // ─── _bulkDelete (#8) ─────────────────────────────────────────────────

  async _bulkDelete() {
    if (!confirm(`Delete ${this._selectedFiles.size} file(s)?`)) return;
    for (const path of this._selectedFiles) {
      try {
        await this.app.vfs.deleteFile(path);
      } catch (e) { /* skip */ }
    }
    this._selectedFiles.clear();
    this._bulkMode = false;
    this.app.notifications?.toast('Selected files deleted.', 'info');
    this.render();
  }

  // ─── _bulkMove (#8) ───────────────────────────────────────────────────

  async _bulkMove() {
    const target = prompt('Enter destination folder path:', 'MyApp/NewFolder');
    if (!target) return;
    for (const path of this._selectedFiles) {
      const fileName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      const newPath = `${target}/${fileName}`;
      try {
        await this.app.vfs.renameFile(path, newPath);
      } catch (e) { /* skip */ }
    }
    this._selectedFiles.clear();
    this._bulkMode = false;
    this.app.notifications?.toast(`Moved files to ${target}`, 'success');
    this.render();
  }

  // ─── _renderRecentFiles (#2) ──────────────────────────────────────────

  /**
   * Render the recent files section at the top of the navigator.
   * @private
   */
  _renderRecentFiles(container) {
    const recent = this._getRecentFiles();
    if (recent.length === 0) return;

    const section = document.createElement('div');
    section.className = 'recent-files-section';

    const header = document.createElement('div');
    header.className = 'recent-files-header';
    header.innerHTML = `<i class="fas fa-chevron-down chevron ${this._recentCollapsed ? 'collapsed' : ''}"></i> Recent`;
    header.addEventListener('click', () => {
      this._recentCollapsed = !this._recentCollapsed;
      this.render();
    });
    section.appendChild(header);

    if (!this._recentCollapsed) {
      const body = document.createElement('div');
      body.className = 'recent-files-body';
      for (const entry of recent) {
        const item = document.createElement('div');
        item.className = 'recent-file-item';
        const name = entry.path.includes('/') ? entry.path.slice(entry.path.lastIndexOf('/') + 1) : entry.path;
        const icon = this.getIcon({ name, isFolder: false });
        item.innerHTML = `<span>${icon}</span> <span>${name}</span> <span class="recent-time">${this._formatTime(entry.time)}</span>`;
        item.addEventListener('click', () => {
          this.app.openFile(entry.path);
        });
        body.appendChild(item);
      }
      section.appendChild(body);
    }

    container.appendChild(section);
  }

  /**
   * Get the list of recent files from localStorage.
   * @returns {Array<{path:string, time:number}>}
   * @private
   */
  _getRecentFiles() {
    try {
      const raw = localStorage.getItem('ai-xcode-recent-files');
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * Add a file to the recent files list (max 10).
   * Called from app.openFile().
   * @param {string} path
   */
  addRecentFile(path) {
    let recent = this._getRecentFiles();
    // Remove existing entry for this path
    recent = recent.filter(e => e.path !== path);
    // Add at front
    recent.unshift({ path, time: Date.now() });
    // Keep only last 10
    recent = recent.slice(0, 10);
    localStorage.setItem('ai-xcode-recent-files', JSON.stringify(recent));
  }

  /**
   * Format a timestamp for the recent files list.
   * @param {number} ts
   * @returns {string}
   * @private
   */
  _formatTime(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  // ─── _renderStats (#9) ────────────────────────────────────────────────

  /**
   * Render project statistics in the sidebar footer.
   * @private
   */
  async _renderStats() {
    const footer = document.getElementById('sidebar-stats-footer');
    if (!footer || !this.app.vfs) return;
    try {
      const stats = await this.app.vfs.getProjectStats();
      const langBadges = stats.languages
        .map(l => `<span class="stats-lang-badge">${l.label}</span>`)
        .join('');
      footer.innerHTML = `
        <div class="stats-row"><span class="stats-label">Files</span><span class="stats-value">${stats.fileCount}</span></div>
        <div class="stats-row"><span class="stats-label">Lines</span><span class="stats-value">${stats.totalLines.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Folders</span><span class="stats-value">${stats.folderCount}</span></div>
        <div class="stats-lang-list">${langBadges}</div>
      `;
    } catch (e) {
      // Stats not critical — silently ignore
    }
  }

  // ─── renderNode ─────────────────────────────────────────────────────────

  /**
   * Recursively render a single tree node.
   *
   * @param {object}  node      Tree node from `vfs.getTree()`.
   * @param {number}  depth     Indentation depth (0 = root).
   * @param {HTMLElement} parentEl  Parent DOM element.
   */
  renderNode(node, depth, parentEl) {
    if (!node) return;

    const row = document.createElement('div');
    row.className = 'file-tree-item';
    row.dataset.path = node.path;
    row.dataset.depth = String(depth);
    row.dataset.isFolder = String(node.isFolder);
    row.style.paddingLeft = `${depth * 14 + 8}px`;

    // Active file highlight
    if (!node.isFolder && node.path === this.app.activeFile) {
      row.classList.add('active');
    }

    // Selected state (#8)
    if (this._selectedFiles.has(node.path)) {
      row.classList.add('selected');
    }

    // ── Tooltip: file info on hover (#7) ──
    if (!node.isFolder) {
      const fileNode = this.app.vfs._cache.get(node.path);
      if (fileNode) {
        const size = fileNode.content ? new Blob([fileNode.content]).size : 0;
        const sizeStr = size < 1024 ? `${size}B` : size < 1048576 ? `${(size/1024).toFixed(1)}KB` : `${(size/1048576).toFixed(1)}MB`;
        const lines = fileNode.content ? fileNode.content.split('\n').length : 0;
        const lang = fileNode.language || 'plaintext';
        const modDate = fileNode.modifiedAt ? new Date(fileNode.modifiedAt).toLocaleDateString() : '—';
        row.setAttribute('data-tooltip', `${node.name}\nSize: ${sizeStr}\nLines: ${lines}\nLanguage: ${lang}\nModified: ${modDate}`);
      }
    }

    // ── Checkbox (#8): shown for files when bulk mode is active ──
    if (this._bulkMode && !node.isFolder) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'tree-checkbox';
      checkbox.checked = this._selectedFiles.has(node.path);
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          this._selectedFiles.add(node.path);
        } else {
          this._selectedFiles.delete(node.path);
        }
        this.render();
      });
      row.appendChild(checkbox);
    }

    // --- Icon ---
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.style.minWidth = '18px';
    iconEl.style.textAlign = 'center';
    iconEl.style.flexShrink = '0';

    // --- Name ---
    const nameEl = document.createElement('span');
    nameEl.className = 'tree-name';
    nameEl.style.flex = '1';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.textContent = node.name;

    // --- Modified indicator ---
    const modifiedEl = document.createElement('span');
    modifiedEl.className = 'tree-modified';
    modifiedEl.style.flexShrink = '0';
    modifiedEl.style.marginLeft = '4px';
    modifiedEl.style.width = '6px';
    modifiedEl.style.height = '6px';
    modifiedEl.style.borderRadius = '50%';
    modifiedEl.style.background = 'var(--accent)';
    modifiedEl.style.visibility = 'hidden';

    row.appendChild(iconEl);
    row.appendChild(nameEl);
    row.appendChild(modifiedEl);

    // --- Determine expand state and icon ---
    const isExpanded = this.expandedFolders.has(node.path);

    if (node.isFolder) {
      iconEl.textContent = this.getIcon(node, isExpanded);
      // Default-expand root-level folders on first render
      if (depth === 0 && !this.expandedFolders.has(node.path) && this.expandedFolders.size === 0) {
        this.expandedFolders.add(node.path);
      }
    } else {
      iconEl.textContent = this.getIcon(node);
      // Modified indicator
      if (this.app.editor && this.app.editor.isModified(node.path)) {
        modifiedEl.style.visibility = 'visible';
      }
    }

    // --- Click handler ---
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (node.isFolder) {
        this.toggleFolder(node.path);
      } else {
        this.app.openFile(node.path);
      }
    });

    // --- Context menu (right-click) ---
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(node, e.clientX, e.clientY);
    });

    parentEl.appendChild(row);

    // --- Render children (if folder is expanded) ---
    if (
      node.isFolder &&
      isExpanded &&
      node.children &&
      node.children.length > 0
    ) {
      for (const child of node.children) {
        this.renderNode(child, depth + 1, parentEl);
      }
    }
  }

  // ─── getIcon ────────────────────────────────────────────────────────────

  /**
   * Return the appropriate icon emoji for a file or folder.
   *
   * @param {object}  file     Tree node from `vfs.getTree()`.
   * @param {boolean} [expanded]  Whether the folder is expanded (folders only).
   * @returns {string} Emoji icon.
   */
  getIcon(file, expanded) {
    if (!file) return DEFAULT_FILE_ICON;

    if (file.isFolder) {
      return expanded ? '📂' : '📁';
    }

    const name = file.name || '';
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx <= 0) return DEFAULT_FILE_ICON;

    const ext = name.slice(dotIdx + 1).toLowerCase();
    return FILE_ICONS[ext] || DEFAULT_FILE_ICON;
  }

  // ─── toggleFolder ───────────────────────────────────────────────────────

  /**
   * Toggle the expand/collapse state of a folder and re-render the tree.
   *
   * @param {string} path  Folder path.
   */
  toggleFolder(path) {
    if (this.expandedFolders.has(path)) {
      this.expandedFolders.delete(path);
    } else {
      this.expandedFolders.add(path);
    }
    this.render();
  }

  // ─── toggleBulkMode (#8) ──────────────────────────────────────────────

  /**
   * Toggle bulk selection mode. When on, checkboxes appear next to files.
   */
  toggleBulkMode() {
    this._bulkMode = !this._bulkMode;
    if (!this._bulkMode) {
      this._selectedFiles.clear();
    }
    this.render();
  }

  // ─── showContextMenu ────────────────────────────────────────────────────

  /**
   * Show a right-click context menu at the given screen coordinates.
   *
   * Menu items: New File, New Folder, Rename, Duplicate, Delete.
   *
   * @param {object} node     The tree node that was right-clicked.
   * @param {number} x        Screen X coordinate.
   * @param {number} y        Screen Y coordinate.
   */
  showContextMenu(node, x, y) {
    // Remove any existing context menu
    this._hideContextMenu();

    this._contextNode = node;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = [
      'position:fixed',
      `left:${x}px`,
      `top:${y}px`,
      'z-index:10000',
      'background:var(--bg-secondary)',
      'border:1px solid var(--border)',
      'border-radius:6px',
      'box-shadow:0 4px 16px rgba(0,0,0,.4)',
      'padding:4px 0',
      'min-width:160px',
      'font-size:12px',
    ].join(';');

    // Build menu items
    const items = [];

    if (node.isFolder) {
      items.push({ label: 'New File', icon: 'fa-file-plus', action: () => this._newFileIn(node) });
      items.push({ label: 'New Folder', icon: 'fa-folder-plus', action: () => this._newFolderIn(node) });
      items.push({ divider: true });
      items.push({ label: 'Rename', icon: 'fa-pen', action: () => this.rename(node) });
      items.push({ label: 'Delete', icon: 'fa-trash-alt', danger: true, action: () => this.delete(node) });
    } else {
      items.push({ label: 'Open', icon: 'fa-external-link-alt', action: () => this.app.openFile(node.path) });
      items.push({ divider: true });
      items.push({ label: this._bulkMode ? 'Select' : 'Enable Bulk Select', icon: 'fa-check-square', action: () => {
        if (!this._bulkMode) this.toggleBulkMode();
        this._selectedFiles.add(node.path);
        this.render();
      }});
      items.push({ divider: true });
      items.push({ label: 'Rename', icon: 'fa-pen', action: () => this.rename(node) });
      items.push({ label: 'Duplicate', icon: 'fa-copy', action: () => this.duplicate(node) });
      items.push({ divider: true });
      items.push({ label: 'Delete', icon: 'fa-trash-alt', danger: true, action: () => this.delete(node) });
    }

    for (const item of items) {
      if (item.divider) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
        menu.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'context-menu-item';
      el.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:6px 14px',
        'cursor:pointer',
        `color:${item.danger ? 'var(--error)' : 'var(--text-primary)'}`,
      ].join(';');

      el.innerHTML = `<i class="fas ${item.icon}" style="width:14px;text-align:center;"></i> ${item.label}`;

      el.addEventListener('mouseenter', () => {
        el.style.background = item.danger ? 'rgba(255,59,48,.15)' : 'var(--bg-tertiary)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.background = 'transparent';
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideContextMenu();
        item.action();
      });

      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Adjust position if menu overflows viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }

    // Click-away listener
    this._onDocClick = (e) => {
      if (!menu.contains(e.target)) {
        this._hideContextMenu();
      }
    };
    // Defer so the current right-click doesn't immediately close it
    setTimeout(() => {
      document.addEventListener('click', this._onDocClick);
      document.addEventListener('contextmenu', this._onDocClick);
    }, 0);
  }

  /**
   * Hide and remove the context menu.
   * @private
   */
  _hideContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
    if (this._onDocClick) {
      document.removeEventListener('click', this._onDocClick);
      document.removeEventListener('contextmenu', this._onDocClick);
      this._onDocClick = null;
    }
    this._contextNode = null;
  }

  // ─── rename ─────────────────────────────────────────────────────────────

  /**
   * Prompt for a new name and rename the file/folder via the VFS.
   *
   * @param {object} node  Tree node to rename.
   */
  async rename(node) {
    if (!node) return;

    const newName = prompt('Enter new name:', node.name);
    if (!newName || newName === node.name) return;

    const parentPath = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : '';
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    try {
      await this.app.vfs.renameFile(node.path, newPath);
      this.app.notifications?.toast(`Renamed to "${newName}"`, 'success');

      // Update active file if it was the renamed one
      if (this.app.activeFile === node.path) {
        this.app.activeFile = newPath;
      }
    } catch (err) {
      console.error('[FileTree] Rename failed:', err);
      this.app.notifications?.toast(`Rename failed: ${err.message}`, 'error');
    }
  }

  // ─── delete ─────────────────────────────────────────────────────────────

  /**
   * Confirm deletion, then remove the file/folder via the VFS.
   *
   * @param {object} node  Tree node to delete.
   */
  async delete(node) {
    if (!node) return;

    const confirmMsg = node.isFolder
      ? `Delete folder "${node.name}" and all its contents?`
      : `Delete "${node.name}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      await this.app.vfs.deleteFile(node.path);

      // Close tab if open
      if (this.app.openTabs) {
        const tabIdx = this.app.openTabs.indexOf(node.path);
        if (tabIdx !== -1) {
          this.app.closeFile(node.path);
        }
      }

      this.app.notifications?.toast(`Deleted "${node.name}"`, 'info');
    } catch (err) {
      console.error('[FileTree] Delete failed:', err);
      this.app.notifications?.toast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ─── duplicate ──────────────────────────────────────────────────────────

  /**
   * Duplicate a file with a `_copy` suffix before the extension.
   *
   * @param {object} node  Tree node (must be a file).
   */
  async duplicate(node) {
    if (!node || node.isFolder) {
      this.app.notifications?.toast('Can only duplicate files.', 'warning');
      return;
    }

    // Construct the new path with _copy suffix
    const dotIdx = node.name.lastIndexOf('.');
    let newName;
    if (dotIdx > 0) {
      newName =
        node.name.substring(0, dotIdx) +
        '_copy' +
        node.name.substring(dotIdx);
    } else {
      newName = node.name + '_copy';
    }

    const parentPath = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : '';
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    try {
      // Read source content
      const content = await this.app.vfs.readFile(node.path);
      // Create the duplicate
      await this.app.vfs.createFile(
        newPath,
        content,
        node.language,
      );
      this.app.notifications?.toast(`Duplicated as "${newName}"`, 'success');
    } catch (err) {
      console.error('[FileTree] Duplicate failed:', err);
      this.app.notifications?.toast(`Duplicate failed: ${err.message}`, 'error');
    }
  }

  // ─── Private: new file / folder helpers ─────────────────────────────────

  /**
   * Create a new file inside the given folder.
   * @param {object} folderNode
   * @private
   */
  async _newFileIn(folderNode) {
    const name = prompt('Enter file name:', 'NewFile.swift');
    if (!name) return;

    const path = `${folderNode.path}/${name}`;
    try {
      await this.app.vfs.createFile(path, '', this.app.vfs.getFileLanguage(path));
      this.expandedFolders.add(folderNode.path);
      this.app.openFile(path);
      this.app.notifications?.toast(`Created "${name}"`, 'success');
    } catch (err) {
      this.app.notifications?.toast(`Failed: ${err.message}`, 'error');
    }
  }

  /**
   * Create a new folder inside the given folder.
   * @param {object} folderNode
   * @private
   */
  async _newFolderIn(folderNode) {
    const name = prompt('Enter folder name:', 'NewFolder');
    if (!name) return;

    const path = `${folderNode.path}/${name}`;
    try {
      await this.app.vfs.createFolder(path);
      this.expandedFolders.add(folderNode.path);
      this.app.notifications?.toast(`Created folder "${name}"`, 'success');
    } catch (err) {
      this.app.notifications?.toast(`Failed: ${err.message}`, 'error');
    }
  }
}

export default FileTree;
