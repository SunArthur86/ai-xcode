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
    this.agentPanel = new AgentPanel(this);
    this.agentPanel.init();

    // Setup UI bindings
    this.setupToolbar();
    this.setupNavigatorTabs();
    this.setupPanelTabs();
    this.setupKeyboardShortcuts();
    this.setupResizers();
    this.applySettings();

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
    document.getElementById('btn-new-file').addEventListener('click', () => this.newFile());
    document.getElementById('btn-new-folder').addEventListener('click', () => this.newFolder());

    // Search
    const search = document.getElementById('toolbar-search');
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim()) {
        this.showNavigator('search');
        this.searchNav.search(search.value);
        search.value = '';
      }
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
      case 'breakpoint': this.debugger.renderBreakpoints(container); break;
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

    // Update inspector
    this.inspector.updateFile(path);
    this.updateStatusLanguage(file.language);
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
      }
    }
    this.renderTabs();
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
    this.buildSystem.build();
  }

  stop() {
    this.isRunning = false;
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-stop').disabled = true;
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
    if (badge) badge.textContent = this.settings.model.replace('-', '-').toUpperCase();

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

  // ====== Resizers ======
  setupResizers() {
    // Panel resizing could be added here with drag handlers
    // For now, panels are fixed width
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
