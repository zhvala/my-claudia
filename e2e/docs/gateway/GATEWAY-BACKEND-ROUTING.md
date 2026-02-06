# Gateway 如何区分不同的 Backend

## 概述

当多个 Backend 注册到同一个 Gateway 时，Gateway 通过**三种机制**来区分请求应该路由到哪个 Backend：

1. **HTTP API**：通过 URL 路径中的 `:backendId` 参数
2. **WebSocket**：通过消息中的 `backendId` 字段
3. **认证头**：通过 `Authorization` 头中的复合认证信息

---

## 1. HTTP API 路由机制

### URL 路径格式

```
http://gateway.com:3200/api/proxy/{backendId}{原始API路径}
                                    ↑
                                    |
                            这里指定 Backend
```

### 实际示例

#### Backend A (laptop-001)
```bash
# 获取 Backend A 的项目列表
GET http://localhost:3200/api/proxy/backend-laptop-001/api/projects
Authorization: Bearer gateway-secret:laptop-api-key

# Gateway 解析:
# - backendId = "backend-laptop-001"
# - 原始路径 = "/api/projects"
# - Gateway 转发到 Backend A
```

#### Backend B (desktop-002)
```bash
# 获取 Backend B 的项目列表
GET http://localhost:3200/api/proxy/backend-desktop-002/api/projects
Authorization: Bearer gateway-secret:desktop-api-key

# Gateway 解析:
# - backendId = "backend-desktop-002"
# - 原始路径 = "/api/projects"
# - Gateway 转发到 Backend B
```

### 代码实现

**测试代码** ([e2e/helpers/setup.ts:111](../helpers/setup.ts#L111)):
```typescript
const client: GatewayApiClient = {
  backendId,
  async fetch(apiPath: string, options?: RequestInit) {
    // 构造完整的 Gateway 代理 URL
    return globalThis.fetch(
      `http://localhost:3200/api/proxy/${backendId}${apiPath}`,
      //                                  ↑          ↑
      //                                  |          原始 API 路径
      //                                  Backend ID
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          // 复合认证：gateway-secret:backend-api-key
          'Authorization': `Bearer test-gateway-secret:${apiKey}`,
          ...options?.headers,
        },
      }
    );
  },
};
```

### Gateway 服务器端处理流程

```typescript
// 伪代码展示 Gateway 如何处理请求

app.all('/api/proxy/:backendId/*', async (req, res) => {
  const backendId = req.params.backendId;  // 从 URL 提取
  const originalPath = req.params[0];       // 原始 API 路径

  // 1. 验证 Gateway Secret
  const [gatewaySecret, apiKey] = parseAuthHeader(req.headers.authorization);
  if (gatewaySecret !== config.gatewaySecret) {
    return res.status(401).json({ error: 'Invalid gateway secret' });
  }

  // 2. 查找对应的 Backend 连接
  const backend = registeredBackends.get(backendId);
  if (!backend) {
    return res.status(502).json({ error: 'Backend not available' });
  }

  // 3. 转发请求到 Backend（通过 WebSocket 或 HTTP）
  const response = await backend.proxyRequest({
    method: req.method,
    path: originalPath,
    headers: { ...req.headers, 'Authorization': `Bearer ${apiKey}` },
    body: req.body
  });

  // 4. 返回 Backend 的响应
  res.status(response.status).json(response.data);
});
```

---

## 2. WebSocket 连接路由机制

### 连接流程

```
客户端                    Gateway                   Backend A          Backend B
  │                         │                          │                  │
  │─────连接 Gateway────────→│                          │                  │
  │                         │                          │                  │
  │──gateway_auth message──→│                          │                  │
  │   (gatewaySecret)       │                          │                  │
  │                         │                          │                  │
  │←─gateway_auth_result───│                          │                  │
  │                         │                          │                  │
  │─connect_backend message→│                          │                  │
  │  (backendId: laptop-001,│                          │                  │
  │   apiKey: laptop-key)   │                          │                  │
  │                         │                          │                  │
  │                         │──查找 Backend A 连接────→│                  │
  │                         │                          │                  │
  │                         │←────建立代理连接─────────│                  │
  │                         │                          │                  │
  │←backend_connect_result─│                          │                  │
  │                         │                          │                  │
  │─send_to_backend message→│                          │                  │
  │  (backendId: laptop-001)│──转发消息───────────────→│                  │
  │                         │                          │                  │
  │                         │←────Backend 响应─────────│                  │
  │                         │                          │                  │
  │←─backend_message───────│                          │                  │
  │                         │                          │                  │
