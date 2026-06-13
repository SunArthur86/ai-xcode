/**
 * AI-Xcode IDE — Debugger UI
 *
 * Simulates Xcode's debug navigator, breakpoints list, and debug area
 * (variables inspector + console). Provides stepping actions
 * (step over / into / out / continue) and a sample call stack + variable set.
 *
 * @module debugger/debugger
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────────────────────────────────────

/** Default sample call stack shown when a debug session is paused. */
const SAMPLE_CALL_STACK = [
  { name: 'main()',                  file: 'MyApp/AppDelegate.swift',      line: 15 },
  { name: 'UIApplicationMain()',     file: '',                              line: 0  },
  { name: 'AppDelegate.applicationDidFinishLaunching()',
    file: 'MyApp/AppDelegate.swift', line: 25 },
  { name: 'ContentView.body.getter', file: 'MyApp/ContentView.swift',      line: 33 },
  { name: 'LoginView.handleLogin()', file: 'MyApp/Views/LoginView.swift',  line: 42 },
];

/** Default sample variables for the variables inspector. */
const SAMPLE_VARIABLES = [
  { name: 'window',     type: 'UIWindow?',   value: 'Optional(0x7f8a5c001200)' },
  { name: 'viewModel',  type: 'ViewModel',   value: 'ViewModel(count: 42, name: "Test")' },
  { name: 'indexPath',  type: 'IndexPath',   value: '[0, 2]' },
  { name: 'userSession',type: 'UserSession', value: 'UserSession(isActive: true)' },
  { name: 'isLoading',  type: 'Bool',        value: 'false' },
  { name: 'dataItems',  type: '[DataItem]',  value: '3 items' },
];

