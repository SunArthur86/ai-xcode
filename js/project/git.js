/**
 * AI-Xcode IDE — Git UI Module
 * Simulates Xcode's Source Control Navigator
 */

export class GitUI {
  constructor(app) {
    this.app = app;
    this.branch = 'main';
    this.stagedFiles = [];
    this.changes = [];
    this.commitHistory = [
      { hash: 'a3f2c9d', message: 'Initial commit — Project setup', author: 'Developer', date: '2024-01-10 10:30' },
      { hash: 'b7e4d2a', message: 'Add User model with password hashing', author: 'Developer', date: '2024-01-10 14:15' },
      { hash: 'c1a8f5e', message: 'Implement LoginView with validation', author: 'Developer', date: '2024-01-11 09:42' },
      { hash: 'd9c3b7f', message: 'Add DashboardView with charts', author: 'Developer', date: '2024-01-11 16:28' },
      { hash: 'e5d1a3c', message: 'Setup test suite with 12 test cases', author: 'Developer', date: '2024-01-12 11:05' },
    ];
    this.refreshChanges();
  }

  render(container) {
    container.innerHTML = `
      <div class="sidebar-header" style="margin:0 -0;padding:0 12px;">
        <span class="sidebar-header-title">Source Control</span>
        <button class="tb-btn" data-tooltip="Commit All" style="width:22px;height:22px;" onclick="window.app?.gitUI?.commitAll()">
          <i class="fas fa-check-double" style="font-size:11px;"></i>
        </button>
      </div>
      <div class="sidebar-content" style="padding:8px 0;">
        <div style="padding:0 12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <i class="fab fa-git-alt" style="color:var(--warning);font-size:14px;"></i>
            <span style="font-weight:600;font-size:13px;">MyApp</span>
            <span class="badge badge-success" style="font-size:9px;">${this.branch}</span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">
            <i class="fas fa-arrow-up" style="font-size:9px;"></i> 0 ahead &nbsp;
            <i class="fas fa-arrow-down" style="font-size:9px;"></i> 0 behind
          </div>
        </div>

        <div style="padding:0 12px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
            Changes (${this.changes.length})
          </div>
        </div>

        <div class="git-changes" id="git-changes-list">
          ${this.renderChangesList()}
        </div>

        <div style="padding:8px 12px 4px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
            Commits (${this.commitHistory.length})
          </div>
        </div>

        <div id="git-history">
          ${this.renderHistoryList()}
        </div>

        <div style="padding:8px 12px;">
          <button class="modal-btn primary" style="width:100%;" onclick="window.app?.gitUI?.showCommitDialog()">
            <i class="fas fa-code-commit"></i> Commit Changes
          </button>
        </div>
      </div>
    `;
  }

