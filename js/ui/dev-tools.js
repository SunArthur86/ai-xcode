/**
 * AI-Xcode IDE — Developer Tools Module
 * 10 built-in tools accessible from the toolbar
 */

export class DevTools {
  constructor(app) {
    this.app = app;
    this.activeTool = null;
    this.snippets = JSON.parse(localStorage.getItem('ai-xcode-snippets') || '[]');
  }

  // ─── Master open/close ────────────────────────────────────────────────
  open(toolName) {
    this.close();
    this.activeTool = toolName;
    const overlay = document.createElement('div');
    overlay.className = 'devtools-overlay modal-overlay visible';
    overlay.id = 'devtools-overlay';
    overlay.innerHTML = `<div class="devtools-dialog modal-dialog"><div class="devtools-header modal-header"><span id="devtools-title"></span><button class="devtools-close" onclick="window.app.devTools.close()">×</button></div><div class="devtools-body" id="devtools-body"></div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    document.body.appendChild(overlay);

    const handlers = {
      snippet: () => this._renderSnippetManager(),
      regex: () => this._renderRegexTester(),
      color: () => this._renderColorPicker(),
      json: () => this._renderJsonFormatter(),
      base64: () => this._renderBase64Tool(),
      markdown: () => this._renderMarkdownPreview(),
      rest: () => this._renderRestTester(),
      cron: () => this._renderCronBuilder(),
      hash: () => this._renderHashGenerator(),
      metrics: () => this._renderCodeMetrics(),
    };
    (handlers[toolName] || (() => {}))();
  }

  close() {
    const el = document.getElementById('devtools-overlay');
    if (el) el.remove();
    this.activeTool = null;
  }

  _setTitle(title) { const t = document.getElementById('devtools-title'); if (t) t.textContent = title; }
  _getBody() { return document.getElementById('devtools-body') || document.createElement('div'); }

  // ─── 1. Snippet Manager ───────────────────────────────────────────────
  _renderSnippetManager() {
    this._setTitle('🗂️ Snippet Manager');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-snippet-manager">
        <div class="dt-snippet-add">
          <input type="text" id="dt-snippet-name" placeholder="Snippet name" class="dt-input">
          <select id="dt-snippet-lang" class="dt-select"><option value="">Auto</option><option>swift</option><option>javascript</option><option>python</option><option>html</option><option>css</option><option>json</option></select>
          <button class="dt-btn" id="dt-snippet-save">Save Snippet</button>
        </div>
        <textarea id="dt-snippet-code" placeholder="Paste code here..." class="dt-textarea" rows="4"></textarea>
        <div class="dt-snippet-list" id="dt-snippet-list"></div>
      </div>`;
    this._refreshSnippets();
    document.getElementById('dt-snippet-save').onclick = () => {
      const name = document.getElementById('dt-snippet-name').value.trim();
      const lang = document.getElementById('dt-snippet-lang').value;
      const code = document.getElementById('dt-snippet-code').value.trim();
      if (!name || !code) return;
      this.snippets.push({ id: Date.now(), name, lang: lang || 'text', code, created: new Date().toISOString() });
      localStorage.setItem('ai-xcode-snippets', JSON.stringify(this.snippets));
      document.getElementById('dt-snippet-name').value = '';
      document.getElementById('dt-snippet-code').value = '';
      this._refreshSnippets();
      this.app?.notifications?.toast('Snippet saved', 'success');
    };
  }

  _refreshSnippets() {
    const container = document.getElementById('dt-snippet-list');
    if (!container) return;
    if (this.snippets.length === 0) { container.innerHTML = '<p class="dt-empty">No snippets yet. Add one above.</p>'; return; }
    container.innerHTML = this.snippets.map(s => `
      <div class="dt-snippet-item">
        <div class="dt-snippet-info"><strong>${s.name}</strong> <span class="dt-badge">${s.lang}</span></div>
        <div class="dt-snippet-actions">
          <button class="dt-btn-sm" onclick="window.app.devTools.insertSnippet(${s.id})">Insert</button>
          <button class="dt-btn-sm dt-btn-danger" onclick="window.app.devTools.deleteSnippet(${s.id})">Delete</button>
        </div>
      </div>`).join('');
  }

  insertSnippet(id) {
    const s = this.snippets.find(x => x.id === id);
    if (!s) return;
    const ed = this.app?.editor?.monaco;
    if (ed) { ed.executeEdits('snippet', [{ range: ed.getSelection(), text: s.code }]); }
    this.close();
    this.app?.notifications?.toast(`Inserted: ${s.name}`, 'success');
  }

