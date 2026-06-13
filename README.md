# 🧑‍💻 AI-Xcode — GLM-Powered IDE

> A fully-featured web-based IDE inspired by Apple Xcode, with deep GLM AI integration **and a Codex-style Agent Loop** for autonomous code modification.

![Version](https://img.shields.io/badge/AI--Xcode-v2.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![GLM](https://img.shields.io/badge/AI-GLM--4--Plus-orange) ![Agent](https://img.shields.io/badge/Agent-Loop-red)

## 🆕 v2.0 — Codex-Inspired Agent Mode

Based on reverse-engineering [OpenAI Codex CLI](https://github.com/openai/codex) (90K★), we added:

| Feature | Inspired By | Description |
|---------|-------------|-------------|
| 🤖 **Agent Loop** | Codex Agent Loop | AI autonomously iterates: reason → call tool → execute → repeat |
| 🧠 **Reasoning Chain** | Codex reasoning_content | Shows AI's thinking process in collapsible purple blocks |
| 📦 **Context Compaction** | Codex /compact | Auto-summarizes when context exceeds threshold |
| 🔧 **Tool Call Visualization** | Codex tool steps | Each tool call shown with icon, args, result, status |
| ✏️ **File Patching** | Codex patch_file | Surgical find-and-replace (not full overwrite) |
| 🔒 **Approval Modes** | Codex approval config | manual / suggest / auto modes for destructive ops |
| 📋 **AGENTS.md** | Codex AGENTS.md | Hierarchical project config loaded into system prompt |
| 🎚 **Reasoning Effort** | Codex effort levels | low / medium / high thinking depth |
| 📊 **Token Tracking** | Codex usage tracking | Real-time token/request/iteration counters |
| 📜 **Command History** | Shell ↑↓ | ArrowUp/Down to recall previous AI messages |
| 🖼 **Image Paste** | Codex multimodal | Paste images into AI chat for visual context |

## ✨ Full Feature List

### Xcode Feature Parity
- 📝 Monaco Editor (syntax highlighting, minimap, multi-tab)
- 📁 Project Navigator (file tree with CRUD)
- 🔍 Symbol Navigator (12+ languages)
- 🔎 Search Navigator (regex, replace)
- ⚠️ Issue Navigator
- 🧪 Test Navigator
- 🐛 Debug Navigator (breakpoints, call stack, variables)
- 📐 Interface Builder (drag-drop UI designer, SwiftUI/UIKit export)
- 📋 Inspector Panel (attributes, quick help, identity)
- 🔧 Build System (simulated pipeline)
- 🖥 Terminal (pseudo-terminal)
- 🎨 Git Integration (diff, commit)
- 🎯 Command Palette (Cmd+Shift+P)
- 🌗 Dark/Light themes

### AI Features (GLM-Powered)
- 💬 AI Chat (streaming, context-aware)
- 🤖 Agent Mode (autonomous tool-calling loop)
- ✨ Inline Completion (ghost text)
- 📖 Explain / 🐛 Find Bugs / ♻️ Refactor
- 🧪 Generate Tests / 📝 Generate Docs / 🔍 Code Review
- 🤖 AI UI Generation (describe → Interface Builder layout)

## 🚀 Quick Start

```bash
git clone https://github.com/SunArthur86/ai-xcode.git
cd ai-xcode
python3 -m http.server 8099
# Open http://localhost:8099
```

Click **⚙️ Settings** → enter GLM API Key → Save.

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘⇧P` | Command Palette |
| `⌘R` | Run / Build |
| `⌘N` | New File |
| `⌘S` | Save |
| `⌘,` | Settings |
| `⌘0` | Toggle Navigator |
| `⌃⌘A` | Toggle AI Panel |
| `↑↓` (in AI input) | Command History |

## 🏗 Architecture (18 modules, 12K+ lines)

```
ai-xcode/
├── index.html
├── css/main.css                 # Apple Design Language themes
├── js/
│   ├── app.js                   # Main controller (740 lines)
│   ├── ai/
│   │   ├── api.js               # GLM API client (929 lines)
│   │   ├── chat.js              # AI chat with streaming (1084 lines)
│   │   ├── agent-loop.js  🆕    # Codex-style agent loop (653 lines)
│   │   └── agent-panel.js 🆕    # Agent UI: reasoning, tools, diffs (395 lines)
│   ├── editor/editor-manager.js # Monaco wrapper (851 lines)
│   ├── navigator/               # Project/Symbol/Search navigators
│   ├── builder/build-system.js  # Build pipeline simulation
│   ├── debugger/debugger.js     # Debug UI
│   ├── ui/                      # Inspector, Command Palette, Interface Builder
│   ├── project/                 # VFS (IndexedDB), Git UI
│   └── utils/helpers.js         # Notifications + utilities
└── docs/plans/
    ├── implementation-plan.md
    └── codex-comparison.md      # Codex vs AI-Xcode analysis
```

## 📊 Codex CLI vs AI-Xcode Comparison

| Feature | Codex CLI | AI-Xcode v2.0 |
|---------|-----------|---------------|
| Agent Loop | ✅ Core | ✅ 8 tools, 25 iterations max |
| Reasoning Display | ✅ | ✅ Collapsible blocks |
| Context Compaction | ✅ Auto | ✅ Auto-summarize |
| Tool Visualization | ✅ | ✅ Timeline with status |
| File Patching | ✅ | ✅ Surgical patch_file |
| Approval Modes | ✅ | ✅ manual/suggest/auto |
| AGENTS.md | ✅ Hierarchical | ✅ Loaded into prompt |
| Reasoning Effort | ✅ | ✅ low/medium/high |
| Token Tracking | ✅ | ✅ Stats API |
| MCP Support | ✅ | 🚧 Planned |
| Sandbox | ✅ Network isolation | N/A (browser sandbox) |
| IDE Features | ❌ CLI only | ✅ Full Xcode-like IDE |

## 📄 License

MIT License

---

Built with ❤️ using Hermes Agent + GLM-4-Plus
