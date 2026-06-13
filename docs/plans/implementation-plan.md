# AI-Xcode (GLM-Powered IDE) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a fully-featured web-based IDE inspired by Apple Xcode, with deep GLM AI integration for code generation, completion, explanation, debugging, and refactoring.

**Architecture:** Single-page application using vanilla JS + Monaco Editor + GLM API. No build tools — everything runs in the browser. Virtual file system backed by IndexedDB for persistence.

**Tech Stack:** HTML5, CSS3 (Apple Design Language), Vanilla ES6+ Modules, Monaco Editor (CDN), GLM-4+ API, IndexedDB, Font Awesome icons.

---

## Xcode Feature Matrix → Implementation Mapping

| Xcode Feature | Our Implementation | Status |
|---|---|---|
| Source Editor | Monaco Editor with multi-tab, minimap, syntax highlighting | Phase 2 |
| Project Navigator | Virtual file tree with CRUD operations | Phase 2 |
| Symbol Navigator | AST-based class/function/variable tree | Phase 8 |
| Search Navigator | Global find & replace with regex | Phase 8 |
| Issue Navigator | Build errors + AI-detected issues | Phase 5 |
| Test Navigator | Test runner with pass/fail UI | Phase 10 |
| Debug Navigator | Breakpoints, call stack, variable inspector | Phase 6 |
| Breakpoint Navigator | Breakpoint management panel | Phase 6 |
| Interface Builder | Canvas-based drag-and-drop UI designer | Phase 7 |
| Inspector Panel | File attributes, quick help, identity | Phase 9 |
| Debug Area | Console output, variable watch | Phase 6 |
| Build System | Simulated build pipeline with console | Phase 5 |
| AI Assistant (NEW) | GLM-powered chat sidebar | Phase 3 |
| AI Completion (NEW) | Inline ghost-text suggestions via GLM | Phase 4 |
| AI Fix-it (NEW) | Auto-detect & fix issues | Phase 4 |
| Command Palette | Cmd+Shift+P fuzzy command search | Phase 8 |
| Toolbar | Run/Stop, scheme selector, AI toggle | Phase 1 |
| Themes | Dark (default) + Light + Custom | Phase 10 |
| Git Integration | Branch status, diff viewer, commit | Phase 10 |
| Asset Catalog | Image/file management | Phase 10 |
| Settings | Model config, keybindings, preferences | Phase 10 |
