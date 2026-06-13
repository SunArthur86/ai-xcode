/**
 * AI-Xcode IDE — Agent Loop Engine
 * 
 * Inspired by OpenAI Codex CLI's agent loop architecture:
 * User Input → Model Inference → Tool Call → Execute → Append → Re-query
 * Repeats until model returns a final assistant message (no tool calls).
 *
 * The agent can autonomously:
 * - Read files from the project
 * - Write/patch files 
 * - Search across files
 * - Run build commands
 * - Create new files
 * - Analyze and fix bugs iteratively
 */

import { debounce } from '../utils/helpers.js';

// Tool definitions sent to GLM in function-calling format
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a file in the project. Returns the full file content with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read (e.g. "MyApp/ContentView.swift")' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write' },
          content: { type: 'string', description: 'The full content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description: 'Apply a targeted patch to an existing file. Finds old_text and replaces with new_text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to patch' },
          old_text: { type: 'string', description: 'The exact text to find (must be unique in the file)' },
          new_text: { type: 'string', description: 'The replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files in the project, or files in a specific directory.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to list (default: root)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for text across all project files. Returns matching files, lines, and context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text to search for' },
          regex: { type: 'boolean', description: 'Whether to treat query as regex (default: false)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file with the given content. Fails if file already exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to create' },
          content: { type: 'string', description: 'Initial content for the file' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_build',
      description: 'Run the build system and return the result (success/fail, errors, warnings).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_code',
      description: 'Analyze the currently open file for bugs, style issues, and improvements. Returns structured findings.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File to analyze (default: active file)' }
        }
      }
    }
  },
];

export class AgentLoop {
  constructor(app) {
    this.app = app;
    this.maxIterations = 25;
    this.iterationCount = 0;
    this.isActive = false;
    this.abortController = null;
    this.reasoningEffort = 'medium'; // low | medium | high
    this.approvalMode = 'auto'; // manual | suggest | auto
    this.conversationHistory = [];
    this.toolCallLog = [];
    this.contextTokenCount = 0;
    this.compactThreshold = 60000; // tokens
    this.onToolCall = null;  // callback(toolName, args, result)
    this.onReasoning = null; // callback(reasoningText)
    this.onIteration = null; // callback(iteration, totalIterations)
    this.onComplete = null;  // callback(summary, changes)
    this.onError = null;     // callback(error)
    // Token & request tracking
    this.totalTokens = 0;
    this.totalRequests = 0;
  }

  /**
   * Run the agent loop for a user request.
   * The AI will autonomously call tools until it produces a final answer.
   */
  async run(userMessage, options = {}) {
    const { systemPrompt, context } = options;
    
    this.isActive = true;
    this.iterationCount = 0;
    this.toolCallLog = [];

    // Build initial messages
    const sys = systemPrompt || this._buildSystemPrompt();
    const messages = [{ role: 'system', content: sys }];

    // Add context (active file info)
    if (context) {
      messages.push({ role: 'user', content: `Project context:\n${context}` });
    }

    // Add conversation history (with compaction check)
    if (this.conversationHistory.length > 0) {
      if (this._estimateTokens(messages) + this.contextTokenCount > this.compactThreshold) {
        await this._compactHistory();
      }
      messages.push(...this.conversationHistory);
    }

    // Add user message
    messages.push({ role: 'user', content: userMessage });

    try {
      while (this.iterationCount < this.maxIterations && this.isActive) {
        this.iterationCount++;
        this.onIteration?.(this.iterationCount, this.maxIterations);

        // Call GLM with tool definitions
        const response = await this._callModel(messages);
        
        // Check for reasoning content (GLM thinking)
        if (response.reasoning) {
          this.onReasoning?.(response.reasoning);
        }

        // If no tool calls, we're done — this is the final answer
        if (!response.tool_calls || response.tool_calls.length === 0) {
          this.conversationHistory.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: response.content }
          );
          
          const changes = this._summarizeChanges();
          this.onComplete?.(response.content, changes);
          this.isActive = false;
          return { content: response.content, changes, iterations: this.iterationCount };
        }

        // Execute each tool call
        messages.push({ role: 'assistant', content: response.content || '', tool_calls: response.tool_calls });

        for (const toolCall of response.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          // Approval check
          if (this.approvalMode === 'manual' && this._isDestructive(fnName)) {
            const approved = await this._requestApproval(fnName, fnArgs);
            if (!approved) {
              messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'User denied this operation.' });
              continue;
            }
          }

