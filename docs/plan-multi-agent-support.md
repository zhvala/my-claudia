# Multi-Agent / Sub-Agent / Workflow 支持规划

## 现状分析

### 已有基础设施

| 能力 | 位置 | 状态 |
|------|------|------|
| Agent 发现 | `SystemInfo.agents?: string[]` (`shared/src/index.ts:466`) | 仅展示名称列表 |
| Agent 斜杠命令 | `PROVIDER_COMMANDS` 中的 `/agents` | 透传到 CLI |
| 并发 Run 跟踪 | `activeRuns: Map<string, ActiveRun>` (`server/src/server.ts:133`) | 支持多 run 并存，但无父子关系 |
| 权限审批链路 | `PermissionRequest` → `PermissionDecision` | 面向用户，不支持 agent 间审批 |
| Session 恢复 | `sdkOptions.resume = sessionId` (`providers/claude-sdk.ts:144`) | 支持单 session 恢复 |
| 多 Provider 支持 | `ProviderConfig` (claude/cursor/codex/custom) | 不同 agent 可用不同 provider |
| Gateway 多后端路由 | `gateway/src/server.ts` | 路由消息到不同后端 |
| 消息协议 (Correlation) | `shared/src/protocol/correlation.ts` | 请求-响应信封格式 |
| 工具调用追踪 | `toolUseId` + `toolUseIdToName` Map | 每次工具调用有唯一ID |

### 核心缺失

当前架构本质上是 **1 User → 1 Session → 1 Run** 的线性模型。用户发一条消息，启动一次 `runClaude()`，等待完成。不支持：

- 一次 Run 内部 spawn 子 Agent
- Agent 之间相互通信
- 声明式 Workflow 定义
- Agent 运行树/谱系追踪
- Agent 级别的资源限制与权限隔离

---

## 需要完成的工作

### 第一层：数据模型与类型定义

#### 1.1 Agent 定义模型

**目的**：让系统知道有哪些 agent、每个 agent 的能力边界。

```typescript
// shared/src/index.ts 新增

interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'custom' | 'mcp';  // 来源
  capabilities: string[];               // 允许使用的工具列表
  systemPrompt?: string;                // agent 专属 system prompt
  maxDepth: number;                     // 最大嵌套深度
  maxConcurrentChildren: number;        // 最大并发子 agent 数
  providerConfigId?: string;            // 可绑定特定 provider
  metadata?: Record<string, unknown>;
}
```

**需要修改的文件**：
- `shared/src/index.ts` — 类型定义
- `server/src/storage/db.ts` — 新建 `agents` 表
- `server/src/repositories/` — 新建 `AgentRepository`

#### 1.2 Agent Run 模型（运行实例）

**目的**：追踪每个 agent 的执行状态、形成 run tree。

```typescript
interface AgentRun {
  id: string;
  agentId: string;
  parentRunId: string | null;   // null = 顶层 run
  rootRunId: string;            // 整棵树的根
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: unknown;
  output: unknown;
  depth: number;                // 在树中的深度
  startedAt: number;
  completedAt?: number;
  tokenUsage?: { input: number; output: number };
  error?: string;
}
```

**需要修改的文件**：
- `shared/src/index.ts` — 类型定义
- `server/src/storage/db.ts` — 新建 `agent_runs` 表
- `server/src/repositories/` — 新建 `AgentRunRepository`

#### 1.3 Workflow 定义模型

**目的**：支持声明式 workflow，定义 agent 的编排关系。

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  projectId: string;
  // DAG 节点定义
  steps: WorkflowStep[];
  // 边定义（依赖关系）
  edges: WorkflowEdge[];
  variables?: Record<string, unknown>;  // 全局变量
}

interface WorkflowStep {
  id: string;
  agentId: string;
  name: string;
  inputMapping?: Record<string, string>;   // 从上游步骤映射输入
  outputMapping?: Record<string, string>;  // 输出字段映射
  condition?: string;                       // 条件表达式（是否执行）
  retryPolicy?: { maxRetries: number; backoffMs: number };
}

