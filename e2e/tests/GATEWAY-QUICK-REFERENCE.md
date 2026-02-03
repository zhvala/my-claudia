# Gateway 快速参考

## 三种区分机制

### 1️⃣ HTTP API - URL 路径

```bash
http://gateway.com:3200/api/proxy/{backendId}{原始路径}
                                   ↑
                                   在这里指定 Backend

# 示例
GET /api/proxy/backend-laptop-001/api/projects  # → Backend A
GET /api/proxy/backend-desktop-002/api/projects # → Backend B
```

### 2️⃣ WebSocket - 消息字段

```typescript
// 每条消息都包含 backendId
{
  "type": "send_to_backend",
  "backendId": "backend-laptop-001",  // ← 在这里指定
  "message": { ... }
}
```

### 3️⃣ 认证 - 复合头

```bash
Authorization: Bearer {gateway-secret}:{backend-api-key}
                      ↑                ↑
                      Layer 1          Layer 2
                      Gateway 认证      Backend 认证
```

---

## WebSocket 连接流程

```
1. 连接 Gateway
   ws://gateway.com:3200/ws

2. Gateway 认证
   → { type: "gateway_auth", gatewaySecret: "..." }
   ← { type: "gateway_auth_result", success: true }

3. 连接 Backend
   → { type: "connect_backend", backendId: "...", apiKey: "..." }
   ← { type: "backend_connect_result", success: true }

4. 发送消息
   → { type: "send_to_backend", backendId: "...", message: {...} }
   ← { type: "backend_message", ... }
```

---

## 配置示例

### 同一 Gateway，多个 Backend

```bash
# Gateway 配置（所有 Backend 共享）
GATEWAY_SECRET=team-gateway-secret

# Backend A: 笔记本
GATEWAY_BACKEND_A_ID=backend-laptop-001
GATEWAY_BACKEND_A_KEY=laptop-api-key

# Backend B: 台式机
GATEWAY_BACKEND_B_ID=backend-desktop-002
GATEWAY_BACKEND_B_KEY=desktop-api-key
```

### 多个独立 Gateway

```bash
# Gateway 1: 生产环境
GATEWAY1_URL=ws://gateway1.com:3200
GATEWAY1_SECRET=prod-gateway-secret
GATEWAY1_API_KEY=prod-backend-key
GATEWAY1_BACKEND_ID=backend-prod-001

# Gateway 2: 测试环境
GATEWAY2_URL=ws://gateway2.com:3201
GATEWAY2_SECRET=test-gateway-secret
GATEWAY2_API_KEY=test-backend-key
GATEWAY2_BACKEND_ID=backend-test-001
```

---

## 代码示例

### HTTP API 请求

```typescript
// Backend A
fetch(`http://localhost:3200/api/proxy/backend-laptop-001/api/projects`, {
  headers: {
    'Authorization': 'Bearer gateway-secret:laptop-key'
  }
});

// Backend B
fetch(`http://localhost:3200/api/proxy/backend-desktop-002/api/projects`, {
  headers: {
    'Authorization': 'Bearer gateway-secret:desktop-key'
  }
});
```

### WebSocket 切换 Backend

```typescript
// 初始: 连接到 Backend A
transport.setBackend('backend-laptop-001', 'laptop-key');

// 切换到 Backend B
transport.setBackend('backend-desktop-002', 'desktop-key');
```

### 测试中使用

```typescript
import { registerMode, getMode } from '../../helpers/modes';
import { gatewayBackendAMode } from '../../fixtures/modes/gateway-backend-a.config';
import { switchToMode } from '../../helpers/connection';

// 注册
registerMode(gatewayBackendAMode);

// 使用
test('测试 Backend A', async ({ page }) => {
  await page.goto('/');
  await switchToMode(page, getMode('gateway-backend-a'));
  // 现在连接到 Backend A
});
```

---

## 错误码

| 错误 | 原因 | HTTP 状态码 |
|------|------|-------------|
| Backend not available | Backend 不存在或离线 | 502 |
| Invalid gateway secret | Gateway Secret 错误 | 401 |
| Invalid backend API key | Backend API Key 错误 | 401 |
| Backend timeout | Backend 响应超时 | 504 |

---

## 关键点

| 特性 | 同一 Gateway 多 Backend | 多个独立 Gateway |
|------|------------------------|------------------|
| Gateway URL | 相同 | 不同 |
| Gateway Secret | 相同 | 不同 |
| Backend ID | 不同 | 不同 |
| Backend API Key | 不同 | 不同 |
| 适用场景 | 多设备/分布式后端 | 多环境（生产/测试） |

---

## 运行演示

```bash
# 查看路由机制演示
pnpm playwright test e2e/tests/examples/gateway-routing-demo.spec.ts

# 测试同一 Gateway 多 Backend
pnpm playwright test e2e/tests/examples/same-gateway-multi-backends.spec.ts

# 测试多个 Gateway
pnpm playwright test e2e/tests/examples/multiple-gateways-example.spec.ts
```

---

## 详细文档

📖 [Gateway Backend 路由机制](GATEWAY-BACKEND-ROUTING.md) - 完整技术原理
📖 [同一 Gateway 多 Backend](SAME-GATEWAY-MULTI-BACKENDS.md) - 使用指南
📖 [多 Gateway 支持](MULTIPLE-GATEWAYS.md) - 多 Gateway 指南
📖 [Gateway 场景对比](GATEWAY-SCENARIOS-COMPARISON.md) - 场景选择

---

## 快速查询

**Q: 如何区分不同的 Backend？**
A: HTTP 用 URL 路径 `:backendId`，WebSocket 用消息中的 `backendId` 字段

**Q: 两个 Backend 可以用同一个 API Key 吗？**
A: 可以但不推荐，会导致权限混淆

**Q: Gateway Secret 所有 Backend 共享吗？**
A: 是的，同一 Gateway 的所有 Backend 共享相同的 Gateway Secret

**Q: 如何切换 Backend？**
A: 更改 `backendId` 和对应的 `apiKey`，然后重新连接

**Q: Backend 之间的数据会共享吗？**
A: 不会，每个 Backend 的数据完全隔离

**Q: Gateway 挂了会怎样？**
A: 所有 Backend 都无法访问，建议 Gateway 高可用部署