          // Execute tool
          const result = await this._executeTool(fnName, fnArgs);
          this.toolCallLog.push({ name: fnName, args: fnArgs, result, iteration: this.iterationCount });
          this.onToolCall?.(fnName, fnArgs, result);

          // Append tool result to messages
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        }
      }

      // Max iterations reached
      if (this.iterationCount >= this.maxIterations) {
        const msg = `Agent reached maximum iterations (${this.maxIterations}). Task may be incomplete.`;
        this.onError?.(new Error(msg));
        this.isActive = false;
        return { content: msg, changes: this._summarizeChanges(), iterations: this.iterationCount, maxedOut: true };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        this.onError?.(new Error('Agent stopped by user.'));
      } else {
        this.onError?.(err);
      }
    }

    this.isActive = false;
    return { content: '', changes: [], iterations: this.iterationCount };
  }

  /**
   * Stop the agent loop.
   */
  stop() {
    this.isActive = false;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Clear conversation history.
   */
  clearHistory() {
    this.conversationHistory = [];
    this.toolCallLog = [];
    this.contextTokenCount = 0;
  }

  // ====== Private Methods ======

  _buildSystemPrompt() {
    const projectInfo = this._getProjectInfo();
    const agentsConfig = this.loadProjectConfig();
    const agentsSection = agentsConfig
      ? `\n--- AGENTS.md (Project Configuration) ---\n${agentsConfig}\n--- End AGENTS.md ---\n`
      : '';

    return `${agentsSection}You are AI-Xcode Agent, an autonomous coding assistant integrated into a web-based IDE.
You have access to tools that let you read, write, and modify files in the project.

## Project: ${projectInfo.name}
## Files: ${projectInfo.fileCount} files
## Languages: ${projectInfo.languages.join(', ')}

## Your capabilities:
- read_file: Read any file in the project
- write_file: Write content to a file (creates or overwrites)
- patch_file: Apply a targeted patch to an existing file
- create_file: Create a new file
- list_files: List project files
- search_files: Search across all files
- run_build: Run the build system
- analyze_code: Analyze code for bugs and improvements

## Rules:
1. Be autonomous — use tools to gather information before answering.
2. When fixing bugs, first read the file, analyze the issue, then patch it.
3. Prefer patch_file over write_file for existing files (surgical changes).
4. Explain your reasoning before making changes.
5. After making changes, summarize what you did.
6. Keep responses concise — the user can see your tool calls.

## Reasoning effort: ${this.reasoningEffort}`;
  }

  _getProjectInfo() {
    const vfs = this.app.vfs;
    let fileCount = 0;
    const languages = new Set();
    
    if (vfs && vfs._cache) {
      for (const node of vfs._cache.values()) {
        if (!node.isFolder) {
          fileCount++;
          if (node.language) languages.add(node.language);
        }
      }
    }

    return { name: 'MyApp', fileCount, languages: Array.from(languages) };
  }

  async _callModel(messages) {
    const glm = this.app.glm;
    
    // GLM supports function calling via tools parameter
    const requestOptions = {
      model: glm.model || 'glm-4-plus',
      messages: messages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      stream: false,
    };

    // Map reasoning effort to temperature
    if (this.reasoningEffort === 'low') requestOptions.temperature = 0.3;
    else if (this.reasoningEffort === 'high') requestOptions.temperature = 0.9;

    // Call the raw API endpoint (need to bypass chat() wrapper for tools)
    const url = glm.endpoint || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${glm.apiKey}`,
    };

    this.abortController = new AbortController();

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestOptions),
      signal: this.abortController.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GLM API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message || {};
    
    // Update token count
    if (data.usage) {
      this.contextTokenCount = data.usage.total_tokens || 0;
      this.totalTokens += this.contextTokenCount;
    }
    this.totalRequests++;

    return {
      content: choice.content || '',
      reasoning: choice.reasoning_content || null,
      tool_calls: choice.tool_calls || null,
    };
  }

  async _executeTool(name, args) {
    const vfs = this.app.vfs;
    
    try {
      switch (name) {
        case 'read_file': {
          const node = vfs._cache.get(args.path);
          if (!node) return { error: `File not found: ${args.path}` };
          const lines = (node.content || '').split('\n');
          const numbered = lines.map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');
          return { path: args.path, language: node.language, lines: lines.length, content: numbered };
        }

        case 'write_file': {
          const existing = vfs._cache.get(args.path);
          if (existing) {
            existing.content = args.content;
            existing.modifiedAt = Date.now();
          } else {
            vfs.createFile(args.path, args.content, vfs.getFileLanguage(args.path));
          }
          vfs._scheduleSave();
          this._refreshEditor(args.path);
          return { success: true, path: args.path, bytes: args.content.length };
        }

        case 'patch_file': {
          const node = vfs._cache.get(args.path);
          if (!node) return { error: `File not found: ${args.path}` };
          if (!node.content.includes(args.old_text)) {
            return { error: `old_text not found in ${args.path}. Make sure the text matches exactly.` };
          }
          const occurrences = node.content.split(args.old_text).length - 1;
          if (occurrences > 1) {
            return { error: `old_text found ${occurrences} times in ${args.path}. Provide more context to make it unique.` };
          }
          node.content = node.content.replace(args.old_text, args.new_text);
          node.modifiedAt = Date.now();
          vfs._scheduleSave();
          this._refreshEditor(args.path);
          return { success: true, path: args.path, patched: true };
        }

        case 'create_file': {
          if (vfs._cache.has(args.path)) {
            return { error: `File already exists: ${args.path}. Use write_file to overwrite.` };
          }
          vfs.createFile(args.path, args.content || '', vfs.getFileLanguage(args.path));
          return { success: true, path: args.path, created: true };
        }

        case 'list_files': {
          const dir = args.directory;
          const files = [];
          for (const node of vfs._cache.values()) {
            if (!dir || node.path.startsWith(dir)) {
              files.push({ path: node.path, type: node.isFolder ? 'folder' : 'file', language: node.language });
            }
          }
          return { files };
        }

        case 'search_files': {
          const results = vfs.searchInFiles(args.query, { regex: args.regex || false });
          return { query: args.query, matches: results.length, results: results.slice(0, 20) };
        }

        case 'run_build': {
          if (!this.app.buildSystem) return { error: 'Build system not available' };
          // Trigger build and wait
          return new Promise((resolve) => {
            const originalLog = this.app.buildSystem.log.bind(this.app.buildSystem);
            let output = '';
            this.app.buildSystem.log = (panel, msg, type) => {
              originalLog(panel, msg, type);
              output += `[${type}] ${msg}\n`;
            };
            this.app.buildSystem.build();
            setTimeout(() => {
              this.app.buildSystem.log = originalLog;
              resolve({ 
                success: this.app.buildSystem.issues.filter(i => i.severity === 'error').length === 0,
                errors: this.app.buildSystem.issues.filter(i => i.severity === 'error'),
                warnings: this.app.buildSystem.issues.filter(i => i.severity === 'warning'),
                output: output.substring(0, 2000),
              });
            }, 4000);
          });
        }

        case 'analyze_code': {
          const path = args.path || this.app.activeFile;
          if (!path) return { error: 'No file to analyze' };
          const node = vfs._cache.get(path);
          if (!node) return { error: `File not found: ${path}` };
          // Use GLM to analyze
          const result = await this.app.glm.findBugs(node.content, node.language);
          return { path, language: node.language, issues: result };
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return { error: err.message };
    }
  }

  _refreshEditor(path) {
    if (this.app.activeFile === path && this.app.editor) {
      const node = this.app.vfs._cache.get(path);
      if (node) {
        const model = this.app.editor.models.get(path);
        if (model && model.getValue() !== node.content) {
          model.setValue(node.content);
        }
      }
    }
    // Refresh file tree
    if (this.app.fileTree && this.app.currentNavigator === 'project') {
      this.app.fileTree.render();
    }
  }

  _isDestructive(toolName) {
    return ['write_file', 'patch_file', 'create_file'].includes(toolName);
  }

  _requestApproval(toolName, args) {
    return new Promise((resolve) => {
      const desc = {
        write_file: `Write to ${args.path}`,
        patch_file: `Patch ${args.path}`,
        create_file: `Create ${args.path}`,
      }[toolName] || toolName;

      const dialog = document.createElement('div');
      dialog.className = 'modal-overlay visible';
      dialog.style.zIndex = '3000';
      dialog.innerHTML = `
        <div class="modal-dialog" style="min-width:400px;">
          <div class="modal-header"><i class="fas fa-shield-alt"></i> Agent Approval Required</div>
          <div class="modal-body">
            <p style="margin-bottom:12px;">The AI agent wants to:</p>
            <div style="background:var(--bg-primary);border-radius:8px;padding:12px;font-family:var(--mono-font);font-size:12px;">
              <strong style="color:var(--accent);">${toolName}</strong><br>
              ${args.path ? `<span style="color:var(--text-secondary);">File:</span> ${args.path}<br>` : ''}
              ${args.old_text ? `<span style="color:var(--text-secondary);">Find:</span> <code style="color:var(--warning);">${this._esc(args.old_text.substring(0, 80))}</code><br>` : ''}
              ${args.new_text ? `<span style="color:var(--text-secondary);">Replace:</span> <code style="color:var(--success);">${this._esc(args.new_text.substring(0, 80))}</code>` : ''}
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn" id="agent-deny">Deny</button>
            <button class="modal-btn primary" id="agent-approve">Approve</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);
      dialog.querySelector('#agent-approve').onclick = () => { dialog.remove(); resolve(true); };
      dialog.querySelector('#agent-deny').onclick = () => { dialog.remove(); resolve(false); };
    });
  }

  async _compactHistory() {
    if (this.conversationHistory.length < 4) return;
    
    // Simple compaction: keep last 4 messages, summarize the rest
    const toCompact = this.conversationHistory.slice(0, -4);
    const summary = toCompact.map(m => 
      `[${m.role}]: ${typeof m.content === 'string' ? m.content.substring(0, 200) : '[tool call]'}`
    ).join('\n');

    this.conversationHistory = [
      { role: 'system', content: `Previous conversation summary:\n${summary}` },
      ...this.conversationHistory.slice(-4)
    ];
    this.contextTokenCount = Math.floor(this.contextTokenCount * 0.3);
  }

  _estimateTokens(messages) {
    return messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
      return sum + Math.ceil(content.length / 4);
    }, 0);
  }

  _summarizeChanges() {
    return this.toolCallLog
      .filter(t => ['write_file', 'patch_file', 'create_file'].includes(t.name))
      .map(t => ({ tool: t.name, path: t.args.path, iteration: t.iteration }));
  }

  // ====== AGENTS.md / Config / Stats Methods ======

  /**
   * Set the reasoning effort level.
   * @param {'low'|'medium'|'high'} level
   */
  setReasoningEffort(level) {
    const valid = ['low', 'medium', 'high'];
    if (!valid.includes(level)) {
      console.warn(`[AgentLoop] Invalid reasoning effort "${level}". Must be one of: ${valid.join(', ')}`);
      return;
    }
    this.reasoningEffort = level;
  }

  /**
   * Set the approval mode for destructive operations.
   * @param {'manual'|'suggest'|'auto'} mode
   *   - 'manual': prompt for all destructive ops
   *   - 'suggest': auto-apply but show what was done
   *   - 'auto': fully autonomous, no prompts
   */
  setApprovalMode(mode) {
    const valid = ['manual', 'suggest', 'auto'];
    if (!valid.includes(mode)) {
      console.warn(`[AgentLoop] Invalid approval mode "${mode}". Must be one of: ${valid.join(', ')}`);
      return;
    }
    this.approvalMode = mode;
  }

  /**
   * Return token usage and activity statistics.
   * @returns {{ totalTokens: number, totalRequests: number, iterationsCompleted: number, toolsCalled: number }}
   */
  getTokenStats() {
    return {
      totalTokens: this.totalTokens || 0,
      totalRequests: this.totalRequests || 0,
      iterationsCompleted: this.iterationCount,
      toolsCalled: this.toolCallLog.length,
    };
  }

  /**
   * Load project-level agent configuration from AGENTS.md.
   * Inspired by Codex CLI's hierarchical AGENTS.md config.
   * Checks the VFS for a file named "AGENTS.md" and returns its content.
   * Called automatically by _buildSystemPrompt() to prepend project config.
   * @returns {string|null} The AGENTS.md content, or null if not found.
   */
  loadProjectConfig() {
    const vfs = this.app.vfs;
    if (!vfs || !vfs._cache) return null;

    const agentsMd = vfs._cache.get('AGENTS.md');
    if (!agentsMd || !agentsMd.content) return null;

    return agentsMd.content;
  }

  /**
   * Return the full tool call log.
   * @returns {Array<{ name: string, args: Object, result: Object, iteration: number }>}
   */
  getToolCallLog() {
    return this.toolCallLog;
  }

  _esc(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }
}

export { AGENT_TOOLS };