```

### 消息格式详解

#### 阶段 1：Gateway 认证
```typescript
// 客户端发送
{
  "type": "gateway_auth",
  "gatewaySecret": "team-gateway-secret"
}

// Gateway 响应
{
  "type": "gateway_auth_result",
  "success": true
}
```

#### 阶段 2：连接到特定 Backend
```typescript
// 客户端发送（指定 backendId）
{
  "type": "connect_backend",
  "backendId": "backend-laptop-001",  // ← 指定 Backend
  "apiKey": "laptop-api-key"
}

// Gateway 响应
{
  "type": "backend_connect_result",
  "success": true,
  "backendId": "backend-laptop-001"
}
```

#### 阶段 3：发送消息到 Backend
```typescript
// 每条消息都包含 backendId
{
  "type": "send_to_backend",
  "backendId": "backend-laptop-001",  // ← 每次都指定
  "message": {
    "type": "create_session",
    "projectId": "proj-123",
    "modelConfig": { ... }
  }
}

// Gateway 转发：
// 1. 提取 backendId
// 2. 查找对应的 Backend 连接
// 3. 转发 message 内容到该 Backend
```

### 代码实现

**GatewayTransport** ([apps/desktop/src/hooks/transport/GatewayTransport.ts](../../apps/desktop/src/hooks/transport/GatewayTransport.ts)):

```typescript
export class GatewayTransport extends BaseTransport {
  private backendId: string;
  private gatewaySecret?: string;
  private apiKey?: string;

  constructor(config: GatewayTransportConfig) {
    super(config);
    this.backendId = config.backendId;  // 存储 backendId
    this.gatewaySecret = config.gatewaySecret;
    this.apiKey = config.apiKey;
  }

  // 阶段 1: Gateway 认证
  connect(): void {
    this.ws = new WebSocket(this.config.url);

    this.ws.onopen = () => {
      const authMsg: ClientToGatewayMessage = {
        type: 'gateway_auth',
        gatewaySecret: this.gatewaySecret
      };
      this.ws!.send(JSON.stringify(authMsg));
    };
  }

  // 阶段 2: 连接 Backend（在 onmessage 的 gateway_auth_result 分支）
  private handleGatewayAuthSuccess(): void {
    const connectMsg: ClientToGatewayMessage = {
      type: 'connect_backend',
      backendId: this.backendId,  // ← 指定 Backend
      apiKey: this.apiKey
    };
    this.ws!.send(JSON.stringify(connectMsg));
  }

  // 阶段 3: 发送消息（每次都包含 backendId）
  send(message: ClientMessage): void {
    const gatewayMessage: ClientToGatewayMessage = {
      type: 'send_to_backend',
      backendId: this.backendId,  // ← 每次发送都指定
      message
    };
    this.ws!.send(JSON.stringify(gatewayMessage));
  }

  // 切换 Backend
  setBackend(backendId: string, apiKey?: string): void {
    this.backendId = backendId;
    this.apiKey = apiKey;

    // 重新连接到新的 Backend
    if (this.gatewayAuthenticated) {
      const connectMsg: ClientToGatewayMessage = {
        type: 'connect_backend',
        backendId,  // ← 新的 Backend ID
        apiKey
      };
      this.ws!.send(JSON.stringify(connectMsg));
    }
  }
}
```

### Gateway 服务器端处理

```typescript
// 伪代码展示 Gateway 如何处理 WebSocket 消息

// 存储已注册的 Backend 连接
const registeredBackends = new Map<string, WebSocket>();

// Backend 注册时
backend.on('register', (backendId, ws) => {
  registeredBackends.set(backendId, ws);
});

// 处理客户端消息
client.on('message', (data) => {
  const message = JSON.parse(data);

  switch (message.type) {
    case 'send_to_backend':
      const backendId = message.backendId;
      const backendWs = registeredBackends.get(backendId);

      if (!backendWs) {
        client.send(JSON.stringify({
          type: 'error',
          error: 'Backend not available'
        }));
        return;
      }

      // 转发消息到对应的 Backend
      backendWs.send(JSON.stringify(message.message));
      break;
  }
});
```

---

## 3. 认证机制

### 两层认证

Gateway 使用**两层认证**来确保安全：

```
Authorization: Bearer {gateway-secret}:{backend-api-key}
                       ↑               ↑
                       |               |
                  Layer 1         Layer 2
                Gateway 认证    Backend 认证
