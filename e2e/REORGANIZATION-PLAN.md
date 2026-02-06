# E2E 目录整理方案

> **整理时间**: 2026-02-06
> **目标**: 清理过时文件，组织文档结构，保持测试文件清晰

---

## 📋 当前问题

1. **文档散乱**：21 个 .md 文件分布在 3 个位置（e2e/, e2e/tests/, e2e/fixtures/）
2. **测试重复**：多个文件功能重复
3. **AI 测试过时**：3 个 AI 测试文件已废弃
4. **调试文件残留**：开发时的临时测试文件

---

## 🗂️ 建议的目录结构

```
e2e/
├── docs/                          # 📚 所有文档集中管理
│   ├── README.md                  # 主文档（从 tests/README.md 移动）
│   ├── QUICK_START.md             # 快速开始
│   ├── TEST-PLAN.md               # 测试计划
│   ├── TEST-REPORT.md             # 测试报告
│   │
│   ├── refactors/                 # 重构文档
│   │   ├── REFACTOR-AI-REMOVAL.md
│   │   ├── REFACTOR-PROJECT-MANAGEMENT.md
│   │   └── REFACTOR-WORKFLOWS.md
│   │
│   ├── modules/                   # 模块总结
│   │   ├── MODULE-E-SUMMARY.md
│   │   ├── MODULE-I-SUMMARY.md
│   │   └── MODULE-J-SUMMARY.md
│   │
│   └── gateway/                   # Gateway 相关文档
│       ├── GATEWAY-ARCHITECTURE-SUMMARY.md
│       ├── GATEWAY-BACKEND-ROUTING.md
│       ├── GATEWAY-QUICK-REFERENCE.md
│       ├── GATEWAY-REQUEST-FORWARDING.md
│       ├── GATEWAY-SCENARIOS-COMPARISON.md
│       ├── MULTIPLE-GATEWAYS.md
│       ├── SAME-GATEWAY-MULTI-BACKENDS.md
│       ├── README-MODES.md
│       └── FRAMEWORK-USAGE.md
│
├── tests/                         # 🧪 活跃的测试文件
│   ├── chat-core.spec.ts         # ✅ 已重构（传统）
│   ├── file-reference.spec.ts    # ✅ 已重构（传统）
│   ├── file-upload.spec.ts       # ✅ 已重构（传统）
│   ├── permission-system.spec.ts # ✅ 已重构（传统）
│   ├── project-management.spec.ts # ✅ 已重构（传统）
│   ├── session-import.spec.ts    # ✅ 已重构（传统）
│   ├── settings-panel.spec.ts    # ✅ 已重构（传统）
│   ├── slash-commands.spec.ts    # ✅ 已重构（传统）
│   ├── workflows.spec.ts         # ✅ 已重构（传统）
│   │
│   ├── performance.spec.ts       # ⏱️ 性能测试
│   ├── security.spec.ts          # 🔒 安全测试
│   │
│   ├── connection/               # 🔌 连接模式测试
│   │   ├── gateway-mode.spec.ts
│   │   ├── local-mode.spec.ts
│   │   ├── mode-switching.spec.ts
│   │   └── remote-mode.spec.ts
│   │
│   ├── shared/                   # 🤝 共享测试（跨模式）
│   │   ├── basic.spec.ts
│   │   ├── chat.spec.ts
│   │   ├── minimal.spec.ts
│   │   ├── sessions.spec.ts
│   │   └── tools.spec.ts
│   │
│   └── examples/                 # 💡 示例测试
│       ├── gateway-routing-demo.spec.ts
│       ├── mode-test-example.spec.ts
│       ├── multiple-gateways-example.spec.ts
│       ├── same-gateway-multi-backends.spec.ts
│       └── simple-working-test.spec.ts
│
├── archived/                      # 🗄️ 归档的废弃文件
│   ├── ai-smoke.spec.ts          # AI 测试（已废弃）
│   ├── ai-success-test.spec.ts   # AI 测试（已废弃）
│   ├── simple-ai-test.spec.ts    # AI 测试（已废弃）
│   ├── debug-schema.spec.ts      # 调试文件
│   ├── config-check.spec.ts      # 调试文件
│   ├── example.spec.ts           # 旧示例
│   ├── file-references.spec.ts   # 重复文件
│   ├── full-workflow.spec.ts     # 已被 workflows.spec.ts 替代
│   ├── user-workflows.spec.ts    # 已被 workflows.spec.ts 替代
│   ├── http-migration.spec.ts    # HTTP 迁移测试（完成）
│   ├── http-migration-api.spec.ts # HTTP 迁移测试（完成）
│   ├── socks5-proxy.spec.ts      # Socks5 代理测试
│   ├── test-direct-api.spec.ts   # API 直连测试
│   └── TEST-STATUS.md            # 旧测试状态（已过期）
│
├── helpers/                       # 🛠️ 辅助函数
│   ├── browser-adapter.ts        # ✅ BrowserAdapter 封装
│   ├── connection.ts             # ✅ 连接辅助函数（已修复）
│   ├── modes.ts
│   ├── setup.ts
│   └── custom-matchers.ts
│
└── fixtures/                      # 📦 测试数据
    ├── test-files/
    ├── claude-cli-data/
    ├── performance-data/
    └── security-tests/
```

