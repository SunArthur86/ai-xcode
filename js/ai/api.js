/**
 * AI-Xcode IDE — GLM API Client
 *
 * Handles all communication with the Zhipu AI (GLM) chat-completions API.
 * Provides streaming via fetch ReadableStream + SSE parsing, inline code
 * completion, code explanation, bug detection, refactoring, test generation,
 * documentation generation, and code review.
 *
 * The GLM API is OpenAI-compatible:
 *   POST https://open.bigmodel.cn/api/paas/v4/chat/completions
 *   Authorization: Bearer <token>
 *   { "model":"glm-4-plus", "messages":[...], "stream":false }
 *
 * Streaming uses Server-Sent Events:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}
 *   data: [DONE]
 *
 * @module ai/api
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const API_ENDPOINT =
  'https://open.bigmodel.cn/api/paas/v4/chat/completions';

/** Default chat / reasoning model (high quality). */
const DEFAULT_MODEL = 'glm-4-plus';
/** Fast model used for inline code completion (low latency). */
const FAST_MODEL = 'glm-4-flash';

/** Default timeout for non-streaming requests (ms). */
const DEFAULT_TIMEOUT_MS = 30_000;
/** JWT validity window for the id.secret key format (ms). */
const JWT_TTL_MS = 60 * 60 * 1000; // 1 hour

/** localStorage keys — shared with the settings module. */
const STORAGE_KEYS = {
  apiKey: 'ai-xcode.glm.apiKey',
  model: 'ai-xcode.glm.model',
};

// ─────────────────────────────────────────────────────────────────────────────
// Error classes
// ─────────────────────────────────────────────────────────────────────────────

