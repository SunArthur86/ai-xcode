/**
 * AI-Xcode IDE — Agent Panel UI
 * 
 * Renders the Codex-style agent loop interface:
 * - Reasoning chain display (collapsible thinking blocks)
 * - Tool call timeline (each step with icon + args + result)
 * - Approval prompts
 * - Change summary
 * - Progress indicator
 * 
 * This replaces the basic AI chat when Agent mode is active.
 */

export class AgentPanel {
  constructor(app) {
    this.app = app;
    this.agentLoop = null;
    this.isVisible = false;
    this.elements = {};
  }

  /**
   * Initialize the agent loop engine and wire up callbacks.
   */
  init() {
    // Lazy import to avoid circular deps
    import('./agent-loop.js').then(({ AgentLoop }) => {
      this.agentLoop = new AgentLoop(this.app);
      this.agentLoop.onToolCall = (name, args, result) => this._renderToolCall(name, args, result);
      this.agentLoop.onReasoning = (text) => this._renderReasoning(text);
      this.agentLoop.onIteration = (cur, max) => this._updateProgress(cur, max);
      this.agentLoop.onComplete = (summary, changes) => this._renderComplete(summary, changes);
      this.agentLoop.onError = (err) => this._renderError(err);
    });
  }

  /**
   * Open the agent panel and run a task.
   */
  async runTask(userMessage) {
    if (!this.agentLoop) this.init();
    if (!this.agentLoop) return;

    this._showPanel();

    const context = this._buildContext();
    
    // Render user message
    this._addMessage('user', userMessage);

    // Show progress
    this._updateProgress(0, this.agentLoop.maxIterations);

    // Run the loop
    const result = await this.agentLoop.run(userMessage, { context });

    // Final rendering already handled by callbacks
    return result;
  }

  /**
   * Stop the agent.
   */
  stop() {
    if (this.agentLoop) {
      this.agentLoop.stop();
      this._updateProgress(0, 0, true);
    }
  }

  /**
   * Clear agent history.
   */
  clear() {
    if (this.agentLoop) {
      this.agentLoop.clearHistory();
    }
    this._resetPanel();
  }

  // ====== UI Rendering ======

  _showPanel() {
    // Replace AI messages area with agent UI
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    // Add agent-specific CSS classes dynamically
    if (!document.getElementById('agent-css')) {
      const style = document.createElement('style');
      style.id = 'agent-css';
      style.textContent = `
        .agent-reasoning {
          background: rgba(191, 90, 242, 0.08);
          border-left: 2px solid var(--purple);
          border-radius: 0 8px 8px 0;
          padding: 8px 12px;
          margin: 4px 0;
          font-size: 12px;
          color: var(--text-secondary);
          font-style: italic;
          position: relative;
        }
        .agent-reasoning-header {
          display: flex; align-items: center; gap: 6px;
          cursor: pointer; font-size: 11px; font-weight: 600;
          color: var(--purple); margin-bottom: 4px; text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .agent-reasoning.collapsed .agent-reasoning-body { display: none; }
        .agent-reasoning-body { line-height: 1.6; white-space: pre-wrap; }

        .agent-tool-call {
          display: flex; flex-direction: column;
          background: var(--bg-tertiary);
          border-radius: 8px;
          margin: 6px 0;
          overflow: hidden;
          border: 1px solid var(--border-primary);
        }
        .agent-tool-header {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px;
          background: var(--bg-elevated);
          font-size: 12px;
          cursor: pointer;
        }
        .agent-tool-icon {
          width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
          border-radius: 4px; font-size: 11px; flex-shrink: 0;
        }
        .agent-tool-name {
          font-family: var(--mono-font); font-size: 11px;
          color: var(--accent); font-weight: 600;
        }
        .agent-tool-args {
          font-family: var(--mono-font); font-size: 11px;
          color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap; flex: 1;
        }
        .agent-tool-status {
          font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600;
        }
        .agent-tool-status.success { background: var(--success); color: black; }
        .agent-tool-status.error { background: var(--error); color: white; }
        .agent-tool-status.pending { background: var(--warning); color: black; }
        .agent-tool-result {
          padding: 8px 10px;
          font-family: var(--mono-font); font-size: 11px;
          color: var(--text-secondary);
          max-height: 200px; overflow-y: auto;
          border-top: 1px solid var(--border-primary);
          background: var(--bg-primary);
        }
        .agent-tool-result.collapsed { display: none; }
        .agent-tool-result pre { white-space: pre-wrap; word-break: break-word; }

        .agent-progress {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px;
          font-size: 11px; color: var(--text-secondary);
        }
        .agent-progress-bar {
          flex: 1; height: 3px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden;
        }
        .agent-progress-fill {
          height: 100%; background: var(--accent); border-radius: 2px;
          transition: width 0.3s ease; width: 0%;
        }
        .agent-progress-fill.indeterminate {
          width: 30%; animation: indeterminate 1.5s infinite;
        }

        .agent-summary {
          background: rgba(48, 209, 88, 0.08);
          border-left: 2px solid var(--success);
          border-radius: 0 8px 8px 0;
          padding: 8px 12px;
          margin: 6px 0;
          font-size: 12px;
        }
        .agent-summary-title {
          font-size: 11px; font-weight: 600; color: var(--success);
          text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
        }
        .agent-change-item {
          display: flex; align-items: center; gap: 6px;
          padding: 2px 0; font-size: 11px;
        }
        .agent-change-icon { width: 16px; text-align: center; }
        .agent-change-path { font-family: var(--mono-font); color: var(--text-primary); }

        .agent-mode-toggle {
          display: flex; gap: 4px; padding: 4px 8px;
        }
        .agent-mode-btn {
          font-size: 10px; padding: 2px 8px; border-radius: 4px;
          background: var(--bg-tertiary); color: var(--text-secondary);
          cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
        }
        .agent-mode-btn.active {
          background: var(--accent-bg); color: var(--accent); border-color: var(--accent);
        }
      `;
      document.head.appendChild(style);
    }

    this.isVisible = true;
  }

