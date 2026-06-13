/**
 * AI-Xcode IDE — Build System
 *
 * Simulates Xcode's build pipeline with realistic step-by-step output,
 * random warnings/errors, progress-bar feedback, and an issues list that
 * feeds the Issue Navigator and status bar.
 *
 * @module builder/build-system
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds per build step (controls overall simulated build duration). */
const STEP_DELAY_MS = 500;

/** Probability (0–1) that a compile step generates a warning. */
const WARNING_CHANCE = 0.30;

/** Probability (0–1) that a compile step generates a fatal error. */
const ERROR_CHANCE = 0.10;

/** Sample warning messages shown when a build step triggers a warning. */
const SAMPLE_WARNINGS = [
  { message: "'indexPath' is deprecated: renamed to ' IndexPath(row:section:)'",
    file: 'MyApp/Views/DashboardView.swift', line: 42 },
  { message: "Result of 'List' initializer is unused",
    file: 'MyApp/Views/DashboardView.swift', line: 28 },
  { message: "Variable 'errorMessage' was written to, but never read",
    file: 'MyApp/Views/LoginView.swift', line: 24 },
  { message: "Force unwrap may cause a runtime exception",
    file: 'MyApp/Models/User.swift', line: 15 },
  { message: "Switch must be exhaustive — add missing cases",
    file: 'MyApp/ContentView.swift', line: 33 },
];