interface WorkflowEdge {
  from: string;  // step id
  to: string;    // step id
  condition?: string;  // 条件边
}
```

**需要修改的文件**：
- `shared/src/index.ts` — 类型定义
- `server/src/storage/db.ts` — 新建 `workflows`、`workflow_steps`、`workflow_edges` 表
- `server/src/repositories/` — 新建 `WorkflowRepository`

---

### 第二层：协议与消息扩展

#### 2.1 新增 WebSocket 消息类型

当前 `ClientMessage` 和 `ServerMessage` 需要扩展以下消息类型：

```typescript
// === Client → Server ===

// 启动 workflow
interface WorkflowStartMessage {
  type: 'workflow_start';
  workflowId: string;
  sessionId: string;
  input: unknown;
  permissionMode: PermissionMode;
}

// 手动 spawn 一个 agent
interface AgentSpawnMessage {
  type: 'agent_spawn';
  agentId: string;
  sessionId: string;
  parentRunId?: string;
  input: unknown;
}

// 取消 agent（级联取消子 agent）
interface AgentCancelMessage {
  type: 'agent_cancel';
  agentRunId: string;
  cascade: boolean;   // 是否级联取消所有子 agent
}

// 查询 agent 运行状态
interface AgentStatusQueryMessage {
  type: 'agent_status_query';
  agentRunId?: string;     // 指定查询某个 run
  sessionId?: string;      // 查询 session 下所有 run
}

// === Server → Client ===

// Agent 运行状态变更通知
interface AgentRunUpdateMessage {
  type: 'agent_run_update';
  agentRun: AgentRun;
}

// Workflow 状态变更通知
interface WorkflowUpdateMessage {
  type: 'workflow_update';
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  completedSteps: string[];
  runningSteps: string[];
  pendingSteps: string[];
}

// Agent spawn 事件（子 agent 被创建时通知 UI）
interface AgentSpawnedMessage {
  type: 'agent_spawned';
  parentRunId: string;
  childRun: AgentRun;
}

// Agent 间消息传递（用于调试/可视化）
interface AgentMessageRelayMessage {
  type: 'agent_message_relay';
  fromAgentRunId: string;
  toAgentRunId: string;
  content: unknown;
}
```

**需要修改的文件**：
- `shared/src/index.ts` — 消息类型定义
- `shared/src/protocol/correlation.ts` — 新请求/响应对

#### 2.2 扩展现有消息

现有的 `run_start` / `run_started` / `run_completed` 等消息需要新增字段：

```typescript
// RunStartPayload 扩展
interface RunStartPayload {
  // ... 现有字段
  agentId?: string;         // 使用哪个 agent
  parentRunId?: string;     // 父 run（sub-agent 场景）
  context?: AgentContext;   // 上游传递的上下文
}

// RunCompletedPayload 扩展
interface RunCompletedPayload {
  // ... 现有字段
  agentRunId?: string;
  output?: unknown;         // 结构化输出（供下游 agent 消费）
}
```

**需要修改的文件**：
- `shared/src/index.ts`
- `server/src/server.ts` — `handleRunStart()` 处理逻辑

---

### 第三层：服务端编排引擎

#### 3.1 Agent 执行器（AgentExecutor）

**目的**：封装单个 agent 的运行生命周期，替代当前直接调用 `runClaude()`。

```
server/src/agents/
├── agent-executor.ts      # 单 agent 执行器
├── agent-registry.ts      # agent 注册与发现
├── agent-context.ts       # agent 运行上下文
└── index.ts
```

核心职责：
- 根据 `AgentDefinition` 配置 SDK 调用参数
- 管理 agent 的生命周期（pending → running → completed/failed）
- 传递 agent 上下文（父 run 结果、全局变量）
- 限制工具使用范围（基于 `capabilities`）
- token 用量追踪

#### 3.2 Sub-Agent 生成机制

**关键问题**：当一个 agent 在运行过程中需要 spawn 子 agent 时，如何处理？

**方案 A：Tool-based spawning（推荐）**

将 "spawn agent" 作为一种特殊 tool，Agent 通过 tool_use 发起子 agent 调用：

```
Parent Agent: tool_use { toolName: "spawn_agent", toolInput: { agentId: "researcher", input: "..." } }
    → Server 拦截此 tool_use
    → Server 启动子 Agent 执行器
    → 子 Agent 完成后，将结果作为 tool_result 返回给父 Agent
