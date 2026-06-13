# Codex CLI vs AI-Xcode 对比分析 + 优化计划

## 核心架构对比

| 维度 | Codex CLI (Rust, 90K★) | AI-Xcode v1.0 | 差距等级 |
|------|----------------------|---------------|---------|
| **Agent Loop** (AI自动迭代调用工具) | ✅ 核心循环: 推理→工具调用→执行→追加→再推理 | ❌ 无 | 🔴 Critical |
| **Reasoning Chain** (展示思考过程) | ✅ 显示reasoning类型输出 | ❌ 无 | 🔴 Critical |
| **Context Compaction** (上下文压缩) | ✅ 自动compact超阈值时触发 | ❌ 无 | 🔴 Major |
| **Tool Call 可视化** | ✅ 每步工具调用都有UI | ❌ 无 | 🔴 Major |
| **File Patching** (精确补丁) | ✅ 应用surgical patch | ❌ 只能全替换 | 🟡 Major |
| **Diff Viewer** (差异查看) | ✅ 内联红绿diff | ⚠️ 基础git diff | 🟡 Minor |
| **Approval 模式** | ✅ manual/suggest/auto | ❌ 无 | 🟡 Medium |
| **Prompt Caching** | ✅ 前缀匹配优化 | ❌ 无 | 🟢 Minor(浏览器端) |
| **Sandbox 隔离** | ✅ 网络隔离+文件限制 | N/A(浏览器沙箱) | ⚪ N/A |
| **AGENTS.md** | ✅ 层级配置 | ❌ 无 | 🟡 Medium |
| **MCP 工具系统** | ✅ 完整MCP支持 | ❌ 无 | 🟡 Medium |
| **Reasoning Effort** | ✅ low/medium/high | ❌ 无 | 🟡 Medium |
| **Token 使用追踪** | ✅ 精确显示 | ⚠️ 粗略 | 🟢 Minor |
| **多模态输入** | ✅ 图片输入 | ❌ 无 | 🟡 Medium |
| **命令历史** | ✅ ↑↓回忆 | ❌ 无 | 🟢 Minor |
| **线程/会话管理** | ✅ 完整thread | ⚠️ 基础 | 🟢 Minor |

## 优化优先级 (逐项执行)

### 🔴 P0 — 核心Agent行为 (必须实现)
1. **Agent Loop**: AI能自动迭代执行工具(读文件/写文件/搜索)
2. **Reasoning Chain**: 展示AI思考过程(thinking面板)
3. **Context Compaction**: 自动压缩超长上下文

### 🔴 P1 — 工具系统 (重要)
4. **Tool Call 可视化**: 每步展示工具名+参数+结果
5. **File Patching**: AI精确补丁(非全量替换)
6. **Diff Viewer**: 应用前后对比

### 🟡 P2 — 用户体验 (增强)
7. **Approval 模式**: AI操作前需用户确认
8. **AGENTS.md 支持**: 读取项目配置文件
9. **Token 追踪面板**: 精确显示消耗
10. **Reasoning Effort**: 可调思考深度

### 🟡 P3 — 多模态+高级
11. **图片粘贴**: 多模态输入
12. **命令历史**: ↑↓回忆
13. **自定义工具注册**: 类MCP工具系统
