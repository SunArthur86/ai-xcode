/**
 * AI-Xcode IDE — Main Application Controller
 * Orchestrates all IDE components: editor, navigator, AI, debugger, etc.
 */

import { VirtualFileSystem } from './project/file-system.js';
import { GLMClient } from './ai/api.js';
import { EditorManager } from './editor/editor-manager.js';
import { FileTree } from './navigator/file-tree.js';
import { AIChat } from './ai/chat.js';
import { BuildSystem } from './builder/build-system.js';
import { DebuggerUI } from './debugger/debugger.js';
import { InspectorPanel } from './ui/inspector-panel.js';
import { CommandPalette } from './ui/command-palette.js';
import { SearchNavigator } from './navigator/search.js';
import { SymbolNavigator } from './navigator/symbol-navigator.js';
import { InterfaceBuilder } from './ui/interface-builder.js';
import { DevTools } from './ui/dev-tools.js';
import { GitUI } from './project/git.js';
import { NotificationManager } from './utils/helpers.js';
import { AgentPanel } from './ai/agent-panel.js';

class AIXcodeApp {
  constructor() {
    this.vfs = null;
    this.glm = null;
    this.editor = null;
    this.fileTree = null;
    this.aiChat = null;
    this.buildSystem = null;
    this.debugger = null;
    this.inspector = null;
    this.cmdPalette = null;
    this.searchNav = null;
    this.symbolNav = null;
    this.interfaceBuilder = null;
    this.gitUI = null;
    this.agentPanel = null;
    this.aiMode = 'chat'; // 'chat' | 'agent'
    this.notifications = new NotificationManager();
    this.pastedImage = null; // Base64 data URL of a pasted image, sent with next message

    this.activeFile = null;
    this.openTabs = [];
    this.currentNavigator = 'project';
    this.settings = this.loadSettings();
    this.isRunning = false;

    /** UI/UX Polish state */
    this.zenMode = false;             // #1 Zen mode
    this.isSplitEditor = false;       // #10 Split editor
    this.splitEditor = null;          // #10 Split Monaco instance
    this.autoSaveEnabled = true;      // #9 Auto-save
    this._autoSaveTimer = null;       // #9 Auto-save debounce timer

    /** Project templates (#4) */
    this.projectTemplates = [
      {
        id: 'swiftui-app',
        name: 'SwiftUI App',
        icon: '📱',
        desc: 'A SwiftUI iOS app with ContentView and App entry point',
        files: [
          { path: '{name}/{name}App.swift', content: `import SwiftUI\n\n@main\nstruct {name}App: App {\n    var body: some Scene {\n        WindowGroup {\n            ContentView()\n        }\n    }\n}\n`, language: 'swift' },
          { path: '{name}/ContentView.swift', content: `import SwiftUI\n\nstruct ContentView: View {\n    var body: some View {\n        VStack {\n            Image(systemName: "globe")\n                .imageScale(.large)\n                .foregroundStyle(.tint)\n            Text("Hello, world!")\n        }\n        .padding()\n    }\n}\n\n#Preview {\n    ContentView()\n}\n`, language: 'swift' },
        ],
      },
      {
        id: 'cli-tool',
        name: 'Command Line Tool',
        icon: '⌨️',
        desc: 'A Swift command-line tool with main.swift',
        files: [
          { path: '{name}/main.swift', content: `import Foundation\n\nprint("Hello, World!")\n\n// Command-line arguments\nlet args = CommandLine.arguments\nprint("Arguments: \\(args)")\n`, language: 'swift' },
          { path: '{name}/README.md', content: `# {name}\n\nA Swift command-line tool.\n\n## Usage\n\n\`\`\`\nswift run {name}\n\`\`\`\n`, language: 'markdown' },
        ],
      },
      {
        id: 'framework',
        name: 'Framework',
        icon: '📦',
        desc: 'A Swift framework with public API module',
        files: [
          { path: '{name}/{name}.swift', content: `import Foundation\n\n/// Public API for {name} framework.\npublic struct {name} {\n    public static let version = "1.0.0"\n    \n    public init() {}\n    \n    public func greet(_ name: String) -> String {\n        return "Hello from {name}, \\(name)!"\n    }\n}\n`, language: 'swift' },
          { path: '{name}/README.md', content: `# {name}\n\nA Swift framework.\n\n## Installation\n\nAdd as Swift Package dependency.\n`, language: 'markdown' },
        ],
      },
      {
        id: 'empty-project',
        name: 'Empty Project',
        icon: '📄',
        desc: 'A blank project with a single starter file',
        files: [
          { path: '{name}/README.md', content: `# {name}\n\nA new project.\n`, language: 'markdown' },
        ],
      },
    ];
  }

  async init() {
    // Initialize VFS
    this.vfs = new VirtualFileSystem();
    await this.vfs.init();
    this.vfs.watch(() => this.onFileSystemChange());

    // Initialize GLM Client
    this.glm = new GLMClient({
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      completionModel: this.settings.completionModel,
    });

    // Wait for Monaco to load
    await this.waitForMonaco();

    // Initialize components
    this.editor = new EditorManager(this);
    this.fileTree = new FileTree(this);
    this.aiChat = new AIChat(this);
    this.buildSystem = new BuildSystem(this);
    this.debugger = new DebuggerUI(this);
    this.inspector = new InspectorPanel(this);
    this.cmdPalette = new CommandPalette(this);
    this.searchNav = new SearchNavigator(this);
    this.symbolNav = new SymbolNavigator(this);
    this.gitUI = new GitUI(this);
    this.interfaceBuilder = new InterfaceBuilder(this);
    this.devTools = new DevTools(this);
    this.agentPanel = new AgentPanel(this);
    this.agentPanel.init();

    // Setup UI bindings
    this.setupToolbar();
    this.setupNavigatorTabs();
    this.setupPanelTabs();
    this.setupKeyboardShortcuts();
    this.setupResizers();
    this.setupUIPolish();      // UI/UX Polish features
    this.applySettings();

    // ═══ Feature 5: Multi-tab Session Restore ═══
    this.restoreTabSession();

    // Render initial state
    this.fileTree.render();
    this.showNavigator('project');
    this.log('console', 'AI-Xcode IDE initialized successfully.', 'success');
    this.log('console', `Project loaded: ${this.vfs.rootName || 'MyApp'}`, 'info');

    // Check API key
    if (!this.settings.apiKey) {
      this.log('console', '⚠️ No GLM API key set. Click Settings to configure AI features.', 'warning');
    }

    // Show welcome toast
    this.notifications.toast('Welcome to AI-Xcode!', 'info');

    console.log('%c🧑‍💻 AI-Xcode IDE', 'font-size:20px;font-weight:bold;color:#0a84ff;');
    console.log('%cGLM-Powered IDE — Ready', 'font-size:13px;color:#8c8c8c;');
  }