  deleteSnippet(id) {
    this.snippets = this.snippets.filter(x => x.id !== id);
    localStorage.setItem('ai-xcode-snippets', JSON.stringify(this.snippets));
    this._refreshSnippets();
  }

  // ─── 2. Regex Tester ─────────────────────────────────────────────────
  _renderRegexTester() {
    this._setTitle('🔍 Regex Tester');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-regex-tester">
        <div class="dt-row"><input type="text" id="dt-regex-pattern" placeholder="Enter regex pattern" class="dt-input" value="\\b\\w+@\\w+\\.\\w+\\b"><input type="text" id="dt-regex-flags" placeholder="flags" class="dt-input-sm" value="g"></div>
        <textarea id="dt-regex-text" class="dt-textarea" rows="4" placeholder="Test text...">Contact us at hello@example.com or admin@test.org</textarea>
        <button class="dt-btn" id="dt-regex-run">Test</button>
        <div id="dt-regex-result" class="dt-result"></div>
      </div>`;
    document.getElementById('dt-regex-run').onclick = () => {
      const pattern = document.getElementById('dt-regex-pattern').value;
      const flags = document.getElementById('dt-regex-flags').value;
      const text = document.getElementById('dt-regex-text').value;
      const result = document.getElementById('dt-regex-result');
      try {
        const regex = new RegExp(pattern, flags);
        const matches = [];
        let m;
        if (flags.includes('g')) {
          while ((m = regex.exec(text)) !== null) { matches.push(m[0]); if (m.index === regex.lastIndex) regex.lastIndex++; }
        } else {
          m = regex.exec(text);
          if (m) matches.push(m[0]);
        }
        const highlighted = text.replace(regex, (match) => `<mark>${match}</mark>`);
        result.innerHTML = `<div class="dt-result-info">${matches.length} match(es)</div><pre class="dt-pre">${highlighted}</pre>`;
      } catch (e) {
        result.innerHTML = `<div class="dt-result-error">❌ ${e.message}</div>`;
      }
    };
  }

  // ─── 3. Color Picker ─────────────────────────────────────────────────
  _renderColorPicker() {
    this._setTitle('🎨 Color Picker');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-color-picker">
        <div class="dt-color-display" id="dt-color-display"></div>
        <div class="dt-color-controls">
          <label>Hex: <input type="text" id="dt-color-hex" class="dt-input" value="#007AFF"></label>
          <div class="dt-slider-row"><label>H</label><input type="range" id="dt-color-h" min="0" max="360" value="211"><span id="dt-color-h-val">211</span></div>
          <div class="dt-slider-row"><label>S</label><input type="range" id="dt-color-s" min="0" max="100" value="100"><span id="dt-color-s-val">100</span></div>
          <div class="dt-slider-row"><label>L</label><input type="range" id="dt-color-l" min="0" max="100" value="53"><span id="dt-color-l-val">53</span></div>
          <div class="dt-slider-row"><label>R</label><input type="number" id="dt-color-r" min="0" max="255" value="0"><span id="dt-color-r-val">0</span></div>
          <div class="dt-slider-row"><label>G</label><input type="number" id="dt-color-g" min="0" max="255" value="122"><span id="dt-color-g-val">122</span></div>
          <div class="dt-slider-row"><label>B</label><input type="number" id="dt-color-b" min="0" max="255" value="255"><span id="dt-color-b-val">255</span></div>
          <button class="dt-btn" id="dt-color-copy">Copy Hex</button>
        </div>
        <div class="dt-color-presets" id="dt-color-presets"></div>
      </div>`;
    const presets = ['#007AFF','#FF3B30','#34C759','#FF9500','#AF52DE','#5856D6','#FFCC00','#A2845E','#8E8E93','#000000','#FFFFFF','#F2F2F7'];
    document.getElementById('dt-color-presets').innerHTML = presets.map(c => `<div class="dt-color-swatch" style="background:${c}" onclick="document.getElementById('dt-color-hex').value='${c}';window.app.devTools._updateColorFromHex()"></div>`).join('');
    const updateDisplay = () => {
      const hex = document.getElementById('dt-color-hex').value;
      document.getElementById('dt-color-display').style.background = hex;
    };
    document.getElementById('dt-color-h').oninput = (e) => { document.getElementById('dt-color-h-val').textContent = e.target.value; this._updateColorFromHSL(); };
    document.getElementById('dt-color-s').oninput = (e) => { document.getElementById('dt-color-s-val').textContent = e.target.value; this._updateColorFromHSL(); };
    document.getElementById('dt-color-l').oninput = (e) => { document.getElementById('dt-color-l-val').textContent = e.target.value; this._updateColorFromHSL(); };
    document.getElementById('dt-color-hex').oninput = updateDisplay;
    document.getElementById('dt-color-copy').onclick = () => {
      const hex = document.getElementById('dt-color-hex').value;
      navigator.clipboard.writeText(hex);
      this.app?.notifications?.toast(`Copied: ${hex}`, 'success');
    };
    updateDisplay();
  }