/** Base error for all GLM API failures. */
class GLMError extends Error {
  constructor(message, { status = null, body = null, code = 'GLM_ERROR' } = {}) {
    super(message);
    this.name = 'GLMError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

/** 401 — invalid or missing API key. */
class GLMAuthError extends GLMError {
  constructor(message = 'Authentication failed: invalid or missing API key.', details = {}) {
    super(message, { ...details, code: 'GLM_AUTH' });
    this.name = 'GLMAuthError';
  }
}

/** 429 — rate limit exceeded. */
class GLMRateLimitError extends GLMError {
  constructor(message = 'Rate limit exceeded. Please slow down and retry.', details = {}) {
    super(message, { ...details, code: 'GLM_RATE_LIMIT' });
    this.name = 'GLMRateLimitError';
  }
}

/** 5xx — upstream server error. */
class GLMServerError extends GLMError {
  constructor(message = 'GLM server error. Please try again later.', details = {}) {
    super(message, { ...details, code: 'GLM_SERVER' });
    this.name = 'GLMServerError';
  }
}

/** Request exceeded the configured timeout. */
class GLMTimeoutError extends GLMError {
  constructor(message = 'Request timed out.', details = {}) {
    super(message, { ...details, code: 'GLM_TIMEOUT' });
    this.name = 'GLMTimeoutError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompts — professional & task-specific
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  chat:
    'You are an expert pair-programming assistant embedded in a web-based IDE ' +
    'called AI-Xcode. You help developers write, understand, debug, and ' +
    'refactor code across many languages. Be concise, accurate, and ' +
    'actionable. When sharing code, always use fenced code blocks with the ' +
    'correct language tag. Prefer modern idioms and best practices.',

  complete:
    'You are an ultra-fast inline code-completion engine. Return ONLY the ' +
    'completion text that should be inserted at the cursor — no markdown ' +
    'fences, no prose, no explanations. Match the surrounding style, ' +
    'indentation, and naming conventions precisely. Keep completions short ' +
    'and syntactically valid in context.',

  explain:
    'You are a senior engineer who explains code clearly. Break your ' +
    'explanation into well-defined sections using Markdown headings: ' +
    'Overview, Key Components, Control Flow, Data Structures, Potential ' +
    'Issues, and Improvements. Be thorough but readable. Use inline code ' +
    'formatting for identifiers.',

  bugs:
    'You are a meticulous code reviewer focused on finding real defects. ' +
    'Respond with a JSON array only — no prose, no markdown fences. Each ' +
    'element: {"line":<number>,"severity":"critical|high|medium|low",' +
    '"message":"<description>","fix":"<suggested fix>"}. If there are no ' +
    'issues, return an empty array [].',

  refactor:
    'You are a refactoring specialist. Return the fully refactored code in a ' +
    'single fenced code block, immediately followed by a Markdown section ' +
    'headed "## Changes" that explains each transformation and why it ' +
    'improves the code. Preserve behaviour exactly unless told otherwise.',

  tests:
    'You are a test-engineering expert. Generate clean, runnable unit tests ' +
    'for the provided code using the requested framework. Cover happy paths, ' +
    'edge cases, and error handling. Return only the test file in a fenced ' +
    'code block with the correct language tag. Include brief comments where ' +
    'helpful.',

  docs:
    'You are a technical writer. Produce clean JSDoc/Markdown documentation ' +
    'for the provided code. Use sections: Description, Parameters, Returns, ' +
    'Examples, and Notes. Return valid Markdown only.',

  review:
    'You are a principal engineer performing a code review. Respond with a ' +
    'single JSON object only — no prose, no markdown fences. Shape: ' +
    '{"score":<0-100>,"issues":[{"line":<number>,' +
    '"severity":"critical|high|medium|low","message":"<desc>",' +
    '"fix":"<suggestion>"}],"suggestions":["<string>",...],' +
    '"summary":"<2-3 sentence overview>"}.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base64url-encode a UTF-8 string (browser-safe).
 * @param {string} str
 * @returns {string}
 */
function b64urlEncodeStr(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url-encode an ArrayBuffer.
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
function b64urlEncodeBuf(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a Zhipu GLM JWT from an `{id}.{secret}` API key using Web Crypto.
 * Returns the compact JWT string. If the key is not in `id.secret` format,
 * returns the key unchanged (treated as a ready-to-use bearer token).
 *
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function generateJWT(apiKey) {
  const idx = apiKey.indexOf('.');
  // If the key doesn't look like id.secret, assume it's a ready token.
  if (idx <= 0 || idx === apiKey.length - 1) return apiKey;

  const id = apiKey.slice(0, idx);
  const secret = apiKey.slice(idx + 1);

  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const now = Date.now();
  const payload = { api_key: id, exp: now + JWT_TTL_MS, timestamp: now };

  const headerB64 = b64urlEncodeStr(JSON.stringify(header));
  const payloadB64 = b64urlEncodeStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlEncodeBuf(sig)}`;
}

/**
 * Safely parse a JSON value out of a model response that may contain
 * surrounding prose / markdown fences. Tries direct parse, then extracts the
 * first balanced JSON value in the text.
 *
 * @param {string} text
 * @param {*} [fallback=null]
 * @returns {*} Parsed JSON or fallback.
 */
function extractJSON(text, fallback = null) {
  if (!text) return fallback;
  const trimmed = text.trim();

  // 1) Direct parse.
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    /* fall through */
  }

  // 2) Strip markdown code fences.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {
      /* fall through */
    }
  }

  // 3) Find first balanced object/array.
  const openIdx = trimmed.search(/[[{]/);
  if (openIdx === -1) return fallback;
  const open = trimmed[openIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(openIdx, i + 1));
        } catch (_) {
          return fallback;
        }
      }
    }
  }
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLMClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Client for the Zhipu GLM chat-completions API.
 *
 * Usage:
 *   import { GLMClient } from './js/ai/api.js';
 *   const ai = new GLMClient();
 *   const { content } = await ai.chat([{ role:'user', content:'Hello' }]);
 */
export class GLMClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey]    Explicit key (overrides localStorage).
   * @param {string} [options.model]     Default model (default glm-4-plus).
   * @param {number} [options.timeout]   Default request timeout in ms.
   * @param {string} [options.endpoint]  Override API endpoint.
   */
  constructor(options = {}) {
    /** @type {string} */
    this._apiKey = options.apiKey ?? null;
    /** @type {string} */
    this._model = options.model ?? localStorage.getItem(STORAGE_KEYS.model) ?? DEFAULT_MODEL;
    /** @type {number} */
    this._timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    /** @type {string} */
    this._endpoint = options.endpoint ?? API_ENDPOINT;

    /** Cumulative token usage across all requests. */
    this.totalTokensUsed = 0;
    /** Total number of requests sent (including streamed). */
    this.totalRequests = 0;
  }

  // ─── Configuration accessors ────────────────────────────────────────────

  /** Current API key (explicit or from localStorage). */
  get apiKey() {
    return this._apiKey ?? localStorage.getItem(STORAGE_KEYS.apiKey);
  }

  /** Set / persist the API key. Pass null/empty to clear. */
  set apiKey(value) {
    this._apiKey = value || null;
    if (value) localStorage.setItem(STORAGE_KEYS.apiKey, value);
    else localStorage.removeItem(STORAGE_KEYS.apiKey);
  }

  /** Active default model. */
  get model() {
    return this._model;
  }
  set model(value) {
    this._model = value || DEFAULT_MODEL;
    localStorage.setItem(STORAGE_KEYS.model, this._model);
  }

  /** Whether an API key has been configured. */
  get isConfigured() {
    return Boolean(this.apiKey);
  }

  // ─── Auth ───────────────────────────────────────────────────────────────

  /**
   * Resolve the bearer token for a request. Generates a JWT when the key is in
   * the `{id}.{secret}` format, otherwise uses the key verbatim.
   * @returns {Promise<string>}
   * @throws {GLMAuthError} when no key is configured.
   */
  async _resolveAuthToken() {
    const key = this.apiKey;
    if (!key) {
      throw new GLMAuthError(
        'No API key configured. Open Settings and enter your GLM API key.',
      );
    }
    return generateJWT(key);
  }

  // ─── Core request ───────────────────────────────────────────────────────

  /**
   * Perform a (non-streaming) chat-completions request.
   *
   * @param {Object} body        Request body (model/messages/...).
   * @param {Object} [opts]
   * @param {number} [opts.timeout]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<Object>} Parsed JSON response.
   * @throws {GLMAuthError|GLMRateLimitError|GLMServerError|GLMTimeoutError|GLMError}
   */
  async _request(body, { timeout, signal } = {}) {
    const token = await this._resolveAuthToken();
    const ms = timeout ?? this._timeout;
    this.totalRequests++;

    // Compose abort: caller signal OR timeout — whichever fires first.
    const ctrl = new AbortController();
    const onTimeout = () => ctrl.abort();
    const timer = setTimeout(onTimeout, ms);
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    let res;
    try {
      res = await fetch(this._endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new GLMTimeoutError(
          `Request exceeded the ${ms}ms timeout.`,
        );
      }
      // Network-level failure (DNS, CORS, offline…).
      throw new GLMError(
        `Network error contacting GLM API: ${err.message}`,
        { code: 'GLM_NETWORK' },
      );
    }
    clearTimeout(timer);

    // Handle HTTP errors with response body context.
    if (!res.ok) {
      let errBody = null;
      try {
        errBody = await res.json();
      } catch (_) {
        try {
          errBody = await res.text();
        } catch { /* ignore */ }
      }
      const msg =
        (errBody && typeof errBody === 'object' && (errBody.error?.message || errBody.msg)) ||
        `HTTP ${res.status}`;

      if (res.status === 401 || res.status === 403) {
        throw new GLMAuthError(msg, { status: res.status, body: errBody });
      }
      if (res.status === 429) {
        throw new GLMRateLimitError(msg, { status: res.status, body: errBody });
      }
      if (res.status >= 500) {
        throw new GLMServerError(msg, { status: res.status, body: errBody });
      }
      throw new GLMError(msg, { status: res.status, body: errBody });
    }

    return res.json();
  }

  // ─── 1. Standard chat completion ────────────────────────────────────────

  /**
   * Standard (non-streaming) chat completion.
   *
   * @param {Array<{role:string,content:string}>} messages
   * @param {Object} [options]
   * @param {number} [options.temperature=0.7]
   * @param {number} [options.max_tokens]
   * @param {string} [options.model]      Override the default model.
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.timeout]
   * @returns {Promise<{content:string,usage:Object,model:string,raw:Object}>}
   */
  async chat(messages, options = {}) {
    const {
      temperature = 0.7,
      max_tokens,
      model,
      signal,
      timeout,
    } = options;

    const body = {
      model: model ?? this.model,
      messages,
      stream: false,
      temperature,
    };
    if (max_tokens != null) body.max_tokens = max_tokens;

    const data = await this._request(body, { signal, timeout });

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      '';
    const usage = data?.usage ?? {};
    this.totalTokensUsed += usage.total_tokens ?? 0;

    return {
      content,
      usage,
      model: data?.model ?? body.model,
      raw: data,
    };
  }

  // ─── 2. Streaming chat ──────────────────────────────────────────────────

  /**
   * Streaming chat completion using fetch + ReadableStream, processing the SSE
   * `data:` lines incrementally.
   *
   * @param {Array<{role:string,content:string}>} messages
   * @param {Object} options            Same shape as {@link chat}.
   * @param {(text:string)=>void} [onChunk]  Called for each text delta.
   * @param {(fullText:string)=>void} [onDone]  Called when the stream ends.
   * @param {(error:Error)=>void} [onError]  Called on any failure.
   * @returns {AbortController} Controller whose `.abort()` cancels the stream.
   */
  chatStream(messages, options = {}, onChunk, onDone, onError) {
    const {
      temperature = 0.7,
      max_tokens,
      model,
      timeout = this._timeout,
    } = options;
    const onChunkFn = typeof onChunk === 'function' ? onChunk : () => {};
    const onDoneFn = typeof onDone === 'function' ? onDone : () => {};
    const onErrorFn = typeof onError === 'function' ? onError : () => {};

    const controller = new AbortController();

    (async () => {
      let token;
      try {
        token = await this._resolveAuthToken();
      } catch (err) {
        onErrorFn(err);
        return;
      }

      const body = {
        model: model ?? this.model,
        messages,
        stream: true,
        temperature,
      };
      if (max_tokens != null) body.max_tokens = max_tokens;

      // Connection timeout (clear once headers arrive).
      const connTimer = setTimeout(() => controller.abort(), timeout);
      this.totalRequests++;

      let res;
      try {
        res = await fetch(this._endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(connTimer);
        if (err.name === 'AbortError') {
          onErrorFn(new GLMTimeoutError('Stream connection timed out.'));
        } else {
          onErrorFn(
            new GLMError(`Network error: ${err.message}`, { code: 'GLM_NETWORK' }),
          );
        }
        return;
      }
      clearTimeout(connTimer);

      if (!res.ok) {
        let errBody = null;
        try {
          errBody = await res.json();
        } catch (_) {
          try {
            errBody = await res.text();
          } catch { /* ignore */ }
        }
        const msg =
          (errBody && typeof errBody === 'object' &&
            (errBody.error?.message || errBody.msg)) ||
          `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) {
          onErrorFn(new GLMAuthError(msg, { status: res.status, body: errBody }));
        } else if (res.status === 429) {
          onErrorFn(new GLMRateLimitError(msg, { status: res.status, body: errBody }));
        } else if (res.status >= 500) {
          onErrorFn(new GLMServerError(msg, { status: res.status, body: errBody }));
        } else {
          onErrorFn(new GLMError(msg, { status: res.status, body: errBody }));
        }
        return;
      }

      // ── Stream the SSE body ───────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      let lastUsage = null;

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by blank lines; process complete lines.
          let nlIdx;
          while ((nlIdx = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);
            if (!line) continue;

            // Strip optional "data:" prefix.
            if (line.startsWith('data:')) line = line.slice(5).trim();
            else if (line.startsWith(':')) continue; // SSE comment / heartbeat
            else continue; // other SSE fields we ignore

            if (line === '[DONE]') {
              buffer = ''; // signal completion
              break;
            }

            let parsed;
            try {
              parsed = JSON.parse(line);
            } catch (_) {
              continue; // skip malformed chunk
            }

            // Token usage may arrive on the final chunk.
            if (parsed.usage) lastUsage = parsed.usage;

            const delta =
              parsed?.choices?.[0]?.delta?.content ??
              parsed?.choices?.[0]?.message?.content ??
              '';
            if (delta) {
              fullText += delta;
              onChunkFn(delta);
            }
          }

          // If we broke out due to [DONE], stop reading.
          if (buffer === '' && line === '[DONE]') break;
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // User-initiated cancel — treat as a clean (partial) finish.
          onDoneFn(fullText);
          return;
        }
        onErrorFn(
          new GLMError(`Stream read error: ${err.message}`, { code: 'GLM_STREAM' }),
        );
        return;
      }

      if (lastUsage) this.totalTokensUsed += lastUsage.total_tokens ?? 0;
      onDoneFn(fullText);
    })();

    return controller;
  }

  // ─── 3. Inline code completion ──────────────────────────────────────────

  /**
   * Get an inline code completion using the fast model.
   *
   * @param {string} prefix     Code before the cursor.
   * @param {string} [suffix=''] Code after the cursor.
   * @param {string} [language='javascript']
   * @param {string} [context='']  Extra context (imports, signatures…).
   * @returns {Promise<string>} The completion text to insert (no fences).
   */
  async completeCode(prefix, suffix = '', language = 'javascript', context = '') {
    const userParts = [
      `Complete the following ${language} code.`,
      '',
      'Context:',
      context || '(none provided)',
      '',
      'Code before cursor:',
      '```' + language,
      prefix,
      '```',
    ];
    if (suffix) {
      userParts.push(
        '',
        'Code after cursor:',
        '```' + language,
        suffix,
        '```',
        '',
        'Return only the text that should be inserted between the prefix and suffix.',
      );
    } else {
      userParts.push('', 'Return only the continuation text to insert after the cursor.');
    }

    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.complete },
        { role: 'user', content: userParts.join('\n') },
      ],
      {
        model: FAST_MODEL,
        temperature: 0.2,
        max_tokens: 256,
      },
    );

    // Strip stray fences if the model added them despite instructions.
    return content.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/\n?```$/, '').trimEnd();
  }

  // ─── 4. Explain code ────────────────────────────────────────────────────

  /**
   * Get a structured Markdown explanation of the selected code.
   *
   * @param {string} code
   * @param {string} [language='javascript']
   * @returns {Promise<string>} Markdown explanation.
   */
  async explainCode(code, language = 'javascript') {
    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.explain },
        {
          role: 'user',
          content:
            `Explain this ${language} code:\n\n` +
            '```' + language + '\n' + code + '\n```',
        },
      ],
      { temperature: 0.4 },
    );
    return content;
  }

  // ─── 5. Find bugs ───────────────────────────────────────────────────────

  /**
   * Analyse code for potential bugs.
   *
   * @param {string} code
   * @param {string} [language='javascript']
   * @returns {Promise<Array<{line:number,severity:string,message:string,fix:string}>>}
   */
  async findBugs(code, language = 'javascript') {
    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.bugs },
        {
          role: 'user',
          content:
            `Analyse this ${language} code for bugs:\n\n` +
            '```' + language + '\n' + code + '\n```',
        },
      ],
      { temperature: 0.2 },
    );

    const result = extractJSON(content, []);
    if (!Array.isArray(result)) return [];
    // Normalise each entry.
    return result.map((item) => ({
      line: Number.isFinite(item.line) ? item.line : 0,
      severity: ['critical', 'high', 'medium', 'low'].includes(item.severity)
        ? item.severity
        : 'medium',
      message: String(item.message ?? ''),
      fix: String(item.fix ?? ''),
    }));
  }

  // ─── 6. Refactor ────────────────────────────────────────────────────────

  /**
   * AI-assisted refactoring.
   *
   * @param {string} code
   * @param {string} [language='javascript']
   * @param {string} [instruction='']  Optional goal (e.g. "extract a helper").
   * @returns {Promise<{code:string,changes:string}>}
   */
  async refactor(code, language = 'javascript', instruction = '') {
    const goal = instruction
      ? `Refactoring goal: ${instruction}`
      : 'Improve readability, performance, and maintainability.';

    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.refactor },
        {
          role: 'user',
          content:
            `${goal}\n\nRefactor this ${language} code (preserve behaviour):\n\n` +
            '```' + language + '\n' + code + '\n```',
        },
      ],
      { temperature: 0.3 },
    );

    // Split refactored code block from the "## Changes" explanation.
    const fenceMatch = content.match(
      /```[a-zA-Z0-9]*\n([\s\S]*?)```([\s\S]*)$/,
    );
    if (fenceMatch) {
      return {
        code: fenceMatch[1].trim(),
        changes: fenceMatch[2].trim(),
      };
    }
    // Fallback: treat entire response as code with no separate changes note.
    return { code: content.trim(), changes: '(No change summary provided.)' };
  }

  // ─── 7. Generate tests ──────────────────────────────────────────────────

  /**
   * Generate unit tests for the provided code.
   *
   * @param {string} code
   * @param {string} [language='javascript']
   * @param {string} [framework='']  e.g. "jest", "pytest", "XCTest".
   * @returns {Promise<string>} The generated test code.
   */
  async generateTests(code, language = 'javascript', framework = '') {
    const fw = framework ? `using the ${framework} framework` : 'using an appropriate framework';

    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.tests },
        {
          role: 'user',
          content:
            `Generate unit tests ${fw} for this ${language} code:\n\n` +
            '```' + language + '\n' + code + '\n```',
        },
      ],
      { temperature: 0.4 },
    );
    return content;
  }

  // ─── 8. Generate documentation ──────────────────────────────────────────

  /**
   * Generate Markdown documentation for the provided code.
   *
   * @param {string} code
   * @param {string} [language='javascript']
   * @returns {Promise<string>} Markdown documentation.
   */
  async generateDoc(code, language = 'javascript') {
    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.docs },
        {
          role: 'user',
          content:
            `Write documentation for this ${language} code:\n\n` +
            '```' + language + '\n' + code + '\n```',
        },
      ],
      { temperature: 0.3 },
    );
    return content;
  }

  // ─── 9. Code review ─────────────────────────────────────────────────────

  /**
   * Perform a structured code review.
   *
   * @param {string} code
   * @param {string} [language='javascript']
   * @returns {Promise<{score:number,issues:Array,suggestions:Array<string>,summary:string}>}
   */
  async reviewCode(code, language = 'javascript') {
    const fallback = {
      score: 0,
      issues: [],
      suggestions: [],
      summary: 'Unable to parse review result.',
    };

    const { content } = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPTS.review },
        {
          role: 'user',
          content:
            `Review this ${language} code for quality, correctness, and best practices:\n\n` +
            '```' + language + '\n' + code + '\n```',
        },
      ],
      { temperature: 0.3 },
    );

    const result = extractJSON(content, fallback);
    return {
      score: Number.isFinite(result?.score) ? Math.max(0, Math.min(100, result.score)) : 0,
      issues: Array.isArray(result?.issues)
        ? result.issues.map((it) => ({
            line: Number.isFinite(it.line) ? it.line : 0,
            severity: ['critical', 'high', 'medium', 'low'].includes(it.severity)
              ? it.severity
              : 'medium',
            message: String(it.message ?? ''),
            fix: String(it.fix ?? ''),
          }))
        : [],
      suggestions: Array.isArray(result?.suggestions)
        ? result.suggestions.map(String)
        : [],
      summary: String(result?.summary ?? fallback.summary),
    };
  }
}

// Default export for convenience.
export default GLMClient;

// Export error classes so callers can `instanceof` check.
export {
  GLMError,
  GLMAuthError,
  GLMRateLimitError,
  GLMServerError,
  GLMTimeoutError,
};
