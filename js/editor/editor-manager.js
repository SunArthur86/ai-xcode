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
    });

    // Cursor position → status bar
    this.monaco.onDidChangeCursorPosition((e) => {
      this.app?.updateStatusCursor?.(e.position.lineNumber, e.position.column);
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

    // Focus editor
    this.monaco.focus();
  }

  /**
   * Called when a model's content changes — updates tab modified state.
   * @private
   */
  _onContentChanged(path) {
    // Re-render tabs so the "modified" dot appears/disappears
    if (this.app?.renderTabs) {
      this.app.renderTabs();
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

  // ─── 13. setupInlineCompletion ───────────────────────────────────────────

  /**
   * Register an inline (ghost-text) completion provider backed by the GLM
   * client's {@link GLMClient.completeCode} method.
   *
   * Completions are debounced (500 ms) and only fire when `autoCompletion`
   * is enabled in the user's settings.
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
   * Register a "Ask AI" entry in Monaco's right-click context menu.
   * When clicked, the currently selected code is sent to the AI chat panel.
   * @private
   */
  _setupContextMenu() {
    if (!this.monaco) return;

    this.monaco.addAction({
      id: 'editor-context-ask-ai',
      label: '✨ Ask AI',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
      contextMenuGroupId: 'ai',
      contextMenuOrder: 1,
      run: () => this._askAI(),
    });
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

  /**
   * Clean up all resources — models, decorations, the provider disposable,
   * and the editor itself.
   */
  dispose() {
    this._inlineCompletionDisposable?.dispose?.();
    clearTimeout(this._completionTimer);
    this._completionAbort?.abort?.();

    for (const [, model] of this.models) {
      model.dispose();
    }
    this.models.clear();
    this.savedContent.clear();
    this.decorations.clear();

    this.monaco?.dispose?.();
    this.monaco = null;
  }
}