/** Sample error messages shown when a build step triggers an error. */
const SAMPLE_ERRORS = [
  { message: "Cannot find type 'NavigationView' in scope",
    file: 'MyApp/Views/DashboardView.swift', line: 87 },
  { message: "Value of type 'User' has no member 'fullName'",
    file: 'MyApp/Models/User.swift', line: 22 },
  { message: "Cannot convert value of type 'String' to expected argument type 'Int'",
    file: 'MyApp/Views/LoginView.swift', line: 56 },
  { message: "'@main' attribute can only be applied to one type per module",
    file: 'MyApp/AppDelegate.swift', line: 6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// BuildSystem
// ─────────────────────────────────────────────────────────────────────────────

export class BuildSystem {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /** Whether a build is currently in progress. */
    this.isBuilding = false;

    /** Build log entries — array of `{ time, step, message, type }`. */
    this.buildLog = [];

    /** Console log entries — array of `{ time, message, type }`. */
    this.consoleLog = [];

    /** Build issues — array of `{ message, file, line, severity }`. */
    this.issues = [];

    /** Ordered build steps, matching Xcode's pipeline. */
    this.buildSteps = [
      'Prepare',
      'Compile Swift',
      'Link',
      'Code Sign',
      'Copy Resources',
      'Build Success',
    ];

    /** Timer references for the current build (for cancellation). */
    this._timers = [];

    /** Build start timestamp (ms epoch). */
    this._buildStartTime = 0;
  }

  // ─── build ──────────────────────────────────────────────────────────────

  /**
   * Start a simulated build process.
   *
   * Iterates through {@link buildSteps}, logging each step with a timestamp.
   * Each step has a chance to produce warnings (30%) or fatal errors (10%).
   * On success the console prints `"Build Succeeded in X.Xs"` and a toast
   * notification is shown. On failure, errors are added to the issues list
   * and the status bar counts are updated.
   *
   * @returns {Promise<void>}
   */
  async build() {
    if (this.isBuilding) return;

    this.isBuilding = true;
    this.issues = [];
    this._buildStartTime = Date.now();

    this.log('build', '─── Build Started ───', 'system');
    this.log('console', 'Building MyApp...', 'system');

    this._showProgressBar();
    const totalSteps = this.buildSteps.length - 1; // exclude the final "Build Success"

    let buildFailed = false;

    for (let i = 0; i < this.buildSteps.length; i++) {
      if (!this.isBuilding) return; // cancelled

      const step = this.buildSteps[i];
      this._updateProgress(i / this.buildSteps.length * 100, step);

      // Determine outcome for intermediate steps (not "Build Success")
      if (i < totalSteps) {
        const roll = Math.random();

        // 10% chance of a fatal error — abort build
        if (roll < ERROR_CHANCE) {
          const error = SAMPLE_ERRORS[
            Math.floor(Math.random() * SAMPLE_ERRORS.length)
          ];
          this.issues.push({ ...error, severity: 'error' });
          this.log('build',
            `❌ ${step}: error: ${error.message} (${error.file}:${error.line})`,
            'error');
          this.log('console', `error: ${error.message}`, 'error');
          buildFailed = true;
          this._finishBuild(false);
          return;
        }

        // 30% chance of a warning — continue building
        if (roll < WARNING_CHANCE + ERROR_CHANCE) {
          const warning = SAMPLE_WARNINGS[
            Math.floor(Math.random() * SAMPLE_WARNINGS.length)
          ];
          this.issues.push({ ...warning, severity: 'warning' });
          this.log('build',
            `⚠️ ${step}: warning: ${warning.message} (${warning.file}:${warning.line})`,
            'warning');
          this.log('console', `warning: ${warning.message}`, 'warning');
        }
      }

      // Normal step log
      this.log('build', `▸ ${step}...`, 'info');

      // Wait for the step to "complete"
      await this._delay(STEP_DELAY_MS);
    }

    // If we got here without errors, the build succeeded
    if (!buildFailed) {
      this._updateProgress(100, 'Build Success');
      this._finishBuild(true);
    }
  }

  /**
   * Finalise the build — either success or failure.
   * @param {boolean} success
   * @private
   */
  _finishBuild(success) {
    const elapsed = ((Date.now() - this._buildStartTime) / 1000).toFixed(1);

    this._clearTimers();
    this.isBuilding = false;
    this._hideProgressBar();

    if (success) {
      this.log('build', '✅ ** Build Succeeded **', 'success');
      this.log('console', `Build Succeeded in ${elapsed}s`, 'success');
      this.app?.notifications?.toast(`Build Succeeded in ${elapsed}s`, 'success');
    } else {
      this.log('build', '❌ ** Build Failed **', 'error');
      this.log('console', `Build Failed (${this.issues.filter(i => i.severity === 'error').length} errors)`, 'error');
      this.app?.notifications?.toast('Build Failed — see Issues', 'error');
      // Switch to issue navigator if available
      if (this.app?.showNavigator) {
        this.app.showNavigator('issue');
      }
    }

    this._updateStatusBar();
  }

  // ─── stop ───────────────────────────────────────────────────────────────

  /**
   * Cancel the current build, clearing all pending timers and logging
   * "Build Cancelled".
   */
  stop() {
    if (!this.isBuilding) return;

    this._clearTimers();
    this.isBuilding = false;
    this._hideProgressBar();

    this.log('build', '⏹ Build Cancelled', 'system');
    this.log('console', 'Build Cancelled', 'system');
  }

  // ─── log ────────────────────────────────────────────────────────────────

  /**
   * Append a message to the console or build log.
   *
   * @param {'console'|'build'} panel  Target panel.
   * @param {string} message          Message text.
   * @param {'info'|'warning'|'error'|'success'|'system'} type  Message type.
   */
  log(panel, message, type = 'info') {
    const time = new Date();
    const timeStr = this._formatTime(time);

    if (panel === 'console') {
      this.consoleLog.push({ time: timeStr, message, type });
      // Live-update console if it's currently visible
      this._refreshLiveConsole();
    } else if (panel === 'build') {
      this.buildLog.push({ time: timeStr, step: '', message, type });
      this._refreshLiveBuildLog();
    }
  }

  // ─── getIssues ──────────────────────────────────────────────────────────

  /**
   * Return the current issues array.
   * @returns {Array<{message:string,file:string,line:number,severity:string}>}
   */
  getIssues() {
    return this.issues;
  }

  // ─── renderConsole ──────────────────────────────────────────────────────

  /**
   * Render the console output as coloured lines inside `container`.
   *
   * @param {HTMLElement} container
   */
  renderConsole(container) {
    if (!container) return;

    const lines = this.consoleLog.length > 0
      ? this.consoleLog.map((e) => this._consoleLineHTML(e)).join('')
      : '<div class="console-line system" style="opacity:.5;">No console output.</div>';

    container.innerHTML = `<div class="console-output">${lines}</div>`;
    container.scrollTop = container.scrollHeight;
  }

  // ─── renderBuildLog ─────────────────────────────────────────────────────

  /**
   * Render the build log entries inside `container`.
   *
   * @param {HTMLElement} container
   */
  renderBuildLog(container) {
    if (!container) return;

    const lines = this.buildLog.length > 0
      ? this.buildLog.map((e) => this._buildLogLineHTML(e)).join('')
      : '<div class="console-line system" style="opacity:.5;">No build log.</div>';

    container.innerHTML = `<div class="build-log-output">${lines}</div>`;
    container.scrollTop = container.scrollHeight;
  }

  // ─── clearLogs ──────────────────────────────────────────────────────────

  /**
   * Clear all logs (console, build log) and issues.
   */
  clearLogs() {
    this.consoleLog = [];
    this.buildLog = [];
    this.issues = [];
    this._updateStatusBar();
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /**
   * Format a `Date` as `HH:MM:SS`.
   * @param {Date} date
   * @returns {string}
   * @private
   */
  _formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /**
   * Promise-based delay that respects build cancellation.
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, ms);
      this._timers.push(timer);
    });
  }

  /** Clear all pending build timers. @private */
  _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  }

  /**
   * Show / update the build progress bar in the bottom panel.
   * @param {number} percent  0–100
   * @param {string} label     Current step name
   * @private
   */
  _showProgressBar() {
    this._updateProgress(0, 'Starting...');
  }

  /**
   * Update the progress bar element.
   * @param {number} percent
   * @param {string} label
   * @private
   */
  _updateProgress(percent, label) {
    const bar = document.getElementById('build-progress-bar');
    const labelEl = document.getElementById('build-progress-label');
    if (bar) {
      bar.style.display = 'flex';
      const fill = bar.querySelector('.progress-fill');
      if (fill) fill.style.width = `${Math.min(100, percent)}%`;
    }
    if (labelEl) {
      labelEl.style.display = 'block';
      labelEl.textContent = `Building... ${label} (${Math.round(percent)}%)`;
    }
  }

  /**
   * Hide the build progress bar.
   * @private
   */
  _hideProgressBar() {
    const bar = document.getElementById('build-progress-bar');
    const labelEl = document.getElementById('build-progress-label');
    if (bar) {
      const fill = bar.querySelector('.progress-fill');
      if (fill) fill.style.width = '0%';
      setTimeout(() => { bar.style.display = 'none'; }, 600);
    }
    if (labelEl) labelEl.style.display = 'none';
  }

  /**
   * Update the status bar error/warning counts.
   * @private
   */
  _updateStatusBar() {
    const errors = this.issues.filter((i) => i.severity === 'error').length;
    const warnings = this.issues.filter((i) => i.severity === 'warning').length;

    const errEl = document.getElementById('status-errors');
    const warnEl = document.getElementById('status-warnings');

    if (errEl) {
      errEl.style.display = errors > 0 ? 'flex' : 'none';
      errEl.innerHTML = `<i class="fas fa-times-circle"></i> ${errors}`;
    }
    if (warnEl) {
      warnEl.style.display = warnings > 0 ? 'flex' : 'none';
      warnEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${warnings}`;
    }
  }

  /**
   * If the console panel is currently visible, re-render it live.
   * @private
   */
  _refreshLiveConsole() {
    const container = document.getElementById('panel-content');
    const consoleTab = document.querySelector('.panel-tab[data-panel="console"]');
    if (container && consoleTab?.classList.contains('active')) {
      this.renderConsole(container);
    }
  }

  /**
   * If the build log panel is currently visible, re-render it live.
   * @private
   */
  _refreshLiveBuildLog() {
    const container = document.getElementById('panel-content');
    const buildTab = document.querySelector('.panel-tab[data-panel="build"]');
    if (container && buildTab?.classList.contains('active')) {
      this.renderBuildLog(container);
    }
  }

  /**
   * Generate HTML for a single console log line.
   * @param {{time:string,message:string,type:string}} entry
   * @returns {string}
   * @private
   */
  _consoleLineHTML(entry) {
    const colorClass = `console-line ${entry.type}`;
    return `<div class="${colorClass}"><span class="log-time">${entry.time}</span> ${this._escapeHtml(entry.message)}</div>`;
  }

  /**
   * Generate HTML for a single build log line.
   * @param {{time:string,step:string,message:string,type:string}} entry
   * @returns {string}
   * @private
   */
  _buildLogLineHTML(entry) {
    const colorClass = `console-line ${entry.type}`;
    return `<div class="${colorClass}"><span class="log-time">${entry.time}</span> ${this._escapeHtml(entry.message)}</div>`;
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default BuildSystem;
