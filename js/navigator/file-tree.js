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

    if (!tree || tree.length === 0) {
      container.innerHTML =
        '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;">' +
        '<i class="fas fa-folder-open" style="font-size:24px;display:block;margin-bottom:8px;"></i>' +
        'Empty project. Create a new file to get started.</div>';
      return;
    }

    for (const node of tree) {
      this.renderNode(node, 0, container);
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