---

## 🚀 执行步骤

### Step 1: 创建目录结构

```bash
# 创建新目录
mkdir -p e2e/docs/refactors
mkdir -p e2e/docs/modules
mkdir -p e2e/docs/gateway
mkdir -p e2e/archived
```

### Step 2: 移动文档文件

```bash
# 主文档
mv e2e/QUICK_START.md e2e/docs/
mv e2e/TEST-PLAN.md e2e/docs/
mv e2e/TEST-REPORT.md e2e/docs/
mv e2e/MODEL-TEST-RESULTS.md e2e/docs/

# 重构文档
mv e2e/REFACTOR-AI-REMOVAL.md e2e/docs/refactors/
mv e2e/REFACTOR-PROJECT-MANAGEMENT.md e2e/docs/refactors/
mv e2e/REFACTOR-WORKFLOWS.md e2e/docs/refactors/

# 模块总结
mv e2e/MODULE-E-SUMMARY.md e2e/docs/modules/
mv e2e/MODULE-I-SUMMARY.md e2e/docs/modules/
mv e2e/MODULE-J-SUMMARY.md e2e/docs/modules/

# Gateway 文档
mv e2e/tests/GATEWAY-*.md e2e/docs/gateway/
mv e2e/tests/MULTIPLE-GATEWAYS.md e2e/docs/gateway/
mv e2e/tests/SAME-GATEWAY-MULTI-BACKENDS.md e2e/docs/gateway/
mv e2e/tests/README-MODES.md e2e/docs/gateway/
mv e2e/tests/FRAMEWORK-USAGE.md e2e/docs/gateway/

# 主 README
mv e2e/tests/README.md e2e/docs/
```

### Step 3: 归档过时文件

```bash
# AI 测试（已废弃）
mv e2e/tests/ai-smoke.spec.ts e2e/archived/
mv e2e/tests/ai-success-test.spec.ts e2e/archived/
mv e2e/tests/simple-ai-test.spec.ts e2e/archived/

# 调试文件
mv e2e/tests/debug-schema.spec.ts e2e/archived/
mv e2e/tests/config-check.spec.ts e2e/archived/
mv e2e/tests/example.spec.ts e2e/archived/

# 重复/过时文件
mv e2e/tests/file-references.spec.ts e2e/archived/
mv e2e/tests/full-workflow.spec.ts e2e/archived/
mv e2e/tests/user-workflows.spec.ts e2e/archived/

# HTTP 迁移测试（已完成）
mv e2e/tests/http-migration.spec.ts e2e/archived/
mv e2e/tests/http-migration-api.spec.ts e2e/archived/

# 其他过时文件
mv e2e/tests/socks5-proxy.spec.ts e2e/archived/
mv e2e/tests/test-direct-api.spec.ts e2e/archived/
mv e2e/tests/TEST-STATUS.md e2e/archived/
```

### Step 4: 更新主 README

创建新的 `e2e/README.md` 作为入口文档。

---

## 📊 整理前后对比

| 指标 | 整理前 | 整理后 | 改进 |
|------|-------|--------|------|
| **文档位置** | 3 个位置 | 1 个位置（docs/） | 集中管理 |
| **测试文件数** | 50+ | ~20 个活跃 | 清晰明确 |
| **过时文件** | 混在一起 | 归档到 archived/ | 分离清楚 |
| **查找难度** | 高 | 低 | 易于导航 |

---

## ✅ 整理后的优势

1. **📚 文档集中**：所有文档在 `docs/` 目录，易于查找
2. **🧪 测试清晰**：活跃测试在 `tests/`，归档文件在 `archived/`
3. **🔍 易于维护**：新成员可以快速理解项目结构
4. **📦 分类明确**：按功能分类（connection/, shared/, examples/）

---

## 🎯 执行建议

**方案 A: 一次性执行**
- 优点：快速完成整理
- 缺点：风险较大，可能影响正在进行的测试

**方案 B: 分步执行**（推荐）
1. 先创建目录结构
2. 移动文档文件（不影响测试）
3. 归档过时文件（验证后再删除）
4. 更新 README 和文档链接

---

*整理方案制定时间：2026-02-06*
