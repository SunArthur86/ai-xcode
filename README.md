# 🧑‍💻 AI-Xcode — GLM-Powered IDE

> A fully-featured web-based IDE inspired by Apple Xcode, with deep GLM AI integration for code generation, completion, explanation, debugging, and refactoring.

![AI-Xcode IDE](https://img.shields.io/badge/AI--Xcode-v1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![GLM](https://img.shields.io/badge/AI-GLM--4--Plus-orange) ![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success)

## ✨ Features

### Xcode Feature Parity

| Feature | Status | Description |
|---------|--------|-------------|
| 📝 **Source Editor** | ✅ | Monaco Editor with syntax highlighting, minimap, multi-tab editing |
| 📁 **Project Navigator** | ✅ | Full file tree with create/rename/delete/duplicate |
| 🔍 **Symbol Navigator** | ✅ | AST-based class/function/variable tree (12+ languages) |
| 🔎 **Search Navigator** | ✅ | Global find & replace with regex, case-sensitive, whole word |
| ⚠️ **Issue Navigator** | ✅ | Build errors + AI-detected issues |
| 🧪 **Test Navigator** | ✅ | Test runner with pass/fail indicators |
| 🐛 **Debug Navigator** | ✅ | Breakpoints, call stack, variable inspector |
| 🔴 **Breakpoint Navigator** | ✅ | Breakpoint management with enable/disable |
| 📐 **Interface Builder** | ✅ | Canvas-based drag-and-drop UI designer with SwiftUI/UIKit export |
| 📋 **Inspector Panel** | ✅ | File attributes, quick help, identity, attributes |
| 🔧 **Build System** | ✅ | Simulated build pipeline with console output |
| 🖥 **Terminal** | ✅ | Integrated pseudo-terminal with command execution |
| 🎨 **Git Integration** | ✅ | Branch status, diff viewer, commit dialog |
| 🎯 **Command Palette** | ✅ | Cmd+Shift+P fuzzy command search |
| 🌗 **Themes** | ✅ | Dark (Xcode default) + Light |

### AI Features (GLM-Powered)

| Feature | Status | Description |
|---------|--------|-------------|
| 💬 **AI Chat** | ✅ | Streaming chat with GLM-4-Plus, context-aware |
| ✨ **Inline Completion** | ✅ | Ghost-text code suggestions via GLM-4-Flash |
| 📖 **Explain Code** | ✅ | AI-powered code explanation |
| 🐛 **Find Bugs** | ✅ | AI bug detection with fix suggestions |
| ♻️ **Refactor** | ✅ | AI refactoring with apply button |
| 🧪 **Generate Tests** | ✅ | AI test case generation |
| 📝 **Generate Docs** | ✅ | AI documentation generation |
| 🔍 **Code Review** | ✅ | AI code review with scoring |
| 🤖 **AI UI Generation** | ✅ | Describe UI → AI generates Interface Builder layout |

## 🚀 Quick Start

### Option 1: Direct Open
```bash
# Clone the repo
git clone https://github.com/SunArthur86/ai-xcode.git
cd ai-xcode

# Open in browser (any modern browser)
open index.html  # macOS
xdg-open index.html  # Linux
```

### Option 2: Local Server (Recommended)
```bash
cd ai-xcode
python3 -m http.server 8099
# Open http://localhost:8099
```

### Configure GLM API
1. Click the **Settings** button (⚙️) in the toolbar
2. Enter your GLM API Key from [open.bigmodel.cn](https://open.bigmodel.cn)
3. Select your preferred model (GLM-4-Plus recommended)
4. Click **Save**

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘N` | New File |
| `⌘S` | Save |
| `⌘W` | Close Tab |
| `⌘R` | Run / Build |
| `⌘.` | Stop |
| `⌘,` | Settings |
| `⌘0` | Toggle Navigator |
| `⌃⌘0` | Toggle Inspector |
| `⌃⌘A` | Toggle AI Panel |
| `⌘⇧Y` | Toggle Debug Area |
| `⌘⇧P` | Command Palette |
| `⌘⇧F` | Global Search |
| `⌘1-8` | Switch Navigators |

## 🏗 Architecture

```
ai-xcode/
├── index.html                 # Main entry point
├── css/
│   └── main.css               # 500+ lines, Apple Design Language
├── js/
│   ├── app.js                 # Main application controller
│   ├── editor/
│   │   └── editor-manager.js  # Monaco Editor wrapper (852 lines)
│   ├── navigator/
│   │   ├── file-tree.js       # Project navigator (file tree)
│   │   ├── symbol-navigator.js # Symbol navigator (12+ languages)
│   │   └── search.js          # Search navigator with replace
│   ├── ai/
│   │   ├── api.js             # GLM API client (929 lines)
│   │   └── chat.js            # AI chat panel with streaming
│   ├── builder/
│   │   └── build-system.js    # Build pipeline simulation
│   ├── debugger/
│   │   └── debugger.js        # Debug UI (breakpoints, variables)
│   ├── ui/
│   │   ├── inspector-panel.js # Right sidebar inspector
│   │   ├── command-palette.js # Cmd+Shift+P palette
│   │   └── interface-builder.js # Visual UI designer
│   ├── project/
│   │   ├── file-system.js     # IndexedDB virtual file system
│   │   └── git.js             # Git UI simulation
│   └── utils/
│       └── helpers.js         # NotificationManager + utilities
├── assets/
├── docs/
│   └── plans/
└── README.md
```

### Tech Stack

- **Vanilla ES6+ Modules** — Zero framework dependencies
- **Monaco Editor** (CDN) — VS Code's editor engine
- **GLM-4-Plus API** — Zhipu AI for all AI features
- **IndexedDB** — Project persistence (survives page reload)
- **Font Awesome** (CDN) — Icon system
- **CSS Custom Properties** — Theming system

## 📸 Screenshots

### Main IDE View
- Dark theme Xcode-style layout
- File tree (left) + Editor (center) + Inspector (right) + AI Chat (far right)
- Bottom panel with Console / Build / Debug / Terminal tabs

### AI Chat
- Streaming responses from GLM-4-Plus
- Quick actions: Explain, Find Bugs, Refactor, Tests, Review, Docs
- Context-aware (includes active file's code context)

### Interface Builder
- 17 component types (Button, Label, TextField, Switch, Slider, etc.)
- Drag-and-drop from component library
- Property inspector with live editing
- Export to SwiftUI or UIKit code
- AI UI generation (describe → generate layout)

## 🔧 Configuration

### GLM Models Supported

| Model | Use Case | Speed |
|-------|----------|-------|
| `glm-4-plus` | Best quality, complex tasks | Medium |
| `glm-4` | Standard tasks | Fast |
| `glm-4-flash` | Code completion, quick tasks | Fastest |
| `glm-4-long` | Long context (>8K tokens) | Medium |

### Editor Settings
- Font size, tab size, word wrap, minimap toggle
- Theme: Dark (default) or Light
- Auto-completion toggle

## 🧩 File Structure

The IDE ships with a sample Swift project (`MyApp`):
```
MyApp/
├── AppDelegate.swift       # App lifecycle
├── ContentView.swift       # Root SwiftUI view
├── Models/
│   └── User.swift          # User model
├── Views/
│   ├── LoginView.swift     # Login screen
│   └── DashboardView.swift # Dashboard
├── Tests/
│   └── MyAppTests.swift    # Unit tests
├── Assets/
│   └── AppIcon             # App icon placeholder
├── Info.plist              # App configuration
└── README.md               # Project docs
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License — feel free to use this project for any purpose.

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) by Microsoft
- [GLM / Zhipu AI](https://open.bigmodel.cn) for AI capabilities
- Design inspired by Apple Xcode
- Font Awesome for icons

---

Built with ❤️ using Hermes Agent + GLM-4-Plus
