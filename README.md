# AI-Xcode IDE

> GLM-Powered Web IDE — Apple Xcode Design Language

纯前端实现的 Web 版 IDE，内置 GLM 大模型驱动，完整复刻 Xcode 所有核心功能。

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-3.0-green)

## ✨ v3.0 新增 50 个功能

### 编辑器增强 (10)
- 🔍 Find & Replace (Ctrl+F / Ctrl+H)
- 📑 Go to Line (Ctrl+G)
- 🖱️ Multi-cursor 编辑提示
- 🔍 Editor Zoom (Ctrl+= / Ctrl+-)
- 📂 Code Folding 控制 (Fold All / Unfold All)
- 🎨 Bracket Pair Colorization
- 💡 Selection Highlight
- 📝 Word Wrap Toggle (点击状态栏语言)
- 🖐️ Drag & Drop Text
- 📌 Sticky Scroll

### AI 能力增强 (10)
- 💬 对话历史面板 (localStorage 持久化)
- ⏹️ 流式响应 Cancel 按钮
- 📋 代码块一键 Copy
- 🔄 消息重新生成
- 🌡️ 面板内 Temperature 滑块
- 🔀 模型快速切换下拉菜单
- 📚 Prompt 模板库 (6 种常用模板)
- 🔀 Diff Preview (代码变更预览)
- 📊 Token 使用统计
- 📤 对话导出为 Markdown

### 项目与文件管理 (10)
- 🔍 文件过滤器 (实时过滤树)
- 🕐 最近文件列表 (带时间戳)
- 🍞 文件路径面包屑导航
- 📦 项目模板 (SwiftUI / CLI / Framework / Empty)
- 📤 项目导出为 JSON
- 📥 项目导入
- 💡 文件信息 Hover Tooltip
- ☑️ 批量文件操作 (多选删除/移动)
- 📊 项目统计仪表板
- 🎨 主题自适应图标

### UI/UX 打磨 (10)
- 🧘 Zen Mode (F11 全屏编辑)
- ⌨️ 快捷键帮助面板 (Shift+?)
- 🔗 状态栏可点击跳转
- ⏳ 加载动画指示器
- ✨ Tab 创建动画
- 📏 可拖拽面板边界调整
- 📋 增强的右键菜单 (Duplicate Line / Sort Lines)
- 🗺️ Minimap 快速切换
- 💾 Auto-Save 自动保存指示
- ↔️ Split Editor 分屏编辑

### 开发者工具 (10)
- 🗂️ Snippet Manager (代码片段管理)
- 🔍 Regex Tester (正则表达式测试)
- 🎨 Color Picker (颜色选择器)
- 📋 JSON Formatter (格式化/压缩/验证)
- 🔐 Base64 Encoder/Decoder
- 📝 Markdown Live Preview
- 🌐 REST API Tester (迷你 Postman)
- ⏰ Cron Expression Builder
- #️⃣ Hash Generator (MD5 / SHA-1 / SHA-256)
- 📊 Code Metrics Dashboard (代码度量)

## 🏗️ 架构

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Vanilla ES6+ Modules | 零框架依赖 |
| 编辑器 | Monaco Editor 0.45 (CDN) | VSCode 同款编辑器 |
| 持久化 | IndexedDB + localStorage | 文件系统 + 配置 |
| AI | GLM-4-Plus / GLM-4-Flash | 聊天 + 补全 + Agent Loop |
| 主题 | CSS Variables | 深色/浅色双主题 |

## 📁 项目结构

```
ai-xcode/
├── index.html              # HTML 入口
├── css/main.css            # Apple Design Language 主题
├── js/
│   ├── app.js              # 主控制器 (1473行)
│   ├── ai/
│   │   ├── api.js          # GLM API Client (929行)
│   │   ├── chat.js         # AI Chat (1726行)
│   │   ├── agent-loop.js   # Agent Loop (653行)
│   │   └── agent-panel.js  # Agent UI (395行)
│   ├── editor/
│   │   └── editor-manager.js # Monaco 封装 (984行)
│   ├── navigator/
│   │   ├── file-tree.js    # 文件树 (859行)
│   │   ├── search.js       # 全局搜索 (799行)
│   │   └── symbol-navigator.js # 符号导航 (583行)
│   ├── ui/
│   │   ├── command-palette.js # Cmd+Shift+P (436行)
│   │   ├── inspector-panel.js # Inspector (536行)
│   │   ├── interface-builder.js # UI 设计器 (474行)
│   │   └── dev-tools.js    # 10种开发者工具 (551行)
│   ├── builder/
│   │   └── build-system.js # 模拟构建 (467行)
│   ├── debugger/
│   │   └── debugger.js     # 调试器 (735行)
│   ├── project/
│   │   ├── file-system.js  # VFS (1392行)
│   │   └── git.js          # Git UI (213行)
│   └── utils/
│       └── helpers.js      # 工具函数 (356行)
├── docs/plans/             # 计划文档
└── README.md
```

## 🚀 快速开始

```bash
# 本地运行
cd ai-xcode
python3 -m http.server 8099
# 打开 http://localhost:8099

# 设置 GLM API Key
# 点击 "Set API Key" 按钮输入你的 GLM API Key
```

## 📊 统计

- **24 个文件，15,708 行代码**
- **166 项功能测试全通过**
- **10 轮压力测试 98.6% 可靠性**
- **66 项 v3.0 新功能测试全通过**
- **0 JavaScript 错误**

## 🔧 配置

| 设置 | 默认值 | 说明 |
|---|---|---|
| Chat Model | glm-4-plus | 聊天/推理模型 |
| Completion Model | glm-4-flash | 代码补全模型 |
| Temperature | 0.7 | AI 创造性 |
| Theme | Dark | 深色/浅色 |
| Font Size | 14px | 编辑器字号 |
| Tab Size | 4 | 缩进宽度 |
| Auto-Save | On | 2秒无编辑自动保存 |

## ⌨️ 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+,` | Settings |
| `Ctrl+S` | Save |
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `Ctrl+G` | Go to Line |
| `Ctrl+=` / `Ctrl+-` | Zoom In/Out |
| `F11` | Zen Mode |
| `Shift+?` | Keyboard Shortcuts Help |

## 📄 License

MIT
