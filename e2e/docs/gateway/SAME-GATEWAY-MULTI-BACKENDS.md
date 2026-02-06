# 同一 Gateway 多 Backend 支持文档

## 概述

测试框架支持测试**注册到同一个 Gateway 服务器的多个 Backend 实例**。这与多个独立 Gateway 服务器的场景不同。

## 两种场景对比

### 场景 1：多个独立的 Gateway 服务器
```
Gateway Server 1 (gateway1.com:3200)
  └── Backend A

Gateway Server 2 (gateway2.com:3201)
  └── Backend B
```
- 不同的 Gateway 服务器
- 不同的 Gateway Secret
- 适用于：多环境测试（生产、测试）

### 场景 2：同一 Gateway，多个 Backend（本文档）
```
Gateway Server (gateway.com:3200)
  ├── Backend A (laptop-123)
  ├── Backend B (desktop-456)
  └── Backend C (cloud-789)
```
- **相同**的 Gateway 服务器
- **相同**的 Gateway Secret
- **不同**的 Backend ID
- **不同**的 API Key
- 适用于：多设备访问、分布式后端

## 真实使用场景

### 场景示例 1：多设备访问
用户有一个 Gateway 服务器 (gateway.mycompany.com)，需要访问多个设备：

```bash
Gateway: gateway.mycompany.com:3200
├── 个人笔记本 (backend-laptop-001)
│   ├── API Key: laptop-key-abc123
│   └── 代理: 无
├── 工作台式机 (backend-desktop-002)
│   ├── API Key: desktop-key-xyz789
│   └── 代理: 公司 SOCKS5
└── 云服务器 (backend-cloud-003)
    ├── API Key: cloud-key-def456
    └── 代理: 云服务商代理
```

### 场景示例 2：团队共享 Gateway
团队使用共享的 Gateway，每个成员连接自己的 Backend：

```bash
Gateway: team-gateway.example.com:3200
├── Alice 的机器 (backend-alice)
├── Bob 的机器 (backend-bob)
└── Charlie 的机器 (backend-charlie)
```

## 架构说明

### 关键配置差异

| 配置项 | Backend A | Backend B | 说明 |
|--------|-----------|-----------|------|
| `gatewayUrl` | ws://gateway.com:3200 | ws://gateway.com:3200 | **相同** |
| `gatewaySecret` | secret-123 | secret-123 | **相同** |
| `backendId` | backend-laptop-001 | backend-desktop-002 | **不同** |
| `apiKey` | laptop-key-abc | desktop-key-xyz | **不同** |
| `proxyUrl` | 可选，不同 | 可选，不同 | **可不同** |

### Gateway 路由机制

当客户端通过 Gateway 访问 Backend 时：

1. **连接阶段**：
   ```
   Client → Gateway (使用 gatewaySecret 认证)
            → Gateway 建立连接
   ```

2. **选择 Backend**：
   ```
   Client 指定 backendId: "backend-laptop-001"
   Gateway 查找该 Backend 是否已注册
   ```

3. **请求转发**：
   ```
   Client → Gateway → Backend (使用 apiKey 认证)
                    ← Backend 响应
          ← Gateway 转发响应
   ```

4. **数据隔离**：
   - 每个 Backend 的数据完全独立
   - 会话、项目、消息都不会跨 Backend 共享
   - 切换 Backend = 切换到完全不同的工作环境

## 配置方法

### 1. 环境变量配置

在 `.env.test` 中配置：

```bash
# 共享的 Gateway 配置
GATEWAY_SECRET=team-gateway-secret

# Backend A: 个人笔记本
GATEWAY_BACKEND_A_ID=backend-laptop-001
GATEWAY_BACKEND_A_KEY=laptop-api-key-abc123

# Backend B: 工作台式机
GATEWAY_BACKEND_B_ID=backend-desktop-002
GATEWAY_BACKEND_B_KEY=desktop-api-key-xyz789
```

### 2. 创建配置文件

配置文件已创建：
- [gateway-backend-a.config.ts](../../fixtures/modes/gateway-backend-a.config.ts)
- [gateway-backend-b.config.ts](../../fixtures/modes/gateway-backend-b.config.ts)

### 3. 注册并使用

```typescript
import { registerMode, getMode } from '../../helpers/modes';
import { gatewayBackendAMode } from '../../fixtures/modes/gateway-backend-a.config';
import { gatewayBackendBMode } from '../../fixtures/modes/gateway-backend-b.config';
import { switchToMode } from '../../helpers/connection';

// 注册两个 backend
registerMode(gatewayBackendAMode);
registerMode(gatewayBackendBMode);

test('测试 Backend A', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const backendA = getMode('gateway-backend-a');
  await switchToMode(page, backendA);

  // 现在连接到 Backend A
  // 所有操作都在 Backend A 上执行
});
```