  _buildContext() {
    const parts = [];
    if (this.app.activeFile) {
      const node = this.app.vfs._cache.get(this.app.activeFile);
      if (node) {
        parts.push(`Active file: ${this.app.activeFile} (${node.language})`);
      }
    }
    // List project files
    if (this.app.vfs && this.app.vfs._cache) {
      const files = [];
      for (const node of this.app.vfs._cache.values()) {
        if (!node.isFolder) files.push(node.path);
      }
      parts.push(`Project files:\n${files.map(f => '  - ' + f).join('\n')}`);
    }
    return parts.join('\n\n');
  }

  _addMessage(role, text) {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;
    const div = document.createElement('div');
    div.className = `ai-message ${role}`;
    div.innerHTML = role === 'user' 
      ? `<div class="ai-msg-bubble">${this._esc(text)}</div>`
      : `<div class="ai-msg-bubble">${this._renderMd(text)}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _renderReasoning(text) {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    const div = document.createElement('div');
    div.className = 'agent-reasoning collapsed';
    div.innerHTML = `
      <div class="agent-reasoning-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <i class="fas fa-brain"></i>
        <span>Thinking...</span>
        <i class="fas fa-chevron-down" style="margin-left:auto;font-size:9px;"></i>
      </div>
      <div class="agent-reasoning-body">${this._esc(text)}</div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _renderToolCall(name, args, result) {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    const icons = {
      read_file: '📖', write_file: '✏️', patch_file: '🔧', create_file: '📄',
      list_files: '📁', search_files: '🔍', run_build: '🔨', analyze_code: '🔬',
    };

    const isError = result && result.error;
    const argStr = Object.entries(args).map(([k, v]) => 
      `${k}=${typeof v === 'string' ? `"${v.substring(0, 50)}"` : JSON.stringify(v)}`
    ).join(', ');

    const div = document.createElement('div');
    div.className = 'agent-tool-call';
    div.innerHTML = `
      <div class="agent-tool-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <div class="agent-tool-icon" style="background:${isError ? 'rgba(255,69,58,0.15)' : 'rgba(10,132,255,0.15)'};">
          ${icons[name] || '🔧'}
        </div>
        <span class="agent-tool-name">${name}()</span>
        <span class="agent-tool-args">${this._esc(argStr)}</span>
        <span class="agent-tool-status ${isError ? 'error' : 'success'}">${isError ? 'FAIL' : 'OK'}</span>
      </div>
      <div class="agent-tool-result collapsed">
        <pre>${this._esc(JSON.stringify(result, null, 2).substring(0, 500))}</pre>
      </div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _updateProgress(current, max, done = false) {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    let bar = document.getElementById('agent-progress-bar');
    if (!bar && !done) {
      bar = document.createElement('div');
      bar.id = 'agent-progress-bar';
      bar.className = 'agent-progress';
      bar.innerHTML = `
        <i class="fas fa-robot" style="color:var(--accent);"></i>
        <span id="agent-progress-text">Thinking...</span>
        <div class="agent-progress-bar"><div class="agent-progress-fill indeterminate" id="agent-progress-fill"></div></div>
        <button class="ai-quick-btn" style="color:var(--error);" onclick="window.__agentPanel?.stop()">⏹ Stop</button>
      `;
      messagesEl.appendChild(bar);
    }

    if (bar) {
      if (done || (max > 0 && current >= max)) {
        bar.remove();
      } else if (max > 0) {
        const text = bar.querySelector('#agent-progress-text');
        if (text) text.textContent = `Iteration ${current}/${max}`;
      }
    }
  }

  _renderComplete(summary, changes) {
    this._updateProgress(0, 0, true);

    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    // Summary message
    if (summary) {
      this._addMessage('assistant', summary);
    }

    // Changes summary
    if (changes && changes.length > 0) {
      const div = document.createElement('div');
      div.className = 'agent-summary';
      div.innerHTML = `
        <div class="agent-summary-title">
          <i class="fas fa-check-circle"></i> Applied ${changes.length} change(s)
        </div>
        ${changes.map(c => `
          <div class="agent-change-item">
            <span class="agent-change-icon">${c.tool === 'create_file' ? '📄' : c.tool === 'patch_file' ? '🔧' : '✏️'}</span>
            <span class="agent-change-path">${this._esc(c.path)}</span>
            <span style="color:var(--text-tertiary);font-size:10px;">(iter ${c.iteration})</span>
          </div>
        `).join('')}
      `;
      messagesEl.appendChild(div);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _renderError(err) {
    this._updateProgress(0, 0, true);
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    const div = document.createElement('div');
    div.className = 'ai-message assistant';
    div.innerHTML = `<div class="ai-msg-bubble" style="border-left:3px solid var(--error);">❌ <strong>Agent Error:</strong> ${this._esc(err.message)}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _resetPanel() {
    const messagesEl = document.getElementById('ai-messages');
    if (messagesEl) {
      messagesEl.innerHTML = `
        <div class="ai-message assistant">
          <div class="ai-msg-bubble">
            🤖 <strong>Agent mode</strong> — I can autonomously read, write, and patch files.
            <br>Describe what you want and I'll handle it step by step.
          </div>
        </div>
      `;
    }
  }

  _esc(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }

  _renderMd(text) {
    // Basic markdown
    let html = this._esc(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code style="font-family:var(--mono-font);background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }
}