  async waitForMonaco() {
    return new Promise((resolve) => {
      require(['vs/editor/editor.main'], () => {
        // Define custom themes
        monaco.editor.defineTheme('xcode-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '6e6e6e', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'ff7ab2' },
            { token: 'string', foreground: 'ff8170' },
            { token: 'number', foreground: 'd0bf69' },
            { token: 'type', foreground: '6bdfff' },
            { token: 'function', foreground: 'a167e6' },
            { token: 'variable', foreground: '76d9b7' },
          ],
          colors: {
            'editor.background': '#1e1e1e',
            'editor.foreground': '#d4d4d4',
            'editorLineNumber.foreground': '#4e4e4e',
            'editorLineNumber.activeForeground': '#d4d4d4',
            'editor.selectionBackground': '#264f78',
            'editor.lineHighlightBackground': '#2a2a2e',
            'editorCursor.foreground': '#aeafad',
            'editorWhitespace.foreground': '#3e3e42',
            'editorIndentGuide.background': '#2d2d2d',
            'editorIndentGuide.activeBackground': '#4e4e4e',
          },
        });

        monaco.editor.defineTheme('xcode-light', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '8e8e93', fontStyle: 'italic' },
            { token: 'keyword', foreground: '9b2393' },
            { token: 'string', foreground: 'c41a16' },
            { token: 'number', foreground: '1c00cf' },
            { token: 'type', foreground: '3900a0' },
          ],
          colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#1d1d1f',
          },
        });

        resolve();
      });
    });
  }

  // ====== Toolbar Setup ======
  setupToolbar() {
    document.getElementById('btn-run').addEventListener('click', () => this.run());
    document.getElementById('btn-stop').addEventListener('click', () => this.stop());
    document.getElementById('btn-toggle-left').addEventListener('click', () => this.togglePanel('sidebar-left', 'btn-toggle-left'));
    document.getElementById('btn-toggle-right').addEventListener('click', () => this.togglePanel('sidebar-right', 'btn-toggle-right'));
    document.getElementById('btn-toggle-ai').addEventListener('click', () => this.togglePanel('ai-panel', 'btn-toggle-ai'));
    document.getElementById('btn-toggle-bottom').addEventListener('click', () => this.togglePanel('panel-bottom', 'btn-toggle-bottom'));
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());

    // ── Developer Tools dropdown ──
    const toolsBtn = document.getElementById('btn-tools');
    const toolsMenu = document.getElementById('tools-dropdown');
    if (toolsBtn && toolsMenu) {
      toolsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toolsMenu.style.display = toolsMenu.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', () => { toolsMenu.style.display = 'none'; });
    }
    document.getElementById('btn-new-file').addEventListener('click', () => this.newFile());
    document.getElementById('btn-new-folder').addEventListener('click', () => this.newFolder());

    // ── Export / Import / Template buttons (#4, #5, #6) ──
    document.getElementById('btn-export-project')?.addEventListener('click', () => this.exportProject());
    document.getElementById('btn-import-project')?.addEventListener('click', () => this.importProject());
    document.getElementById('btn-new-template')?.addEventListener('click', () => this.openTemplateDialog());

    // ── File filter input (#1) ──
    const fileFilter = document.getElementById('file-filter-input');
    if (fileFilter) {
      fileFilter.addEventListener('input', (e) => {
        if (this.fileTree) {
          this.fileTree.filterFiles(e.target.value);
        }
      });
    }

    // ── Template modal cancel ──
    document.getElementById('template-cancel')?.addEventListener('click', () => {
      document.getElementById('template-overlay').classList.remove('visible');
    });

    // ── Import file input change ──
    document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await this.vfs.importProject(text);
        this.fileTree.render();
        this.renderTabs();
        this.notifications.toast(`Imported ${file.name}`, 'success');
      } catch (err) {
        this.notifications.toast(`Import failed: ${err.message}`, 'error');
      }
      e.target.value = '';
    });

    // Search
    const search = document.getElementById('toolbar-search');
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim()) {
        this.showNavigator('search');
        this.searchNav.search(search.value);
        search.value = '';
      }
    });

    // ── Editor Enhancement toolbar buttons (#1 Find/Replace, #5 Fold/Unfold) ──
    document.getElementById('btn-find')?.addEventListener('click', () => {
      this.triggerEditorAction('actions.find');
    });
    document.getElementById('btn-replace')?.addEventListener('click', () => {
      this.triggerEditorAction('editor.action.startFindReplaceAction');
    });
    document.getElementById('btn-fold-all')?.addEventListener('click', () => {
      this.editor?.foldAll?.();
    });
    document.getElementById('btn-unfold-all')?.addEventListener('click', () => {
      this.editor?.unfoldAll?.();
    });

    // Status bar: click language label to toggle word wrap (#8)
    document.getElementById('status-language')?.addEventListener('click', () => {
      this.toggleWordWrap();
    });

    // ── UI/UX Polish: Zen mode, shortcuts, minimap toggle (#1, #2, #8) ──
    document.getElementById('btn-zen-mode')?.addEventListener('click', () => this.toggleZenMode());
    document.getElementById('btn-shortcuts')?.addEventListener('click', () => this.showShortcutsHelp());
    document.getElementById('btn-minimap-toggle')?.addEventListener('click', () => this.toggleMinimap());
    document.getElementById('btn-split-editor')?.addEventListener('click', () => this.toggleSplitEditor());

    // ── #3 Status bar click → jump to errors / go to line ──
    document.getElementById('status-errors')?.addEventListener('click', () => {
      this.showNavigator('issue');
    });
    document.getElementById('status-cursor')?.addEventListener('click', () => {
      this.triggerEditorAction('editor.action.gotoLine');
    });

    // ── #9 Auto-save toggle ──
    document.getElementById('status-autosave')?.addEventListener('click', () => {
      this.autoSaveEnabled = !this.autoSaveEnabled;
      this.updateAutoSaveIndicator();
      this.notifications.toast(`Auto-save: ${this.autoSaveEnabled ? 'On' : 'Off'}`, 'info', 1200);
    });

    // ═══ Feature 8: Column Selection toggle button ═══
    document.getElementById('btn-column-mode')?.addEventListener('click', () => {
      this.editor?.toggleColumnSelectionMode?.();
    });
  }

  // ====== Navigator Tabs ======
  setupNavigatorTabs() {
    document.querySelectorAll('.nav-icon').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav;
        this.showNavigator(nav);
      });
    });
  }

  showNavigator(nav) {
    this.currentNavigator = nav;
    document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-icon[data-nav="${nav}"]`).classList.add('active');

    const titles = {
      project: 'Project', symbol: 'Symbols', search: 'Search',
      issue: 'Issues', test: 'Tests', debug: 'Debug',
      breakpoint: 'Breakpoints', git: 'Source Control',
    };
    document.getElementById('nav-title').textContent = titles[nav] || nav;

    const container = document.getElementById('navigator-content');
    container.innerHTML = '';

    switch (nav) {
      case 'project': this.fileTree.render(); break;
      case 'symbol': this.symbolNav.render(container); break;
      case 'search': this.searchNav.render(container); break;
      case 'issue': this.renderIssueNavigator(container); break;
      case 'test': this.renderTestNavigator(container); break;
      case 'debug': this.debugger.renderNavigator(container); break;
      case 'breakpoint':
        this.debugger.renderBreakpoints(container);
        this.renderBookmarksNavigator(container); // Feature 1: bookmarks section
        break;
      case 'git': this.gitUI.render(container); break;
    }
  }

  renderIssueNavigator(container) {
    const issues = this.buildSystem ? this.buildSystem.getIssues() : [];
    if (issues.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;"><i class="fas fa-check-circle" style="font-size:24px;color:var(--success);"></i><br><br>No issues found.</div>';
      return;
    }
    container.innerHTML = issues.map(i => `
      <div class="file-tree-item" onclick="app.openFile('${i.file}', ${i.line})">
        <span class="icon" style="color:var(--${i.severity === 'error' ? 'error' : 'warning'});">
          <i class="fas fa-${i.severity === 'error' ? 'times-circle' : 'exclamation-triangle'}"></i>
        </span>
        <span class="name">${i.message}</span>
        <span class="badge badge-${i.severity === 'error' ? 'error' : 'warning'}">${i.file}:${i.line}</span>
      </div>
    `).join('');
  }

  renderTestNavigator(container) {
    const tests = [
      { name: 'MyAppTests', status: 'passed', count: 12 },
      { name: 'testUserCreation', status: 'passed', file: 'Tests/MyAppTests.swift' },
      { name: 'testLoginValidation', status: 'passed', file: 'Tests/MyAppTests.swift' },
      { name: 'testDashboardRender', status: 'passed', file: 'Tests/MyAppTests.swift' },
      { name: 'testLogoutFlow', status: 'failed', file: 'Tests/MyAppTests.swift' },
    ];
    container.innerHTML = tests.map(t => `
      <div class="file-tree-item" onclick="app.openFile('${t.file || ''}')">
        <span class="icon" style="color:var(--${t.status === 'passed' ? 'success' : 'error'});">
          <i class="fas fa-${t.status === 'passed' ? 'check' : 'times'}-circle"></i>
        </span>
        <span class="name">${t.name}</span>
        ${t.count ? `<span class="badge badge-success">${t.count}</span>` : ''}
      </div>
    `).join('');
  }

  // ====== Panel Tabs (Bottom) ======
  setupPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.showPanelContent(tab.dataset.panel);
      });
    });
  }

  showPanelContent(panel) {
    const container = document.getElementById('panel-content');
    switch (panel) {
      case 'console': this.buildSystem.renderConsole(container); break;
      case 'build': this.buildSystem.renderBuildLog(container); break;
      case 'debug': this.debugger.renderDebugArea(container); break;
      case 'terminal': this.renderTerminal(container); break;
    }
  }

  renderTerminal(container) {
    container.innerHTML = `
      <div style="padding:8px;">
        <div style="color:var(--text-secondary);margin-bottom:8px;font-size:11px;">Pseudo Terminal — simulates shell commands</div>
        <div id="terminal-output" style="min-height:60px;">
          <div class="console-line system">$ AI-Xcode Terminal v1.0</div>
          <div class="console-line system">$ Type commands below...</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:8px;">
          <span style="color:var(--accent);">$</span>
          <input type="text" id="terminal-input" placeholder="Enter command..." 
            style="flex:1;background:transparent;border:none;color:var(--text-primary);font-family:var(--mono-font);font-size:12px;">
        </div>
      </div>
    `;
    const input = document.getElementById('terminal-input');
    const output = document.getElementById('terminal-output');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const cmd = input.value.trim();
        output.innerHTML += `<div class="console-line"><span style="color:var(--accent);">$</span> ${cmd}</div>`;
        const result = this.executeTerminalCommand(cmd);
        if (result) output.innerHTML += `<div class="console-line">${result}</div>`;
        output.innerHTML += `<div class="console-line"><span style="color:var(--accent);">$</span> </div>`;
        output.scrollTop = output.scrollHeight;
        input.value = '';
      }
    });
    input.focus();
  }

  executeTerminalCommand(cmd) {
    const [base, ...args] = cmd.split(' ');
    switch (base) {
      case 'help':
        return 'Available commands: ls, pwd, cat, echo, clear, swift-version, glm-status, help';
      case 'ls': {
        const tree = this.vfs.getTree();
        return this.treeToString(tree);
      }
      case 'pwd':
        return '/MyApp';
      case 'echo':
        return args.join(' ');
      case 'clear':
        document.getElementById('terminal-output').innerHTML = '';
        return '';
      case 'swift-version':
        return 'Swift 5.9.2 (AI-Xcode simulated)';
      case 'glm-status':
        return `GLM Model: ${this.settings.model}<br>API Key: ${this.settings.apiKey ? '✅ Set' : '❌ Not set'}<br>Tokens Used: ${this.glm.totalTokensUsed || 0}`;
      case 'cat': {
        if (!args[0]) return 'Usage: cat <filename>';
        const content = this.vfs.readFile(args[0]);
        return content || `File not found: ${args[0]}`;
      }
      default:
        return `Command not found: ${base}. Type 'help' for available commands.`;
    }
  }

  treeToString(node, prefix = '') {
    let result = '';
    if (node.children) {
      for (const child of node.children) {
        const icon = child.isFolder ? '📁' : this.getFileIcon(child.name);
        result += `${prefix}${icon} ${child.name}<br>`;
        if (child.isFolder && child.children) {
          result += this.treeToString(child, prefix + '  ');
        }
      }
    }
    return result;
  }

  getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { swift: '🦅', js: '📜', ts: '📘', py: '🐍', html: '🌐', css: '🎨', json: '⚙️', md: '📝', plist: '📋' };
    return icons[ext] || '📄';
  }

  // ====== File Operations ======
  async openFile(path, line = null) {
    if (!path) return;
    const file = this.vfs._cache.get(path);
    if (!file || file.isFolder) return;

    this.activeFile = path;

    // Hide welcome, show editor
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('monaco-container').style.display = 'flex';

    // Open in editor
    await this.editor.openFile(path, file.content, file.language, line);

    // Update tabs
    if (!this.openTabs.includes(path)) {
      this.openTabs.push(path);
      this.renderTabs();
    } else {
      this.renderTabs();
    }
    // Feature 5: Save tab session
    this.saveTabSession();

    // Update inspector
    this.inspector.updateFile(path);
    this.updateStatusLanguage(file.language);

    // ── Track recent files (#2) ──
    if (this.fileTree) {
      this.fileTree.addRecentFile(path);
    }

    // ── Update breadcrumb (#3) ──
    this.updateBreadcrumb(path);
  }

  closeFile(path) {
    const idx = this.openTabs.indexOf(path);
    if (idx === -1) return;
    this.openTabs.splice(idx, 1);

    if (this.activeFile === path) {
      if (this.openTabs.length > 0) {
        this.openFile(this.openTabs[Math.max(0, idx - 1)]);
      } else {
        this.activeFile = null;
        document.getElementById('welcome-screen').style.display = 'flex';
        document.getElementById('monaco-container').style.display = 'none';
        // Clear breadcrumb when no file is open (#3)
        this.updateBreadcrumb(null);
      }
    }
    this.renderTabs();
    // Feature 5: Save tab session
    this.saveTabSession();
  }

  renderTabs() {
    const container = document.getElementById('editor-tabs');
    container.innerHTML = this.openTabs.map(path => {
      const file = this.vfs._cache.get(path);
      if (!file) return '';
      const icon = this.getFileIcon(file.name);
      const isActive = path === this.activeFile;
      const isModified = this.editor && this.editor.isModified(path);
      return `
        <div class="editor-tab ${isActive ? 'active' : ''}" onclick="app.openFile('${path}')">
          <span class="tab-icon">${icon}</span>
          <span class="tab-name">${file.name}</span>
          <span class="tab-close" onclick="event.stopPropagation();app.closeFile('${path}')">
            ${isModified ? '<span class="tab-modified"></span>' : '<i class="fas fa-times"></i>'}
          </span>
        </div>
      `;
    }).join('');
  }

  newFile() {
    const name = prompt('Enter file name:', 'Untitled.swift');
    if (!name) return;
    const path = name.startsWith('/') ? name : `MyApp/${name}`;
    this.vfs.createFile(path, '', this.vfs.getFileLanguage(path));
    this.openFile(path);
    this.notifications.toast(`Created: ${name}`, 'success');
  }

  newFolder() {
    const name = prompt('Enter folder name:', 'NewFolder');
    if (!name) return;
    const path = name.startsWith('/') ? name : `MyApp/${name}`;
    this.vfs.createFolder(path);
    this.notifications.toast(`Created folder: ${name}`, 'success');
  }

  // ====== Run / Build ======
  run() {
    this.isRunning = true;
    document.getElementById('btn-run').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    this.showLoadingIndicator?.('Building...');
    this.buildSystem.build();
  }

  stop() {
    this.isRunning = false;
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    this.hideLoadingIndicator?.();
    this.buildSystem.stop();
    this.notifications.toast('Build stopped.', 'warning');
  }

  // ====== Panel Toggles ======
  togglePanel(className, btnId) {
    const panel = document.querySelector(`.${className}`);
    panel.classList.toggle('collapsed');
    const btn = document.getElementById(btnId);
    if (panel.classList.contains('collapsed')) {
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
    }
  }

  // ====== Settings ======
  loadSettings() {
    const saved = localStorage.getItem('ai-xcode-settings');
    const defaults = {
      apiKey: '', model: 'glm-4-plus', completionModel: 'glm-4-flash',
      temperature: 0.7, autoCompletion: true,
      theme: 'dark', fontSize: 14, tabSize: 4,
      minimap: true, wordWrap: false,
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem('ai-xcode-settings', JSON.stringify(this.settings));
    this.applySettings();
  }

  applySettings() {
    // Theme
    document.body.classList.toggle('light-theme', this.settings.theme === 'light');
    document.documentElement.setAttribute('data-theme', this.settings.theme);

    // Editor
    if (this.editor && this.editor.monaco) {
      this.editor.monaco.updateOptions({
        fontSize: this.settings.fontSize,
        tabSize: this.settings.tabSize,
        minimap: { enabled: this.settings.minimap },
        wordWrap: this.settings.wordWrap ? 'on' : 'off',
      });
    }

    // AI model badge
    const badge = document.getElementById('ai-model-badge');
    if (badge) {
      const label = this.settings.model.toUpperCase();
      badge.innerHTML = `${label} <i class="fas fa-chevron-down" style="font-size:8px;margin-left:2px;"></i>`;
    }

    // GLM client
    if (this.glm) {
      this.glm.model = this.settings.model;
      this.glm.completionModel = this.settings.completionModel;
      this.glm.apiKey = this.settings.apiKey;
    }
  }

  openSettings() {
    document.getElementById('setting-api-key').value = this.settings.apiKey;
    document.getElementById('setting-model').value = this.settings.model;
    document.getElementById('setting-completion-model').value = this.settings.completionModel;
    document.getElementById('setting-temp').value = this.settings.temperature;
    document.getElementById('setting-temp-val').textContent = this.settings.temperature;
    document.getElementById('setting-autocomplete').checked = this.settings.autoCompletion;
    document.getElementById('setting-theme').value = this.settings.theme;
    document.getElementById('setting-fontsize').value = this.settings.fontSize;
    document.getElementById('setting-tabsize').value = this.settings.tabSize;
    document.getElementById('setting-minimap').checked = this.settings.minimap;
    document.getElementById('setting-wordwrap').checked = this.settings.wordWrap;
    document.getElementById('settings-overlay').classList.add('visible');
  }

  // ====== AI Mode Toggle ======
  setAIMode(mode) {
    this.aiMode = mode;
    document.getElementById('mode-chat').classList.toggle('active', mode === 'chat');
    document.getElementById('mode-agent').classList.toggle('active', mode === 'agent');
    const title = document.getElementById('ai-panel-title');
    const input = document.getElementById('ai-input');
    
    if (mode === 'agent') {
      title.textContent = 'AI Agent';
      input.placeholder = 'Describe a task — Agent will autonomously read/write files... (Enter to run)';
      this.agentPanel._resetPanel();
    } else {
      title.textContent = 'AI Assistant';
      input.placeholder = 'Ask AI anything... (Enter to send, Shift+Enter for newline)';
    }
  }

  // ====== Keyboard Shortcuts ======
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const meta = e.metaKey || e.ctrlKey;

      // Command Palette
      if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.cmdPalette.open();
      }
      // Settings
      if (meta && e.key === ',') {
        e.preventDefault();
        this.openSettings();
      }
      // New File
      if (meta && e.key === 'n') {
        e.preventDefault();
        this.newFile();
      }
      // Run
      if (meta && e.key === 'r') {
        e.preventDefault();
        this.run();
      }
      // Stop
      if (meta && e.key === '.') {
        e.preventDefault();
        this.stop();
      }
      // Toggle panels
      if (meta && e.key === '0') {
        e.preventDefault();
        this.togglePanel('sidebar-left', 'btn-toggle-left');
      }
      // Save
      if (meta && e.key === 's') {
        e.preventDefault();
        if (this.activeFile) {
          this.editor.save(this.activeFile);
          this.notifications.toast('Saved.', 'success', 1500);
        }
      }
      // Global search
      if (meta && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        document.getElementById('toolbar-search').focus();
      }
      // Close tab
      if (meta && e.key === 'w') {
        e.preventDefault();
        if (this.activeFile) this.closeFile(this.activeFile);
      }

      // ── Editor Enhancements ──

      // Find (Ctrl+F) — Monaco handles natively when editor is focused;
      // this also works when focus is elsewhere (toolbar, sidebar, etc.).
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.triggerEditorAction('actions.find');
      }
      // Replace (Ctrl+H)
      if (meta && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        this.triggerEditorAction('editor.action.startFindReplaceAction');
      }
      // Go to Line (Ctrl+G)
      if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.triggerEditorAction('editor.action.gotoLine');
      }
      // Zoom in (Ctrl+=)
      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.editorZoom(1);
      }
      // Zoom out (Ctrl+-)
      if (meta && e.key === '-') {
        e.preventDefault();
        this.editorZoom(-1);
      }

      // ── UI/UX Polish: F11 Zen mode (#1) ──
      if (e.key === 'F11') {
        e.preventDefault();
        this.toggleZenMode();
      }

      // ── UI/UX Polish: ? shortcut help overlay (#2) ──
      // Only trigger when not typing in an input/textarea and Shift+/ is pressed
      if (e.shiftKey && e.key === '?' && !this._isTypingInInput(e)) {
        e.preventDefault();
        this.showShortcutsHelp();
      }

      // ═══ Feature 1: Bookmark Shortcuts ═══
      // Ctrl/Cmd+F2 — Toggle bookmark on current line
      if (meta && e.key === 'F2') {
        e.preventDefault();
        this.editor?.toggleBookmark?.();
      }
      // F2 (no modifiers) — Next bookmark
      if (!meta && !e.shiftKey && !e.altKey && e.key === 'F2') {
        // Only trigger when editor is focused or not in an input
        if (!this._isTypingInInput(e)) {
          e.preventDefault();
          this.editor?.nextBookmark?.();
        }
      }
      // Shift+F2 — Previous bookmark
      if (!meta && e.shiftKey && !e.altKey && e.key === 'F2') {
        if (!this._isTypingInInput(e)) {
          e.preventDefault();
          this.editor?.prevBookmark?.();
        }
      }

      // ═══ Feature 7: Find in Selection (Ctrl+Shift+L) ═══
      if (meta && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        this.editor?.findInSelection?.();
      }
    });

    // Settings modal handlers
    document.getElementById('settings-save').addEventListener('click', () => {
      const newSettings = {
        apiKey: document.getElementById('setting-api-key').value.trim(),
        model: document.getElementById('setting-model').value,
        completionModel: document.getElementById('setting-completion-model').value,
        temperature: parseFloat(document.getElementById('setting-temp').value),
        autoCompletion: document.getElementById('setting-autocomplete').checked,
        theme: document.getElementById('setting-theme').value,
        fontSize: parseInt(document.getElementById('setting-fontsize').value),
        tabSize: parseInt(document.getElementById('setting-tabsize').value),
        minimap: document.getElementById('setting-minimap').checked,
        wordWrap: document.getElementById('setting-wordwrap').checked,
      };
      this.saveSettings(newSettings);
      document.getElementById('settings-overlay').classList.remove('visible');
      this.notifications.toast('Settings saved!', 'success');
    });

    document.getElementById('settings-cancel').addEventListener('click', () => {
      document.getElementById('settings-overlay').classList.remove('visible');
    });

    document.getElementById('settings-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'settings-overlay') {
        document.getElementById('settings-overlay').classList.remove('visible');
      }
    });

    // Temperature slider live update
    const tempSlider = document.getElementById('setting-temp');
    tempSlider.addEventListener('input', (e) => {
      document.getElementById('setting-temp-val').textContent = e.target.value;
    });

    // AI input handler
    const aiInput = document.getElementById('ai-input');
    aiInput.addEventListener('keydown', (e) => {
      // Command history navigation (ArrowUp/ArrowDown).
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        this.aiChat.handleKeydown(e);
        // If handleKeydown consumed the event (preventDefault was called),
        // stop further processing.
        if (e.defaultPrevented) return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.aiMode === 'agent') {
          this.agentPanel.runTask(document.getElementById('ai-input').value);
          document.getElementById('ai-input').value = '';
        } else {
          this.aiChat.send();
        }
      }
    });
    // Auto-resize textarea
    aiInput.addEventListener('input', () => {
      aiInput.style.height = 'auto';
      aiInput.style.height = Math.min(120, aiInput.scrollHeight) + 'px';
    });

    // Image paste support — captures pasted images and stores them for the next send.
    aiInput.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.pastedImage = ev.target.result; // base64 data URL
            this.notifications.toast('Image pasted — will be sent with next message', 'info');
            // Show preview
            const preview = document.createElement('div');
            preview.id = 'pasted-image-preview';
            preview.style.cssText = 'padding:4px;border-radius:4px;';
            preview.innerHTML = '<span style="font-size:11px;color:var(--accent);">📎 Image attached</span>';
            // Remove any existing preview first.
            document.getElementById('pasted-image-preview')?.remove();
            document.querySelector('.ai-input-area')?.insertBefore(preview, document.querySelector('.ai-input-wrapper'));
          };
          reader.readAsDataURL(blob);
        }
      }
    });

    document.getElementById('ai-send').addEventListener('click', () => {
      if (this.aiMode === 'agent') {
        const input = document.getElementById('ai-input');
        this.agentPanel.runTask(input.value);
        input.value = '';
      } else {
        this.aiChat.send();
      }
    });
    document.getElementById('ai-clear').addEventListener('click', () => this.aiChat.clear());

    // Quick action buttons
    document.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => this.aiChat.quickAction(btn.dataset.action));
    });
  }

  // ====== Resizers (#6) ======
  setupResizers() {
    const resizers = document.querySelectorAll('.panel-resizer');
    resizers.forEach(resizer => {
      resizer.addEventListener('mousedown', (e) => this._startResize(e, resizer));
    });
    // Restore saved widths/heights from localStorage
    this._restorePanelSizes();
  }

  _startResize(e, resizer) {
    e.preventDefault();
    const targetId = resizer.dataset.target;
    const target = document.getElementById(targetId);
    if (!target) return;

    const isVertical = resizer.classList.contains('vertical');
    const startPos = isVertical ? e.clientX : e.clientY;
    const startSize = isVertical ? target.offsetWidth : target.offsetHeight;

    resizer.classList.add('dragging');
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const currentPos = isVertical ? ev.clientX : ev.clientY;
      const delta = currentPos - startPos;

      // Determine direction (left panels shrink left-to-right, right panels grow right-to-left)
      let newSize;
      if (targetId === 'sidebar-left') {
        newSize = Math.max(140, Math.min(500, startSize + delta));
        target.style.width = newSize + 'px';
      } else if (targetId === 'sidebar-right' || targetId === 'ai-panel') {
        newSize = Math.max(160, Math.min(600, startSize - delta));
        target.style.width = newSize + 'px';
      } else if (targetId === 'panel-bottom') {
        newSize = Math.max(60, Math.min(600, startSize - delta));
        target.style.height = newSize + 'px';
      }
    };

    const onUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      // Persist sizes
      this._savePanelSize(targetId, target);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _savePanelSize(targetId, target) {
    const sizes = JSON.parse(localStorage.getItem('ai-xcode-panel-sizes') || '{}');
    if (targetId === 'panel-bottom') {
      sizes[targetId] = target.offsetHeight;
    } else {
      sizes[targetId] = target.offsetWidth;
    }
    localStorage.setItem('ai-xcode-panel-sizes', JSON.stringify(sizes));
  }

  _restorePanelSizes() {
    const sizes = JSON.parse(localStorage.getItem('ai-xcode-panel-sizes') || '{}');
    for (const [id, size] of Object.entries(sizes)) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (id === 'panel-bottom') {
        el.style.height = size + 'px';
      } else {
        el.style.width = size + 'px';
      }
    }
  }

  // ====== VFS Change Handler ======
  onFileSystemChange() {
    if (this.fileTree && this.currentNavigator === 'project') {
      this.fileTree.render();
    }
  }

  // ====== Status Bar Updates ======
  updateStatusLanguage(lang) {
    document.getElementById('status-language').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  updateStatusCursor(line, col) {
    document.getElementById('status-cursor').textContent = `Ln ${line}, Col ${col}`;
  }

  /**
   * Check if the current focus is in an input/textarea.
   * Used to prevent shortcut-trigger from firing while typing.
   */
  _isTypingInInput(e) {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  /**
   * Update the multi-cursor count indicator in the status bar (#3).
   * Shows the indicator only when more than one cursor is active.
   */
  updateStatusMultiCursor(count) {
    const el = document.getElementById('status-multicursor');
    if (!el) return;
    if (count > 1) {
      el.style.display = 'flex';
      el.textContent = `${count} cursors`;
    } else {
      el.style.display = 'none';
    }
  }

  /**
   * Trigger a Monaco editor action by its action id.
   * Used by keyboard shortcuts (#1, #2) and toolbar buttons.
   */
  triggerEditorAction(actionId) {
    if (this.editor?.monaco) {
      const action = this.editor.monaco.getAction(actionId);
      if (action) {
        action.run();
        this.editor.monaco.focus();
      }
    }
  }

  /**
   * Zoom the editor font size up (+1) or down (-1).  Clamped to [8, 32].
   * Triggered by Ctrl+= / Ctrl+- (#4).
   */
  editorZoom(direction) {
    const newSize = Math.max(8, Math.min(32, (this.settings.fontSize || 14) + direction));
    this.settings.fontSize = newSize;
    if (this.editor?.monaco) {
      this.editor.monaco.updateOptions({ fontSize: newSize });
    }
    this.notifications.toast(`Font size: ${newSize}px`, 'info', 1000);
  }

  /**
   * Toggle editor word wrap. Called from the status bar language click (#8).
   */
  toggleWordWrap() {
    this.settings.wordWrap = !this.settings.wordWrap;
    if (this.editor?.monaco) {
      this.editor.monaco.updateOptions({
        wordWrap: this.settings.wordWrap ? 'on' : 'off',
      });
    }
    this.notifications.toast(
      `Word wrap: ${this.settings.wordWrap ? 'On' : 'Off'}`,
      'info', 1000,
    );
  }

  // ====== Feature Methods (#3–#6) ======

  /**
   * Update the file path breadcrumb below editor tabs (#3).
   * @param {string} path  Full file path (e.g. "MyApp/Views/LoginView.swift").
   */
  updateBreadcrumb(path) {
    const container = document.getElementById('editor-breadcrumb');
    if (!container) return;

    if (!path) {
      container.innerHTML = '';
      return;
    }

    const segments = path.split('/');
    container.innerHTML = '';

    segments.forEach((seg, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '›';
        container.appendChild(sep);
      }
      const item = document.createElement('span');
      item.className = 'breadcrumb-item';
      if (i === segments.length - 1) item.classList.add('active');
      item.textContent = seg;

      // Clicking a segment opens the folder/file at that path
      const partialPath = segments.slice(0, i + 1).join('/');
      item.addEventListener('click', () => {
        if (i === segments.length - 1) {
          this.openFile(partialPath);
        } else {
          // Try to open as folder (expand in tree)
          if (this.fileTree) {
            this.fileTree.expandedFolders.add(partialPath);
            this.fileTree.render();
          }
        }
      });
      container.appendChild(item);
    });
  }

  /**
   * Export the current project as a downloadable JSON file (#5).
   */
  async exportProject() {
    try {
      const data = await this.vfs.exportProject();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-xcode-project-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.notifications.toast(`Exported ${data.files.length} files`, 'success');
    } catch (err) {
      this.notifications.toast(`Export failed: ${err.message}`, 'error');
    }
  }

  /**
   * Import a project from a JSON file (#6).
   * Triggers the hidden file input dialog.
   */
  importProject() {
    const input = document.getElementById('import-file-input');
    if (input) {
      input.click();
    }
  }

  /**
   * Open the project template selection dialog (#4).
   */
  openTemplateDialog() {
    const body = document.getElementById('template-body');
    if (!body) return;
    body.innerHTML = this.projectTemplates.map(t => `
      <div class="template-card" data-template="${t.id}">
        <span class="template-icon">${t.icon}</span>
        <div class="template-info">
          <div class="template-name">${t.name}</div>
          <div class="template-desc">${t.desc}</div>
        </div>
      </div>
    `).join('');

    body.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        const tmpl = this.projectTemplates.find(t => t.id === card.dataset.template);
        if (tmpl) this.newFromTemplate(tmpl);
      });
    });

    document.getElementById('template-overlay').classList.add('visible');
  }

  /**
   * Create a new project from a template (#4).
   * @param {object} template  Template object from this.projectTemplates.
   */
  async newFromTemplate(template) {
    const name = prompt('Enter project name:', template.name.replace(/\s+/g, ''));
    if (!name) return;

    document.getElementById('template-overlay').classList.remove('visible');

    try {
      for (const f of template.files) {
        const path = f.path.replace(/\{name\}/g, name);
        const content = f.content.replace(/\{name\}/g, name);
        await this.vfs.createFile(path, content, f.language || this.vfs.getFileLanguage(path));
      }
      this.fileTree.render();
      // Open the first file
      const firstPath = template.files[0].path.replace(/\{name\}/g, name);
      this.openFile(firstPath);
      this.notifications.toast(`Created "${name}" from ${template.name}`, 'success');
    } catch (err) {
      this.notifications.toast(`Template creation failed: ${err.message}`, 'error');
    }
  }

  // ====== UI/UX POLISH FEATURES (#1–#10) ======

  /**
   * Set up all UI/UX polish features that need DOM/event wiring.
   * Called from init().
   */
  setupUIPolish() {
    // #4 Loading indicator — init hidden, set up AI streaming watcher
    this._initLoadingIndicator();

    // #5 Animated tabs — handled purely by CSS, no JS needed

    // #8 Minimap toggle — reflect current setting
    const minimapBtn = document.getElementById('btn-minimap-toggle');
    if (minimapBtn && this.settings.minimap) {
      minimapBtn.classList.add('active');
    }

    // #9 Auto-save — wire up editor content change for auto-save
    this._initAutoSave();

    // #2 Shortcuts overlay — click outside to close
    document.addEventListener('click', (e) => {
      const overlay = document.getElementById('shortcuts-overlay');
      if (overlay && e.target === overlay) {
        overlay.classList.remove('visible');
      }
    });
  }

  // ── #1 Zen Mode ──────────────────────────────────────────────────

  /**
   * Toggle fullscreen "Zen mode" — hides all panels (sidebar, inspector,
   * AI, bottom) and expands the editor.  Press F11 again to restore.
   */
  toggleZenMode() {
    this.zenMode = !this.zenMode;
    document.body.classList.toggle('zen-mode', this.zenMode);
    this.notifications.toast(
      this.zenMode ? 'Zen mode enabled — press F11 to exit' : 'Zen mode disabled',
      'info', 1500,
    );
    // Refresh editor layout after CSS transition
    setTimeout(() => {
      if (this.editor?.monaco) this.editor.monaco.layout();
    }, 250);
  }

  // ── #2 Keyboard Shortcut Help Overlay ────────────────────────────

  /**
   * Show a modal listing all keyboard shortcuts.
   */
  showShortcutsHelp() {
    // Remove any existing overlay first
    document.getElementById('shortcuts-overlay')?.remove();

    const shortcuts = [
      ['Run', '⌘R'],
      ['Stop', '⌘.'],
      ['Save', '⌘S'],
      ['New File', '⌘N'],
      ['Close Tab', '⌘W'],
      ['Command Palette', '⌘⇧P'],
      ['Global Search', '⌘⇧F'],
      ['Find', '⌘F'],
      ['Replace', '⌘H'],
      ['Go to Line', '⌘G'],
      ['Settings', '⌘,'],
      ['Toggle Navigator', '⌘0'],
      ['Toggle Inspector', '⌃⌘0'],
      ['Toggle AI Panel', '⌃⌘A'],
      ['Toggle Debug Area', '⌘⇧Y'],
      ['Toggle Word Wrap', 'Click language label'],
      ['Zoom In', '⌘='],
      ['Zoom Out', '⌘-'],
      ['Zen Mode', 'F11'],
      ['Shortcuts Help', '?'],
      ['Format Document', '⌘⇧F (in palette)'],
      ['Ask AI', '⌘I'],
      ['Toggle Minimap', 'Click map button'],
      ['Toggle Bookmark', '⌘F2'],
      ['Next Bookmark', 'F2'],
      ['Previous Bookmark', '⇧F2'],
      ['Find in Selection', '⌘⇧L'],
      ['Toggle Column Mode', 'Toolbar button'],
      ['Smart Paste', 'Auto on ⌘V'],
    ];

    const rows = shortcuts.map(([desc, key]) =>
      `<div class="shortcut-row"><span class="shortcut-desc">${desc}</span><span class="shortcut-key">${key}</span></div>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-overlay';
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div class="shortcuts-dialog">
        <div class="modal-header">
          <i class="fas fa-keyboard"></i> Keyboard Shortcuts
        </div>
        <div class="shortcuts-body">${rows}</div>
        <div class="modal-footer">
          <button class="modal-btn primary" onclick="document.getElementById('shortcuts-overlay').classList.remove('visible')">Got it</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Trigger CSS transition
    requestAnimationFrame(() => overlay.classList.add('visible'));
    // Esc to close + click outside
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.classList.remove('visible');
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  // ── #4 Loading Indicator ─────────────────────────────────────────

  _initLoadingIndicator() {
    this.showLoading = (text = 'Working...') => {
      const indicator = document.getElementById('loading-indicator');
      const txt = document.getElementById('loading-text');
      if (indicator) indicator.classList.add('visible');
      if (txt) txt.textContent = text;
    };
    this.hideLoading = () => {
      const indicator = document.getElementById('loading-indicator');
      if (indicator) indicator.classList.remove('visible');
    };
  }

  /**
   * Show the loading spinner in the toolbar (e.g. during AI streaming or build).
   * @param {string} [text]  Optional text label.
   */
  showLoadingIndicator(text) {
    this.showLoading?.(text);
  }

  /**
   * Hide the loading spinner.
   */
  hideLoadingIndicator() {
    this.hideLoading?.();
  }

  // ── #8 Minimap Toggle ────────────────────────────────────────────

  /**
   * Toggle the Monaco minimap on/off.
   */
  toggleMinimap() {
    this.settings.minimap = !this.settings.minimap;
    if (this.editor?.monaco) {
      this.editor.monaco.updateOptions({
        minimap: { enabled: this.settings.minimap },
      });
    }
    const btn = document.getElementById('btn-minimap-toggle');
    if (btn) btn.classList.toggle('active', this.settings.minimap);
    this.notifications.toast(`Minimap: ${this.settings.minimap ? 'On' : 'Off'}`, 'info', 1000);
  }

  // ── #9 Auto-Save ─────────────────────────────────────────────────

  _initAutoSave() {
    // Hook into editor content changes to trigger auto-save
    if (this.editor?.monaco) {
      this.editor.monaco.onDidChangeModelContent(() => {
        this._scheduleAutoSave();
      });
    }
  }

  /**
   * Schedule an auto-save after 2 seconds of no edits.
   */
  _scheduleAutoSave() {
    if (!this.autoSaveEnabled || !this.activeFile) return;
    clearTimeout(this._autoSaveTimer);
    this.updateAutoSaveIndicator('saving');
    this._autoSaveTimer = setTimeout(() => {
      if (this.activeFile && this.editor) {
        this.editor.save(this.activeFile);
        this.updateAutoSaveIndicator('saved');
        // Reset to idle after 1.5s
        setTimeout(() => this.updateAutoSaveIndicator('idle'), 1500);
      }
    }, 2000);
  }

  /**
   * Update the auto-save status bar indicator.
   * @param {'idle'|'saving'|'saved'} state
   */
  updateAutoSaveIndicator(state) {
    const el = document.getElementById('status-autosave');
    const txt = document.getElementById('autosave-text');
    if (!el || !txt) return;
    el.classList.remove('saving', 'saved');
    if (state === 'saving') {
      el.classList.add('saving');
      txt.textContent = 'Saving...';
    } else if (state === 'saved') {
      el.classList.add('saved');
      txt.textContent = 'Saved ✓';
    } else {
      txt.textContent = `Auto-Save: ${this.autoSaveEnabled ? 'On' : 'Off'}`;
    }
  }

  // ── #10 Split Editor ─────────────────────────────────────────────

  /**
   * Toggle split editor view — creates a second Monaco instance
   * side-by-side with the primary editor, showing the same model.
   */
  toggleSplitEditor() {
    this.isSplitEditor = !this.isSplitEditor;
    const container = document.getElementById('editor-container');
    const splitContainer = document.getElementById('monaco-container-split');

    if (this.isSplitEditor) {
      // Create split editor
      const splitDom = document.getElementById('monaco-editor-split');
      if (!splitDom) return;

      const settings = this.app?.settings ?? this.settings ?? {};
      this.splitEditor = monaco.editor.create(splitDom, {
        theme: settings.theme === 'light' ? 'xcode-light' : 'xcode-dark',
        automaticLayout: true,
        fontSize: settings.fontSize ?? 14,
        fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
        readOnly: true, // Read-only mirror
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
      });

      // Share the same model
      const model = this.editor?.monaco?.getModel();
      if (model) this.splitEditor.setModel(model);

      container.classList.add('split');
      document.body.classList.add('editor-split-active');
      splitContainer.style.display = 'flex';
      this.notifications.toast('Split editor enabled', 'info', 1200);
    } else {
      // Close split editor
      if (this.splitEditor) {
        this.splitEditor.dispose();
        this.splitEditor = null;
      }
      container.classList.remove('split');
      document.body.classList.remove('editor-split-active');
      splitContainer.style.display = 'none';
      this.notifications.toast('Split editor disabled', 'info', 1200);
    }

    // Layout both editors
    setTimeout(() => {
      if (this.editor?.monaco) this.editor.monaco.layout();
      if (this.splitEditor) this.splitEditor.layout();
    }, 100);
  }

  // ═══ Feature 5: Multi-tab Session Restore ═══

  /**
   * Save the currently open tab paths and active tab to localStorage.
   */
  saveTabSession() {
    try {
      const data = {
        tabs: this.openTabs,
        activeTab: this.activeFile,
      };
      localStorage.setItem('ai-xcode-open-tabs', JSON.stringify(data));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Restore previously open tabs from localStorage.
   * Called during init().
   */
  async restoreTabSession() {
    try {
      const raw = localStorage.getItem('ai-xcode-open-tabs');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) return;

      // Open each tab (only those that still exist in VFS)
      for (const path of data.tabs) {
        const file = this.vfs._cache.get(path);
        if (file && !file.isFolder) {
          if (!this.openTabs.includes(path)) {
            this.openTabs.push(path);
            // Create model for each file so switching tabs is instant
            await this.editor.openFile(path, file.content, file.language);
          }
        }
      }

      // Restore active tab
      if (data.activeTab && this.openTabs.includes(data.activeTab)) {
        await this.openFile(data.activeTab);
      } else if (this.openTabs.length > 0) {
        await this.openFile(this.openTabs[0]);
      }

      this.renderTabs();
    } catch (e) {
      console.warn('[AIXcodeApp] Failed to restore tab session:', e);
    }
  }

  // ═══ Feature 1: Bookmarks in Breakpoint Navigator ═══

  /**
   * Render the bookmark section in the breakpoint navigator.
   * Called when the breakpoint navigator is shown.
   * @param {HTMLElement} container
   */
  renderBookmarksNavigator(container) {
    const allBookmarks = [];
    if (this.editor?.bookmarks) {
      for (const [path, lines] of this.editor.bookmarks) {
        for (const line of lines) {
          allBookmarks.push({ path, line });
        }
      }
    }

    if (allBookmarks.length === 0) return;

    const section = document.createElement('div');
    section.className = 'bookmark-section';
    section.style.cssText = 'border-top:1px solid var(--border-primary);margin-top:8px;';
    section.innerHTML = `<div style="padding:6px 12px;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">🔖 Bookmarks (${allBookmarks.length})</div>`;

    for (const bm of allBookmarks) {
      const name = bm.path.includes('/') ? bm.path.slice(bm.path.lastIndexOf('/') + 1) : bm.path;
      const item = document.createElement('div');
      item.className = 'file-tree-item';
      item.style.paddingLeft = '12px';
      item.innerHTML = `
        <span class="icon" style="color:var(--warning);">
          <i class="fas fa-bookmark"></i>
        </span>
        <span class="name">${name}:${bm.line}</span>
        <span class="badge" style="font-size:9px;color:var(--text-tertiary);">${bm.path}</span>
      `;
      item.addEventListener('click', () => {
        this.openFile(bm.path, bm.line);
      });
      section.appendChild(item);
    }
    container.appendChild(section);
  }

  // ═══ Feature 8: Column Mode Indicator ═══

  /**
   * Update the column selection mode indicator in the status bar.
   * @param {boolean} isActive
   */
  updateColumnModeIndicator(isActive) {
    const el = document.getElementById('status-column-mode');
    if (!el) return;
    el.style.display = isActive ? 'flex' : 'none';
  }

  // ====== Logging ======
  log(panel, message, type = 'info') {
    if (this.buildSystem) {
      this.buildSystem.log(panel, message, type);
    } else {
      console.log(`[${panel}] ${message}`);
    }
  }
}

// Global app instance
let app;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  app = new AIXcodeApp();
  await app.init();
  window.app = app;
});