  renderChangesList() {
    if (this.changes.length === 0) {
      return '<div style="padding:8px 12px;color:var(--text-tertiary);font-size:12px;">No uncommitted changes.</div>';
    }
    return this.changes.map(c => `
      <div class="git-change-item" onclick="window.app?.gitUI?.showDiff('${c.path}')">
        <span class="git-status-badge git-status-${c.status}">${c.status}</span>
        <span style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;">${c.name}</span>
        <div style="margin-left:auto;display:flex;gap:2px;">
          <button class="tb-btn" data-tooltip="Stage" style="width:20px;height:20px;" onclick="event.stopPropagation();window.app?.gitUI?.stage('${c.path}')">
            <i class="fas fa-plus" style="font-size:8px;"></i>
          </button>
          <button class="tb-btn" data-tooltip="Discard" style="width:20px;height:20px;" onclick="event.stopPropagation();window.app?.gitUI?.discard('${c.path}')">
            <i class="fas fa-undo" style="font-size:8px;"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  renderHistoryList() {
    return this.commitHistory.slice(0, 5).map(c => `
      <div style="padding:6px 12px;cursor:pointer;" onclick="window.app?.gitUI?.showCommit('${c.hash}')">
        <div style="font-size:12px;color:var(--text-primary);">${c.message}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">
          <span style="font-family:var(--mono-font);color:var(--accent);">${c.hash.substring(0, 7)}</span>
          · ${c.author} · ${c.date}
        </div>
      </div>
    `).join('');
  }

  refreshChanges() {
    this.changes = [
      { path: 'MyApp/ContentView.swift', name: 'ContentView.swift', status: 'M' },
      { path: 'MyApp/Views/LoginView.swift', name: 'LoginView.swift', status: 'M' },
    ];
  }

  stage(path) {
    if (!this.stagedFiles.includes(path)) {
      this.stagedFiles.push(path);
      this.app.notifications.toast(`Staged: ${path.split('/').pop()}`, 'success', 2000);
    }
  }

  discard(path) {
    if (confirm(`Discard changes to ${path}?`)) {
      this.changes = this.changes.filter(c => c.path !== path);
      this.render(document.getElementById('navigator-content'));
      this.app.notifications.toast(`Discarded: ${path.split('/').pop()}`, 'warning', 2000);
    }
  }

  showDiff(path) {
    const panel = document.getElementById('panel-bottom');
    panel.classList.remove('collapsed');
    const content = document.getElementById('panel-content');
    content.innerHTML = `
      <div style="padding:8px;">
        <div style="margin-bottom:8px;">
          <strong style="font-size:13px;">Diff: ${path}</strong>
          <span class="badge badge-warning" style="margin-left:8px;">Modified</span>
        </div>
        <div style="font-family:var(--mono-font);font-size:12px;line-height:1.8;">
          <div style="color:var(--text-tertiary);">--- a/${path}</div>
          <div style="color:var(--text-tertiary);">+++ b/${path}</div>
          <div class="console-line success">+    var body: some View {</div>
          <div class="console-line success">+        VStack {</div>
          <div class="console-line success">+            Text("Hello, World!")</div>
          <div class="console-line success">+                .font(.title)</div>
          <div class="console-line error">-    Text("Hello")</div>
          <div class="console-line error">-        .font(.body)</div>
          <div style="color:var(--text-secondary);">     .padding()</div>
          <div style="color:var(--text-secondary);">     }</div>
        </div>
      </div>
    `;
  }

  showCommit(hash) {
    const commit = this.commitHistory.find(c => c.hash === hash);
    if (!commit) return;
    this.app.notifications.toast(`${commit.hash.substring(0, 7)}: ${commit.message}`, 'info');
  }

  showCommitDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay visible';
    dialog.id = 'commit-dialog';
    dialog.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header"><i class="fas fa-code-commit"></i> Commit Changes</div>
        <div class="modal-body">
          <div style="margin-bottom:12px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:4px;">Files to Commit</div>
            ${this.changes.map(c => `
              <label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">
                <input type="checkbox" checked> 
                <span class="git-status-badge git-status-${c.status}">${c.status}</span>
                ${c.name}
              </label>
            `).join('')}
          </div>
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:4px;">Commit Message</div>
            <textarea class="inspector-input" id="commit-msg" rows="3" placeholder="Enter commit message..." style="width:100%;resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn" onclick="document.getElementById('commit-dialog').remove()">Cancel</button>
          <button class="modal-btn primary" onclick="window.app?.gitUI?.doCommit()">Commit</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    document.getElementById('commit-msg').focus();
  }

  doCommit() {
    const msg = document.getElementById('commit-msg').value.trim();
    if (!msg) {
      this.app.notifications.toast('Commit message required!', 'error');
      return;
    }
    const hash = Math.random().toString(16).substring(2, 9);
    const now = new Date();
    this.commitHistory.unshift({
      hash, message: msg, author: 'Developer',
      date: now.toISOString().substring(0, 16).replace('T', ' '),
    });
    this.changes = [];
    document.getElementById('commit-dialog')?.remove();
    this.render(document.getElementById('navigator-content'));
    this.app.notifications.toast(`Committed: ${msg}`, 'success');
    this.app.log('console', `[git] Committed as ${hash}: ${msg}`, 'success');
  }

  commitAll() {
    this.showCommitDialog();
  }
}
