/**
 * AI-Xcode IDE — AI Chat Panel
 *
 * The GLM-powered assistant chat panel. Manages the conversation history,
 * streams responses token-by-token into the UI, renders a small subset of
 * Markdown, and wires up the six "quick action" buttons (explain, bugs,
 * refactor, tests, review, docs) to the corresponding GLM methods.
 *
 * The chat input is a `<textarea id="ai-input">`. Messages are appended to
 * `#ai-messages`. The send button (`#ai-send`) doubles as a stop button
 * while a response is streaming.
 *
 * @module ai/chat
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * System prompt injected at the start of every chat conversation.
 * @type {string}
 */
const SYSTEM_PROMPT =
  'You are AI-Xcode Assistant, an expert coding companion integrated into ' +
  'an IDE. Provide concise, actionable responses. When showing code, use ' +
  'proper code blocks with language identifiers.';

/**
 * Markdown-rendered welcome message shown when the chat is cleared or first
 * initialised. Kept as plain text so it flows through `renderMarkdown` and
 * `addMessage(..., true)` for consistent styling.
 * @type {string}
 */
const WELCOME_MARKDOWN = [
  '👋 Welcome to **AI-Xcode**! I\'m your GLM-powered coding assistant.',
  '',
  'I can help you:',
  '- Write & explain code',
  '- Find & fix bugs',
  '- Refactor & optimize',
  '- Generate tests & docs',
  '- Code review',
  '',
  'Select code in the editor and ask a question, or use a quick-action ' +
  'button below. Set your GLM API key in Settings to get started.',
].join('\n');

/**
 * Map quick-action id → human-readable label (shown in the chat header of a
 * result message).
 * @type {Record<string, string>}
 */
const ACTION_LABELS = {
  explain: '📖 Explain',
  bugs: '🐛 Find Bugs',
  refactor: '♻️ Refactor',
  tests: '🧪 Generate Tests',
  review: '🔍 Code Review',
  docs: '📝 Generate Docs',
};

/**
 * Map quick-action id → GLM client method name.
 * @type {Record<string, string>}
 */
const ACTION_METHODS = {
  explain: 'explainCode',
  bugs: 'findBugs',
  refactor: 'refactor',
  tests: 'generateTests',
  review: 'reviewCode',
  docs: 'generateDoc',
};

/**
 * Common prompt templates for the Templates dropdown (Feature 7).
 * @type {Array<{icon: string, label: string, prompt: string}>}
 */
const PROMPT_TEMPLATES = [
  { icon: '📖', label: 'Explain this code', prompt: 'Please explain what this code does, step by step, including its purpose, key components, and any important design decisions.' },
  { icon: '🧪', label: 'Write unit tests', prompt: 'Write comprehensive unit tests for this code. Cover happy paths, edge cases, and error handling. Use an appropriate testing framework.' },
  { icon: '🛡️', label: 'Add error handling', prompt: 'Add robust error handling to this code. Include try/catch blocks, input validation, and meaningful error messages.' },
  { icon: '⚡', label: 'Optimize performance', prompt: 'Analyze this code for performance bottlenecks and provide an optimized version. Explain what was improved and why.' },
  { icon: '📝', label: 'Add documentation', prompt: 'Add thorough documentation to this code. Include JSDoc comments, inline explanations, and a summary of the overall structure.' },
  { icon: '🔧', label: 'Fix all issues', prompt: 'Review this code for bugs, security issues, code style problems, and best practice violations. Fix all issues you find and explain each fix.' },
];

/**
 * Available models for the model switcher (Feature 6).
 * @type {Array<{value: string, label: string}>}
 */
const AVAILABLE_MODELS = [
  { value: 'glm-4-plus', label: 'GLM-4-Plus (Best Quality)' },
  { value: 'glm-4', label: 'GLM-4 (Standard)' },
  { value: 'glm-4-flash', label: 'GLM-4-Flash (Fastest)' },
  { value: 'glm-4-long', label: 'GLM-4-Long (Long Context)' },
];

/**
 * File-extension → short language identifier, used when building code context
 * for the model and when labelling code blocks. Falls back to a generic
 * `text` for unknown extensions.
 * @type {Record<string, string>}
 */