  _updateColorFromHSL() {
    const h = +document.getElementById('dt-color-h').value;
    const s = +document.getElementById('dt-color-s').value / 100;
    const l = +document.getElementById('dt-color-l').value / 100;
    const rgb = this._hslToRgb(h, s, l);
    const hex = '#' + [rgb.r, rgb.g, rgb.b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    document.getElementById('dt-color-hex').value = hex;
    document.getElementById('dt-color-r').value = rgb.r;
    document.getElementById('dt-color-g').value = rgb.g;
    document.getElementById('dt-color-b').value = rgb.b;
    document.getElementById('dt-color-display').style.background = hex;
  }

  _updateColorFromHex() {
    const hex = document.getElementById('dt-color-hex').value;
    document.getElementById('dt-color-display').style.background = hex;
  }

  _hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  // ─── 4. JSON Formatter ───────────────────────────────────────────────
  _renderJsonFormatter() {
    this._setTitle('📋 JSON Formatter');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-json-tool">
        <textarea id="dt-json-input" class="dt-textarea" rows="6" placeholder='Paste JSON here... e.g. {"name":"test","value":42}'></textarea>
        <div class="dt-button-row">
          <button class="dt-btn" id="dt-json-format">Beautify</button>
          <button class="dt-btn" id="dt-json-minify">Minify</button>
          <button class="dt-btn" id="dt-json-validate">Validate</button>
          <button class="dt-btn" id="dt-json-copy">Copy Result</button>
        </div>
        <pre id="dt-json-output" class="dt-pre dt-result"></pre>
      </div>`;
    const run = (mode) => {
      const input = document.getElementById('dt-json-input').value.trim();
      const output = document.getElementById('dt-json-output');
      try {
        const parsed = JSON.parse(input);
        if (mode === 'format') output.textContent = JSON.stringify(parsed, null, 2);
        else if (mode === 'minify') output.textContent = JSON.stringify(parsed);
        else output.innerHTML = '<span style="color:var(--success)">✅ Valid JSON</span>';
      } catch (e) { output.innerHTML = `<span style="color:var(--error)">❌ ${e.message}</span>`; }
    };
    document.getElementById('dt-json-format').onclick = () => run('format');
    document.getElementById('dt-json-minify').onclick = () => run('minify');
    document.getElementById('dt-json-validate').onclick = () => run('validate');
    document.getElementById('dt-json-copy').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('dt-json-output').textContent);
      this.app?.notifications?.toast('Copied', 'success');
    };
  }

  // ─── 5. Base64 Encoder/Decoder ───────────────────────────────────────
  _renderBase64Tool() {
    this._setTitle('🔐 Base64 Encoder/Decoder');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-base64-tool">
        <textarea id="dt-b64-input" class="dt-textarea" rows="4" placeholder="Enter text or Base64..."></textarea>
        <div class="dt-button-row">
          <button class="dt-btn" id="dt-b64-encode">Encode →</button>
          <button class="dt-btn" id="dt-b64-decode">← Decode</button>
          <button class="dt-btn" id="dt-b64-swap">⇅ Swap</button>
        </div>
        <textarea id="dt-b64-output" class="dt-textarea" rows="4" readonly placeholder="Result..."></textarea>
      </div>`;
    document.getElementById('dt-b64-encode').onclick = () => {
      const input = document.getElementById('dt-b64-input').value;
      try { document.getElementById('dt-b64-output').value = btoa(unescape(encodeURIComponent(input))); }
      catch (e) { this.app?.notifications?.toast('Encode failed: ' + e.message, 'error'); }
    };
    document.getElementById('dt-b64-decode').onclick = () => {
      const input = document.getElementById('dt-b64-input').value;
      try { document.getElementById('dt-b64-output').value = decodeURIComponent(escape(atob(input))); }
      catch (e) { this.app?.notifications?.toast('Decode failed: ' + e.message, 'error'); }
    };
    document.getElementById('dt-b64-swap').onclick = () => {
      const a = document.getElementById('dt-b64-input').value;
      document.getElementById('dt-b64-input').value = document.getElementById('dt-b64-output').value;
      document.getElementById('dt-b64-output').value = a;
    };
  }

  // ─── 6. Markdown Live Preview ────────────────────────────────────────
  _renderMarkdownPreview() {
    this._setTitle('📝 Markdown Live Preview');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-markdown-tool">
        <div class="dt-split-view">
          <textarea id="dt-md-input" class="dt-textarea" rows="12" placeholder="# Hello&#10;&#10;Type **Markdown** here..."># Preview&#10;&#10;Type **Markdown** here...</textarea>
          <div id="dt-md-preview" class="dt-md-preview"></div>
        </div>
      </div>`;
    const input = document.getElementById('dt-md-input');
    const preview = document.getElementById('dt-md-preview');
    const render = () => {
      let html = input.value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
        .replace(/^\- (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<)/, '<p>')
        .replace(/$/, '</p>');
      preview.innerHTML = html;
    };
    input.oninput = render;
    render();
  }

  // ─── 7. REST API Tester ──────────────────────────────────────────────
  _renderRestTester() {
    this._setTitle('🌐 REST API Tester');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-rest-tool">
        <div class="dt-row">
          <select id="dt-rest-method" class="dt-select">
            <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option>
          </select>
          <input type="text" id="dt-rest-url" class="dt-input" placeholder="https://api.example.com/endpoint" value="https://httpbin.org/get">
          <button class="dt-btn" id="dt-rest-send">Send</button>
        </div>
        <textarea id="dt-rest-headers" class="dt-textarea" rows="2" placeholder='Headers JSON: {"Content-Type":"application/json"}'></textarea>
        <textarea id="dt-rest-body" class="dt-textarea" rows="3" placeholder='Request body (JSON)...'></textarea>
        <div id="dt-rest-result" class="dt-result"></div>
      </div>`;
    document.getElementById('dt-rest-send').onclick = async () => {
      const method = document.getElementById('dt-rest-method').value;
      const url = document.getElementById('dt-rest-url').value;
      let headers = {};
      try { headers = JSON.parse(document.getElementById('dt-rest-headers').value || '{}'); } catch {}
      const body = document.getElementById('dt-rest-body').value;
      const result = document.getElementById('dt-rest-result');
      result.innerHTML = '<span class="dt-loading">Sending...</span>';
      try {
        const opts = { method, headers };
        if (body && method !== 'GET') opts.body = body;
        const res = await fetch(url, opts);
        const text = await res.text();
        let formatted = text;
        try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch {}
        result.innerHTML = `<div class="dt-result-info">Status: <strong>${res.status} ${res.statusText}</strong> · ${text.length} bytes</div><pre class="dt-pre">${formatted.substring(0, 5000)}</pre>`;
      } catch (e) {
        result.innerHTML = `<div class="dt-result-error">❌ ${e.message}</div><div class="dt-hint">Note: CORS may block cross-origin requests in browser.</div>`;
      }
    };
  }

  // ─── 8. Cron Expression Builder ──────────────────────────────────────
  _renderCronBuilder() {
    this._setTitle('⏰ Cron Expression Builder');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-cron-tool">
        <div class="dt-cron-display" id="dt-cron-display">* * * * *</div>
        <div class="dt-cron-desc" id="dt-cron-desc">Every minute</div>
        <div class="dt-cron-presets">
          <button class="dt-btn-sm" data-cron="* * * * *">Every minute</button>
          <button class="dt-btn-sm" data-cron="*/5 * * * *">Every 5 min</button>
          <button class="dt-btn-sm" data-cron="0 * * * *">Every hour</button>
          <button class="dt-btn-sm" data-cron="0 9 * * *">Daily 9am</button>
          <button class="dt-btn-sm" data-cron="0 9 * * 1">Weekly Mon</button>
          <button class="dt-btn-sm" data-cron="0 0 1 * *">Monthly 1st</button>
        </div>
        <div class="dt-cron-custom">
          <label>Minute</label><input type="text" id="dt-cron-min" class="dt-input-sm" value="*">
          <label>Hour</label><input type="text" id="dt-cron-hr" class="dt-input-sm" value="*">
          <label>Day of Month</label><input type="text" id="dt-cron-dom" class="dt-input-sm" value="*">
          <label>Month</label><input type="text" id="dt-cron-mon" class="dt-input-sm" value="*">
          <label>Day of Week</label><input type="text" id="dt-cron-dow" class="dt-input-sm" value="*">
        </div>
        <button class="dt-btn" id="dt-cron-copy">Copy Expression</button>
      </div>`;
    const update = () => {
      const parts = ['dt-cron-min','dt-cron-hr','dt-cron-dom','dt-cron-mon','dt-cron-dow'].map(id => document.getElementById(id).value || '*');
      const expr = parts.join(' ');
      document.getElementById('dt-cron-display').textContent = expr;
      document.getElementById('dt-cron-desc').textContent = this._describeCron(expr);
    };
    ['dt-cron-min','dt-cron-hr','dt-cron-dom','dt-cron-mon','dt-cron-dow'].forEach(id => {
      document.getElementById(id).oninput = update;
    });
    document.querySelectorAll('.dt-cron-presets button').forEach(btn => {
      btn.onclick = () => {
        const parts = btn.dataset.cron.split(' ');
        ['dt-cron-min','dt-cron-hr','dt-cron-dom','dt-cron-mon','dt-cron-dow'].forEach((id, i) => document.getElementById(id).value = parts[i]);
        update();
      };
    });
    document.getElementById('dt-cron-copy').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('dt-cron-display').textContent);
      this.app?.notifications?.toast('Cron expression copied', 'success');
    };
    update();
  }

  _describeCron(expr) {
    const [m, h, dom, mon, dow] = expr.split(' ');
    if (expr === '* * * * *') return 'Every minute';
    if (m.startsWith('*/')) return `Every ${m.slice(2)} minutes`;
    if (m === '0' && h === '*') return 'Every hour at minute 0';
    if (m === '0' && h !== '*' && dom === '*' && mon === '*' && dow === '*') return `Every day at ${h}:${m.padStart(2,'0')}`;
    if (dow !== '*' && dow !== '?') return `Weekly on day ${dow} at ${h}:${m}`;
    if (dom !== '*' && dom !== '?') return `Monthly on day ${dom} at ${h}:${m}`;
    return `Custom: ${expr}`;
  }

  // ─── 9. Hash Generator ───────────────────────────────────────────────
  async _renderHashGenerator() {
    this._setTitle('#️⃣ Hash Generator');
    const body = this._getBody();
    body.innerHTML = `
      <div class="dt-hash-tool">
        <textarea id="dt-hash-input" class="dt-textarea" rows="3" placeholder="Enter text to hash...">Hello World</textarea>
        <button class="dt-btn" id="dt-hash-generate">Generate Hashes</button>
        <div class="dt-hash-results" id="dt-hash-results"></div>
      </div>`;
    document.getElementById('dt-hash-generate').onclick = async () => {
      const input = document.getElementById('dt-hash-input').value;
      const results = document.getElementById('dt-hash-results');
      results.innerHTML = '<span class="dt-loading">Computing...</span>';
      const encoder = new TextEncoder();
      const algos = [
        { name: 'SHA-256', algo: 'SHA-256' },
        { name: 'SHA-1', algo: 'SHA-1' },
        { name: 'MD5', algo: null, custom: true },
      ];
      let html = '';
      for (const a of algos) {
        try {
          let hash;
          if (a.custom) {
            hash = this._md5(input);
          } else {
            const buf = await crypto.subtle.digest(a.algo, encoder.encode(input));
            hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
          }
          html += `<div class="dt-hash-row"><span class="dt-hash-label">${a.name}</span><code class="dt-hash-value">${hash}</code><button class="dt-btn-sm" onclick="navigator.clipboard.writeText('${hash}')">Copy</button></div>`;
        } catch (e) { html += `<div class="dt-hash-row"><span>${a.name}</span><span class="dt-result-error">Failed</span></div>`; }
      }
      results.innerHTML = html;
    };
  }

  _md5(str) {
    // Simple MD5 implementation (public domain, Joseph Myers)
    function rotateLeft(x, n) { return (x << n) | (x >>> (32 - n)); }
    function addUnsigned(x, y) { const x4 = (x & 0x40000000), y4 = (y & 0x40000000), x8 = (x & 0x80000000), y8 = (y & 0x80000000), result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF); if (x4 & y4) return result ^ 0x80000000 ^ x8 ^ y8; if (x4 | y4) { if (result & 0x40000000) return result ^ 0xC0000000 ^ x8 ^ y8; else return result ^ 0x40000000 ^ x8 ^ y8; } else return result ^ x8 ^ y8; }
    function F(x,y,z) { return (x & y) | ((~x) & z); }
    function G(x,y,z) { return (x & z) | (y & (~z)); }
    function H(x,y,z) { return x ^ y ^ z; }
    function I(x,y,z) { return y ^ (x | (~z)); }
    function FF(a,b,c,d,x,s,ac) { a = addUnsigned(a, addUnsigned(addUnsigned(F(b,c,d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
    function GG(a,b,c,d,x,s,ac) { a = addUnsigned(a, addUnsigned(addUnsigned(G(b,c,d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
    function HH(a,b,c,d,x,s,ac) { a = addUnsigned(a, addUnsigned(addUnsigned(H(b,c,d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
    function II(a,b,c,d,x,s,ac) { a = addUnsigned(a, addUnsigned(addUnsigned(I(b,c,d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
    function convertToWordArray(str) {
      let lWordCount, lMessageLength = str.length, lNumberOfWords_temp1 = lMessageLength + 8, lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64, lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16, lWordArray = Array(lNumberOfWords - 1), lBytePosition = 0, lByteCount = 0;
      while (lByteCount < lMessageLength) { lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition); lByteCount++; }
      lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
      lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
      lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
      return lWordArray;
    }
    function wordToHex(lValue) { let wordToHexValue = '', wordToHexValue_temp = '', lByte, lCount; for (lCount = 0; lCount <= 3; lCount++) { lByte = (lValue >>> (lCount * 8)) & 255; wordToHexValue_temp = '0' + lByte.toString(16); wordToHexValue += wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2); } return wordToHexValue; }
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const K = [0xD76AA478,0xE8C7B756,0x242070DB,0xC1BDCEEE,0xF57C0FAF,0x4787C62A,0xA8304613,0xFD469501,0x698098D8,0x8B44F7AF,0xFFFF5BB1,0x895CD7BE,0x6B901122,0xFD987193,0xA679438E,0x49B40821,0xF61E2562,0xC040B340,0x265E5A51,0xE9B6C7AA,0xD62F105D,0x02441453,0xD8A1E681,0xE7D3FBC8,0x21E1CDE6,0xC33707D6,0xF4D50D87,0x455A14ED,0xA9E3E905,0xFCEFA3F8,0x676F02D9,0x8D2A4C8A,0xFFFA3942,0x8771F681,0x6D9D6122,0xFDE5380C,0xA4BEEA44,0x4BDECFA9,0xF6BB4B60,0xBEBFBC70,0x289B7EC6,0xEAA127FA,0xD4EF3085,0x04881D05,0xD9D4D039,0xE6DB99E5,0x1FA27CF8,0xC4AC5665,0xF4292244,0x432AFF97,0xAB9423A7,0xFC93A039,0x655B59C3,0x8F0CCC92,0xFFEFF47D,0x85845DD1,0x6FA87E4F,0xFE2CE6E0,0xA3014314,0x4E0811A1,0xF7537E82,0xBD3AF235,0x2AD7D2BB,0xEB86D391];
    const x = convertToWordArray(unescape(encodeURIComponent(str)));
    let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
    for (let k = 0; k < x.length; k += 16) {
      const AA = a, BB = b, CC = c, DD = d;
      for (let i = 0; i < 64; i++) {
        let temp;
        if (i < 16) { temp = FF(a,b,c,d, x[k+i], S[i], K[i]); }
        else if (i < 32) { temp = GG(a,b,c,d, x[k+((5*i+1)%16)], S[i], K[i]); }
        else if (i < 48) { temp = HH(a,b,c,d, x[k+((3*i+5)%16)], S[i], K[i]); }
        else { temp = II(a,b,c,d, x[k+((7*i)%16)], S[i], K[i]); }
        a=d; d=c; c=b; b=temp;
      }
      a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
    }
    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
  }

  // ─── 10. Code Metrics Dashboard ──────────────────────────────────────
  _renderCodeMetrics() {
    this._setTitle('📊 Code Metrics Dashboard');
    const body = this._getBody();
    body.innerHTML = '<div class="dt-loading">Analyzing project...</div>';
    const stats = this._calculateMetrics();
    const maxLines = Math.max(...Object.values(stats.languages).map(l => l.lines), 1);
    body.innerHTML = `
      <div class="dt-metrics">
        <div class="dt-metric-cards">
          <div class="dt-metric-card"><div class="dt-metric-value">${stats.totalFiles}</div><div class="dt-metric-label">Total Files</div></div>
          <div class="dt-metric-card"><div class="dt-metric-value">${stats.totalLines.toLocaleString()}</div><div class="dt-metric-label">Total Lines</div></div>
          <div class="dt-metric-card"><div class="dt-metric-value">${stats.totalChars.toLocaleString()}</div><div class="dt-metric-label">Characters</div></div>
          <div class="dt-metric-card"><div class="dt-metric-value">${Object.keys(stats.languages).length}</div><div class="dt-metric-label">Languages</div></div>
        </div>
        <h3 class="dt-section-title">Language Breakdown</h3>
        <div class="dt-lang-bars">
          ${Object.entries(stats.languages).sort((a,b) => b[1].lines - a[1].lines).map(([lang, data]) => `
            <div class="dt-lang-bar">
              <div class="dt-lang-name">${lang}</div>
              <div class="dt-lang-bar-track">
                <div class="dt-lang-bar-fill" style="width: ${(data.lines / maxLines * 100).toFixed(1)}%; background: ${this._langColor(lang)};"></div>
              </div>
              <div class="dt-lang-count">${data.files} files · ${data.lines.toLocaleString()} lines</div>
            </div>
          `).join('')}
        </div>
        <h3 class="dt-section-title">Code Quality Estimate</h3>
        <div class="dt-quality-grid">
          <div class="dt-quality-item"><span>Functions</span><strong>${stats.functions}</strong></div>
          <div class="dt-quality-item"><span>Classes</span><strong>${stats.classes}</strong></div>
          <div class="dt-quality-item"><span>Comments</span><strong>${stats.comments}</strong></div>
          <div class="dt-quality-item"><span>TODOs</span><strong>${stats.todos}</strong></div>
          <div class="dt-quality-item"><span>Avg File Size</span><strong>${stats.avgFileSize.toFixed(0)} lines</strong></div>
          <div class="dt-quality-item"><span>Comment Ratio</span><strong>${stats.commentRatio.toFixed(1)}%</strong></div>
        </div>
      </div>`;
  }

  _calculateMetrics() {
    const langs = {};
    let totalFiles = 0, totalLines = 0, totalChars = 0;
    let functions = 0, classes = 0, comments = 0, todos = 0;
    const vfs = this.app?.vfs;
    if (!vfs || !vfs._cache) return { totalFiles: 0, totalLines: 0, totalChars: 0, languages: {}, functions: 0, classes: 0, comments: 0, todos: 0, avgFileSize: 0, commentRatio: 0 };
    for (const node of vfs._cache.values()) {
      if (node.isFolder || !node.content) continue;
      totalFiles++;
      const lines = node.content.split('\n').length;
      totalLines += lines;
      totalChars += node.content.length;
      const lang = vfs.getFileLanguage(node.path) || 'text';
      if (!langs[lang]) langs[lang] = { files: 0, lines: 0 };
      langs[lang].files++;
      langs[lang].lines += lines;
      // Count patterns
      functions += (node.content.match(/\bfunc\s+\w+|function\s+\w+|def\s+\w+/g) || []).length;
      classes += (node.content.match(/\bclass\s+\w+|struct\s+\w+|enum\s+\w+/g) || []).length;
      comments += (node.content.match(/^\s*\/\/.*$|^\s*\/\*[\s\S]*?\*\//gm) || []).length;
      todos += (node.content.match(/TODO|FIXME|HACK/gi) || []).length;
    }
    return { totalFiles, totalLines, totalChars, languages: langs, functions, classes, comments, todos, avgFileSize: totalFiles > 0 ? totalLines / totalFiles : 0, commentRatio: totalLines > 0 ? (comments / totalLines) * 100 : 0 };
  }

  _langColor(lang) {
    const colors = { swift: '#FA7343', javascript: '#F7DF1E', python: '#3776AB', html: '#E34F26', css: '#1572B6', json: '#A0AEC0', markdown: '#083FA1', text: '#8E8E93' };
    return colors[lang] || '#8E8E93';
  }
}
