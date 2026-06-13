/**
 * AI-Xcode IDE — Helpers & Notification Manager
 *
 * This module exports two kinds of thing:
 *
 *  1. `NotificationManager` — a small toast system. `app.js` constructs one
 *     instance in the app constructor (`this.notifications = new NotificationManager()`)
 *     and calls `toast()` from all over the codebase. Toasts render into the
 *     pre-existing `#toast-container` element (see `index.html`) and use the
 *     `.toast` / `.toast.success` / `.toast.fade-out` styles from `main.css`.
 *
 *  2. A grab-bag of stateless utility functions (`debounce`, `formatBytes`,
 *     `escapeHtml`, …) used across the IDE. They are exported both as named
 *     standalone functions so other modules can import exactly what they need:
 *
 *         import { escapeHtml, debounce } from './utils/helpers.js';
 *
 * @module utils/helpers
 */

// ─────────────────────────────────────────────────────────────────────────────
// NotificationManager
// ─────────────────────────────────────────────────────────────────────────────

/** FontAwesome icon + semantic colour variable per toast type. */
const TOAST_STYLES = {
  success: { icon: 'fa-check-circle', var: '--success' },
  error:   { icon: 'fa-times-circle', var: '--error' },
  warning: { icon: 'fa-exclamation-triangle', var: '--warning' },
  info:    { icon: 'fa-info-circle', var: '--info' },
};

export class NotificationManager {
  /**
   * Locate (or lazily create) the toast container and prepare for stacking.
   * The container is expected to be `<div id="toast-container">` in the DOM,
   * matching the markup in `index.html`.
   */
  constructor() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      // Defensive fallback: build the container if the host page lacks one.
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
    /** Running count used purely for diagnostic / id purposes. */
    this._count = 0;
  }

  /**
   * Show a toast notification at the bottom-right of the screen.
   *
   * Multiple toasts stack vertically (the container is a flex column). Each
   * toast auto-dismisses after `duration` ms, but can be dismissed early by
   * clicking it (or its close button).
   *
   * @param {string}  message             Message to display (plain text).
   * @param {('success'|'error'|'warning'|'info')} [type='info']
   *                                     Visual style + icon.
   * @param {number}  [duration=3000]   Auto-dismiss delay in milliseconds.
   * @returns {HTMLDivElement}           The created toast element.
   */
  toast(message, type = 'info', duration = 3000) {
    const style = TOAST_STYLES[type] || TOAST_STYLES.info;
    this._count++;

    // Build the toast node.
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <span class="toast-icon" style="color:var(${style.var});font-size:14px;">
        <i class="fas ${style.icon}"></i>
      </span>
      <span class="toast-message" style="flex:1;">${escapeHtml(message)}</span>
      <button class="toast-close" type="button" aria-label="Dismiss"
              style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:0 2px;font-size:12px;">
        <i class="fas fa-times"></i>
      </button>`;

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      el.classList.add('fade-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    // Click anywhere on the toast (except interactive children) dismisses it.
    el.addEventListener('click', dismiss);
    // Explicit close button.
    el.querySelector('.toast-close').addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });

    this.container.appendChild(el);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
    return el;
  }

  /** Convenience wrappers for the four toast types. */
  success(message, duration = 3000) { return this.toast(message, 'success', duration); }
  error(message, duration = 3000)   { return this.toast(message, 'error', duration); }
  warning(message, duration = 3000) { return this.toast(message, 'warning', duration); }
  info(message, duration = 3000)    { return this.toast(message, 'info', duration); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a byte count into a human-readable file-size string.
 *
 * @example formatBytes(0)        → '0 B'
 * @example formatBytes(1536)     → '1.5 KB'
 * @example formatBytes(10485760) → '10 MB'
 * @param {number} bytes                  Size in bytes.
 * @param {number} [decimals=1]           Decimal places to show.
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes)) return '—';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(decimals))} ${units[i]}`;
}

/**
 * Format a duration in seconds as a compact, human-readable string.
 *
 * @example formatTime(0)      → '0.0s'
 * @example formatTime(1.234)  → '1.2s'
 * @example formatTime(83)     → '1m 23s'
 * @example formatTime(3725)   → '1h 2m'
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

/**
 * Standard debounce: returns a wrapper that delays invoking `fn` until
 * `delay` ms have elapsed since the last call. Shares a single timer.
 *
 * @template {any[]} A
 * @param {(...args: A) => void} fn
 * @param {number} delay              Milliseconds to wait.
 * @returns {(...args: A) => void}    Debounced function.
 */
export function debounce(fn, delay) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Standard throttle: ensures `fn` is invoked at most once per `limit` ms.
 * The trailing call is fired after the window closes so the final value
 * is always applied.
 *
 * @template {any[]} A
 * @param {(...args: A) => void} fn
 * @param {number} limit             Minimum interval between calls (ms).
 * @returns {(...args: A) => void}   Throttled function.
 */
export function throttle(fn, limit) {
  let inThrottle = false;
  let lastArgs = null;
  return function throttled(...args) {
    if (inThrottle) {
      lastArgs = args;
      return;
    }
    fn.apply(this, args);
    inThrottle = true;
    setTimeout(() => {
      inThrottle = false;
      if (lastArgs) {
        throttled.apply(this, lastArgs);
        lastArgs = null;
      }
    }, limit);
  };
}

/**
 * Generate a RFC 4122 v4 UUID. Uses `crypto.randomUUID` when available and
 * falls back to a manual implementation for older browsers / insecure
 * contexts.
 *
 * @returns {string} A UUID such as `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Manual fallback.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Escape the five HTML-significant characters in `text` so the result can be
 * safely interpolated into `innerHTML`.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Truncate `text` to `length` characters, appending `suffix` if anything was
 * cut.
 *
 * @param {string} text
 * @param {number} length          Maximum length of the returned string
 *                                  (excluding the suffix).
 * @param {string} [suffix='…']   Ellipsis (or custom) appended on truncation.
 * @returns {string}
 */
export function truncate(text, length, suffix = '…') {
  const str = String(text);
  if (str.length <= length) return str;
  return str.slice(0, length) + suffix;
}

/**
 * Format a `Date` (or date-parseable value) as `"YYYY-MM-DD HH:mm"`.
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
export function formatDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Deep-clone a plain JSON-serialisable value. Prefers the native
 * `structuredClone` (handles Date, Map, Set, …) and falls back to
 * `JSON.parse(JSON.stringify(...))`.
 *
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      /* fall through to JSON path for non-cloneable values */
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

// Basic email regex — intentionally lenient, suitable for UI validation only.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lightweight email format validation. This is intentionally simple — it only
 * checks the shape `local@domain.tld` — and must not be relied upon for
 * security-critical validation.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

/**
 * Copy `text` to the system clipboard via the async Clipboard API. Returns a
 * promise that resolves to `true` on success or `false` if the copy failed
 * (e.g. insecure context or permission denied).
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Legacy fallback using a hidden textarea + execCommand.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Trigger a browser download of `content` as a file named `filename`.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} [type='text/plain']  MIME type of the blob.
 * @returns {void}
 */
export function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick so the click has time to process.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