## 使用示例

### 示例 1：验证数据隔离

```typescript
test('Backend 之间数据应该隔离', async ({ page }) => {
  const backendA = getMode('gateway-backend-a');
  const backendB = getMode('gateway-backend-b');

  // 在 Backend A 上创建项目
  await switchToMode(page, backendA);
  await page.click('[data-testid="new-project-btn"]');
  await page.fill('input[name="project-name"]', 'Backend A Project');
  await page.click('[data-testid="save-btn"]');

  // 切换到 Backend B
  await switchToMode(page, backendB);

  // 验证 Backend A 的项目不存在
  const projectList = await page.textContent('[data-testid="project-list"]');
  expect(projectList).not.toContain('Backend A Project');

  console.log('✓ 数据正确隔离');
});
```

### 示例 2：测试 Backend 切换

```typescript
test('在多个 Backend 之间切换', async ({ page }) => {
  const backends = [
    getMode('gateway-backend-a'),
    getMode('gateway-backend-b'),
  ];

  for (const backend of backends) {
    console.log(`切换到 ${backend.name}...`);
    await switchToMode(page, backend);

    // 发送测试消息
    await page.fill('textarea', `测试 ${backend.name}`);
    await page.click('[data-testid="send-btn"]');

    console.log(`✓ ${backend.name} 工作正常`);
  }
});
```

### 示例 3：并行测试所有 Backend

```typescript
import { testAllModes } from '../../helpers/test-factory';

// 注册所有 backend
registerMode(gatewayBackendAMode);
registerMode(gatewayBackendBMode);

// 自动在所有 backend 上运行测试
testAllModes('功能测试', async (page, mode) => {
  if (mode.id.startsWith('gateway-backend')) {
    console.log(`测试 ${mode.name} (Backend ID: ${mode.backendId})`);

    // 测试逻辑会在每个 backend 上独立运行
    // Backend A, Backend B 都会执行一次
  }
});
```

## 完整示例

参考 [same-gateway-multi-backends.spec.ts](examples/same-gateway-multi-backends.spec.ts) 获取完整的测试示例。

## 运行测试

```bash
# 运行同一 Gateway 多 Backend 示例
pnpm playwright test e2e/tests/examples/same-gateway-multi-backends.spec.ts

# 使用 UI 模式调试
pnpm playwright test e2e/tests/examples/same-gateway-multi-backends.spec.ts --ui

# 查看所有可用的 backend
pnpm playwright test e2e/tests/examples/same-gateway-multi-backends.spec.ts --grep "should show both backends"
```

## 技术细节

### Backend 注册流程

1. **Backend 启动时注册**：
   ```typescript
   // Backend 向 Gateway 注册
   POST /api/gateway/register
   {
     "backendId": "backend-laptop-001",
     "apiKey": "laptop-api-key-abc123"
   }
   ```

2. **Gateway 维护注册表**：
   ```typescript
   {
     "backend-laptop-001": {
       "status": "online",
       "lastSeen": "2026-02-03T10:00:00Z",
       "connection": WebSocket
     },
     "backend-desktop-002": {
       "status": "online",
       "lastSeen": "2026-02-03T10:01:00Z",
       "connection": WebSocket
     }
   }
   ```

3. **客户端请求路由**：
   ```typescript
   // 客户端请求
   GET /api/proxy/backend-laptop-001/api/projects
   Authorization: Bearer gateway-secret:laptop-api-key

   // Gateway 转发到对应 Backend
   → Backend A 处理
   ← 返回结果
   ```

### 认证层级

```
客户端认证
  ├── Layer 1: Gateway Secret (验证客户端可以访问 Gateway)
  └── Layer 2: Backend API Key (验证客户端可以访问特定 Backend)
```

两层认证确保：
- 只有授权用户可以访问 Gateway
- 只有正确的 API Key 可以访问特定 Backend
- Backend 之间完全隔离

## 注意事项

### 1. Backend ID 唯一性
每个 Backend 必须有唯一的 `backendId`：

```bash
# ✅ 正确
GATEWAY_BACKEND_A_ID=backend-laptop-001
GATEWAY_BACKEND_B_ID=backend-desktop-002

# ❌ 错误（ID 重复）
GATEWAY_BACKEND_A_ID=backend-001
GATEWAY_BACKEND_B_ID=backend-001  # 冲突！
```

