/**
 * AI-Xcode IDE — Interface Builder
 * Visual UI designer (like Xcode's Storyboard / Interface Builder)
 */

export class InterfaceBuilder {
  constructor(app) {
    this.app = app;
    this.components = [];
    this.selectedId = null;
    this.deviceFrame = { w: 375, h: 812, name: 'iPhone 15' };
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.snapGrid = 10;
    this.ibActive = false;
    this._idCounter = 0;

    this.componentTypes = [
      { type: 'Button', label: 'Button', icon: '🔘', w: 100, h: 36, props: { text: 'Button', bg: '#0a84ff', color: '#ffffff', fontSize: 14 } },
      { type: 'Label', label: 'Label', icon: '🏷️', w: 120, h: 20, props: { text: 'Label', color: '#1d1d1f', fontSize: 14, align: 'left' } },
      { type: 'TextField', label: 'Text Field', icon: '📝', w: 160, h: 34, props: { placeholder: 'Enter text...', color: '#1d1d1f', fontSize: 14 } },
      { type: 'TextView', label: 'Text View', icon: '📄', w: 200, h: 100, props: { text: '', color: '#1d1d1f', fontSize: 14 } },
      { type: 'ImageView', label: 'Image View', icon: '🖼️', w: 100, h: 100, props: { src: '', cornerRadius: 0 } },
      { type: 'Switch', label: 'Switch', icon: '🔀', w: 51, h: 31, props: { on: true } },
      { type: 'Slider', label: 'Slider', icon: '🎚️', w: 200, h: 30, props: { min: 0, max: 1, value: 0.5 } },
      { type: 'View', label: 'View', icon: '⬜', w: 200, h: 150, props: { bg: '#e0e0e0', cornerRadius: 0 } },
      { type: 'TableView', label: 'Table View', icon: '📋', w: 200, h: 300, props: { rows: 5 } },
      { type: 'CollectionView', label: 'Collection', icon: '🔲', w: 200, h: 200, props: { cols: 3 } },
      { type: 'StackView', label: 'Stack View', icon: '📚', w: 200, h: 50, props: { axis: 'vertical', spacing: 8 } },
      { type: 'SegmentControl', label: 'Segment', icon: '📊', w: 200, h: 30, props: { segments: ['First', 'Second', 'Third'] } },
      { type: 'ActivityIndicator', label: 'Spinner', icon: '⏳', w: 30, h: 30, props: {} },
      { type: 'ProgressView', label: 'Progress', icon: '📈', w: 200, h: 4, props: { progress: 0.5 } },
      { type: 'DatePicker', label: 'Date Picker', icon: '📅', w: 280, h: 120, props: { mode: 'date' } },
      { type: 'Picker', label: 'Picker', icon: '🎡', w: 200, h: 180, props: { items: ['Option 1', 'Option 2'] } },
      { type: 'MapView', label: 'Map View', icon: '🗺️', w: 300, h: 200, props: {} },
    ];
  }

  open(path) {
    this.ibActive = true;
    this.app.editor?.monaco?.updateOptions({ readOnly: true });
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('monaco-container').style.display = 'none';
    this.render();
  }

  close() {
    this.ibActive = false;
    document.getElementById('ib-root')?.remove();
    this.app.editor?.monaco?.updateOptions({ readOnly: false });
  }