```

### Layer 1: Gateway Secret
- **目的**：验证客户端有权访问 Gateway
- **位置**：认证头的第一部分
- **所有使用同一 Gateway 的客户端共享**

### Layer 2: Backend API Key
- **目的**：验证客户端有权访问特定 Backend
- **位置**：认证头的第二部分
- **每个 Backend 独立的 API Key**

### 示例对比

```bash
# Backend A (笔记本)
Authorization: Bearer team-gateway-secret:laptop-api-key
                      ↑                    ↑
                      相同                  不同

# Backend B (台式机)
Authorization: Bearer team-gateway-secret:desktop-api-key
                      ↑                    ↑
                      相同                  不同
```

### Gateway 验证流程

```typescript
function authenticateRequest(authHeader: string, backendId: string) {
  // 1. 解析认证头
  const [type, credentials] = authHeader.split(' ');
  if (type !== 'Bearer') {
    throw new Error('Invalid auth type');
  }

  // 2. 分离 Gateway Secret 和 Backend API Key
  const [gatewaySecret, apiKey] = credentials.split(':');

  // 3. 验证 Gateway Secret（Layer 1）
  if (gatewaySecret !== config.gatewaySecret) {
    throw new Error('Invalid gateway secret');
  }

  // 4. 查找 Backend 并验证 API Key（Layer 2）
  const backend = registeredBackends.get(backendId);
  if (!backend) {
    throw new Error('Backend not available');
  }

  if (apiKey !== backend.apiKey) {
    throw new Error('Invalid backend API key');
  }

  // 5. 认证成功
  return { backendId, apiKey };
}
```

---

## 4. 完整的请求路由示例

### 场景：客户端从 Backend A 切换到 Backend B

```typescript
// === 初始状态：连接到 Backend A ===

// 1. HTTP API 请求 - 获取 Backend A 的项目
fetch('http://localhost:3200/api/proxy/backend-laptop-001/api/projects', {
  headers: {
    'Authorization': 'Bearer gateway-secret:laptop-key'
  }
});
// Gateway 路由到 Backend A (laptop-001)
// Backend A 验证 laptop-key
// 返回 Backend A 的项目列表

// 2. WebSocket 消息 - 在 Backend A 创建会话
transport.send({
  type: 'create_session',
  projectId: 'proj-a-001'
});
// GatewayTransport 包装消息：
{
  type: 'send_to_backend',
  backendId: 'backend-laptop-001',
  message: { type: 'create_session', projectId: 'proj-a-001' }
}
// Gateway 路由到 Backend A
// Backend A 创建会话


// === 切换到 Backend B ===

// 3. 切换 Backend
transport.setBackend('backend-desktop-002', 'desktop-key');
// 发送新的 connect_backend 消息
{
  type: 'connect_backend',
  backendId: 'backend-desktop-002',
  apiKey: 'desktop-key'
}
// Gateway 断开与 Backend A 的代理
// Gateway 连接到 Backend B


// 4. HTTP API 请求 - 获取 Backend B 的项目
fetch('http://localhost:3200/api/proxy/backend-desktop-002/api/projects', {
  headers: {
    'Authorization': 'Bearer gateway-secret:desktop-key'
  }
});
// Gateway 路由到 Backend B (desktop-002)
// Backend B 验证 desktop-key
// 返回 Backend B 的项目列表（与 Backend A 完全不同）

// 5. WebSocket 消息 - 在 Backend B 创建会话
transport.send({
  type: 'create_session',
  projectId: 'proj-b-001'
});
// GatewayTransport 包装消息：
{
  type: 'send_to_backend',
  backendId: 'backend-desktop-002',  // ← 已更新为 Backend B
  message: { type: 'create_session', projectId: 'proj-b-001' }
}
// Gateway 路由到 Backend B
// Backend B 创建会话
```

---

## 5. Gateway 内部状态管理

### Backend 注册表

```typescript
// Gateway 维护的注册表
class GatewayServer {
  private backends = new Map<string, BackendConnection>();

