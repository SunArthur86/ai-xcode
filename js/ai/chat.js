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
    console.log('[AIChat] initialised.');
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

    // Regular send — optionally annotate with file context.
    this.addMessage('user', text);
    this._resetInput();

    // Build the messages array for the model.
    const apiMessages = this._buildApiMessages(text);

    await this.streamResponse(apiMessages);
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
}

export default AIChat;