  render() {
    let root = document.getElementById('ib-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ib-root';
      root.style.cssText = 'display:flex;flex:1;overflow:hidden;';
      const editorContainer = document.getElementById('editor-container');
      editorContainer.appendChild(root);
    }

    root.innerHTML = `
      <div class="ib-component-library">
        <div class="sidebar-header">
          <span class="sidebar-header-title">Components</span>
        </div>
        <div class="sidebar-content" id="ib-library">
          ${this.componentTypes.map(c => `
            <div class="ib-lib-item" draggable="true" data-type="${c.type}">
              <span>${c.icon}</span>
              <span>${c.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div class="ib-toolbar">
          <select id="ib-device" class="inspector-input" style="width:auto;">
            <option value="375,812,iPhone 15">iPhone 15 (375×812)</option>
            <option value="390,844,iPhone 15 Pro">iPhone 15 Pro (390×844)</option>
            <option value="428,926,iPhone 15 Pro Max">iPhone 15 Pro Max (428×926)</option>
            <option value="744,1133,iPad Mini">iPad Mini (744×1133)</option>
            <option value="820,1180,iPad Air">iPad Air (820×1180)</option>
          </select>
          <div class="toolbar-divider"></div>
          <button class="ai-quick-btn" id="ib-export-swiftui">⬇ Export SwiftUI</button>
          <button class="ai-quick-btn" id="ib-export-uikit">⬇ Export UIKit</button>
          <button class="ai-quick-btn" id="ib-clear">🗑 Clear</button>
          <button class="ai-quick-btn" id="ib-ai-generate">🤖 AI Generate</button>
        </div>
        <div class="ib-canvas" id="ib-canvas">
          ${this.renderCanvas()}
        </div>
      </div>
    `;

    this.setupLibraryDrag();
    this.setupCanvasEvents();
    this.setupToolbar();
  }

  renderCanvas() {
    const { w, h, name } = this.deviceFrame;
    return `
      <div class="ib-canvas-bg" id="ib-frame" style="width:${w}px;min-height:${h}px;">
        <div style="position:absolute;top:0;left:0;right:0;height:44px;background:#f0f0f0;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#888;pointer-events:none;">
          ${name} — Safe Area
        </div>
        ${this.components.map(c => this.renderComponent(c)).join('')}
      </div>
    `;
  }

  renderComponent(c) {
    const isSelected = c.id === this.selectedId;
    const styles = [
      `position:absolute`, `left:${c.x}px`, `top:${c.y}px`,
      `width:${c.w}px`, `height:${c.h}px`,
      `border:${isSelected ? '2px solid var(--accent)' : '1px dashed transparent'}`,
    ];

    let inner = '';
    switch (c.type) {
      case 'Button':
        styles.push(`background:${c.props.bg || '#0a84ff'}`, `border-radius:8px`, `display:flex`, `align-items:center`, `justify-content:center`);
        inner = `<span style="color:${c.props.color};font-size:${c.props.fontSize}px;pointer-events:none;">${this.esc(c.props.text)}</span>`;
        break;
      case 'Label':
        inner = `<span style="color:${c.props.color};font-size:${c.props.fontSize}px;text-align:${c.props.align};pointer-events:none;">${this.esc(c.props.text)}</span>`;
        break;
      case 'TextField':
        styles.push(`background:white`, `border:1px solid #ccc`, `border-radius:6px`, `display:flex`, `align-items:center`, `padding:0 8px`);
        inner = `<span style="color:#999;font-size:${c.props.fontSize}px;pointer-events:none;">${this.esc(c.props.placeholder)}</span>`;
        break;
      case 'ImageView':
        styles.push(`background:#e0e0e0`, `border-radius:${c.props.cornerRadius || 0}px`, `display:flex`, `align-items:center`, `justify-content:center`);
        inner = `<span style="color:#aaa;pointer-events:none;">🖼️</span>`;
        break;
      case 'Switch':
        styles.push(`background:${c.props.on ? '#34c759' : '#e5e5ea'}`, `border-radius:16px`, `display:flex`, `align-items:center`, `padding:2px`);
        inner = `<div style="width:27px;height:27px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.2);margin-left:${c.props.on ? '20px' : '0'};transition:margin 0.2s;pointer-events:none;"></div>`;
        break;
      case 'Slider':
        styles.push(`display:flex`, `align-items:center`);
        inner = `<div style="width:100%;height:4px;background:#e5e5ea;border-radius:2px;pointer-events:none;"><div style="width:${c.props.value * 100}%;height:100%;background:#0a84ff;border-radius:2px;"></div></div><div style="width:20px;height:20px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);margin-left:-10px;pointer-events:none;"></div>`;
        break;
      case 'View':
        styles.push(`background:${c.props.bg || '#e0e0e0'}`, `border-radius:${c.props.cornerRadius || 0}px`);
        break;
      case 'TableView':
        styles.push(`background:white`, `border:1px solid #e0e0e0`, `overflow:hidden`);
        inner = Array.from({ length: Math.min(c.props.rows || 5, 8) }, (_, i) =>
          `<div style="height:36px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;padding:0 12px;font-size:12px;color:#999;pointer-events:none;">Item ${i + 1}</div>`
        ).join('');
        break;
      case 'CollectionView':
        styles.push(`background:white`, `border:1px solid #e0e0e0`, `display:flex`, `flex-wrap:wrap`, `gap:4px`, `padding:4px`, `overflow:hidden`);
        inner = Array.from({ length: c.props.cols * 3 }, () =>
          `<div style="flex:1;min-width:50px;height:50px;background:#f5f5f5;border-radius:4px;pointer-events:none;"></div>`
        ).join('');
        break;
      case 'StackView':
        styles.push(`background:rgba(0,122,255,0.05)`, `border:1px dashed rgba(0,122,255,0.3)`, `border-radius:4px`);
        break;
      case 'SegmentControl':
        styles.push(`background:#f0f0f0`, `border-radius:6px`, `display:flex`, `overflow:hidden`);
        inner = (c.props.segments || []).map((s, i) =>
          `<div style="flex:1;${i === 0 ? 'background:white;' : ''}display:flex;align-items:center;justify-content:center;font-size:12px;color:#333;pointer-events:none;">${this.esc(s)}</div>`
        ).join('');
        break;
      case 'ActivityIndicator':
        styles.push(`display:flex`, `align-items:center`, `justify-content:center`);
        inner = `<div class="spin" style="width:24px;height:24px;border:3px solid #e0e0e0;border-top-color:#0a84ff;border-radius:50%;pointer-events:none;"></div>`;
        break;
      case 'ProgressView':
        styles.push(`background:#e0e0e0`, `border-radius:2px`, `overflow:hidden`);
        inner = `<div style="width:${(c.props.progress || 0.5) * 100}%;height:100%;background:#0a84ff;pointer-events:none;"></div>`;
        break;
      case 'DatePicker':
        styles.push(`background:white`, `border:1px solid #e0e0e0`, `border-radius:8px`, `padding:8px`);
        inner = `<div style="text-align:center;font-size:12px;color:#333;pointer-events:none;">📅 Date Picker<br><span style="color:#999;">${c.props.mode}</span></div>`;
        break;
      case 'Picker':
        styles.push(`background:white`, `border:1px solid #e0e0e0`, `display:flex`, `align-items:center`, `justify-content:center`);
        inner = (c.props.items || []).map((item, i) =>
          `<div style="text-align:center;font-size:${i === 1 ? '16px' : '12px'};color:${i === 1 ? '#333' : '#aaa'};pointer-events:none;">${this.esc(item)}</div>`
        ).join('');
        break;
      case 'MapView':
        styles.push(`background:linear-gradient(135deg,#e8f5e9,#c8e6c9)`, `border:1px solid #a5d6a7`, `border-radius:8px`, `display:flex`, `align-items:center`, `justify-content:center`);
        inner = `<span style="font-size:32px;pointer-events:none;">🗺️</span>`;
        break;
      default:
        styles.push(`background:#f0f0f0`, `border-radius:4px`);
    }

    return `<div class="ib-component ${isSelected ? 'selected' : ''}" data-id="${c.id}" style="${styles.join(';')}" 
      onmousedown="window.__ib?.startDrag(event, ${c.id})" 
      onclick="window.__ib?.select(${c.id})"
      ondblclick="window.__ib?.editText(${c.id})">${inner}</div>`;
  }