Parent Agent: 收到 tool_result，继续推理
```

优点：
- 不需要修改 Claude SDK 的核心逻辑
- 对父 Agent 来说就是一次 tool call
- 自然支持嵌套
- 可以利用现有 permission 系统审批

缺点：
- 子 Agent 执行期间父 Agent 的 SDK session 处于等待状态
- 有超时风险

**方案 B：Parallel spawning**

父 Agent 的 run 暂停，spawn 多个子 Agent 并行运行，全部完成后汇总结果继续父 Agent。

需要额外的：
- Run 暂停/恢复机制
- 结果聚合逻辑
- 超时与失败处理

**需要新建的文件**：
- `server/src/agents/agent-executor.ts`
- `server/src/agents/agent-registry.ts`
- `server/src/agents/agent-context.ts`
- `server/src/agents/spawn-tool.ts` — spawn_agent 工具实现

**需要修改的文件**：
- `server/src/server.ts` — 消息路由，新增 agent spawn 处理
- `server/src/providers/claude-sdk.ts` — tool_use 拦截逻辑

#### 3.3 Workflow 编排引擎（WorkflowEngine）

**目的**：解析 Workflow DAG 定义，按依赖关系调度 agent 执行。

```
server/src/workflow/
├── workflow-engine.ts     # DAG 调度引擎
├── workflow-runner.ts     # 单次 workflow 执行实例
├── step-executor.ts       # 单步骤执行
├── condition-evaluator.ts # 条件表达式求值
└── index.ts
```

核心职责：
- 解析 DAG，计算拓扑序
- 并行执行无依赖关系的步骤
- 处理条件分支（if/else edge）
- 步骤失败时的重试与回滚策略
- 实时通知 UI 当前 workflow 进度
- 变量传递与映射

#### 3.4 Agent 间上下文传递

```typescript
interface AgentContext {
  // 来自父 agent 的信息
  parentOutput?: unknown;

  // 全局共享变量（workflow 级别）
  sharedVariables: Record<string, unknown>;

  // 消息历史摘要（避免传递全量历史）
  historySummary?: string;

  // 文件引用（已上传的文件 ID）
  fileReferences?: string[];

  // 运行约束
  constraints: {
    maxTokens?: number;
    maxDuration?: number;   // ms
    allowedTools?: string[];
  };
}
```

---

### 第四层：权限与安全

#### 4.1 Agent 级别权限策略

当前权限系统是 session 维度，需要细化到 agent 维度：

```typescript
interface AgentPermissionPolicy {
  agentId: string;
  // 工具级别
  allowedTools: string[];
  deniedTools: string[];
  // 能力级别
  canSpawnChildren: boolean;
  canAccessNetwork: boolean;
  canModifyFiles: boolean;
  canExecuteCommands: boolean;
  // 资源限制
  maxTokensPerRun: number;
  maxDurationPerRun: number;       // ms
  maxConcurrentChildren: number;
  maxDepth: number;
  // 审批策略
  requireUserApproval: 'always' | 'never' | 'on_sensitive_tools';
}
```

**需要修改的文件**：
- `shared/src/index.ts` — 类型定义
- `server/src/storage/db.ts` — `agent_permissions` 表
- `server/src/server.ts` — 权限检查逻辑注入

#### 4.2 级联取消与资源回收

当父 agent 被取消时：
1. 递归取消所有子 agent
2. 释放所有子 agent 的 AbortController
3. 清理 pending permissions
4. 更新所有子 run 状态为 `cancelled`
5. 通知 UI 更新

**需要修改的文件**：
- `server/src/server.ts` — `run_cancel` 处理逻辑
- `server/src/agents/agent-executor.ts` — 取消传播

#### 4.3 深度与循环保护

- 限制 agent 嵌套深度（防止递归 spawn 导致资源耗尽）
- 检测 agent 循环调用（A → B → A）
- 全局 token budget 控制

---

### 第五层：前端 UI

#### 5.1 Agent 运行树可视化

当前 UI 只展示一条线性消息流。多 agent 场景需要：

```
components/
├── agents/
│   ├── AgentTreeView.tsx       # 运行树视图（树状展开）
│   ├── AgentRunCard.tsx        # 单个 agent run 卡片
│   ├── AgentStatusBadge.tsx    # 状态标记 (running/completed/failed)
│   ├── AgentContextPanel.tsx   # 查看 agent 上下文/输出
│   └── WorkflowDiagram.tsx     # Workflow DAG 可视化
```

**关键 UI 需求**：
- 在聊天流中内嵌 agent spawn 事件卡片
- 可展开查看子 agent 的完整消息历史
- 实时显示各 agent 的运行状态
- 取消按钮支持级联/单独取消
- Workflow 进度条/DAG 图

#### 5.2 Agent 管理界面

```
components/
├── agents/
│   ├── AgentListPanel.tsx      # Agent 列表管理
│   ├── AgentConfigForm.tsx     # 创建/编辑 agent
│   ├── AgentPermissionEditor.tsx # 权限配置
│   └── WorkflowEditor.tsx      # Workflow 编辑器（可视化 DAG）
```

#### 5.3 前端状态管理

新增 Zustand store：

```typescript
// stores/agentStore.ts
interface AgentStore {
  // Agent 定义
  agents: AgentDefinition[];