### 2. API Key 独立性
每个 Backend 应该有自己的 API Key：

```bash
# ✅ 推荐：不同的 API Key
GATEWAY_BACKEND_A_KEY=laptop-key-abc123
GATEWAY_BACKEND_B_KEY=desktop-key-xyz789

# ⚠️ 不推荐但可行：相同的 API Key
# 可能导致安全问题和权限混淆
```

### 3. 数据完全隔离
- 切换 Backend = 切换工作环境
- 会话、项目、设置都不会共享
- 需要在每个 Backend 上独立配置

### 4. Gateway 单点故障
- 如果 Gateway 挂了，所有 Backend 都无法访问
- 生产环境建议：
  - Gateway 高可用部署
  - 监控 Gateway 健康状态
  - 准备降级方案（直连模式）

### 5. Backend 离线处理
当 Backend 离线时：

```typescript
// Gateway 返回错误
{
  "error": "Backend not available",
  "backendId": "backend-laptop-001",
  "status": "offline"
}
```

测试应该处理这种情况：

```typescript
test('Backend 离线时应该提示错误', async ({ page }) => {
  const backend = getMode('gateway-backend-a');

  // 模拟 Backend 离线
  // 尝试连接
  await switchToMode(page, backend);

  // 应该看到错误提示
  const errorMsg = await page.locator('[data-testid="connection-error"]').textContent();
  expect(errorMsg).toContain('Backend not available');
});
```

## 最佳实践

### 1. 清晰的命名
使用描述性的 Backend ID：

```bash
# ✅ 好
backend-alice-laptop
backend-production-server-1
backend-dev-docker-container

# ❌ 差
backend1
b1
test
```

### 2. 文档化配置
为每个 Backend 记录：
- Backend ID
- 用途/位置
- 负责人
- API Key 管理方式

### 3. 监控和日志
记录 Backend 切换事件：

```typescript
await switchToMode(page, backend);
console.log(`Switched to: ${backend.name} (${backend.backendId})`);
```

### 4. 错误处理
优雅处理 Backend 不可用：

```typescript
try {
  await switchToMode(page, backend);
} catch (error) {
  console.log(`Backend ${backend.name} is not available, skipping test`);
  test.skip();
}
```

## 故障排查

### Backend 无法连接

**症状**：切换到 Backend 后一直显示 "Connecting..."

**检查清单**：
1. ✅ Backend 服务是否运行？
2. ✅ Backend 是否已注册到 Gateway？
   ```bash
   curl http://localhost:3100/api/server/gateway/status
   ```
3. ✅ `GATEWAY_BACKEND_X_ID` 是否正确？
4. ✅ `GATEWAY_BACKEND_X_KEY` 是否正确？
5. ✅ Gateway Secret 是否正确？

### Backend 切换后数据混乱

**症状**：看到了其他 Backend 的数据

**原因**：可能是缓存或状态未清理

**解决**：
```typescript
// 切换 Backend 后刷新页面
await switchToMode(page, backend);
await page.reload();
await page.waitForLoadState('networkidle');
```

### Gateway 返回 502

**症状**：`502 Bad Gateway` 错误

**原因**：Backend 已注册但连接断开

**检查**：
1. Backend 进程是否还在运行？
2. 网络连接是否正常？
3. Gateway 到 Backend 的 WebSocket 是否断开？

## 相关文档

- [Gateway Backend 路由机制](GATEWAY-BACKEND-ROUTING.md) - **详细解释 Gateway 如何区分不同 Backend**
- [多 Gateway 支持文档](MULTIPLE-GATEWAYS.md) - 多个独立 Gateway 服务器
- [Gateway 场景对比](GATEWAY-SCENARIOS-COMPARISON.md) - 两种场景的详细对比
- [框架使用指南](FRAMEWORK-USAGE.md) - 基础使用
- [完整示例](examples/same-gateway-multi-backends.spec.ts) - 示例代码
- [路由演示](examples/gateway-routing-demo.spec.ts) - Gateway 路由机制演示

## 总结

同一 Gateway 多 Backend 架构允许你：

✅ 通过一个 Gateway 访问多个设备/服务器
✅ 无缝切换不同的工作环境
✅ 每个 Backend 完全独立和隔离
✅ 统一的认证和代理管理
✅ 简化网络配置（只需一个 Gateway）

适用于个人多设备使用、团队协作、分布式后端测试等场景。
