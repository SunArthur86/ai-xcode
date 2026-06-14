/**
 * AI-Xcode IDE — Monaco Editor Manager
 *
 * Wraps the Monaco editor instance and provides a clean API for file
 * management, editing operations, decorations, inline AI code completion,
 * command-palette actions, and a context-menu "Ask AI" integration.
 *
 * The global `monaco` object is loaded via AMD `require` before this module
 * is instantiated (see {@link AIXcodeApp.waitForMonaco}).
 *
 * @module editor/editor-manager
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce delay (ms) for inline-completion requests after the user stops typing. */
const INLINE_COMPLETION_DEBOUNCE_MS = 500;

/**
 * Decoration appearance by semantic type.
 *
 * Built lazily because Monaco's enum values (`OverviewRulerLane`,
 * `TrackedRange`) are only available after the AMD loader resolves — this
 * module may be *imported* before `monaco` is ready (the `EditorManager`
 * constructor always runs after `app.waitForMonaco()`).
 *
 * @param {string} type
 * @returns {Object} Monaco `IModelDecorationOptions`.
 */
function buildDecorationOptions(type) {
  switch (type) {
    case 'error':
      return {
        isWholeLine: true,
        className: 'decoration-error-line',
        glyphMarginClassName: 'fas fa-times-circle decoration-error-glyph',
        glyphMarginHoverMessage: { value: 'Error' },
        overviewRuler: {
          color: '#ff3b30',
          position: monaco.editor.OverviewRulerLane.Center,
        },
      };
    case 'warning':
      return {
        isWholeLine: true,
        className: 'decoration-warning-line',
        glyphMarginClassName: 'fas fa-exclamation-triangle decoration-warning-glyph',
        glyphMarginHoverMessage: { value: 'Warning' },
        overviewRuler: {
          color: '#ffcc00',
          position: monaco.editor.OverviewRulerLane.Center,
        },
      };
    case 'breakpoint':
      return {
        isWholeLine: false,
        glyphMarginClassName: 'breakpoint-glyph',
        glyphMarginHoverMessage: { value: 'Breakpoint' },
        stickiness:
          monaco.editor.TrackedRange.Stickiness
            .NeverGrowsWhenTypingAtEdges,
      };
    case 'highlight':
    default:
      return {
        isWholeLine: true,
        className: 'decoration-highlight-line',
        overviewRuler: {
          color: '#0a84ff',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      };
  }
}

/**
 * Map file-extension → Monaco language id.
 * Used as a fallback when the caller does not specify a language.
 */
const EXT_LANGUAGE_MAP = {
  swift: 'swift',
  js: 'javascript',
  mjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  xml: 'xml',
  plist: 'xml',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  c: 'c',
  h: 'cpp',
  hpp: 'cpp',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  php: 'php',
  dart: 'dart',
  lua: 'lua',
  toml: 'ini',
  ini: 'ini',
  txt: 'plaintext',
};

// ─────────────────────────────────────────────────────────────────────────────
// EditorManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the Monaco editor lifecycle, per-file models, decorations,
 * inline AI completion, and editor-related commands.
 */
export class EditorManager {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /** The Monaco editor instance (`monaco.editor.IStandaloneCodeEditor`). */
    this.monaco = null;

    /** @type {Map<string, import('monaco-editor').editor.ITextModel>} Path → model. */
    this.models = new Map();

    /**
     * Last-saved content per file path, used for modification tracking.
     * @type {Map<string, string>}
     */
    this.savedContent = new Map();

    /**
     * Active decorations (id → original ids returned by deltaDecorations).
     * @type {Map<string, string[]>}
     */
    this.decorations = new Map();

    /** Counter for generating unique decoration keys. */
    this._decorationCounter = 0;

    /** Disposable for the inline-completion provider (if registered). */
    this._inlineCompletionDisposable = null;

    /** Debounce timer handle for inline completion. */
    this._completionTimer = null;

    /** AbortController for the in-flight completion request. */
    this._completionAbort = null;

    // ── Feature 1: Line Bookmarks ── path → Set of lineNumbers
    this.bookmarks = new Map();
    this._bookmarkDecorations = [];

    // ── Feature 2: Word Count ──
    this._wordCountEl = null;

    // ── Feature 3: File Comparison ──
    this._compareAgainstPath = null;
    this._diffEditor = null;

    // ── Feature 4: Enhanced Ghost Text ──
    this._ghostTextTimer = null;
    this._ghostTextDecorationIds = [];

    // ── Feature 6: Smart Paste ──
    this._smartPasteEnabled = true;

    this._init();
  }

  // ─── Initialisation ──────────────────────────────────────────────────────

  /**
   * Create the Monaco editor on `#monaco-editor` with sensible defaults.
   * Wires up cursor-position status updates and the context menu.
   * @private
   */
  _init() {
    const dom = document.getElementById('monaco-editor');
    if (!dom) {
      console.error('[EditorManager] #monaco-editor element not found');
      return;
    }

    const settings = this.app?.settings ?? {};

    this.monaco = monaco.editor.create(dom, {
      value: '',
      language: 'plaintext',
      theme: 'xcode-dark',
      automaticLayout: true,
      fontSize: settings.fontSize ?? 14,
      fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
      fontLigatures: true,
      minimap: { enabled: settings.minimap ?? true },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      renderWhitespace: 'selection',
      renderLineHighlight: 'all',
      roundedSelection: true,
      padding: { top: 8, bottom: 8 },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false,
      },
      glyphMargin: true,
      lineNumbers: 'on',
      folding: true,
      showFoldingControls: 'mouseover',
      tabSize: settings.tabSize ?? 4,
      wordWrap: settings.wordWrap ? 'on' : 'off',
      contextmenu: true,
      mouseWheelZoom: true,
      multiCursorModifier: 'alt',
      smoothScrollingDuration: 100,
      fixedOverflowWidgets: true,
      linkedEditing: true,

      // ── Editor Enhancement Options ──
      matchBrackets: 'always',           // #6 bracket matching highlight
      selectionHighlight: true,          // #7 selection highlight
      dragAndDrop: true,                 // #9 drag & drop text
      stickyScroll: { enabled: true },   // #10 sticky scroll
    });

    // Cursor position → status bar
    this.monaco.onDidChangeCursorPosition((e) => {
      this.app?.updateStatusCursor?.(e.position.lineNumber, e.position.column);
      this.updateWordCount(); // Feature 2: word count on cursor change
    });

    // Multi-cursor count → status indicator (#3)
    this.monaco.onDidChangeCursorSelection(() => {
      const selections = this.monaco.getSelections();
      const count = selections ? selections.length : 1;
      this.app?.updateStatusMultiCursor?.(count);
    });

    // Feature 2: Word count on content change
    this.monaco.onDidChangeModelContent(() => {
      this.updateWordCount();
    });

    // Feature 8: Column selection mode indicator
    this.monaco.onDidChangeCursorSelection(() => {
      const selections = this.monaco.getSelections();
      const isColumnMode = selections && selections.some(s => s.selectionStartLineNumber !== s.positionLineNumber && s.startColumn !== s.endColumn && s.selectionStartColumn !== s.positionColumn);
      this.app?.updateColumnModeIndicator?.(isColumnMode || (selections && selections.length > 1));
    });

    // Feature 6: Smart Paste — intercept paste
    this.monaco.onDidPaste((e) => {
      if (this._smartPasteEnabled) {
        this.smartPaste(e);
      }
    });

    // Context-menu: "Ask AI"
    this._setupContextMenu();

    console.log('[EditorManager] Monaco editor initialised.');
  }

  // ─── 1. openFile ─────────────────────────────────────────────────────────

  /**
   * Open a file in the editor.  Creates (or reuses) a Monaco model for the
   * given path, attaches it to the editor, optionally reveals a line, and
   * sets up modification tracking.
   *
   * @param {string} path           Normalised VFS path.
   * @param {string} content        File contents.
   * @param {string} [language]     Monaco language id (auto-detected if omitted).
   * @param {number} [line]         Line to reveal and centre on.
   * @returns {Promise<void>}
   */
  async openFile(path, content, language, line) {
    if (!path) return;

    // Resolve language
    const lang = language || this._detectLanguage(path);

    // Get or create model
    let model = this.models.get(path);
    if (model) {
      // Update content only if it differs (e.g. external change)
      if (model.getValue() !== content) {
        model.setValue(content);
      }
    } else {
      const uri = monaco.Uri.parse('file:///' + path.replace(/[^a-zA-Z0-9/_.-]/g, '_'));
      model = monaco.editor.createModel(content || '', lang, uri);
      this.models.set(path, model);
    }

    // Track last-saved content for modification detection
    if (!this.savedContent.has(path)) {
      this.savedContent.set(path, content || '');
    }

    // Attach model to editor
    this.monaco.setModel(model);

    // Content-change listener → mark file modified (tab dot etc.)
    model.onDidChangeContent(() => {
      this._onContentChanged(path);
    });

    // Reveal target line
    if (line != null && line > 0) {
      this.gotoLine(line);
    }

    // Render bookmark decorations for this file
    this.renderBookmarkDecorations(path);

    // Feature 2: Update word count
    this.updateWordCount();

    // Sync split editor if active (#10)
    if (this.app?.splitEditor) {
      this.app.splitEditor.setModel(model);
    }

    // Focus editor
    this.monaco.focus();
  }

  /**
   * Called when a model's content changes — updates tab modified state.
   * Also triggers auto-save scheduling in the app.
   * @private
   */
  _onContentChanged(path) {
    // Re-render tabs so the "modified" dot appears/disappears
    if (this.app?.renderTabs) {
      this.app.renderTabs();
    }
    // Trigger auto-save scheduling (#9)
    if (this.app?._scheduleAutoSave) {
      this.app._scheduleAutoSave();
    }
  }

  // ─── 2. save ─────────────────────────────────────────────────────────────

  /**
   * Persist the current model content for `path` to the VFS and mark the
   * file as unmodified.
   *
   * @param {string} path
   * @returns {void}
   */
  save(path) {
    const model = this.models.get(path);
    if (!model) return;

    const content = model.getValue();
    this.app.vfs.writeFile(path, content);
    this.savedContent.set(path, content);

    // Refresh tab indicators
    if (this.app?.renderTabs) {
      this.app.renderTabs();
    }
  }

  // ─── 3. isModified ───────────────────────────────────────────────────────

  /**
   * Whether the file at `path` has unsaved changes.
   *
   * @param {string} path
   * @returns {boolean}
   */
  isModified(path) {
    const model = this.models.get(path);
    if (!model) return false;
    const saved = this.savedContent.get(path);
    if (saved === undefined) return false;
    return model.getValue() !== saved;
  }

  // ─── 4. getContent ───────────────────────────────────────────────────────

  /**
   * Return the full text of the model for the given path.
   *
   * @param {string} path
   * @returns {string|null} Content or null if no model exists.
   */
  getContent(path) {
    const model = this.models.get(path);
    return model ? model.getValue() : null;
  }

  // ─── 5. getCurrentContent ────────────────────────────────────────────────

  /**
   * Return the content of the currently active editor model.
   *
   * @returns {string}
   */
  getCurrentContent() {
    const model = this.monaco?.getModel();
    return model ? model.getValue() : '';
  }

  // ─── 6. getSelection ─────────────────────────────────────────────────────

  /**
   * Return the currently selected text, or `null` when nothing is selected.
   *
   * @returns {string|null}
   */
  getSelection() {
    if (!this.monaco) return null;
    const model = this.monaco.getModel();
    if (!model) return null;
    const selection = this.monaco.getSelection();
    if (!selection || selection.isEmpty()) return null;
    return model.getValueInRange(selection);
  }

  // ─── 7. insertText ───────────────────────────────────────────────────────

  /**
   * Insert `text` at the current cursor position (replaces any selection
   * then positions the cursor at the end of the inserted text).
   *
   * @param {string} text
   */
  insertText(text) {
    if (!this.monaco) return;
    const selection = this.monaco.getSelection();
    const op = {
      identifier: { major: 1, minor: 1 },
      range: selection
        ? new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn,
          )
        : this.monaco.getPosition(),
      text,
      forceMoveMarkers: true,
    };
    this.monaco.executeEdits('editor-manager', [op]);
    this.monaco.focus();
  }

  // ─── 8. replaceSelection ─────────────────────────────────────────────────

  /**
   * Replace the current selection with `text`. If nothing is selected the
   * text is inserted at the cursor.
   *
   * @param {string} text
   */
  replaceSelection(text) {
    if (!this.monaco) return;
    const selection = this.monaco.getSelection();
    if (!selection) {
      this.insertText(text);
      return;
    }
    const op = {
      identifier: { major: 1, minor: 1 },
      range: selection,
      text,
      forceMoveMarkers: true,
    };
    this.monaco.executeEdits('editor-manager', [op]);
    this.monaco.focus();
  }

  // ─── 9. formatDocument ───────────────────────────────────────────────────

  /**
   * Trigger Monaco's built-in "format document" action.
   */
  formatDocument() {
    if (!this.monaco) return;
    this.monaco.getAction('editor.action.formatDocument')?.run();
    this.monaco.focus();
  }

  // ─── 10. addDecoration ───────────────────────────────────────────────────

  /**
   * Add a visual decoration to a line.
   *
   * @param {number} line      1-based line number.
   * @param {'error'|'warning'|'breakpoint'|'highlight'} type
   * @returns {string} Decoration id (for later removal).
   */
  addDecoration(line, type = 'highlight') {
    if (!this.monaco) return null;

    const model = this.monaco.getModel();
    if (!model) return null;

    const opts = buildDecorationOptions(type);

    const decoration = {
      range: new monaco.Range(Math.max(1, line), 1, line, 1),
      options: opts,
    };

    const ids = model.deltaDecorations([], [decoration]);
    const key = `deco-${++this._decorationCounter}`;
    this.decorations.set(key, ids);
    return key;
  }

  // ─── 11. removeDecoration ────────────────────────────────────────────────

  /**
   * Remove a decoration previously added via {@link addDecoration}.
   *
   * @param {string} id  Decoration key returned by `addDecoration`.
   */
  removeDecoration(id) {
    const ids = this.decorations.get(id);
    if (!ids) return;
    const model = this.monaco?.getModel();
    if (model) {
      model.deltaDecorations(ids, []);
    }
    this.decorations.delete(id);
  }

  /**
   * Remove **all** decorations currently applied to the editor.
   */
  clearDecorations() {
    const model = this.monaco?.getModel();
    for (const [, ids] of this.decorations) {
      if (model) model.deltaDecorations(ids, []);
    }
    this.decorations.clear();
  }

  // ─── 12. gotoLine ────────────────────────────────────────────────────────

  /**
   * Reveal and centre on a specific line (and optionally column).
   *
   * @param {number} line      1-based line number.
   * @param {number} [column]  1-based column (defaults to 1).
   */
  gotoLine(line, column = 1) {
    if (!this.monaco) return;
    const lineNumber = Math.max(1, line | 0);
    const col = Math.max(1, column | 0);

    this.monaco.revealLineInCenter(lineNumber);
    this.monaco.setPosition({ lineNumber, column: col });
    this.monaco.focus();
  }

  // ─── 12b. foldAll / unfoldAll (#5) ───────────────────────────────────────

  /**
   * Fold all foldable regions in the editor.
   */
  foldAll() {
    this.monaco?.getAction('editor.foldAll')?.run();
    this.monaco?.focus();
  }

  /**
   * Unfold all folded regions in the editor.
   */
  unfoldAll() {
    this.monaco?.getAction('editor.unfoldAll')?.run();
    this.monaco?.focus();
  }

  // ─── 13. setupInlineCompletion ───────────────────────────────────────────

  /**
   * Register an inline (ghost-text) completion provider backed by the GLM
   * client's {@link GLMClient.completeCode} method.
   *
   * Completions are debounced (500 ms for inline provider, 1.5s for ghost text)
   * and only fire when `autoCompletion` is enabled in the user's settings.
   *
   * Feature 4 Enhancement: Also sets up a standalone ghost-text system that
   * shows suggestions after 1.5s of typing pause, only when not in a
   * comment or string.
   *
   * @param {import('../ai/api.js').GLMClient} glmClient
   */
  setupInlineCompletion(glmClient) {
    if (!glmClient) {
      console.warn('[EditorManager] setupInlineCompletion: no GLM client provided');
      return;
    }

    // Dispose any previously registered provider.
    this._inlineCompletionDisposable?.dispose?.();

    // Capture `this` so the provider methods can access the manager.
    const self = this;

    /** A monotonically increasing request id to race-guard responses. */
    let requestSeq = 0;

    this._inlineCompletionDisposable = monaco.languages.registerInlineCompletionsProvider(
      { pattern: '**' },
      {
        /**
         * @param {import('monaco-editor').editor.ITextModel} model
         * @param {import('monaco-editor').editor.InlineCompletionContext} context
         * @returns {Promise<{items: Array<{insertText: string, range: any}>}|undefined>}
         */
        async provideInlineCompletions(model, position, context) {
          // Respect the autoCompletion setting.
          if (!self.app?.settings?.autoCompletion) {
            return undefined;
          }

          // Don't trigger when the user is actively selecting text.
          const editorSelection = self.monaco?.getSelection();
          if (editorSelection && !editorSelection.isEmpty()) {
            return undefined;
          }

          const lineContent = model.getLineContent(position.lineNumber);
          const charBefore = lineContent[position.column - 2];

          // Only suggest after a non-empty character or whitespace
          // (avoid firing on empty lines or right after newline with no content).
          if (position.column === 1 && lineContent.trim() === '') {
            return undefined;
          }

          const seq = ++requestSeq;

          // Build prefix / suffix around the cursor.
          const fullText = model.getValue();
          const offsetUntilCursor = model.getOffsetAt(position);
          const prefix = fullText.slice(0, offsetUntilCursor);
          const suffix = fullText.slice(offsetUntilCursor);

          // Determine language from the model URI / language id.
          const language = model.getLanguageId?.() || 'plaintext';

          // Debounce — wait for the user to stop typing.
          const completionText = await self._debouncedComplete(
            () => glmClient.completeCode(prefix, suffix, language),
          );

          // Race guard: a newer request superseded this one.
          if (seq !== requestSeq || !completionText) {
            return undefined;
          }

          // Only show if we have a non-empty suggestion.
          const trimmed = completionText.trim();
          if (!trimmed) return undefined;

          return {
            items: [
              {
                insertText: completionText,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              },
            ],
          };
        },

        /** No-op — Monaco calls this to free resources. */
        handleItemDidShow() {},
        /** No-op. */
        handleItemDidHide() {},
        /** No-op. */
        dispose() {},
      },
    );

    console.log('[EditorManager] Inline completion provider registered.');

    // ═══ Feature 4: Enhanced Ghost Text Suggestions ═══
    // Set up a standalone ghost-text system that fires after 1.5s of typing pause,
    // only when not inside a comment or string literal.
    this._setupEnhancedGhostText(glmClient);
  }

  /**
   * Enhanced ghost text: shows AI hints after 1.5s pause when cursor is not
   * in a comment or string. Uses a subtle inline decoration.
   * @param {import('../ai/api.js').GLMClient} glmClient
   * @private
   */
  _setupEnhancedGhostText(glmClient) {
    if (!this.monaco || !glmClient) return;
    const GHOST_TEXT_DELAY_MS = 1500;
    let ghostSeq = 0;
    const self = this;

    // Listen for content changes to trigger ghost text
    this.monaco.onDidChangeModelContent(() => {
      clearTimeout(this._ghostTextTimer);

      // Only if auto-completion is enabled
      if (!self.app?.settings?.autoCompletion) return;

      this._ghostTextTimer = setTimeout(async () => {
        // Check we're not in a comment or string
        if (self._isInCommentOrString()) return;
        if (!self.monaco) return;

        const model = self.monaco.getModel();
        if (!model) return;

        const position = self.monaco.getPosition();
        const lineContent = model.getLineContent(position.lineNumber);
        if (!lineContent.trim()) return;

        // Don't trigger when user is selecting
        const sel = self.monaco.getSelection();
        if (sel && !sel.isEmpty()) return;

        const seq = ++ghostSeq;
        const fullText = model.getValue();
        const offset = model.getOffsetAt(position);
        const prefix = fullText.slice(0, offset);
        const suffix = fullText.slice(offset);
        const language = model.getLanguageId?.() || 'plaintext';

        try {
          const suggestion = await glmClient.completeCode(prefix, suffix, language);
          if (seq !== ghostSeq || !suggestion || !suggestion.trim()) {
            return;
          }
          // Only show single-line or short completions as ghost text
          const firstLine = suggestion.split('\n')[0];
          if (!firstLine.trim() || firstLine.length > 80) return;

          // Apply ghost text decoration (inline greyed text)
          self._renderGhostText(position, firstLine);
        } catch (err) {
          if (err?.name !== 'AbortError') {
            // Silent fail for ghost text
          }
        }
      }, GHOST_TEXT_DELAY_MS);
    });

    // Dismiss ghost text on any key press (except Tab)
    this.monaco.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Tab) {
        // Accept ghost text on Tab
        self._acceptGhostText();
      } else if (e.keyCode === monaco.KeyCode.Escape) {
        self._clearGhostText();
      } else {
        // Clear on any other key
        self._clearGhostText();
      }
    });

    // Also clear on cursor move or selection change
    this.monaco.onDidChangeCursorPosition(() => {
      // Small delay so Tab acceptance works before cursor moves
      setTimeout(() => {
        if (!self._ghostTextActive) self._clearGhostText();
      }, 50);
    });
  }

  /**
   * Render ghost text at the given position.
   * @param {Object} position  Monaco position {lineNumber, column}.
   * @param {string} text      The ghost text to display.
   * @private
   */
  _renderGhostText(position, text) {
    this._clearGhostText();
    const model = this.monaco?.getModel();
    if (!model) return;

    this._ghostTextLine = position.lineNumber;
    this._ghostTextColumn = position.column;
    this._ghostTextContent = text;

    // Use inline decoration after the cursor position
    const decorations = model.deltaDecorations([], [{
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      options: {
        after: {
          content: text,
          inlineClassName: 'ghost-text-suggestion',
          cursorStops: monaco.editor.InjectedTextCursorStops.None,
        },
      },
    }]);
    this._ghostTextDecorationIds = decorations;
    this._ghostTextActive = true;
  }

  /**
   * Accept the current ghost text (insert it at cursor).
   * @private
   */
  _acceptGhostText() {
    if (!this._ghostTextActive || !this._ghostTextContent) {
      this._clearGhostText();
      return;
    }
    const model = this.monaco?.getModel();
    if (!model) return;

    const line = this._ghostTextLine;
    const col = this._ghostTextColumn;
    const op = {
      range: new monaco.Range(line, col, line, col),
      text: this._ghostTextContent,
      forceMoveMarkers: true,
    };
    this.monaco.executeEdits('ghost-text-accept', [op]);
    this._clearGhostText();
    this.monaco.focus();
  }

  /**
   * Clear the current ghost text decoration.
   * @private
   */
  _clearGhostText() {
    if (this._ghostTextDecorationIds.length === 0) {
      this._ghostTextActive = false;
      return;
    }
    const model = this.monaco?.getModel();
    if (model) {
      model.deltaDecorations(this._ghostTextDecorationIds, []);
    }
    this._ghostTextDecorationIds = [];
    this._ghostTextActive = false;
    this._ghostTextContent = null;
  }

  /**
   * Check if the cursor is inside a comment or string literal.
   * Uses Monaco's tokenization to detect this.
   * @returns {boolean}
   * @private
   */
  _isInCommentOrString() {
    if (!this.monaco) return false;
    const position = this.monaco.getPosition();
    const model = this.monaco.getModel();
    if (!model) return false;

    // Get the token type at the cursor position
    const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
    const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
    if (tokenIndex < 0) return false;

    const tokenType = lineTokens.getTokenType(tokenIndex);
    const tokenLower = tokenType.toLowerCase();

    // Check for comment, string, regex, etc.
    return tokenLower.includes('comment') ||
           tokenLower.includes('string') ||
           tokenLower.includes('regex') ||
           tokenLower.includes('regexp');
  }

  /**
   * Debounce a completion request by {@link INLINE_COMPLETION_DEBOUNCE_MS}.
   * Cancels any in-flight request via AbortController.
   *
   * @param {() => Promise<string>} fn
   * @returns {Promise<string|null>}
   * @private
   */
  async _debouncedComplete(fn) {
    // Clear previous debounce timer.
    clearTimeout(this._completionTimer);

    // Abort any in-flight request.
    this._completionAbort?.abort?.();

    return new Promise((resolve) => {
      this._completionTimer = setTimeout(async () => {
        this._completionAbort = new AbortController();
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          // Silently swallow completion errors — ghost text is non-critical.
          if (err?.name !== 'AbortError') {
            console.warn('[EditorManager] Inline completion error:', err?.message);
          }
          resolve(null);
        }
      }, INLINE_COMPLETION_DEBOUNCE_MS);
    });
  }

  // ─── 14. setupCommandPaletteActions ──────────────────────────────────────

  /**
   * Register editor-specific commands that appear in the Monaco / app
   * command palette.
   */
  setupCommandPaletteActions() {
    if (!this.monaco) return;

    const actions = [
      {
        id: 'editor.formatDocument',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
        run: () => this.formatDocument(),
      },
      {
        id: 'editor.gotoLine',
        label: 'Go to Line…',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG],
        run: async () => {
          const input = prompt('Go to line:');
          const n = parseInt(input, 10);
          if (Number.isFinite(n) && n > 0) this.gotoLine(n);
        },
      },
      {
        id: 'editor.askAI',
        label: 'Ask AI About Selection',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
        run: () => this._askAI(),
      },
      {
        id: 'editor.toggleWordWrap',
        label: 'Toggle Word Wrap',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
        run: () => {
          const current = this.monaco.getOption(monaco.editor.EditorOption.wordWrap);
          this.monaco.updateOptions({
            wordWrap: current === 'on' ? 'off' : 'on',
          });
        },
      },
      {
        id: 'editor.toggleMinimap',
        label: 'Toggle Minimap',
        run: () => {
          const current = this.monaco.getOption(monaco.editor.EditorOption.minimap);
          this.monaco.updateOptions({
            minimap: { enabled: !current.enabled },
          });
        },
      },
    ];

    for (const action of actions) {
      this.monaco.addAction(action);
    }

    console.log('[EditorManager] Command-palette actions registered.');
  }

  // ─── Context Menu: "Ask AI" ──────────────────────────────────────────────

  /**
   * Register custom context-menu entries in Monaco's right-click menu:
   * - "Format Code"
   * - "Ask AI"  (sends selection/document to the AI chat panel)
   * - "Duplicate Line"  (#7)
   * - "Sort Lines"  (#7)
   *
   * @private
   */
  _setupContextMenu() {
    if (!this.monaco) return;

    // "Format Code" in context menu
    this.monaco.addAction({
      id: 'editor-context-format-code',
      label: '🎨 Format Code',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1,
      run: () => this.formatDocument(),
    });

    // "Ask AI" in context menu
    this.monaco.addAction({
      id: 'editor-context-ask-ai',
      label: '✨ Ask AI',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
      contextMenuGroupId: 'ai',
      contextMenuOrder: 1,
      run: () => this._askAI(),
    });

    // "Duplicate Line" — duplicates the current line (or each selected line)
    this.monaco.addAction({
      id: 'editor-context-duplicate-line',
      label: '📑 Duplicate Line',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 2,
      run: () => this._duplicateLine(),
    });

    // "Sort Lines" — sorts selected lines alphabetically
    this.monaco.addAction({
      id: 'editor-context-sort-lines',
      label: '🔤 Sort Lines',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 3,
      run: () => this._sortLines(),
    });
  }

  /**
   * Duplicate the current line (or each line in the selection).
   * @private
   */
  _duplicateLine() {
    if (!this.monaco) return;
    this.monaco.getAction('editor.action.copyLinesDownAction')?.run();
    this.monaco.focus();
  }

  /**
   * Sort the selected lines alphabetically (ascending).
   * If no selection, operates on all lines in the document.
   * @private
   */
  _sortLines() {
    if (!this.monaco) return;
    const editor = this.monaco;
    const model = editor.getModel();
    if (!model) return;

    const selection = editor.getSelection();
    let startLine, endLine;

    if (selection && !selection.isEmpty()) {
      startLine = selection.startLineNumber;
      endLine = selection.endLineNumber;
      // If the selection ends at column 1 of the last line, exclude that line
      if (selection.endColumn === 1 && endLine > startLine) {
        endLine--;
      }
    } else {
      startLine = 1;
      endLine = model.getLineCount();
    }

    // Extract lines
    const lines = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(model.getLineContent(i));
    }

    // Sort (case-insensitive, trim for comparison)
    lines.sort((a, b) => {
      const ta = a.trim().toLowerCase();
      const tb = b.trim().toLowerCase();
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    // Replace range with sorted lines
    const range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
    editor.executeEdits('sort-lines', [{
      range,
      text: lines.join('\n'),
      forceMoveMarkers: true,
    }]);
    editor.setSelection(new monaco.Range(startLine, 1, startLine + lines.length - 1, 1));
    editor.focus();
  }

  /**
   * Send the current selection (or the whole document if nothing is
   * selected) to the AI chat panel with a contextual prompt.
   * @private
   */
  _askAI() {
    const selected = this.getSelection();
    const code = selected || this.getCurrentContent();
    if (!code || !code.trim()) {
      this.app?.notifications?.toast?.('Nothing selected to ask AI about.', 'warning');
      return;
    }

    const prompt = selected
      ? `Explain this code:\n\n\`\`\`\n${code}\n\`\`\``
      : `Review this file:\n\n\`\`\`\n${code}\n\`\`\``;

    // Populate the AI input and send.
    const aiInput = document.getElementById('ai-input');
    if (aiInput) {
      aiInput.value = prompt;
      aiInput.dispatchEvent(new Event('input'));
      aiInput.focus();
    }

    // Ensure the AI panel is visible.
    const aiPanel = document.querySelector('.ai-panel, #ai-panel');
    if (aiPanel?.classList.contains('collapsed')) {
      this.app?.togglePanel?.('ai-panel', 'btn-toggle-ai');
    }

    // Auto-send if the chat component is available.
    if (this.app?.aiChat?.send) {
      this.app.aiChat.send();
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Detect the Monaco language id from a file path's extension.
   *
   * @param {string} path
   * @returns {string} Monaco language id.
   * @private
   */
  _detectLanguage(path) {
    if (!path) return 'plaintext';
    const ext = path.split('.').pop()?.toLowerCase();
    return EXT_LANGUAGE_MAP[ext] || 'plaintext';
  }

  /**
   * Update the editor's theme.
   *
   * @param {string} theme  Monaco theme id (e.g. `'xcode-dark'`).
   */
  setTheme(theme) {
    this.monaco?.updateOptions({ theme });
  }

  /**
   * Update editor options from the app settings.
   * Called by {@link AIXcodeApp.applySettings}.
   *
   * @param {Object} settings
   */
  applySettings(settings) {
    if (!this.monaco) return;
    this.monaco.updateOptions({
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      minimap: { enabled: settings.minimap },
      wordWrap: settings.wordWrap ? 'on' : 'off',
      theme: settings.theme === 'light' ? 'xcode-light' : 'xcode-dark',
    });
  }

  /**
   * Close (dispose) the model for a given path and clean up tracking state.
   *
   * @param {string} path
   */
  closeModel(path) {
    const model = this.models.get(path);
    if (model) {
      model.dispose();
      this.models.delete(path);
    }
    this.savedContent.delete(path);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 1: Line Bookmark System
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Toggle a bookmark on the current cursor line for the active file.
   */
  toggleBookmark() {
    if (!this.monaco) return;
    const path = this.app?.activeFile;
    if (!path) return;

    const pos = this.monaco.getPosition();
    const lineNumber = pos.lineNumber;

    if (!this.bookmarks.has(path)) {
      this.bookmarks.set(path, new Set());
    }
    const set = this.bookmarks.get(path);
    if (set.has(lineNumber)) {
      set.delete(lineNumber);
    } else {
      set.add(lineNumber);
    }
    this.renderBookmarkDecorations(path);
    // Refresh breakpoint navigator if it's visible
    this.app?.showNavigator?.('breakpoint');
    this.app?.notifications?.toast?.(
      set.has(lineNumber) ? `🔖 Bookmark added: Line ${lineNumber}` : `Bookmark removed: Line ${lineNumber}`,
      'info', 1000,
    );
  }

  /**
   * Navigate to the next bookmark in the active file (wraps around).
   */
  nextBookmark() {
    const path = this.app?.activeFile;
    if (!path) return;
    const set = this.bookmarks.get(path);
    if (!set || set.size === 0) {
      this.app?.notifications?.toast?.('No bookmarks in this file', 'info', 1000);
      return;
    }
    const currentLine = this.monaco.getPosition().lineNumber;
    const sorted = [...set].sort((a, b) => a - b);
    const next = sorted.find(l => l > currentLine) ?? sorted[0];
    this.gotoLine(next);
  }

  /**
   * Navigate to the previous bookmark in the active file (wraps around).
   */
  prevBookmark() {
    const path = this.app?.activeFile;
    if (!path) return;
    const set = this.bookmarks.get(path);
    if (!set || set.size === 0) {
      this.app?.notifications?.toast?.('No bookmarks in this file', 'info', 1000);
      return;
    }
    const currentLine = this.monaco.getPosition().lineNumber;
    const sorted = [...set].sort((a, b) => b - a);
    const prev = sorted.find(l => l < currentLine) ?? sorted[0];
    this.gotoLine(prev);
  }

  /**
   * Get all bookmarks for a given file path.
   * @param {string} path
   * @returns {number[]} Array of bookmarked line numbers.
   */
  getBookmarks(path) {
    const set = this.bookmarks.get(path);
    return set ? [...set].sort((a, b) => a - b) : [];
  }

  /**
   * Render bookmark decorations (glyph margin icons) for a file.
   * @param {string} path
   */
  renderBookmarkDecorations(path) {
    const model = this.monaco?.getModel();
    if (!model) return;
    const set = this.bookmarks.get(path);
    if (!set || set.size === 0) {
      // Clear existing decorations
      if (this._bookmarkDecorations.length > 0) {
        model.deltaDecorations(this._bookmarkDecorations, []);
        this._bookmarkDecorations = [];
      }
      return;
    }
    const decorations = [...set].map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'bookmark-glyph',
        glyphMarginHoverMessage: { value: '🔖 Bookmark — Click F2 to navigate' },
        stickiness: 1, // NeverGrowsWhenTypingAtEdges
        overviewRuler: {
          color: '#ffd60a',
          position: monaco.editor.OverviewRulerLane.Center,
        },
      },
    }));
    this._bookmarkDecorations = model.deltaDecorations(this._bookmarkDecorations, decorations);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 2: Word Count & Reading Time
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update the word/char/line count in the status bar.
   */
  updateWordCount() {
    const el = document.getElementById('status-wordcount');
    if (!el) return;
    const model = this.monaco?.getModel();
    if (!model) {
      el.textContent = '';
      return;
    }
    const text = model.getValue();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const lines = model.getLineCount();
    const lang = model.getLanguageId?.() || '';
    let html = `W: ${words} | C: ${chars} | L: ${lines}`;
    // Reading time for markdown files
    if (lang === 'markdown') {
      const minutes = Math.max(1, Math.ceil(words / 200));
      html += ` | ⏱ ${minutes}m`;
    }
    el.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 3: File Comparison (Quick Diff)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compare two files using Monaco DiffEditor.
   * @param {string} path1  Original file path.
   * @param {string} path2  Modified file path.
   */
  compareFiles(path1, path2) {
    const content1 = this.app.vfs.readFile(path1) || '';
    const content2 = this.app.vfs.readFile(path2) || '';

    // Create or reuse a diff editor container
    let diffContainer = document.getElementById('diff-editor-container');
    if (!diffContainer) {
      diffContainer = document.createElement('div');
      diffContainer.id = 'diff-editor-container';
      diffContainer.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:var(--bg-primary);';
      diffContainer.innerHTML = `
        <div style="display:flex;align-items:center;padding:8px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-primary);">
          <span style="font-size:13px;font-weight:600;color:var(--text-primary);">📊 Comparing: ${path1} ↔ ${path2}</span>
          <span style="flex:1;"></span>
          <button id="close-diff-editor" style="background:var(--bg-hover);border:none;color:var(--text-primary);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;">Close ✕</button>
        </div>
        <div id="diff-editor-body" style="width:100%;height:calc(100vh - 44px);"></div>
      `;
      document.body.appendChild(diffContainer);
      document.getElementById('close-diff-editor').addEventListener('click', () => {
        this.closeDiffEditor();
      });
      document.addEventListener('keydown', function escClose(e) {
        if (e.key === 'Escape') {
          const dc = document.getElementById('diff-editor-container');
          if (dc) dc.remove();
        }
      });
    }

    const body = document.getElementById('diff-editor-body');
    const lang1 = this._detectLanguage(path1);

    if (this._diffEditor) {
      this._diffEditor.dispose();
    }

    this._diffEditor = monaco.editor.createDiffEditor(body, {
      theme: 'xcode-dark',
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      fontSize: this.app?.settings?.fontSize ?? 14,
    });

    const origModel = monaco.editor.createModel(content1, lang1);
    const modModel = monaco.editor.createModel(content2, lang1);
    this._diffEditor.setModel({
      original: origModel,
      modified: modModel,
    });

    this.app?.notifications?.toast?.(`Comparing ${path1} ↔ ${path2}`, 'info');
  }

  /**
   * Set the "compare against" file path for the context menu.
   * @param {string} path
   */
  setCompareAgainst(path) {
    this._compareAgainstPath = path;
  }

  /** @returns {string|null} */
  getCompareAgainst() {
    return this._compareAgainstPath;
  }

  /** Close the diff editor overlay. */
  closeDiffEditor() {
    const container = document.getElementById('diff-editor-container');
    if (container) container.remove();
    if (this._diffEditor) {
      this._diffEditor.dispose();
      this._diffEditor = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 6: Smart Paste (AI-powered)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect the programming language of pasted text using heuristics.
   * @param {string} text
   * @returns {string|null} Detected language or null if unsure.
   * @private
   */
  _detectPastedLanguage(text) {
    if (!text || text.length < 5) return null;

    const indicators = {
      swift: [
        /\bfunc\s+\w+\s*\(/, /\bvar\s+\w+/, /\blet\s+\w+/,
        /\bimport\s+(SwiftUI|UIKit|Foundation)/,
        /@\w+/, /struct\s+\w+.*:\s*View/,
      ],
      javascript: [
        /\bconst\s+\w+\s*=/, /\blet\s+\w+\s*=/, /\bvar\s+\w+\s*=/,
        /\bfunction\s+\w+\s*\(/, /=>\s*\{?/, /\bconsole\.log\b/,
        /\brequire\s*\(/, /\bexport\s+(default|const|function)\b/,
      ],
      typescript: [
        /:\s*(string|number|boolean|void|any)\b/,
        /\binterface\s+\w+/, /\btype\s+\w+\s*=/,
        /\bas\s+(string|number|any)\b/,
      ],
      python: [
        /\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bfrom\s+\w+\s+import/,
        /\bprint\s*\(/, /\bself\./, /\bif\s+__name__\s*==/,
        /\bclass\s+\w+.*:/, /\belif\b/,
      ],
      java: [
        /\bpublic\s+(class|static|void|String|int)\b/,
        /\bSystem\.out\.println\b/, /\bprivate\s+\w+\s+\w+/,
        /\bpackage\s+[\w.]+;/,
      ],
      go: [
        /\bfunc\s+\w+\s*\(/, /\bpackage\s+(main|\w+)\b/,
        /\bfmt\.(Print|Sprintf)\b/,
      ],
    };

    const scores = {};
    for (const [lang, patterns] of Object.entries(indicators)) {
      scores[lang] = 0;
      for (const p of patterns) {
        if (p.test(text)) scores[lang]++;
      }
    }

    let best = null;
    let bestScore = 0;
    for (const [lang, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        best = lang;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  /**
   * Smart Paste handler — detects language mismatch and offers AI translation.
   * @param {Object} e  The Monaco paste event.
   */
  async smartPaste(e) {
    if (!this.app?.glm?.isConfigured) return;
    if (!this.app?.activeFile) return;

    const model = this.monaco?.getModel();
    if (!model) return;

    // Get the pasted text from the range
    const range = e.range;
    if (!range) return;
    const pastedText = model.getValueInRange(range);
    if (!pastedText || pastedText.length < 20) return;

    const detectedLang = this._detectPastedLanguage(pastedText);
    if (!detectedLang) return;

    const currentLang = model.getLanguageId?.() || 'plaintext';
    const currentExt = this.app.activeFile.split('.').pop()?.toLowerCase();

    // Map detected language to extensions
    const langExtMap = {
      swift: 'swift', javascript: 'js', typescript: 'ts',
      python: 'py', java: 'java', go: 'go',
    };
    const detectedExt = langExtMap[detectedLang];

    // Only show prompt if there's a mismatch
    if (!detectedExt || detectedExt === currentExt) return;
    if (detectedLang === currentLang) return;

    // Show a toast with translate option
    const toastEl = document.createElement('div');
    toastEl.className = 'toast smart-paste-toast';
    toastEl.style.cssText = 'background:var(--bg-elevated);border:1px solid var(--accent);';
    toastEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <i class="fas fa-language" style="color:var(--accent);"></i>
        <span style="flex:1;">Detected <b>${detectedLang}</b> code pasted into <b>${currentLang}</b> file. Translate?</span>
        <button class="toast-btn-yes" style="background:var(--accent);color:white;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Yes</button>
        <button class="toast-btn-no" style="background:var(--bg-hover);color:var(--text-primary);border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;">No</button>
      </div>
    `;
    const container = document.getElementById('toast-container') || document.body;
    container.appendChild(toastEl);
    requestAnimationFrame(() => toastEl.classList.add('visible'));

    const autoRemove = setTimeout(() => toastEl.remove(), 15000);

    toastEl.querySelector('.toast-btn-yes').addEventListener('click', async () => {
      clearTimeout(autoRemove);
      toastEl.remove();
      await this._translatePastedCode(pastedText, detectedLang, currentLang, range);
    });
    toastEl.querySelector('.toast-btn-no').addEventListener('click', () => {
      clearTimeout(autoRemove);
      toastEl.remove();
    });
  }

  /**
   * Translate pasted code using GLM and replace the selection.
   * @private
   */
  async _translatePastedCode(originalText, fromLang, toLang, originalRange) {
    this.app?.showLoadingIndicator?.('Translating code...');
    try {
      const prompt = `Translate the following ${fromLang} code to ${toLang}. Return ONLY the translated code, no explanations, no markdown fences:\n\n${originalText}`;
      const messages = [
        { role: 'system', content: 'You are a code translation expert. Return only translated code with no markdown fences or explanations.' },
        { role: 'user', content: prompt },
      ];
      const result = await this.app.glm.chat(messages, { temperature: 0.3, max_tokens: 2000 });
      let translated = result.content || '';
      // Strip markdown fences if present
      translated = translated.replace(/^```[\w]*\n?/m, '').replace(/```$/m, '').trim();

      if (translated && this.monaco?.getModel()) {
        const model = this.monaco.getModel();
        model.applyEdits([{
          range: originalRange,
          text: translated,
          forceMoveMarkers: true,
        }]);
        this.app?.notifications?.toast?.(`✅ Translated ${fromLang} → ${toLang}`, 'success');
      }
    } catch (err) {
      this.app?.notifications?.toast?.(`Translation failed: ${err.message}`, 'error');
    } finally {
      this.app?.hideLoadingIndicator?.();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 7: Find in Selection
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Trigger Monaco's "Find in Selection" mode.
   * Requires an active text selection.
   */
  findInSelection() {
    if (!this.monaco) return;
    const selection = this.monaco.getSelection();
    if (!selection || selection.isEmpty()) {
      this.app?.notifications?.toast?.('Select text first to use Find in Selection', 'info', 1500);
      return;
    }
    // Monaco built-in: triggers find widget with the current selection as search scope
    const findAction = this.monaco.getAction('editor.action.findWithSelection');
    if (findAction) {
      findAction.run();
    } else {
      // Fallback: open find widget then set the selection as search scope
      this.monaco.getAction('actions.find')?.run();
    }
    this.monaco.focus();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 8: Column Selection Mode
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Toggle column (block) selection mode in the editor.
   */
  toggleColumnSelectionMode() {
    if (!this.monaco) return;
    // Toggle between "cursor" and column selection
    const currentOption = this.monaco.getOption(monaco.editor.EditorOption.columnSelection);
    const newState = !currentOption;
    this.monaco.updateOptions({ columnSelection: newState });
    this.app?.updateColumnModeIndicator?.(newState);
    // Update toolbar button visual state
    const btn = document.getElementById('btn-column-mode');
    if (btn) btn.classList.toggle('active', newState);
    this.app?.notifications?.toast?.(
      `Column selection: ${newState ? 'On' : 'Off'}`,
      'info', 1200,
    );
    this.monaco.focus();
  }

  /**
   * Clean up all resources — models, decorations, the provider disposable,
   * and the editor itself.
   */
  dispose() {
    this._inlineCompletionDisposable?.dispose?.();
    clearTimeout(this._completionTimer);
    clearTimeout(this._ghostTextTimer);
    this._completionAbort?.abort?.();

    // Clean up diff editor
    this.closeDiffEditor?.();

    for (const [, model] of this.models) {
      model.dispose();
    }
    this.models.clear();
    this.savedContent.clear();
    this.decorations.clear();
    this._ghostTextDecorationIds = [];

    this.monaco?.dispose?.();
    this.monaco = null;
  }
}