  // 当前活跃的 agent runs（树结构）
  activeRuns: Map<string, AgentRun>;
  runTree: Map<string, string[]>;  // parentRunId → childRunIds

  // Workflow 状态
  activeWorkflows: Map<string, WorkflowStatus>;

  // Actions
  spawnAgent(agentId: string, input: unknown, parentRunId?: string): void;
  cancelAgent(agentRunId: string, cascade: boolean): void;
  startWorkflow(workflowId: string, input: unknown): void;
}
```

**需要新建的文件**：
- `apps/desktop/src/stores/agentStore.ts`
- `apps/desktop/src/components/agents/` — 所有 UI 组件

**需要修改的文件**：
- `apps/desktop/src/hooks/useUnifiedSocket.ts` — 处理新消息类型
- `apps/desktop/src/components/chat/` — 嵌入 agent 事件卡片

---

### 第六层：Gateway 层适配

#### 6.1 Agent 路由

当 agent 被配置为运行在不同 backend 上时（如：researcher agent 在 Backend A，coder agent 在 Backend B），Gateway 需要：

- 按 agent 配置将 spawn 请求路由到正确的 backend
- 跨 backend 转发 agent 间消息
- 聚合多 backend 的 agent 运行状态

**需要修改的文件**：
- `gateway/src/server.ts` — 新增 agent routing 逻辑
- `shared/src/index.ts` — Gateway 协议新增 agent 相关消息

#### 6.2 跨 Backend Agent 上下文传递

- 序列化 AgentContext 在 Gateway 层中转
- 文件引用跨 backend 的解析
- Token usage 跨 backend 的汇总

---

### 第七层：测试与可观测性

#### 7.1 测试

```
e2e/tests/
├── agent-spawn.spec.ts          # 子 agent 生成与完成
├── agent-cancellation.spec.ts   # 级联取消
├── workflow-execution.spec.ts   # Workflow DAG 执行
├── agent-permissions.spec.ts    # Agent 权限隔离
├── agent-resource-limits.spec.ts # 资源限制验证
```

**单元测试**：
- DAG 拓扑排序
- 条件表达式求值
- 上下文映射逻辑
- 循环检测

#### 7.2 可观测性

- Agent 运行日志（带 runId/parentRunId 关联）
- Token 用量按 agent 分维度统计
- Run 时长分布
- 失败率与重试率

---

## 工作量估算与优先级

| 阶段 | 工作项 | 优先级 | 涉及模块 |
|------|--------|--------|----------|
| **P0** | Agent 定义模型 + DB schema | 高 | shared, server |
| **P0** | Agent Run 模型 + 父子关系追踪 | 高 | shared, server |
| **P0** | AgentExecutor 基础实现 | 高 | server |
| **P0** | 扩展 `run_start` 支持 agentId | 高 | shared, server |
| **P1** | Tool-based sub-agent spawn 机制 | 高 | server |
| **P1** | Agent 权限策略 | 高 | shared, server |
| **P1** | 级联取消 | 中 | server |
| **P1** | 前端 Agent 运行树视图 | 中 | desktop |
| **P1** | 新 WebSocket 消息类型 | 中 | shared, server, desktop |
| **P2** | Workflow 定义模型 | 中 | shared, server |
| **P2** | Workflow DAG 引擎 | 中 | server |
| **P2** | Agent 管理界面 | 中 | desktop |
| **P2** | 前端 agentStore | 中 | desktop |
| **P3** | Workflow 可视化编辑器 | 低 | desktop |
| **P3** | Gateway agent 路由 | 低 | gateway |
| **P3** | 跨 backend agent 调度 | 低 | gateway |
| **P3** | Parallel agent spawning | 低 | server |
| **P3** | 条件分支与重试策略 | 低 | server |

---

## 建议实施路线

### MVP（最小可行版本）— 聚焦 Sub-Agent

仅实现 **Tool-based sub-agent spawn**，这是最简单且最实用的场景：

1. 定义 AgentDefinition / AgentRun 类型
2. 建 `agents` + `agent_runs` 表
3. 实现 AgentExecutor 封装 `runClaude()`
4. 在 tool_use 中拦截 `spawn_agent` 调用
5. 子 agent 完成后将结果作为 tool_result 返回
6. 前端展示 agent spawn 事件（可折叠卡片）
7. 基础权限检查（深度限制、工具白名单）

### V1 — 加入 Workflow

在 MVP 基础上：
1. Workflow 定义与存储
2. DAG 引擎实现顺序 + 并行调度
3. Workflow 进度通知 UI
4. Agent 管理页面

### V2 — 完整能力

1. Workflow 可视化编辑器
2. 条件分支与循环
3. Gateway 跨 backend agent 调度
4. 完整的可观测性
5. Agent marketplace（共享/导入 agent 定义）

---

## 文件变更清单汇总

### 新建文件

| 文件 | 用途 |
|------|------|
| `server/src/agents/agent-executor.ts` | Agent 执行器 |
| `server/src/agents/agent-registry.ts` | Agent 注册与发现 |
| `server/src/agents/agent-context.ts` | Agent 上下文管理 |
| `server/src/agents/spawn-tool.ts` | spawn_agent 工具实现 |
| `server/src/agents/index.ts` | 模块导出 |
| `server/src/workflow/workflow-engine.ts` | DAG 调度引擎 |
| `server/src/workflow/workflow-runner.ts` | Workflow 执行实例 |
| `server/src/workflow/step-executor.ts` | 步骤执行器 |
| `server/src/workflow/condition-evaluator.ts` | 条件表达式求值 |
| `server/src/workflow/index.ts` | 模块导出 |
| `server/src/repositories/agent-repository.ts` | Agent CRUD |
| `server/src/repositories/agent-run-repository.ts` | AgentRun CRUD |
| `server/src/repositories/workflow-repository.ts` | Workflow CRUD |
| `apps/desktop/src/stores/agentStore.ts` | Agent 前端状态管理 |
| `apps/desktop/src/components/agents/AgentTreeView.tsx` | 运行树视图 |
| `apps/desktop/src/components/agents/AgentRunCard.tsx` | Run 卡片 |
| `apps/desktop/src/components/agents/AgentStatusBadge.tsx` | 状态标记 |
| `apps/desktop/src/components/agents/AgentListPanel.tsx` | Agent 管理列表 |
| `apps/desktop/src/components/agents/AgentConfigForm.tsx` | Agent 配置表单 |
| `apps/desktop/src/components/agents/WorkflowEditor.tsx` | Workflow 编辑器 |
| `apps/desktop/src/components/agents/WorkflowDiagram.tsx` | Workflow DAG 可视化 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `shared/src/index.ts` | 新增 Agent/Workflow/消息类型定义 |
| `shared/src/protocol/correlation.ts` | 新增 agent/workflow 请求响应对 |
| `server/src/storage/db.ts` | 新建 agents/agent_runs/workflows 等表 |
| `server/src/server.ts` | Agent spawn 处理、级联取消、新消息路由 |
| `server/src/providers/claude-sdk.ts` | tool_use 拦截、agent 配置注入 |
| `server/src/router/index.ts` | 注册 agent/workflow CRUD 路由 |
| `gateway/src/server.ts` | Agent 路由、跨 backend 调度 |
| `apps/desktop/src/hooks/useUnifiedSocket.ts` | 处理新消息类型 |
| `apps/desktop/src/components/chat/` | 嵌入 agent 事件卡片 |