  // Backend 注册
  registerBackend(backendId: string, ws: WebSocket, apiKey: string) {
    this.backends.set(backendId, {
      id: backendId,
      ws: ws,
      apiKey: apiKey,
      status: 'online',
      lastSeen: Date.now()
    });
    console.log(`Backend registered: ${backendId}`);
  }

  // 查找 Backend
  getBackend(backendId: string): BackendConnection | undefined {
    return this.backends.get(backendId);
  }

  // 路由消息
  routeMessage(clientWs: WebSocket, backendId: string, message: any) {
    const backend = this.getBackend(backendId);

    if (!backend) {
      clientWs.send(JSON.stringify({
        type: 'error',
        error: `Backend "${backendId}" not available`
      }));
      return;
    }

    if (backend.status !== 'online') {
      clientWs.send(JSON.stringify({
        type: 'error',
        error: `Backend "${backendId}" is offline`
      }));
      return;
    }

    // 转发到对应 Backend
    backend.ws.send(JSON.stringify(message));
  }
}
```

### 实际状态示例

```javascript
// Gateway 内部状态
{
  backends: Map {
    'backend-laptop-001' => {
      id: 'backend-laptop-001',
      ws: WebSocket { readyState: 1 },
      apiKey: 'laptop-api-key',
      status: 'online',
      lastSeen: 1738570800000
    },
    'backend-desktop-002' => {
      id: 'backend-desktop-002',
      ws: WebSocket { readyState: 1 },
      apiKey: 'desktop-api-key',
      status: 'online',
      lastSeen: 1738570801000
    },
    'backend-cloud-003' => {
      id: 'backend-cloud-003',
      ws: WebSocket { readyState: 0 },  // 正在连接
      apiKey: 'cloud-api-key',
      status: 'connecting',
      lastSeen: 1738570802000
    }
  },

  clients: Map {
    'client-session-abc' => {
      ws: WebSocket { readyState: 1 },
      currentBackendId: 'backend-laptop-001',  // 当前连接的 Backend
      authenticated: true
    }
  }
}
```

---

## 6. 错误处理

### Backend 不存在
```bash
GET /api/proxy/non-existent-backend/api/projects

Response:
{
  "error": "Backend not available",
  "backendId": "non-existent-backend"
}
Status: 502 Bad Gateway
```

### Backend 离线
```bash
# Backend 已注册但连接断开
GET /api/proxy/backend-offline/api/projects

Response:
{
  "error": "Backend is offline",
  "backendId": "backend-offline",
  "status": "offline"
}
Status: 502 Bad Gateway
```

### API Key 不匹配
```bash
GET /api/proxy/backend-laptop-001/api/projects
Authorization: Bearer gateway-secret:wrong-api-key

Response:
{
  "error": "Invalid backend API key"
}
Status: 401 Unauthorized
```

---

## 7. 总结

Gateway 通过以下机制区分不同的 Backend：

| 传输方式 | 区分方法 | 示例 |
|---------|---------|------|
| **HTTP API** | URL 路径中的 `:backendId` | `/api/proxy/backend-laptop-001/api/projects` |
| **WebSocket** | 消息中的 `backendId` 字段 | `{ type: 'send_to_backend', backendId: 'backend-laptop-001', ... }` |
| **认证** | 复合 Authorization 头 | `Bearer gateway-secret:backend-api-key` |

### 关键要点

✅ **每个 Backend 必须有唯一的 backendId**
✅ **HTTP 请求通过 URL 路径区分**
✅ **WebSocket 消息通过消息体区分**
✅ **两层认证：Gateway Secret + Backend API Key**
✅ **切换 Backend 只需更改 backendId 和 apiKey**
✅ **数据完全隔离，不会跨 Backend 共享**

### 相关文档

- [Gateway 请求转发机制](GATEWAY-REQUEST-FORWARDING.md) - **Gateway 服务器内部实现详解**
- [同一 Gateway 多 Backend 文档](SAME-GATEWAY-MULTI-BACKENDS.md)
- [Gateway 场景对比](GATEWAY-SCENARIOS-COMPARISON.md)
- [快速参考](GATEWAY-QUICK-REFERENCE.md)
- [使用示例](examples/same-gateway-multi-backends.spec.ts)