/** Sample thread list. */
const SAMPLE_THREADS = [
  { id: 1,  name: 'com.apple.main-thread',  state: 'running',  isCurrent: true  },
  { id: 2,  name: 'com.apple.libdispatch-manager', state: 'blocked', isCurrent: false },
  { id: 7,  name: 'JS Garbage Collector',   state: 'running',  isCurrent: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// DebuggerUI
// ─────────────────────────────────────────────────────────────────────────────

export class DebuggerUI {
  /**
   * @param {import('../app.js').AIXcodeApp} app  The application controller.
   */
  constructor(app) {
    /** @type {import('../app.js').AIXcodeApp} */
    this.app = app;

    /**
     * Breakpoints keyed by file path → Set of line numbers.
     * @type {Map<string, Set<number>>}
     */
    this.breakpoints = new Map();

    /** Whether the debugger is currently paused at a breakpoint. */
    this.isPaused = false;

    /** Whether a debug session is active. */
    this.isActive = false;

    /** Current call stack frames (array of frame objects). */
    this.callStack = [];

    /** Current variables (array of variable objects). */
    this.variables = [];

    /** Thread list for the debug navigator. */
    this.threads = [];

    /** Current paused line number. */
    this.currentLine = null;

    /** Current paused file path. */
    this.currentFile = null;

    /** Debug console lines. */
    this.debugConsole = [];

    /** (lldb) expression history for the debug console. */
    this._exprHistory = [];
  }

  // ─── toggleBreakpoint ───────────────────────────────────────────────────

  /**
   * Add or remove a breakpoint at the given file + line.
   *
   * Also adds/removes a Monaco glyph decoration if the file is active.
   *
   * @param {string} path   File path.
   * @param {number} line   1-based line number.
   * @returns {boolean} `true` if a breakpoint was added, `false` if removed.
   */
  toggleBreakpoint(path, line) {
    let lines = this.breakpoints.get(path);
    if (!lines) {
      lines = new Set();
      this.breakpoints.set(path, lines);
    }

    let added;
    if (lines.has(line)) {
      lines.delete(line);
      added = false;
      // Clean up empty sets
      if (lines.size === 0) this.breakpoints.delete(path);
    } else {
      lines.add(line);
      added = true;
    }

    // Update Monaco decoration if the active file matches
    if (this.app?.editor && path === this.app.activeFile) {
      this._refreshEditorDecorations(path, lines);
    }

    // Re-render breakpoints panel if visible
    this._refreshBreakpointsPanel();

    return added;
  }

  /**
   * Enable/disable a breakpoint by toggling its presence.
   * @param {string} path
   * @param {number} line
   */
  toggleBreakpointEnabled(path, line) {
    this.toggleBreakpoint(path, line);
  }

  /**
   * Remove all breakpoints.
   */
  clearAllBreakpoints() {
    this.breakpoints.clear();
    this._refreshBreakpointsPanel();
    if (this.app?.editor?.clearDecorations) {
      // Only clear breakpoint-type decorations ideally; here we just refresh
      for (const [path] of this.breakpoints) {
        this._refreshEditorDecorations(path, new Set());
      }
    }
  }

  // ─── renderNavigator ────────────────────────────────────────────────────

  /**
   * Render the debug navigator: active session info, threads, and call stack.
   *
   * @param {HTMLElement} container
   */
  renderNavigator(container) {
    if (!container) return;

    if (!this.isActive) {
      container.innerHTML = `
        <div class="debug-empty" style="padding:24px;text-align:center;color:var(--text-tertiary);">
          <i class="fas fa-bug" style="font-size:32px;margin-bottom:12px;display:block;"></i>
          <div style="font-size:13px;margin-bottom:8px;">No active debug session</div>
          <button class="debug-start-btn" onclick="app.debugger.startSession()"
            style="background:var(--accent);color:#fff;border:none;padding:6px 16px;
                   border-radius:6px;cursor:pointer;font-size:12px;">
            <i class="fas fa-play"></i> Start Debug Session
          </button>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="debug-navigator">
        ${this._renderSessionHeader()}
        ${this._renderThreads()}
        ${this._renderCallStackNav()}
      </div>`;
  }

  // ─── renderBreakpoints ──────────────────────────────────────────────────

  /**
   * Render the breakpoints list with enable/disable toggle and remove.
   *
   * @param {HTMLElement} container
   */
  renderBreakpoints(container) {
    if (!container) return;

    const allBps = this._getAllBreakpoints();

    if (allBps.length === 0) {
      container.innerHTML = `
        <div style="padding:24px;text-align:center;color:var(--text-tertiary);">
          <i class="fas fa-circle" style="font-size:24px;margin-bottom:12px;display:block;opacity:.3;"></i>
          <div style="font-size:12px;">No breakpoints set.<br>Click in the editor gutter to add one.</div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="breakpoints-list">
        ${allBps.map((bp) => `
          <div class="bp-item file-tree-item" style="display:flex;align-items:center;gap:6px;">
            <span class="bp-toggle" onclick="app.debugger.toggleBreakpoint('${this._esc(bp.path)}', ${bp.line})"
              style="cursor:pointer;color:var(--accent);width:18px;text-align:center;">
              <i class="fas fa-circle" style="font-size:10px;"></i>
            </span>
            <span class="bp-icon" style="width:18px;text-align:center;color:var(--warning);">
              <i class="fas fa-bug"></i>
            </span>
            <span class="bp-label" onclick="app.openFile('${this._esc(bp.path)}', ${bp.line})"
              style="flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${this._esc(bp.name)} :${bp.line}
            </span>
            <span class="bp-remove" onclick="app.debugger.toggleBreakpoint('${this._esc(bp.path)}', ${bp.line})"
              style="cursor:pointer;color:var(--text-tertiary);opacity:0;transition:opacity .15s;"
              onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
              <i class="fas fa-times"></i>
            </span>
          </div>
        `).join('')}
      </div>
      <div style="padding:8px 12px;">
        <button onclick="app.debugger.clearAllBreakpoints()"
          style="background:none;border:1px solid var(--border);color:var(--text-secondary);
                 padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">
          <i class="fas fa-trash-alt"></i> Clear All
        </button>
      </div>`;
  }

  // ─── renderDebugArea ────────────────────────────────────────────────────

  /**
   * Render the debug area: variables inspector on top, debug console below.
   *
   * @param {HTMLElement} container
   */
  renderDebugArea(container) {
    if (!container) return;

    if (!this.isActive) {
      container.innerHTML = `
        <div style="padding:16px;color:var(--text-tertiary);font-size:12px;">
          Start a debug session to see variables and the debug console.
        </div>`;
      return;
    }

    const varRows = this.variables.length > 0
      ? this.variables.map((v) => `
        <tr>
          <td class="var-name">${this._esc(v.name)}</td>
          <td class="var-type">${this._esc(v.type)}</td>
          <td class="var-value">${this._esc(v.value)}</td>
        </tr>`).join('')
      : '<tr><td colspan="3" style="opacity:.5;padding:12px;">No variables in scope.</td></tr>';

    const consoleLines = this.debugConsole.length > 0
      ? this.debugConsole.map((l) => `<div class="console-line ${l.type}">${this._esc(l.text)}</div>`).join('')
      : '<div class="console-line system" style="opacity:.5;">(lldb) Debug console ready.</div>';

    container.innerHTML = `
      <div class="debug-area" style="display:flex;flex-direction:column;height:100%;">
        <!-- Variables inspector -->
        <div class="debug-variables" style="flex:0 0 auto;max-height:50%;overflow:auto;border-bottom:1px solid var(--border);">
          <div style="padding:4px 10px;font-size:11px;color:var(--text-tertiary);
                      background:var(--bg-secondary);border-bottom:1px solid var(--border);
                      text-transform:uppercase;letter-spacing:.5px;">
            Variables
          </div>
          <table class="variables-table" style="width:100%;border-collapse:collapse;font-size:12px;
                   font-family:var(--mono-font);">
            <thead>
              <tr style="opacity:.6;">
                <th style="text-align:left;padding:3px 10px;">Name</th>
                <th style="text-align:left;padding:3px 10px;">Type</th>
                <th style="text-align:left;padding:3px 10px;">Value</th>
              </tr>
            </thead>
            <tbody>${varRows}</tbody>
          </table>
        </div>
        <!-- Debug console -->
        <div class="debug-console-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:4px 10px;font-size:11px;color:var(--text-tertiary);
                      background:var(--bg-secondary);border-bottom:1px solid var(--border);
                      text-transform:uppercase;letter-spacing:.5px;">
            (lldb) Console
          </div>
          <div id="debug-console-output" class="debug-console-output"
               style="flex:1;overflow:auto;padding:4px 8px;">
            ${consoleLines}
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;
                      border-top:1px solid var(--border);">
            <span style="color:var(--accent);font-family:var(--mono-font);font-size:12px;">(lldb)</span>
            <input type="text" id="debug-console-input" placeholder="po <expression>..."
              style="flex:1;background:transparent;border:none;color:var(--text-primary);
                     font-family:var(--mono-font);font-size:12px;outline:none;">
          </div>
        </div>
      </div>`;

    // Wire up the (lldb) console input
    this._wireDebugConsoleInput();
  }

  // ─── startSession ───────────────────────────────────────────────────────

  /**
   * Simulate starting a debug session. Sets the session active, loads sample
   * variables, a sample call stack, and pauses at the first breakpoint
   * (or a default location if none exist).
   */
  startSession() {
    this.isActive = true;
    this.isPaused = true;
    this.callStack = [...SAMPLE_CALL_STACK];
    this.variables = SAMPLE_VARIABLES.map((v) => ({ ...v }));
    this.threads = SAMPLE_THREADS.map((t) => ({ ...t }));

    // Find first breakpoint, or default to AppDelegate.swift:25
    const allBps = this._getAllBreakpoints();
    if (allBps.length > 0) {
      this.currentFile = allBps[0].path;
      this.currentLine = allBps[0].line;
    } else {
      this.currentFile = 'MyApp/AppDelegate.swift';
      this.currentLine = 25;
    }

    this._addConsoleLine(`Process ${this.currentFile} launched`, 'system');
    this._addConsoleLine(`Stopped at breakpoint: ${this.currentFile}:${this.currentLine}`, 'warning');

    this.app?.notifications?.toast('Debug session started — paused at breakpoint', 'info');

    // Re-render navigator if visible
    const navContent = document.getElementById('navigator-content');
    if (navContent && this.app?.currentNavigator === 'debug') {
      this.renderNavigator(navContent);
    }

    // Open the file at the breakpoint
    if (this.app?.openFile) {
      this.app.openFile(this.currentFile, this.currentLine);
    }
  }

  /**
   * End the current debug session.
   */
  stopSession() {
    this.isActive = false;
    this.isPaused = false;
    this.callStack = [];
    this.variables = [];
    this.threads = [];
    this.currentLine = null;
    this.currentFile = null;

    this._addConsoleLine('Debug session ended.', 'system');
    this.app?.notifications?.toast('Debug session ended.', 'info');

    const navContent = document.getElementById('navigator-content');
    if (navContent && this.app?.currentNavigator === 'debug') {
      this.renderNavigator(navContent);
    }
  }

  // ─── Stepping actions ───────────────────────────────────────────────────

  /**
   * Step over the current line.
   */
  stepOver() {
    if (!this.isActive || !this.isPaused) return;
    this._simulateStep('over');
    this._addConsoleLine('stepped over → next line', 'system');
  }

  /**
   * Step into the current function call.
   */
  stepInto() {
    if (!this.isActive || !this.isPaused) return;
    this._simulateStep('into');
    this._addConsoleLine('stepped into → caller body', 'system');
  }

  /**
   * Step out of the current function.
   */
  stepOut() {
    if (!this.isActive || !this.isPaused) return;
    this._simulateStep('out');
    this._addConsoleLine('stepped out → return address', 'system');
  }

  /**
   * Continue execution until the next breakpoint or program end.
   */
  continue_() {
    if (!this.isActive || !this.isPaused) return;

    const allBps = this._getAllBreakpoints();
    if (allBps.length > 1) {
      // Move to next breakpoint
      const next = allBps.find(
        (bp) => bp.path > this.currentFile || (bp.path === this.currentFile && bp.line > this.currentLine),
      ) ?? allBps[0];
      this.currentFile = next.path;
      this.currentLine = next.line;
      this.isPaused = true;
      this._addConsoleLine(`Stopped at breakpoint: ${this.currentFile}:${this.currentLine}`, 'warning');
    } else {
      // No more breakpoints — program runs to completion
      this.isPaused = false;
      this._addConsoleLine('Process finished. Exit status: 0', 'success');
      this._addConsoleLine('Build Succeeded in simulated run.', 'success');
    }

    this._refreshNavigator();
    if (this.app?.openFile && this.isPaused) {
      this.app.openFile(this.currentFile, this.currentLine);
    }
  }

  // ─── getCallStack ───────────────────────────────────────────────────────

  /**
   * Return the current call stack (sample data).
   * @returns {Array<{name:string,file:string,line:number}>}
   */
  getCallStack() {
    return this.callStack.length > 0 ? [...this.callStack] : [...SAMPLE_CALL_STACK];
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /**
   * Simulate a single step by advancing the current line.
   * @param {'over'|'into'|'out'} kind
   * @private
   */
  _simulateStep(kind) {
    if (kind === 'into' && this.callStack.length > 1) {
      // Push a new frame (simulate)
      const top = this.callStack[0];
      this.callStack.unshift({
        name: `${top.name} → nested_call()`,
        file: this.currentFile || 'MyApp/ContentView.swift',
        line: (this.currentLine || 1) + 1,
      });
    }
    if (kind === 'out' && this.callStack.length > 1) {
      this.callStack.shift();
    }

    this.currentLine = (this.currentLine || 1) + 1;

    // Mutate a sample variable to show "live" debugging
    if (this.variables.length > 0) {
      const idxVar = this.variables.find((v) => v.name === 'indexPath');
      if (idxVar) {
        const parts = idxVar.value.match(/\[(\d+),\s*(\d+)\]/);
        if (parts) {
          idxVar.value = `[${parts[1]}, ${parseInt(parts[2], 10) + 1}]`;
        }
      }
    }

    this._refreshNavigator();
    this._refreshDebugArea();
    if (this.app?.openFile) {
      this.app.openFile(this.currentFile, this.currentLine);
    }
  }

  /**
   * Render the session header for the debug navigator.
   * @returns {string}
   * @private
   */
  _renderSessionHeader() {
    const status = this.isPaused
      ? '<span style="color:var(--warning);"><i class="fas fa-pause"></i> Paused</span>'
      : '<span style="color:var(--success);"><i class="fas fa-play"></i> Running</span>';

    return `
      <div class="debug-session-header" style="padding:8px 12px;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);">MyApp</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${status}</div>
      </div>`;
  }

  /**
   * Render the thread list for the debug navigator.
   * @returns {string}
   * @private
   */
  _renderThreads() {
    if (!this.threads || this.threads.length === 0) return '';

    const items = this.threads.map((t) => `
      <div class="thread-item file-tree-item" style="display:flex;align-items:center;gap:6px;${t.isCurrent ? 'background:var(--bg-tertiary);' : ''}">
        <span style="color:${t.isCurrent ? 'var(--accent)' : 'var(--text-tertiary)'};">
          <i class="fas fa-${t.isCurrent ? 'angle-right' : 'circle'}" style="font-size:10px;"></i>
        </span>
        <span style="flex:1;font-size:11px;font-family:var(--mono-font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${this._esc(t.name)}
        </span>
        <span style="font-size:10px;color:var(--text-tertiary);">${t.state}</span>
      </div>`).join('');

    return `
      <div class="debug-section">
        <div class="section-label" style="padding:4px 12px;font-size:10px;text-transform:uppercase;
             color:var(--text-tertiary);letter-spacing:.5px;">Threads</div>
        ${items}
      </div>`;
  }

  /**
   * Render the call stack for the debug navigator.
   * @returns {string}
   * @private
   */
  _renderCallStackNav() {
    const frames = this.getCallStack();

    const items = frames.map((frame, i) => {
      const isTop = i === 0;
      const location = frame.file
        ? `${this._esc(frame.file)}:${frame.line}`
        : ':0';

      return `
        <div class="stack-frame file-tree-item ${isTop ? 'active' : ''}"
             onclick="app.openFile('${this._esc(frame.file)}', ${frame.line})"
             style="display:flex;flex-direction:column;gap:1px;${isTop ? 'background:var(--bg-tertiary);' : ''}">
          <span style="font-size:12px;color:${isTop ? 'var(--accent)' : 'var(--text-primary)'};font-family:var(--mono-font);">
            ${this._esc(frame.name)}
          </span>
          <span style="font-size:10px;color:var(--text-tertiary);">${location}</span>
        </div>`;
    }).join('');

    return `
      <div class="debug-section">
        <div class="section-label" style="padding:4px 12px;font-size:10px;text-transform:uppercase;
             color:var(--text-tertiary);letter-spacing:.5px;">Call Stack</div>
        ${items}
      </div>`;
  }

  /**
   * Get a flat array of all breakpoints.
   * @returns {Array<{path:string,line:number,name:string}>}
   * @private
   */
  _getAllBreakpoints() {
    const result = [];
    for (const [path, lines] of this.breakpoints) {
      const name = path.split('/').pop() || path;
      for (const line of lines) {
        result.push({ path, line, name });
      }
    }
    return result.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.line - b.line;
    });
  }

  /**
   * Refresh Monaco decorations for breakpoints on the given file.
   * @param {string} path
   * @param {Set<number>} lines
   * @private
   */
  _refreshEditorDecorations(path, lines) {
    const editor = this.app?.editor;
    if (!editor?.monaco) return;

    // Clear existing breakpoint decorations (best-effort)
    if (editor.clearDecorations) {
      editor.clearDecorations();
    }

    // Re-add each breakpoint as a glyph decoration
    for (const line of lines) {
      if (editor.addDecoration) {
        editor.addDecoration(line, 'breakpoint');
      }
    }
  }

  /**
   * Add a line to the debug console.
   * @param {string} text
   * @param {string} type
   * @private
   */
  _addConsoleLine(text, type = 'info') {
    this.debugConsole.push({ text, type });
    // Keep the console bounded
    if (this.debugConsole.length > 200) {
      this.debugConsole.shift();
    }
  }

  /**
   * Wire up the (lldb) console input field.
   * @private
   */
  _wireDebugConsoleInput() {
    const input = document.getElementById('debug-console-input');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const cmd = input.value.trim();
        this._addConsoleLine(`(lldb) ${cmd}`, 'system');
        const result = this._evaluateLldbCommand(cmd);
        if (result) this._addConsoleLine(result, 'info');
        this._refreshDebugConsole();
        input.value = '';
      }
    });
  }

  /**
   * Evaluate a pseudo-(lldb) command.
   * @param {string} cmd
   * @returns {string|null}
   * @private
   */
  _evaluateLldbCommand(cmd) {
    const [base, ...args] = cmd.split(/\s+/);

    switch (base) {
      case 'po':
      case 'p': {
        const expr = args.join(' ');
        const v = this.variables.find(
          (x) => x.name === expr || expr.includes(x.name),
        );
        if (v) return `${v.type} = ${v.value}`;
        return `error: <expression unavailable>`;
      }
      case 'frame':
        return args[0] === 'variable'
          ? this.variables.map((v) => `(${v.type}) ${v.name} = ${v.value}`).join('\n')
          : null;
      case 'bt':
        return this.getCallStack()
          .map((f, i) => `frame #${i}: ${f.name} at ${f.file || ''}:${f.line}`)
          .join('\n');
      case 'help':
        return 'Available: po <expr>, p <expr>, frame variable, bt, continue, step, next';
      default:
        return `error: unknown command "${base}".`;
    }
  }

  /**
   * Re-render the navigator if it's currently visible.
   * @private
   */
  _refreshNavigator() {
    const navContent = document.getElementById('navigator-content');
    if (navContent && this.app?.currentNavigator === 'debug') {
      this.renderNavigator(navContent);
    }
  }

  /**
   * Re-render the breakpoints panel if it's visible.
   * @private
   */
  _refreshBreakpointsPanel() {
    const navContent = document.getElementById('navigator-content');
    if (navContent && this.app?.currentNavigator === 'breakpoint') {
      this.renderBreakpoints(navContent);
    }
  }

  /**
   * Re-render the debug area if it's visible.
   * @private
   */
  _refreshDebugArea() {
    const panelContent = document.getElementById('panel-content');
    const debugTab = document.querySelector('.panel-tab[data-panel="debug"]');
    if (panelContent && debugTab?.classList.contains('active')) {
      this.renderDebugArea(panelContent);
    }
  }

  /**
   * Re-render just the debug console output area.
   * @private
   */
  _refreshDebugConsole() {
    const output = document.getElementById('debug-console-output');
    if (!output) return;
    output.innerHTML = this.debugConsole
      .map((l) => `<div class="console-line ${l.type}">${this._esc(l.text)}</div>`)
      .join('');
    output.scrollTop = output.scrollHeight;
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   * @private
   */
  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default DebuggerUI;