const EXT_LANGUAGE_MAP = {
  swift: 'swift', js: 'javascript', mjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', md: 'markdown', markdown: 'markdown', xml: 'xml',
  plist: 'xml', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'cpp',
  hpp: 'cpp', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
  sh: 'shell', bash: 'shell', sql: 'sql', yml: 'yaml', yaml: 'yaml',
  php: 'php', dart: 'dart', lua: 'lua', toml: 'ini', ini: 'ini',
  txt: 'text',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the file-name portion from a VFS path.
 * @param {string} path
 * @returns {string}
 */
function baseName(path) {
  if (!path) return 'untitled';
  const parts = path.split('/');
  return parts[parts.length - 1] || 'untitled';
}

/**
 * Guess a language identifier from a file path's extension.
 * @param {string} path
 * @returns {string}
 */
function languageFromPath(path) {
  if (!path) return 'text';
  const ext = path.split('.').pop()?.toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || 'text';
}

/**
 * Escape a string for safe insertion into HTML text content.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// AIChat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the AI assistant chat panel: conversation history, streaming
 * responses, Markdown rendering, and quick-action commands.
 */
export class AIChat {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /**
     * Chat history sent to the model on each turn.
     * @type {Array<{role: 'user'|'assistant', content: string, timestamp: number}>}
     */
    this.messages = [];

    /**
     * Command history for ArrowUp/Down cycling (like a shell).
     * @type {string[]}
     */
    this.history = [];
    /** Current position when cycling through {@link history} (-1 = not browsing). */
    this.historyIndex = -1;

    /** True while an AI response is actively streaming. */
    this.isStreaming = false;

    /** AbortController for the in-flight stream (null when idle). */
    this.abortController = null;

    this._init();
  }

  // ─── Initialisation ───────────────────────────────────────────────────

  /**
   * Render the welcome message. The DOM already contains a static welcome
   * bubble in `index.html`, but we replace it with our Markdown-rendered
   * version so the styling is consistent after a `clear()`.
   * @private
   */
  _init() {
    const container = document.getElementById('ai-messages');
    if (container) {
      container.innerHTML = '';
      this.addMessage('assistant', WELCOME_MARKDOWN, true);
    }
    this._updateSendButton();
    this._initEnhancements();
    console.log('[AIChat] initialised.');
  }

  /**
   * Initialise all AI enhancement features: code copy delegation,
   * temperature slider, model switcher, history, templates, export,
   * and token counter.
   * @private
   */
  _initEnhancements() {
    // ── Feature 3: Code block copy via event delegation ──────────────
    const messagesEl = document.getElementById('ai-messages');
    if (messagesEl) {
      messagesEl.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.ai-code-copy');
        if (!copyBtn) return;
        const block = copyBtn.closest('.ai-code-block');
        const codeEl = block?.querySelector('pre code, pre');
        const code = codeEl?.textContent || '';
        navigator.clipboard?.writeText(code).then(() => {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
          }, 1500);
          this.app?.notifications?.toast?.('Copied to clipboard.', 'info', 1200);
        }).catch(() => {});
      });
    }

    // ── Feature 5: Temperature slider ────────────────────────────────
    const tempSlider = document.getElementById('ai-temp-slider');
    const tempVal = document.getElementById('ai-temp-val');
    if (tempSlider) {
      const initTemp = this._temperature();
      tempSlider.value = initTemp;
      if (tempVal) tempVal.textContent = initTemp.toFixed(1);
      tempSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (tempVal) tempVal.textContent = v.toFixed(1);
        if (this.app.settings) {
          this.app.settings.temperature = v;
          this.app.saveSettings({ temperature: v });
        }
      });
    }

    // ── Feature 9: Token counter initial display ─────────────────────
    this.updateTokenCounter();

    // ── Feature 1: History button ────────────────────────────────────
    document.getElementById('ai-history')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDropdown('history', e.currentTarget);
    });

    // ── Feature 7: Templates button ──────────────────────────────────
    document.getElementById('ai-templates')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDropdown('templates', e.currentTarget);
    });

    // ── Feature 10: Export button ────────────────────────────────────
    document.getElementById('ai-export')?.addEventListener('click', () => {
      this.exportConversation();
    });

    // ── Feature 6: Model switcher ────────────────────────────────────
    document.getElementById('ai-model-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDropdown('model', e.currentTarget);
    });

    // Close dropdowns when clicking elsewhere.
    document.addEventListener('click', () => this._closeDropdowns());
  }

  // ─── 1. send ──────────────────────────────────────────────────────────

  /**
   * Send a user message and stream the assistant's reply.
   *
   * Behaviour:
   *  - While streaming, the send button acts as a **stop** button — clicking
   *    it calls {@link stop} and returns.
   *  - Reads text from `#ai-input` unless `customText` is supplied.
   *  - If the input is empty but code is selected in the editor, the question
   *    is sent *with* that code as context (via {@link sendWithContext}).
   *  - If the input is empty and no file is open, do nothing.
   *
   * @param {string|null} [customText=null]  Optional explicit message text.
   * @returns {Promise<void>}
   */
  async send(customText = null) {
    // ── Stop button semantics ─────────────────────────────────────────
    if (this.isStreaming) {
      this.stop();
      return;
    }

    const input = document.getElementById('ai-input');
    let text = customText != null ? customText : (input?.value?.trim() ?? '');

    const hasActiveFile = Boolean(this.app.activeFile);
    const selection = this._getSelection();

    // Nothing to send and nothing open → bail.
    if (!text && !hasActiveFile) return;

    // No text but there is a selection → ask about the selection.
    if (!text && selection) {
      this.addMessage('user', '_Asking about the selected code…_', true);
      this._resetInput();
      return this.sendWithContext('Please explain this code.', {
        code: selection,
        fileName: this.app.activeFile,
        language: this._getLanguage(),
      });
    }

    // No text and no selection but a file is open → bail (avoid empty send).
    if (!text) return;

    // Push to command history (max 50 entries, no consecutive duplicates).
    if (text && this.history[this.history.length - 1] !== text) {
      this.history.push(text);
      if (this.history.length > 50) this.history.shift();
    }
    this.historyIndex = -1;

    // Regular send — optionally annotate with file context.
    this.addMessage('user', text);
    this._resetInput();

    // Build the messages array for the model.
    const apiMessages = this._buildApiMessages(text);

    await this.streamResponse(apiMessages);
  }

  // ─── 1b. handleKeydown (command history) ─────────────────────────────

  /**
   * Process keydown events on the AI input for command-history navigation.
   *
   * - **ArrowUp**: cycle backward through previous messages (oldest first →
   *   newest last). Clamps at the oldest entry.
   * - **ArrowDown**: cycle forward. When past the newest entry the input is
   *   cleared back to an empty state.
   *
   * The original draft (if any unsaved text existed) is preserved so pressing
   * ArrowDown past the end restores it.
   *
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (this.history.length === 0) return;

    const input = document.getElementById('ai-input');
    if (!input) return;

    // Save the user's current draft the first time they press Up.
    if (this.historyIndex === -1) {
      this._draft = input.value;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // If not yet browsing, start at the most recent entry.
      if (this.historyIndex === -1) {
        this.historyIndex = this.history.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
      input.value = this.history[this.historyIndex];
      // Move cursor to end for natural editing.
      requestAnimationFrame(() => {
        input.selectionStart = input.selectionEnd = input.value.length;
      });
    } else {
      // ArrowDown
      if (this.historyIndex === -1) return; // already at "current draft"
      e.preventDefault();
      this.historyIndex++;
      if (this.historyIndex >= this.history.length) {
        // Past the newest entry → restore the draft (or empty).
        this.historyIndex = -1;
        input.value = this._draft || '';
        this._draft = null;
      } else {
        input.value = this.history[this.historyIndex];
      }
      requestAnimationFrame(() => {
        input.selectionStart = input.selectionEnd = input.value.length;
      });
    }
  }

  // ─── 2. sendWithContext ───────────────────────────────────────────────

  /**
   * Send a question pre-pended with a code snippet as context.
   *
   * The formatted message looks like:
   * ```
   * Here's my code from <file>:
   * ```language
   * <code>
   * ```
   *
   * Question: <text>
   * ```
   *
   * @param {string} text     The user's question.
   * @param {Object} context
   * @param {string} context.code        The code snippet.
   * @param {string} [context.fileName]  Originating file name (for clarity).
   * @param {string} [context.language]  Language id for the code fence.
   * @returns {Promise<void>}
   */
  async sendWithContext(text, context) {
    const { code, fileName, language = 'text' } = context;
    const fileLabel = fileName ? ` from \`${baseName(fileName)}\`` : '';

    const formatted =
      `Here's my code${fileLabel}:\n` +
      '```' + language + '\n' +
      code +
      '\n```\n\n' +
      `Question: ${text}`;

    this.addMessage('user', formatted);
    this._resetInput();

    const apiMessages = this._buildApiMessages(formatted);
    await this.streamResponse(apiMessages);
  }

  // ─── 3. streamResponse ────────────────────────────────────────────────

  /**
   * Stream an assistant response into a freshly-created message bubble.
   *
   * Delegates to {@link GLMClient.chatStream}, appending each text delta to
   * the bubble and re-rendering Markdown incrementally. On completion the
   * full text is saved into {@link messages}. On error an error bubble is
   * shown instead.
   *
   * @param {Array<{role:string,content:string}>} messages  API-formatted messages.
   * @param {(error:Error)=>void} [onError]  Optional extra error callback.
   * @returns {AbortController} The controller (also stored on `this`).
   */
  streamResponse(messages, onError) {
    // Defensive: never start two streams at once.
    if (this.isStreaming) {
      this.stop();
    }

    this.isStreaming = true;
    this._updateSendButton();

    // Create the assistant bubble that will receive streamed text.
    const bubble = this.addMessage('assistant', '');
    const contentEl = bubble.querySelector('.ai-msg-content') || bubble;
    const typingEl = this.addTypingIndicator();
    let accumulated = '';

    /** @param {Error} err */
    const handleError = (err) => {
      this.removeTypingIndicator(typingEl);
      this._finishStream();

      // User-initiated abort is not an error.
      if (err?.name === 'AbortError') {
        if (accumulated) {
          this.messages.push({
            role: 'assistant',
            content: accumulated,
            timestamp: Date.now(),
          });
        } else {
          contentEl.innerHTML = '<em>Cancelled.</em>';
        }
        return;
      }

      const friendly = this._friendlyError(err);
      contentEl.innerHTML =
        `<div class="ai-error">⚠️ ${escapeHtml(friendly)}</div>`;
      if (typeof onError === 'function') onError(err);
    };

    this.abortController = this.app.glm.chatStream(
      messages,
      { temperature: this._temperature() },
      // ── onChunk ────────────────────────────────────────────────────
      (delta) => {
        // Remove the typing indicator on first token.
        if (typingEl && typingEl.parentNode) {
          this.removeTypingIndicator(typingEl);
        }
        accumulated += delta;
        contentEl.innerHTML = this.renderMarkdown(accumulated);
        this._scrollToBottom();
      },
      // ── onDone ─────────────────────────────────────────────────────
      (fullText) => {
        this.removeTypingIndicator(typingEl);
        const finalText = fullText || accumulated;
        contentEl.innerHTML = this.renderMarkdown(finalText);
        this._scrollToBottom();
        this.messages.push({
          role: 'assistant',
          content: finalText,
          timestamp: Date.now(),
        });
        this._addRegenerateButton(bubble);
        this._addApplyChangesButton(bubble, finalText);
        this._finishStream();
      },
      // ── onError ────────────────────────────────────────────────────
      handleError,
    );

    return this.abortController;
  }

  // ─── 4. quickAction ───────────────────────────────────────────────────

  /**
   * Run a one-shot code-intelligence action against the current editor
   * selection (or the whole file if nothing is selected).
   *
   * Supported actions: `explain`, `bugs`, `refactor`, `tests`, `review`,
   * `docs`. Each maps to a dedicated GLM client method.
   *
   * Results are rendered into the chat. For `refactor`, if the response
   * contains code an **Apply** button is offered that replaces the current
   * editor selection.
   *
   * @param {('explain'|'bugs'|'refactor'|'tests'|'review'|'docs')} action
   * @returns {Promise<void>}
   */
  async quickAction(action) {
    const methodName = ACTION_METHODS[action];
    const label = ACTION_LABELS[action] || action;
    if (!methodName || !this.app.glm?.[methodName]) {
      this.addMessage('assistant', `⚠️ Unknown action: \`${action}\``, true);
      return;
    }

    // Gather source code: selection first, fall back to whole file.
    const code = this._getSelection() || this._getFileContent();
    if (!code || !code.trim()) {
      this.addMessage(
        'assistant',
        `⚠️ No code to analyse. Open a file or select some code first.`,
        true,
      );
      return;
    }

    const language = this._getLanguage();
    const fileName = this.app.activeFile || 'untitled';

    // Show a user-facing breadcrumb so the conversation reads naturally.
    this.addMessage(
      'user',
      `**${label}** — \`${baseName(fileName)}\` (${language})`,
      true,
    );

    const typingEl = this.addTypingIndicator();
    this.isStreaming = true;
    this._updateSendButton();

    try {
      const result = await this.app.glm[methodName](code, language);

      // Structured results (bugs / review) get a rich rendering.
      if (action === 'bugs') {
        this._renderBugReport(result, fileName);
      } else if (action === 'review') {
        this._renderReviewReport(result, fileName);
      } else if (action === 'refactor') {
        this._renderRefactorResult(result);
      } else {
        // explain / tests / docs → plain Markdown text.
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        this.addMessage('assistant', text, false);
      }
    } catch (err) {
      const friendly = this._friendlyError(err);
      this.addMessage('assistant', `⚠️ ${escapeHtml(friendly)}`, true);
    } finally {
      this.removeTypingIndicator(typingEl);
      this._finishStream();
    }
  }

  // ─── 5. clear ─────────────────────────────────────────────────────────

  /**
   * Clear all messages from the UI and memory, then show the welcome message.
   */
  clear() {
    if (this.isStreaming) this.stop();
    this.messages = [];
    const container = document.getElementById('ai-messages');
    if (container) container.innerHTML = '';
    this.addMessage('assistant', WELCOME_MARKDOWN, true);
    this.app?.notifications?.toast?.('Chat cleared.', 'info', 1500);
  }

  // ─── 6. addMessage ────────────────────────────────────────────────────

  /**
   * Create a message element and append it to `#ai-messages`.
   *
   * @param {('user'|'assistant')} role
   * @param {string} content       Message text (Markdown) or pre-rendered HTML.
   * @param {boolean} [isHTML=false]  If true, `content` is treated as raw HTML
   *        (already safe) and inserted via `innerHTML`. Otherwise it is passed
   *        through {@link renderMarkdown}.
   * @returns {HTMLElement} The `.ai-message` wrapper element.
   */
  addMessage(role, content, isHTML = false) {
    const container = document.getElementById('ai-messages');
    if (!container) return document.createElement('div');

    const wrapper = document.createElement('div');
    wrapper.className = `ai-message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';

    const body = document.createElement('div');
    body.className = 'ai-msg-content';
    body.innerHTML = isHTML
      ? content
      : this.renderMarkdown(content);

    bubble.appendChild(body);

    // Role avatar / icon for visual clarity.
    if (role === 'assistant') {
      const icon = document.createElement('span');
      icon.className = 'ai-msg-icon';
      icon.innerHTML = '<i class="fas fa-robot"></i>';
      bubble.prepend(icon);
    }

    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    this._scrollToBottom();

    return wrapper;
  }

  // ─── 7. addTypingIndicator ────────────────────────────────────────────

  /**
   * Append an animated "typing" indicator (three bouncing dots) to the
   * message list.
   *
   * @returns {HTMLElement} The indicator element (pass to
   *         {@link removeTypingIndicator}).
   */
  addTypingIndicator() {
    const container = document.getElementById('ai-messages');
    if (!container) return document.createElement('div');

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message assistant ai-typing-wrapper';

    const indicator = document.createElement('div');
    indicator.className = 'ai-typing-indicator';
    indicator.innerHTML =
      '<span class="ai-typing-dot"></span>'.repeat(3) +
      '<span class="sr-only">Assistant is typing…</span>';

    wrapper.appendChild(indicator);
    container.appendChild(wrapper);
    this._scrollToBottom();

    return wrapper;
  }

  // ─── 8. removeTypingIndicator ─────────────────────────────────────────

  /**
   * Remove a typing indicator previously added by {@link addTypingIndicator}.
   *
   * @param {HTMLElement} el  The element returned by `addTypingIndicator`.
   */
  removeTypingIndicator(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  // ─── 9. renderMarkdown ────────────────────────────────────────────────

  /**
   * Convert a subset of Markdown into safe HTML.
   *
   * Supported syntax:
   *  - Fenced code blocks: ` ```lang … ``` `
   *  - Inline code: `` `code` ``
   *  - Bold: `**text**`
   *  - Italic: `*text*`
   *  - Headers: `#`, `##`, `###`
   *  - Unordered lists: `- item`
   *  - Ordered lists: `1. item`
   *  - Links: `[text](url)`
   *
   * HTML entities in the source are escaped *first*, so the output is safe
   * against injection.
   *
   * @param {string} text
   * @returns {string} HTML string.
   */
  renderMarkdown(text) {
    if (!text) return '';

    // 1) Escape everything up-front.
    let src = escapeHtml(text);

    // 2) Extract fenced code blocks so their contents are not mangled by
    //    the inline transformations. Replace with placeholders.
    const codeBlocks = [];
    src = src.replace(
      /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g,
      (match, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: lang || '', code });
        return `\u0000CODEBLOCK${idx}\u0000`;
      },
    );

    // 3) Inline code → placeholder (protected from bold/italic parsing).
    const inlineCodes = [];
    src = src.replace(
      /`([^`\n]+)`/g,
      (match, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(code);
        return `\u0000INLINE${idx}\u0000`;
      },
    );

    // 4) Links [text](url)  (must run before italic, which uses * … )
    src = src.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

    // 5) Headers (# / ## / ###).
    src = src.replace(
      /^###\s+(.+)$/gm,
      '<h4>$1</h4>',
    );
    src = src.replace(
      /^##\s+(.+)$/gm,
      '<h3>$1</h3>',
    );
    src = src.replace(
      /^#\s+(.+)$/gm,
      '<h2>$1</h2>',
    );

    // 6) Bold **text** then italic *text*.
    src = src.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    src = src.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    // 7) Lists. Group consecutive list items into <ul>/<ol>.
    src = this._renderLists(src);

    // 8) Restore inline code.
    src = src.replace(
      /\u0000INLINE(\d+)\u0000/g,
      (m, i) => `<code class="ai-inline-code">${inlineCodes[+i]}</code>`,
    );

    // 9) Restore fenced code blocks.
    src = src.replace(
      /\u0000CODEBLOCK(\d+)\u0000/g,
      (m, i) => {
        const block = codeBlocks[+i];
        const langClass = block.lang
          ? ` class="language-${escapeHtml(block.lang)}"`
          : '';
        const label = block.lang
          ? `<span class="ai-code-lang">${escapeHtml(block.lang)}</span>`
          : '';
        return (
          '<div class="ai-code-block">' +
          '<div class="ai-code-header">' +
          label +
          `<button class="ai-code-copy" title="Copy"><i class="fas fa-copy"></i></button>` +
          '</div>' +
          `<pre><code${langClass}>${block.code.replace(/\n$/, '')}</code></pre>` +
          '</div>'
        );
      },
    );

    // 10) Convert remaining single newlines into <br> (but not inside block
    //     elements). Simple heuristic: blank line → paragraph break, single
    //     newline within text → <br>.
    src = src
      .replace(/\n{2,}/g, '\n\n')
      .split('\n\n')
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        // Leave block-level HTML untouched.
        if (/^<(h\d|ul|ol|pre|div|blockquote)/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    return src;
  }

  /**
   * Convert Markdown list syntax (`- item` / `1. item`) into HTML lists.
   * Operates on already-escaped text.
   * @param {string} src
   * @returns {string}
   * @private
   */
  _renderLists(src) {
    const lines = src.split('\n');
    const out = [];
    let listType = null; // 'ul' | 'ol' | null

    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };

    for (const line of lines) {
      const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
      const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);

      if (ulMatch) {
        if (listType !== 'ul') {
          closeList();
          out.push('<ul>');
          listType = 'ul';
        }
        out.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (listType !== 'ol') {
          closeList();
          out.push('<ol>');
          listType = 'ol';
        }
        out.push(`<li>${olMatch[1]}</li>`);
      } else {
        closeList();
        out.push(line);
      }
    }
    closeList();
    return out.join('\n');
  }

  // ─── 10. stop ─────────────────────────────────────────────────────────

  /**
   * Abort the current streaming request (if any). Safe to call when idle.
   */
  stop() {
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (_) {
        /* already aborted */
      }
      this.abortController = null;
    }
    this._finishStream();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Reset streaming state and restore the send button.
   * @private
   */
  _finishStream() {
    this.isStreaming = false;
    this.abortController = null;
    this._updateSendButton();
    this.updateTokenCounter();
    this._saveConversationToHistory();
  }

  /**
   * Toggle the send button between "send" and "stop" visuals.
   * @private
   */
  _updateSendButton() {
    const btn = document.getElementById('ai-send');
    if (!btn) return;
    if (this.isStreaming) {
      btn.classList.add('is-streaming');
      btn.setAttribute('data-tooltip', 'Stop');
      btn.innerHTML = '<i class="fas fa-stop"></i>';
    } else {
      btn.classList.remove('is-streaming');
      btn.setAttribute('data-tooltip', 'Send');
      btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
  }

  /**
   * Clear and shrink the input textarea.
   * @private
   */
  _resetInput() {
    const input = document.getElementById('ai-input');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
  }

  /**
   * Auto-scroll the message container to the bottom.
   * @private
   */
  _scrollToBottom() {
    const container = document.getElementById('ai-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  /**
   * Get the current editor text selection (or null).
   * @returns {string|null}
   * @private
   */
  _getSelection() {
    return this.app.editor?.getSelection?.() ?? null;
  }

  /**
   * Get the full content of the active file (or empty string).
   * @returns {string}
   * @private
   */
  _getFileContent() {
    return this.app.editor?.getCurrentContent?.() ?? '';
  }

  /**
   * Determine the language id of the active file.
   * Prefers the VFS-cached value, falls back to extension detection.
   * @returns {string}
   * @private
   */
  _getLanguage() {
    const path = this.app.activeFile;
    if (path) {
      const file = this.app.vfs?.cache?.get?.(path);
      if (file?.language) return file.language;
    }
    return languageFromPath(path);
  }

  /**
   * Current temperature from app settings (default 0.7).
   * @returns {number}
   * @private
   */
  _temperature() {
    const t = this.app.settings?.temperature;
    return typeof t === 'number' ? t : 0.7;
  }

  /**
   * Build the messages array for the GLM API, prepending the system prompt
   * and the conversation history, then the new user message.
   *
   * @param {string} userText
   * @returns {Array<{role:string,content:string}>}
   * @private
   */
  _buildApiMessages(userText) {
    const msgs = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Carry over prior conversation (skip the initial system entry which we
    // just added).
    for (const m of this.messages) {
      msgs.push({ role: m.role, content: m.content });
    }

    // Record + append the new user turn.
    this.messages.push({ role: 'user', content: userText, timestamp: Date.now() });
    msgs.push({ role: 'user', content: userText });

    return msgs;
  }

  /**
   * Translate a thrown error into a short, user-friendly message.
   * @param {Error} err
   * @returns {string}
   * @private
   */
  _friendlyError(err) {
    if (!err) return 'An unknown error occurred.';
    // GLM-specific error classes carry helpful messages already.
    if (err.code === 'GLM_AUTH' || err.name === 'GLMAuthError') {
      return 'Authentication failed. Check your GLM API key in Settings.';
    }
    if (err.code === 'GLM_RATE_LIMIT' || err.name === 'GLMRateLimitError') {
      return 'Rate limit reached. Please wait a moment and try again.';
    }
    if (err.code === 'GLM_SERVER' || err.name === 'GLMServerError') {
      return 'The GLM server is having trouble. Try again shortly.';
    }
    if (err.code === 'GLM_TIMEOUT' || err.name === 'GLMTimeoutError') {
      return 'The request timed out. Try again or simplify your prompt.';
    }
    return err.message || String(err);
  }

  // ─── Quick-action result renderers ────────────────────────────────────

  /**
   * Render a structured bug report (from `findBugs`) into the chat.
   * @param {Array<{line:number,severity:string,message:string,fix:string}>} bugs
   * @param {string} fileName
   * @private
   */
  _renderBugReport(bugs, fileName) {
    if (!Array.isArray(bugs) || bugs.length === 0) {
      this.addMessage(
        'assistant',
        `✅ No bugs found in \`${baseName(fileName)}\`.`,
        true,
      );
      return;
    }

    const items = bugs
      .map((b) => {
        const sev = escapeHtml(b.severity || 'medium');
        const line = b.line ? `**L${b.line}:** ` : '';
        const msg = escapeHtml(b.message || '');
        const fix = b.fix ? `\n  ↳ _Fix:_ ${escapeHtml(b.fix)}` : '';
        return `- <span class="ai-sev ai-sev-${sev}">${sev}</span> ${line}${msg}${fix}`;
      })
      .join('\n');

    const md =
      `Found **${bugs.length}** potential issue${bugs.length === 1 ? '' : 's'}:\n\n` +
      items;

    this.addMessage('assistant', md, true);
  }

  /**
   * Render a structured code review (from `reviewCode`) into the chat.
   * @param {{score:number,issues:Array,suggestions:Array<string>,summary:string}} review
   * @param {string} fileName
   * @private
   */
  _renderReviewReport(review, fileName) {
    const score = Number.isFinite(review?.score) ? review.score : 0;
    const grade = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';

    let md = `## Code Review — \`${baseName(fileName)}\`\n\n`;
    md += `${grade} **Score: ${score}/100**\n\n`;
    if (review?.summary) md += `${escapeHtml(review.summary)}\n\n`;

    if (Array.isArray(review?.issues) && review.issues.length) {
      md += `### Issues (${review.issues.length})\n`;
      for (const it of review.issues) {
        const sev = escapeHtml(it.severity || 'medium');
        md += `- <span class="ai-sev ai-sev-${sev}">${sev}</span>`;
        if (it.line) md += ` **L${it.line}:**`;
        md += ` ${escapeHtml(it.message || '')}`;
        if (it.fix) md += `\n  ↳ _Fix:_ ${escapeHtml(it.fix)}`;
        md += '\n';
      }
      md += '\n';
    }

    if (Array.isArray(review?.suggestions) && review.suggestions.length) {
      md += `### Suggestions\n`;
      for (const s of review.suggestions) md += `- ${escapeHtml(s)}\n`;
    }

    this.addMessage('assistant', md, true);
  }

  /**
   * Render a refactor result (from `refactor`) into the chat, adding an
   * **Apply** button that writes the refactored code back into the editor.
   * @param {{code:string,changes:string}} result
   * @private
   */
  _renderRefactorResult({ code, changes }) {
    const wrapper = this.addMessage('assistant', '');
    const body = wrapper.querySelector('.ai-msg-content');

    let html = '<p>♻️ Here is the refactored code:</p>';
    html += '<div class="ai-code-block">';
    html += '<div class="ai-code-header">';
    html += '<span class="ai-code-lang">refactored</span>';
    html += '<button class="ai-code-copy" title="Copy"><i class="fas fa-copy"></i></button>';
    html += '</div>';
    html += `<pre><code>${escapeHtml(code || '')}</code></pre>`;
    html += '</div>';

    // Apply button — replaces the current editor selection (or whole file).
    const applyId = 'ai-apply-' + Date.now();
    html += `<button class="ai-apply-btn" id="${applyId}">`;
    html += '<i class="fas fa-check"></i> Apply to editor';
    html += '</button>';

    if (changes) {
      html += '<h4>Changes</h4>';
      html += `<p>${escapeHtml(changes).replace(/\n/g, '<br>')}</p>`;
    }

    body.innerHTML = html;

    // Wire up the apply button.
    const applyBtn = body.querySelector(`#${applyId}`);
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const editor = this.app.editor;
        if (!editor) return;
        // If there's a selection, replace it; otherwise replace whole file.
        const hasSelection = Boolean(editor.getSelection?.());
        if (hasSelection) {
          editor.replaceSelection?.(code);
        } else if (this.app.activeFile) {
          // Replace the entire model content.
          const model = editor.models?.get(this.app.activeFile);
          if (model) {
            model.setValue(code);
          }
        }
        this.app?.notifications?.toast?.('Refactored code applied.', 'success', 2000);
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="fas fa-check"></i> Applied';
      });
    }

    // Wire up copy button inside this bubble.
    const copyBtn = body.querySelector('.ai-code-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(code || '').then(() => {
          this.app?.notifications?.toast?.('Copied to clipboard.', 'info', 1200);
        });
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // AI Enhancement Features (1–10)
  // ─────────────────────────────────────────────────────────────────────

  // ─── Feature 1: Conversation History ───────────────────────────────

  /**
   * Persist the current conversation to localStorage.
   * Conversations are capped at 50 entries.
   * @private
   */
  _saveConversationToHistory() {
    if (!this.messages || this.messages.length < 2) return;
    try {
      const key = 'ai-xcode-ai-history';
      let history = JSON.parse(localStorage.getItem(key) || '[]');
      // Remove the welcome message from the snapshot.
      const conv = this.messages.filter(
        (m) => !m.content?.includes?.('Welcome to **AI-Xcode**'),
      );
      if (conv.length < 2) return;
      const firstUser = conv.find((m) => m.role === 'user');
      const preview = (firstUser?.content || 'Conversation')
        .replace(/[*`#]/g, '')
        .substring(0, 50);
      const entry = {
        id: Date.now(),
        preview: preview + (firstUser?.content?.length > 50 ? '…' : ''),
        timestamp: Date.now(),
        messages: conv.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      };
      // Replace if same preview already exists, otherwise prepend.
      history = history.filter((h) => h.preview !== entry.preview);
      history.unshift(entry);
      if (history.length > 50) history = history.slice(0, 50);
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
      console.warn('[AIChat] Failed to save history:', e);
    }
  }

  /**
   * Restore a previously saved conversation by index.
   * @param {number} index  Index in the history array.
   */
  restoreConversation(index) {
    try {
      const history = JSON.parse(
        localStorage.getItem('ai-xcode-ai-history') || '[]',
      );
      const entry = history[index];
      if (!entry) return;
      if (this.isStreaming) this.stop();
      this.messages = (entry.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
      }));
      const container = document.getElementById('ai-messages');
      if (container) {
        container.innerHTML = '';
        if (this.messages.length === 0) {
          this.addMessage('assistant', WELCOME_MARKDOWN, true);
        } else {
          for (const m of this.messages) {
            this.addMessage(m.role, m.content);
          }
        }
      }
      this.app?.notifications?.toast?.('Conversation restored.', 'info', 1500);
    } catch (e) {
      console.warn('[AIChat] Failed to restore conversation:', e);
    }
  }

  // ─── Feature 4: Regeneration ────────────────────────────────────────

  /**
   * Add a small "Regenerate" refresh button below the last assistant
   * message bubble.
   * @param {HTMLElement} bubble  The assistant message bubble element.
   * @private
   */
  _addRegenerateButton(bubble) {
    if (!bubble) return;
    // Remove any existing regenerate button.
    bubble.parentElement?.querySelector('.ai-regenerate-btn')?.remove();
    const btn = document.createElement('button');
    btn.className = 'ai-regenerate-btn';
    btn.innerHTML = '<i class="fas fa-redo-alt"></i> Regenerate';
    btn.addEventListener('click', () => this.regenerate());
    bubble.parentElement.appendChild(btn);
  }

  /**
   * Regenerate the last assistant response by re-sending the last user
   * message. Removes the current assistant answer first.
   */
  async regenerate() {
    if (this.isStreaming) return;
    // Find the last user message in history.
    let lastUserIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;

    const lastUserText = this.messages[lastUserIdx].content;
    // Truncate history up to (but not including) the last user message,
    // then remove everything after it (the old assistant reply).
    this.messages = this.messages.slice(0, lastUserIdx);

    // Re-render the message list.
    const container = document.getElementById('ai-messages');
    if (container) {
      container.innerHTML = '';
      if (this.messages.length === 0) {
        this.addMessage('assistant', WELCOME_MARKDOWN, true);
      }
      for (const m of this.messages) {
        this.addMessage(m.role, m.content);
      }
    }

    // Re-send the same question.
    this.addMessage('user', lastUserText);
    const apiMessages = this._buildApiMessages(lastUserText);
    await this.streamResponse(apiMessages);
  }

  // ─── Feature 8: Diff Preview & Apply Changes ────────────────────────

  /**
   * Check if the assistant response contains code that could modify an
   * existing file. If so, add an "Apply Changes" button that opens a diff
   * preview dialog.
   * @param {HTMLElement} bubble  The assistant message bubble.
   * @param {string} text        The full assistant response text.
   * @private
   */
  _addApplyChangesButton(bubble, text) {
    if (!bubble || !text) return;
    // Only show if there's an active file and the response contains a code block.
    if (!this.app.activeFile) return;
    const hasCodeBlock = /```[\s\S]*?```/.test(text);
    if (!hasCodeBlock) return;

    // Extract the first/largest code block.
    const blocks = text.match(/```(\w*)\n?([\s\S]*?)```/g);
    if (!blocks || blocks.length === 0) return;

    // Find the largest code block (likely the full file replacement).
    let bestCode = '';
    let bestLang = '';
    for (const block of blocks) {
      const m = block.match(/```(\w*)\n?([\s\S]*?)```/);
      if (m && m[2].length > bestCode.length) {
        bestCode = m[2];
        bestLang = m[1] || '';
      }
    }
    if (bestCode.length < 20) return;

    const contentEl = bubble.querySelector('.ai-msg-content') || bubble;
    const btnId = 'ai-apply-changes-' + Date.now();
    const btn = document.createElement('button');
    btn.className = 'ai-apply-btn';
    btn.id = btnId;
    btn.innerHTML = '<i class="fas fa-file-import"></i> Apply Changes';
    btn.style.marginLeft = '8px';
    contentEl.appendChild(btn);
    btn.addEventListener('click', () => {
      const fileNode = this.app.vfs?._cache?.get(this.app.activeFile);
      const oldContent = fileNode?.content || this._getFileContent() || '';
      this.showDiffPreview(oldContent, bestCode, bestLang, () => {
        this._applyCodeToEditor(bestCode);
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-check"></i> Applied';
      });
    });
  }

  /**
   * Show a modal diff preview comparing old and new code side-by-side.
   * @param {string} oldCode
   * @param {string} newCode
   * @param {string} language
   * @param {() => void} onApply  Callback when user clicks "Apply".
   */
  showDiffPreview(oldCode, newCode, language = '', onApply) {
    // Remove any existing diff dialog.
    document.getElementById('ai-diff-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ai-diff-overlay';
    overlay.id = 'ai-diff-overlay';

    // Build simple line-by-line diff.
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    let diffHtml = '';
    for (let i = 0; i < maxLines; i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o === n) {
        diffHtml += `<div class="ai-diff-line unchanged"><span class="diff-num">${i + 1}</span><span class="diff-content">${escapeHtml(o || '')}</span></div>`;
      } else {
        if (o !== undefined) {
          diffHtml += `<div class="ai-diff-line removed"><span class="diff-num">${i + 1}</span><span class="diff-content">- ${escapeHtml(o)}</span></div>`;
        }
        if (n !== undefined) {
          diffHtml += `<div class="ai-diff-line added"><span class="diff-num">${i + 1}</span><span class="diff-content">+ ${escapeHtml(n)}</span></div>`;
        }
      }
    }

    overlay.innerHTML = `
      <div class="ai-diff-dialog">
        <div class="modal-header">
          <i class="fas fa-code-branch" style="color:var(--accent);"></i>
          Apply Changes — <span style="font-family:var(--mono-font);font-size:12px;">${escapeHtml(this.app.activeFile || 'file')}</span>
        </div>
        <div class="ai-diff-content">${diffHtml}</div>
        <div class="modal-footer">
          <button class="modal-btn" id="ai-diff-cancel">Cancel</button>
          <button class="modal-btn primary" id="ai-diff-apply">
            <i class="fas fa-check"></i> Apply Changes
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelector('#ai-diff-cancel').addEventListener('click', () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
    });
    overlay.querySelector('#ai-diff-apply').addEventListener('click', () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
      if (typeof onApply === 'function') onApply();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 200);
      }
    });
  }

  /**
   * Apply new code to the editor (replaces selection or whole file).
   * @param {string} code
   * @private
   */
  _applyCodeToEditor(code) {
    const editor = this.app.editor;
    if (!editor) return;
    const hasSelection = Boolean(editor.getSelection?.());
    if (hasSelection) {
      editor.replaceSelection?.(code);
    } else if (this.app.activeFile) {
      const model = editor.models?.get(this.app.activeFile);
      if (model) model.setValue(code);
    }
    this.app?.notifications?.toast?.('Changes applied to editor.', 'success', 2000);
  }

  // ─── Feature 9: Token Counter ──────────────────────────────────────

  /**
   * Update the token usage counter in the AI panel footer.
   */
  updateTokenCounter() {
    const el = document.getElementById('ai-token-counter');
    if (!el) return;
    const tokens = this.app.glm?.totalTokensUsed ?? 0;
    el.innerHTML = `<i class="fas fa-coins" style="font-size:9px;"></i> ${tokens.toLocaleString()} tokens`;
  }

  // ─── Feature 10: Conversation Export ────────────────────────────────

  /**
   * Export the current conversation as a Markdown file. Creates a .md file
   * in the VFS and shows a toast notification.
   */
  exportConversation() {
    if (!this.messages || this.messages.length === 0) {
      this.app?.notifications?.toast?.('No conversation to export.', 'warning', 1500);
      return;
    }

    const lines = [
      '# AI-Xcode Conversation Export',
      '',
      `**Exported:** ${new Date().toLocaleString()}`,
      `**Model:** ${this.app.glm?.model || 'unknown'}`,
      '',
      '---',
      '',
    ];

    for (const msg of this.messages) {
      // Skip welcome message.
      if (msg.content?.includes?.('Welcome to **AI-Xcode**')) continue;
      const role = msg.role === 'user' ? '👤 **User**' : '🤖 **Assistant**';
      lines.push(`### ${role}`);
      lines.push('');
      lines.push(msg.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    const md = lines.join('\n');
    const fileName = `chat-export-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}.md`;
    const filePath = `MyApp/Exports/${fileName}`;

    try {
      if (this.app.vfs) {
        // Ensure Exports folder exists.
        if (!this.app.vfs._cache.has('MyApp/Exports')) {
          this.app.vfs.createFolder?.('MyApp/Exports');
        }
        this.app.vfs.createFile?.(filePath, md, 'markdown');
        this.app?.notifications?.toast?.(
          `Conversation exported to ${filePath}`, 'success', 3000,
        );
      }
    } catch (e) {
      // Fallback: trigger a browser download.
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      this.app?.notifications?.toast?.(
        'Conversation downloaded as Markdown.', 'success', 2000,
      );
    }
  }

  // ─── Feature 6 & 7: Dropdown Management ────────────────────────────

  /**
   * Toggle a dropdown menu (history, templates, or model) anchored to a
   * button element. Clicking the same button again closes it.
   * @param {'history'|'templates'|'model'} type
   * @param {HTMLElement} anchor  The button that triggered the dropdown.
   * @private
   */
  _toggleDropdown(type, anchor) {
    // If a dropdown of this type is already open, close it.
    const existing = document.getElementById('ai-enhancement-dropdown');
    if (existing && existing.dataset.type === type) {
      existing.remove();
      return;
    }
    existing?.remove();

    const dropdown = document.createElement('div');
    dropdown.className = 'ai-dropdown';
    dropdown.id = 'ai-enhancement-dropdown';
    dropdown.dataset.type = type;

    // Position relative to anchor.
    const rect = anchor.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
    dropdown.style.left = 'auto';

    if (type === 'history') {
      dropdown.innerHTML = this._buildHistoryHTML();
      dropdown.querySelectorAll('[data-restore]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.restoreConversation(parseInt(item.dataset.restore, 10));
          this._closeDropdowns();
        });
      });
      const clearBtn = dropdown.querySelector('[data-clear-history]');
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          localStorage.removeItem('ai-xcode-ai-history');
          this._closeDropdowns();
          this.app?.notifications?.toast?.('History cleared.', 'info', 1200);
        });
      }
    } else if (type === 'templates') {
      dropdown.innerHTML = this._buildTemplatesHTML();
      dropdown.querySelectorAll('[data-template]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.insertTemplate(item.dataset.template);
          this._closeDropdowns();
        });
      });
    } else if (type === 'model') {
      dropdown.innerHTML = this._buildModelHTML();
      dropdown.querySelectorAll('[data-model]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchModel(item.dataset.model);
          this._closeDropdowns();
        });
      });
    }

    document.body.appendChild(dropdown);
    // Prevent clicks inside from closing.
    dropdown.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Build the history dropdown HTML.
   * @returns {string}
   * @private
   */
  _buildHistoryHTML() {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('ai-xcode-ai-history') || '[]');
    } catch (_) { /* ignore */ }

    if (history.length === 0) {
      return '<div class="ai-dropdown-empty">No saved conversations yet.<br>Conversations are saved automatically.</div>';
    }

    const items = history.map((h, i) => {
      const time = new Date(h.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      return `
        <div class="ai-dropdown-item" data-restore="${i}">
          <span class="item-icon">💬</span>
          <span class="item-text">${escapeHtml(h.preview || 'Conversation')}</span>
          <span class="item-meta">${time}</span>
        </div>`;
    }).join('');

    return `
      <div class="ai-dropdown-header">Chat History (${history.length})</div>
      ${items}
      <div class="ai-dropdown-divider"></div>
      <div class="ai-dropdown-item" data-clear-history style="color:var(--error);">
        <span class="item-icon">🗑️</span>
        <span class="item-text">Clear All History</span>
      </div>
    `;
  }

  /**
   * Build the templates dropdown HTML.
   * @returns {string}
   * @private
   */
  _buildTemplatesHTML() {
    const items = PROMPT_TEMPLATES.map((t) => `
      <div class="ai-dropdown-item" data-template="${escapeHtml(t.prompt)}">
        <span class="item-icon">${t.icon}</span>
        <span class="item-text">${escapeHtml(t.label)}</span>
      </div>`).join('');
    return `<div class="ai-dropdown-header">Prompt Templates</div>${items}`;
  }

  /**
   * Build the model switcher dropdown HTML.
   * @returns {string}
   * @private
   */
  _buildModelHTML() {
    const current = this.app.glm?.model || this.app.settings?.model || 'glm-4-plus';
    const items = AVAILABLE_MODELS.map((m) => {
      const isActive = m.value === current;
      return `
        <div class="ai-dropdown-item" data-model="${m.value}" ${isActive ? 'style="background:var(--accent-bg);"' : ''}>
          <span class="item-icon">${isActive ? '✓' : ''}</span>
          <span class="item-text">${escapeHtml(m.label)}</span>
        </div>`;
    }).join('');
    return `<div class="ai-dropdown-header">Switch Model</div>${items}`;
  }

  /**
   * Close any open AI enhancement dropdowns.
   * @private
   */
  _closeDropdowns() {
    document.getElementById('ai-enhancement-dropdown')?.remove();
  }

  /**
   * Insert a template prompt into the AI input and focus it.
   * @param {string} prompt
   */
  insertTemplate(prompt) {
    const input = document.getElementById('ai-input');
    if (!input) return;
    input.value = prompt;
    input.focus();
    // Place cursor at end.
    input.selectionStart = input.selectionEnd = input.value.length;
    // Trigger auto-resize.
    input.dispatchEvent(new Event('input'));
    this.app?.notifications?.toast?.('Template inserted.', 'info', 1000);
  }

  /**
   * Switch the active GLM model.
   * @param {string} model  Model identifier (e.g. 'glm-4-plus').
   */
  switchModel(model) {
    if (!model) return;
    this.app.saveSettings({ model });
    // Update badge text.
    const badge = document.getElementById('ai-model-badge');
    if (badge) {
      const label = model.toUpperCase().replace(/-/g, '-');
      badge.innerHTML = `${label} <i class="fas fa-chevron-down" style="font-size:8px;margin-left:2px;"></i>`;
    }
    this.app?.notifications?.toast?.(
      `Model switched to ${model}.`, 'success', 1500,
    );
  }
}

export default AIChat;