  setupLibraryDrag() {
    document.querySelectorAll('.ib-lib-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/type', item.dataset.type);
      });
    });

    const frame = document.getElementById('ib-frame');
    if (frame) {
      frame.addEventListener('dragover', (e) => { e.preventDefault(); });
      frame.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/type');
        if (!type) return;
        const rect = frame.getBoundingClientRect();
        const x = this.snap(e.clientX - rect.left);
        const y = this.snap(e.clientY - rect.top);
        this.addComponent(type, x, y);
      });
    }
  }

  setupCanvasEvents() {
    const deviceSelect = document.getElementById('ib-device');
    if (deviceSelect) {
      deviceSelect.addEventListener('change', (e) => {
        const [w, h, name] = e.target.value.split(',');
        this.deviceFrame = { w: parseInt(w), h: parseInt(h), name };
        this.render();
      });
    }

    document.getElementById('ib-clear')?.addEventListener('click', () => {
      if (confirm('Clear all components?')) {
        this.components = [];
        this.selectedId = null;
        this.render();
        this.renderInspectorProps();
      }
    });

    document.getElementById('ib-export-swiftui')?.addEventListener('click', () => this.exportToCode('swiftui'));
    document.getElementById('ib-export-uikit')?.addEventListener('click', () => this.exportToCode('uikit'));
    document.getElementById('ib-ai-generate')?.addEventListener('click', () => this.aiGenerate());
  }

  setupToolbar() { /* handled in setupCanvasEvents */ }

  addComponent(type, x, y) {
    const ct = this.componentTypes.find(c => c.type === type);
    if (!ct) return;
    const id = ++this._idCounter;
    this.components.push({
      id, type: ct.type, x: this.snap(x), y: this.snap(y),
      w: ct.w, h: ct.h, props: JSON.parse(JSON.stringify(ct.props)),
    });
    this.selectedId = id;
    this.render();
    this.renderInspectorProps();
  }

  select(id) {
    this.selectedId = id;
    this.render();
    this.renderInspectorProps();
  }

  startDrag(e, id) {
    e.stopPropagation();
    const comp = this.components.find(c => c.id === id);
    if (!comp) return;
    this.selectedId = id;
    this.isDragging = true;
    const frame = document.getElementById('ib-frame');
    const rect = frame.getBoundingClientRect();
    this.dragOffset = { x: e.clientX - rect.left - comp.x, y: e.clientY - rect.top - comp.y };

    const onMove = (ev) => {
      if (!this.isDragging) return;
      comp.x = this.snap(ev.clientX - rect.left - this.dragOffset.x);
      comp.y = this.snap(ev.clientY - rect.top - this.dragOffset.y);
      const el = frame.querySelector(`[data-id="${id}"]`);
      if (el) { el.style.left = comp.x + 'px'; el.style.top = comp.y + 'px'; }
    };

    const onUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.renderInspectorProps();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  editText(id) {
    const comp = this.components.find(c => c.id === id);
    if (!comp) return;
    if (comp.type === 'Label' || comp.type === 'Button') {
      const newText = prompt('Edit text:', comp.props.text);
      if (newText !== null) { comp.props.text = newText; this.render(); }
    } else if (comp.type === 'TextField') {
      const newPh = prompt('Edit placeholder:', comp.props.placeholder);
      if (newPh !== null) { comp.props.placeholder = newPh; this.render(); }
    }
  }

  deleteComponent(id) {
    this.components = this.components.filter(c => c.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.render();
    this.renderInspectorProps();
  }

  setProperty(id, prop, value) {
    const comp = this.components.find(c => c.id === id);
    if (comp) { comp.props[prop] = value; this.render(); }
  }

  resizeComponent(id, w, h) {
    const comp = this.components.find(c => c.id === id);
    if (comp) { comp.w = this.snap(w); comp.h = this.snap(h); this.render(); }
  }

  renderInspectorProps() {
    const inspector = document.getElementById('inspector-content');
    if (!inspector || !this.selectedId) return;

    const comp = this.components.find(c => c.id === this.selectedId);
    if (!comp) return;

    const ct = this.componentTypes.find(c => c.type === comp.type);
    let propsHtml = '';

    if (comp.props.text !== undefined) {
      propsHtml += `<div class="inspector-row"><span class="inspector-label">Text</span></div>`;
      propsHtml += `<input class="inspector-input" value="${this.esc(comp.props.text)}" oninput="window.__ib?.setProperty(${comp.id},'text',this.value)" style="margin-bottom:4px;">`;
    }
    if (comp.props.placeholder !== undefined) {
      propsHtml += `<div class="inspector-row"><span class="inspector-label">Placeholder</span></div>`;
      propsHtml += `<input class="inspector-input" value="${this.esc(comp.props.placeholder)}" oninput="window.__ib?.setProperty(${comp.id},'placeholder',this.value)" style="margin-bottom:4px;">`;
    }
    if (comp.props.color !== undefined) {
      propsHtml += `<div class="inspector-row"><span class="inspector-label">Text Color</span><input type="color" value="${comp.props.color}" oninput="window.__ib?.setProperty(${comp.id},'color',this.value)"></div>`;
    }
    if (comp.props.bg !== undefined) {
      propsHtml += `<div class="inspector-row"><span class="inspector-label">Background</span><input type="color" value="${comp.props.bg}" oninput="window.__ib?.setProperty(${comp.id},'bg',this.value)"></div>`;
    }
    if (comp.props.fontSize !== undefined) {
      propsHtml += `<div class="inspector-row"><span class="inspector-label">Font Size</span><input type="number" class="inspector-input" value="${comp.props.fontSize}" oninput="window.__ib?.setProperty(${comp.id},'fontSize',+this.value)" style="width:60px;"></div>`;
    }

    propsHtml += `<div class="inspector-row"><span class="inspector-label">X</span><input type="number" class="inspector-input" value="${comp.x}" oninput="window.__ib?.components.find(c=>c.id===${comp.id}).x=+this.value;window.__ib?.render()" style="width:60px;"></div>`;
    propsHtml += `<div class="inspector-row"><span class="inspector-label">Y</span><input type="number" class="inspector-input" value="${comp.y}" oninput="window.__ib?.components.find(c=>c.id===${comp.id}).y=+this.value;window.__ib?.render()" style="width:60px;"></div>`;
    propsHtml += `<div class="inspector-row"><span class="inspector-label">Width</span><input type="number" class="inspector-input" value="${comp.w}" oninput="window.__ib?.resizeComponent(${comp.id},+this.value,${comp.h})" style="width:60px;"></div>`;
    propsHtml += `<div class="inspector-row"><span class="inspector-label">Height</span><input type="number" class="inspector-input" value="${comp.h}" oninput="window.__ib?.resizeComponent(${comp.id},${comp.w},+this.value)" style="width:60px;"></div>`;
    propsHtml += `<button class="modal-btn danger" style="width:100%;margin-top:8px;" onclick="window.__ib?.deleteComponent(${comp.id})">🗑 Delete</button>`;

    inspector.innerHTML = `
      <div class="inspector-section">
        <div class="inspector-header"><span class="inspector-title">${ct?.icon || '📦'} ${comp.type}</span></div>
        <div class="inspector-body">${propsHtml}</div>
      </div>
    `;
  }

  exportToCode(format = 'swiftui') {
    let code = '';
    if (format === 'swiftui') {
      code = 'import SwiftUI\n\n';
      code += `struct ContentView: View {\n`;
      code += `    var body: some View {\n`;
      code += `        ZStack {\n`;
      code += `            Color.white\n`;
      for (const c of this.components) {
        code += `            ${this.componentToSwiftUI(c)}\n`;
      }
      code += `        }\n`;
      code += `    }\n`;
      code += `}\n`;
    } else {
      code = 'import UIKit\n\n';
      code += `class ViewController: UIViewController {\n`;
      code += `    override func viewDidLoad() {\n`;
      code += `        super.viewDidLoad()\n`;
      for (const c of this.components) {
        code += `        ${this.componentToUIKit(c)}\n`;
      }
      code += `    }\n`;
      code += `}\n`;
    }

    this.showExportDialog(code, format);
  }

  componentToSwiftUI(c) {
    switch (c.type) {
      case 'Button': return `            Button("${this.esc(c.props.text)}") { }\n                .frame(width: ${c.w}, height: ${c.h})\n                .background(Color(hex: "${c.props.bg}"))\n                .foregroundColor(.white)\n                .cornerRadius(8)\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'Label': return `            Text("${this.esc(c.props.text)}")\n                .font(.system(size: ${c.props.fontSize}))\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'TextField': return `            TextField("${this.esc(c.props.placeholder)}", text: .constant(""))\n                .frame(width: ${c.w}, height: ${c.h})\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'ImageView': return `            Image(systemName: "photo")\n                .frame(width: ${c.w}, height: ${c.h})\n                .background(Color.gray.opacity(0.2))\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'Switch': return `            Toggle("", isOn: .constant(${c.props.on}))\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'Slider': return `            Slider(value: .constant(${c.props.value}))\n                .frame(width: ${c.w})\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'View': return `            Rectangle()\n                .fill(Color(hex: "${c.props.bg}"))\n                .frame(width: ${c.w}, height: ${c.h})\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      case 'ProgressView': return `            ProgressView(value: ${c.props.progress})\n                .frame(width: ${c.w})\n                .position(x: ${c.x + c.w/2}, y: ${c.y + c.h/2})`;
      default: return `            // ${c.type} at (${c.x}, ${c.y}) ${c.w}x${c.h}`;
    }
  }

  componentToUIKit(c) {
    const v = c.type.charAt(0).toLowerCase() + c.type.slice(1).replace(' ', '');
    switch (c.type) {
      case 'Button': return `let ${v}${c.id} = UIButton(type: .system)\n        ${v}${c.id}.setTitle("${this.esc(c.props.text)}", for: .normal)\n        ${v}${c.id}.frame = CGRect(x: ${c.x}, y: ${c.y}, width: ${c.w}, height: ${c.h})\n        view.addSubview(${v}${c.id})`;
      case 'Label': return `let ${v}${c.id} = UILabel()\n        ${v}${c.id}.text = "${this.esc(c.props.text)}"\n        ${v}${c.id}.frame = CGRect(x: ${c.x}, y: ${c.y}, width: ${c.w}, height: ${c.h})\n        view.addSubview(${v}${c.id})`;
      case 'TextField': return `let ${v}${c.id} = UITextField()\n        ${v}${c.id}.placeholder = "${this.esc(c.props.placeholder)}"\n        ${v}${c.id}.borderStyle = .roundedRect\n        ${v}${c.id}.frame = CGRect(x: ${c.x}, y: ${c.y}, width: ${c.w}, height: ${c.h})\n        view.addSubview(${v}${c.id})`;
      default: return `// ${c.type} at (${c.x}, ${c.y}) ${c.w}x${c.h}`;
    }
  }

  showExportDialog(code, format) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay visible';
    dialog.innerHTML = `
      <div class="modal-dialog" style="min-width:600px;">
        <div class="modal-header">📤 Export ${format === 'swiftui' ? 'SwiftUI' : 'UIKit'} Code</div>
        <div class="modal-body">
          <pre style="background:var(--bg-primary);border-radius:8px;padding:12px;font-family:var(--mono-font);font-size:12px;color:var(--text-primary);overflow:auto;max-height:400px;white-space:pre-wrap;">${this.esc(code)}</pre>
        </div>
        <div class="modal-footer">
          <button class="modal-btn" onclick="this.closest('.modal-overlay').remove()">Close</button>
          <button class="modal-btn primary" onclick="navigator.clipboard.writeText(\`${code.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`).then(()=>app.notifications.toast('Copied!','success'))">Copy</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
  }

  async aiGenerate() {
    const prompt = prompt('Describe the UI you want to build:', 'A login form with email field, password field, and a login button');
    if (!prompt) return;

    this.app.notifications.toast('Asking GLM to generate UI...', 'info');
    this.app.log('console', `AI Interface Builder: "${prompt}"`, 'info');

    try {
      const messages = [{
        role: 'system',
        content: 'You are a UI layout generator. Return ONLY a JSON array of components. Each component: {type, x, y, w, h, props}. Types: Button, Label, TextField, View, Switch, Slider, ImageView. Canvas size: 375x812. Use the prompt to create an appropriate layout.'
      }, { role: 'user', content: prompt }];

      const result = await this.app.glm.chat(messages, { temperature: 0.3 });
      let jsonStr = result.content.trim();
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (match) jsonStr = match[0];
      const newComps = JSON.parse(jsonStr);

      this.components = [];
      for (const c of newComps) {
        this.components.push({ id: ++this._idCounter, ...c, props: c.props || {} });
      }
      this.render();
      this.app.notifications.toast(`Generated ${newComps.length} components!`, 'success');
    } catch (err) {
      this.app.notifications.toast('AI generation failed: ' + err.message, 'error');
    }
  }

  snap(val) { return Math.round(val / this.snapGrid) * this.snapGrid; }
  esc(text) { const d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }
}
