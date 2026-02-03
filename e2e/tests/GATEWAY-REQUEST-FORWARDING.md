# Gateway 请求转发机制详解

## 概述

Gateway 充当中间人，将客户端的请求转发给正确的 Backend。本文档详细解释整个转发流程。

---

## 1. Backend 注册流程

### Backend 启动时

**Backend 代码** ([server/src/gateway-client.ts](../../server/src/gateway-client.ts)):

```typescript
// Backend 启动时连接到 Gateway
const client = new GatewayClient({
  gatewayUrl: 'ws://gateway.example.com:3200/ws',
  gatewaySecret: 'team-gateway-secret',
  name: 'My Laptop',
  serverPort: 3100
});

client.connect();
```

**步骤 1: 连接并发送注册消息**
```typescript
// Backend → Gateway
{
  type: 'register',
  gatewaySecret: 'team-gateway-secret',
  deviceId: 'stable-device-uuid-1234',  // 稳定的设备 ID
  name: 'My Laptop'
}
```

**步骤 2: Gateway 验证并分配 backendId**

**Gateway 代码** ([gateway/src/server.ts:371-417](../../gateway/src/server.ts#L371-L417)):

```typescript
async function handleBackendRegister(ws: WebSocket, message: BackendRegisterMessage) {
  // 1. 验证 Gateway Secret
  if (message.gatewaySecret !== GATEWAY_SECRET) {
    ws.send(JSON.stringify({
      type: 'register_result',
      success: false,
      error: 'Invalid gateway secret'
    }));
    return;
  }

  // 2. 从数据库获取或创建 backendId（持久化）
  const backendId = await storage.getOrCreateBackendId(
    message.deviceId,
    message.name || 'Unknown'
  );
  // 例如: "abc12345" (8字符)

  // 3. 如果该 Backend 已连接，断开旧连接
  const existing = backends.get(backendId);
  if (existing) {
    existing.ws.close();
    backends.delete(backendId);
  }

  // 4. 注册新连接
  const backend: ConnectedBackend = {
    id: generateUUID(),
    backendId: backendId,
    deviceId: message.deviceId,
    name: message.name || 'Unknown',
    ws: ws,
    isAlive: true
  };

  backends.set(backendId, backend);

  // 5. 返回注册结果
  ws.send(JSON.stringify({
    type: 'register_result',
    success: true,
    backendId: backendId  // Backend 收到自己的 ID
  }));

  console.log(`Backend registered: ${backendId} (${message.name})`);
}
```

**Gateway 内部状态**:
```typescript
// Gateway 维护的 Backend 映射表
const backends = new Map<string, ConnectedBackend>([
  ['abc12345', {
    id: 'uuid-1',
    backendId: 'abc12345',
    deviceId: 'stable-device-uuid-1234',
    name: 'My Laptop',
    ws: WebSocket { ... },  // 指向 Backend 的 WebSocket 连接
    isAlive: true
  }],
  ['def67890', {
    id: 'uuid-2',
    backendId: 'def67890',
    deviceId: 'stable-device-uuid-5678',
    name: 'My Desktop',
    ws: WebSocket { ... },
    isAlive: true
  }]
]);
```

---

## 2. HTTP 请求转发流程

### 场景：客户端通过 HTTP 请求 Backend

**客户端请求**:
```bash
GET http://gateway.com:3200/api/proxy/abc12345/api/projects
Authorization: Bearer team-gateway-secret:laptop-api-key
```

### Gateway 处理流程

**Gateway 代码** ([gateway/src/server.ts:147-262](../../gateway/src/server.ts#L147-L262)):

```typescript
// Express 路由处理
app.all('/api/proxy/:backendId/*', async (req, res) => {
  const backendId = req.params.backendId;  // 'abc12345'
  const apiPath = '/' + req.params[0];     // '/api/projects'

  // === 步骤 1: 验证 Gateway Secret ===
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const [type, credentials] = authHeader.split(' ');
  const [gatewaySecret, apiKey] = credentials.split(':');

  if (gatewaySecret !== GATEWAY_SECRET) {
    return res.status(401).json({ error: 'Invalid gateway secret' });
  }

  // === 步骤 2: 查找 Backend 连接 ===
  const backend = backends.get(backendId);
  if (!backend || backend.ws.readyState !== WebSocket.OPEN) {
    return res.status(502).json({
      error: 'Backend not available',
      backendId: backendId
    });
  }

  // === 步骤 3: 创建 HTTP 代理请求 ===
  const requestId = generateUUID();  // 用于关联请求和响应

  const proxyRequest: HttpProxyRequestMessage = {
    type: 'http_proxy_request',
    requestId: requestId,
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: apiPath,
    headers: {
      ...req.headers,
      'Authorization': `Bearer ${apiKey}`,  // 替换为 Backend API Key
      'Host': `localhost:${BACKEND_PORT}`   // 目标是 Backend 的本地服务器
    },
    body: req.body ? JSON.stringify(req.body) : undefined
  };

  // === 步骤 4: 发送到 Backend 并等待响应 ===
  backend.ws.send(JSON.stringify(proxyRequest));

  // 创建 Promise，等待 Backend 响应
  const responsePromise = new Promise<HttpProxyResponse>((resolve, reject) => {
    pendingHttpRequests.set(requestId, { resolve, reject });

    // 30秒超时
    setTimeout(() => {
      pendingHttpRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 30000);
  });

  // === 步骤 5: 等待响应并返回给客户端 ===
  try {
    const response = await responsePromise;

    res.status(response.status).json(response.body);
  } catch (error) {
    res.status(504).json({ error: 'Gateway timeout' });
  }
});
```

### Backend 处理 HTTP 代理请求

**Backend 代码** ([server/src/gateway-client.ts](../../server/src/gateway-client.ts)):

```typescript
// Backend 收到来自 Gateway 的 HTTP 代理请求
ws.on('message', async (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'http_proxy_request') {
    const { requestId, method, path, headers, body } = message;

    try {
      // === 步骤 1: 转发到本地 HTTP 服务器 ===
      const response = await fetch(`http://localhost:3100${path}`, {
        method: method,
        headers: headers,
        body: body ? JSON.parse(body) : undefined
      });

      const responseBody = await response.json();

      // === 步骤 2: 返回响应给 Gateway ===
      const proxyResponse: HttpProxyResponseMessage = {
        type: 'http_proxy_response',
        requestId: requestId,  // 关联原始请求
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody
      };

      ws.send(JSON.stringify(proxyResponse));
    } catch (error) {
      // 错误响应
      ws.send(JSON.stringify({
        type: 'http_proxy_response',
        requestId: requestId,
        status: 500,
        body: { error: 'Backend error' }
      }));
    }
  }
});
```

### Gateway 接收并转发响应

**Gateway 代码**:

```typescript
// Gateway 收到 Backend 的响应
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'http_proxy_response') {
    const { requestId, status, headers, body } = message;

    // 查找等待中的 HTTP 请求
    const pending = pendingHttpRequests.get(requestId);
    if (pending) {
      pending.resolve({ status, headers, body });
      pendingHttpRequests.delete(requestId);
    }
  }
});
```

---

## 3. WebSocket 消息转发流程

### 场景：客户端通过 WebSocket 发送消息

**步骤 1: 客户端连接并认证**

```typescript
// 客户端 → Gateway
{
  type: 'gateway_auth',
  gatewaySecret: 'team-gateway-secret'
}

// Gateway → 客户端
{
  type: 'gateway_auth_result',
  success: true
}
```

**步骤 2: 客户端连接到特定 Backend**

```typescript
// 客户端 → Gateway
{
  type: 'connect_backend',
  backendId: 'abc12345',
  apiKey: 'laptop-api-key'
}
```

**Gateway 处理代码** ([gateway/src/server.ts:526-618](../../gateway/src/server.ts#L526-L618)):

```typescript
async function handleConnectBackend(clientWs: WebSocket, clientId: string, message: ConnectBackendMessage) {
  const { backendId, apiKey } = message;

  // === 步骤 1: 查找 Backend ===
  const backend = backends.get(backendId);
  if (!backend || backend.ws.readyState !== WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'backend_auth_result',
      backendId: backendId,
      success: false,
      error: 'Backend not available'
    }));
    return;
  }

  // === 步骤 2: 转发认证请求到 Backend ===
  const authRequest: ClientAuthMessage = {
    type: 'client_auth',
    clientId: clientId,  // Gateway 生成的客户端 ID
    apiKey: apiKey
  };

  backend.ws.send(JSON.stringify(authRequest));

  // Backend 会返回 client_auth_result，Gateway 会转发给客户端
}
```

**Backend 验证 API Key**:

```typescript
// Backend 收到认证请求
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'client_auth') {
    const { clientId, apiKey } = message;

    // 验证 API Key
    const isValid = validateApiKey(apiKey);

    // 返回结果
    ws.send(JSON.stringify({
      type: 'client_auth_result',
      clientId: clientId,
      success: isValid,
      error: isValid ? undefined : 'Invalid API key'
    }));
  }
});
```

**Gateway 转发认证结果**:

```typescript
// Gateway 收到 Backend 的认证结果
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'client_auth_result') {
    const { clientId, success, error } = message;

    // 查找客户端连接
    const client = clients.get(clientId);
    if (client) {
      if (success) {
        // 记录客户端已认证到该 Backend
        client.authenticatedBackends.add(backendId);
      }

      // 转发结果给客户端
      client.ws.send(JSON.stringify({
        type: 'backend_auth_result',
        backendId: backendId,
        success: success,
        error: error
      }));
    }
  }
});
```

**步骤 3: 客户端发送消息到 Backend**

```typescript
// 客户端 → Gateway
{
  type: 'send_to_backend',
  backendId: 'abc12345',
  message: {
    type: 'create_session',
    projectId: 'proj-001',
    modelConfig: { ... }
  }
}
```

**Gateway 转发消息**:

```typescript
async function handleSendToBackend(clientWs: WebSocket, clientId: string, message: SendToBackendMessage) {
  const { backendId, message: clientMessage } = message;

  // === 步骤 1: 验证客户端已认证 ===
  const client = clients.get(clientId);
  if (!client || !client.authenticatedBackends.has(backendId)) {
    clientWs.send(JSON.stringify({
      type: 'error',
      error: 'Not authenticated to this backend'
    }));
    return;
  }

  // === 步骤 2: 查找 Backend ===
  const backend = backends.get(backendId);
  if (!backend || backend.ws.readyState !== WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'error',
      error: 'Backend not available'
    }));
    return;
  }

  // === 步骤 3: 转发消息 ===
  const forwardedMessage: ForwardedMessage = {
    type: 'forwarded',
    clientId: clientId,  // Backend 需要知道是哪个客户端
    message: clientMessage
  };

  backend.ws.send(JSON.stringify(forwardedMessage));
}
```

**Backend 处理消息并响应**:

```typescript
// Backend 收到转发的消息
ws.on('message', async (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'forwarded') {
    const { clientId, message: clientMessage } = message;

    // 处理消息（创建会话、发送聊天等）
    const response = await handleClientMessage(clientMessage);

    // 返回响应给 Gateway
    const backendResponse: BackendResponseMessage = {
      type: 'backend_response',
      clientId: clientId,  // 指定接收响应的客户端
      message: response
    };

    ws.send(JSON.stringify(backendResponse));
  }
});
```

**Gateway 转发响应给客户端**:

```typescript
// Gateway 收到 Backend 的响应
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'backend_response') {
    const { clientId, message: serverMessage } = message;

    // 查找客户端并转发
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(serverMessage));
    }
  }
});
```

---

## 4. 完整流程图

### HTTP 请求流程

```
┌─────────────┐
│   客户端     │
│             │
│ GET /api/   │
│ proxy/abc/  │
│ api/proj    │
└──────┬──────┘
       │
       │ ① HTTP Request
       │ Authorization: Bearer gw-secret:api-key
       │
       ▼
┌─────────────────────────────────────┐
│          Gateway (3200)              │
│                                      │
│ ② 解析 backendId: "abc12345"       │
│ ③ 验证 Gateway Secret               │
│ ④ 查找 backends.get("abc12345")    │
│ ⑤ 创建 http_proxy_request          │
│ ⑥ requestId: "uuid-123"            │
└──────┬──────────────────────────────┘
       │
       │ ⑦ WebSocket Message
       │ { type: 'http_proxy_request',
       │   requestId: 'uuid-123',
       │   method: 'GET',
       │   path: '/api/projects',
       │   headers: { Authorization: 'Bearer api-key' }
       │ }
       │
       ▼
┌─────────────────────────────────────┐
│      Backend abc12345 (3100)        │
│                                      │
│ ⑧ 收到代理请求                       │
│ ⑨ 转发到本地服务器                   │
│    fetch('http://localhost:3100/   │
│          api/projects')             │
│ ⑩ 处理请求                          │
└──────┬──────────────────────────────┘
       │
       │ ⑪ WebSocket Message
       │ { type: 'http_proxy_response',
       │   requestId: 'uuid-123',
       │   status: 200,
       │   body: { data: [...] }
       │ }
       │
       ▼
┌─────────────────────────────────────┐
│          Gateway (3200)              │
│                                      │
│ ⑫ 收到响应                          │
│ ⑬ 通过 requestId 关联原始请求       │
│ ⑭ resolve(response)                │
└──────┬──────────────────────────────┘
       │
       │ ⑮ HTTP Response
       │ Status: 200
       │ Body: { data: [...] }
       │
       ▼
┌─────────────┐
│   客户端     │
└─────────────┘
```

### WebSocket 消息流程

```
┌─────────────┐
│   客户端     │
└──────┬──────┘
       │
       │ ① send_to_backend
       │ { backendId: 'abc12345',
       │   message: { type: 'create_session', ... }
       │ }
       │
       ▼
┌──────────────────────────────┐
│      Gateway (3200)           │
│                               │
│ ② 验证认证                    │
│ ③ 查找 backends['abc12345']  │
│ ④ 包装消息                    │
└──────┬───────────────────────┘
       │
       │ ⑤ forwarded
       │ { type: 'forwarded',
       │   clientId: 'client-uuid',
       │   message: { type: 'create_session', ... }
       │ }
       │
       ▼
┌──────────────────────────────┐
│  Backend abc12345 (3100)     │
│                               │
│ ⑥ 处理消息                    │
│ ⑦ 生成响应                    │
└──────┬───────────────────────┘
       │
       │ ⑧ backend_response
       │ { type: 'backend_response',
       │   clientId: 'client-uuid',
       │   message: { type: 'session_created', ... }
       │ }
       │
       ▼
┌──────────────────────────────┐
│      Gateway (3200)           │
│                               │
│ ⑨ 根据 clientId 查找客户端   │
│ ⑩ 转发响应                    │
└──────┬───────────────────────┘
       │
       │ ⑪ ServerMessage
       │ { type: 'session_created', ... }
       │
       ▼
┌─────────────┐
│   客户端     │
└─────────────┘
```

---

## 5. 关键数据结构

### Gateway 内部状态

```typescript
// Backend 连接映射
const backends = new Map<string, ConnectedBackend>();

interface ConnectedBackend {
  id: string;           // 内部连接 ID (UUID)
  backendId: string;    // 公开的路由 ID (8字符，持久化)
  deviceId: string;     // 设备 ID（稳定标识符）
  name: string;         // 显示名称
  ws: WebSocket;        // WebSocket 连接
  isAlive: boolean;     // 健康状态
}

// 客户端连接映射
const clients = new Map<string, ConnectedClient>();

interface ConnectedClient {
  id: string;                        // 客户端 ID (UUID)
  ws: WebSocket;                     // WebSocket 连接
  authenticatedBackends: Set<string>; // 已认证的 Backend IDs
  isAlive: boolean;                  // 健康状态
}

// HTTP 请求映射（用于关联请求和响应）
const pendingHttpRequests = new Map<string, {
  resolve: (response: HttpProxyResponse) => void;
  reject: (error: Error) => void;
}>();
```

---

## 6. 请求-响应关联机制

### 为什么需要 requestId？

HTTP 代理请求是**异步**的：
1. Gateway 发送请求到 Backend
2. Gateway 等待响应（最多 30 秒）
3. Backend 可能同时处理多个请求
4. Gateway 需要知道哪个响应对应哪个请求

### requestId 的作用

```typescript
// Gateway 发送请求时生成 requestId
const requestId = 'uuid-abc-123';

// 创建 Promise 并存储
const promise = new Promise((resolve, reject) => {
  pendingHttpRequests.set(requestId, { resolve, reject });

  setTimeout(() => {
    pendingHttpRequests.delete(requestId);
    reject(new Error('Timeout'));
  }, 30000);
});

// 发送到 Backend
backend.ws.send(JSON.stringify({
  type: 'http_proxy_request',
  requestId: requestId,  // ← 携带 requestId
  ...
}));

// 等待响应
const response = await promise;

// ------

// Backend 响应时携带相同的 requestId
backend.ws.send(JSON.stringify({
  type: 'http_proxy_response',
  requestId: requestId,  // ← 相同的 requestId
  status: 200,
  body: { ... }
}));

// Gateway 收到响应
const pending = pendingHttpRequests.get(requestId);
if (pending) {
  pending.resolve(response);  // ← 解析对应的 Promise
  pendingHttpRequests.delete(requestId);
}
```

---

## 7. 数据持久化

### Backend ID 持久化

**为什么需要持久化？**
- Backend 重启后应该保持相同的 backendId
- 客户端配置保存了 backendId，不应该改变

**实现** ([gateway/src/storage.ts](../../gateway/src/storage.ts)):

```sql
-- SQLite 数据库: ~/.my-claudia/gateway/gateway.db

CREATE TABLE device_mappings (
  device_id TEXT PRIMARY KEY,      -- 稳定的设备 ID
  backend_id TEXT UNIQUE NOT NULL, -- 分配的 backendId (8字符)
  name TEXT,                       -- 显示名称
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 示例数据
INSERT INTO device_mappings VALUES (
  'stable-device-uuid-1234',  -- Backend 提供的稳定 ID
  'abc12345',                 -- Gateway 分配的 backendId
  'My Laptop',
  1738570800000,
  1738570800000
);
```

**查询逻辑**:
```typescript
async function getOrCreateBackendId(deviceId: string, name: string): Promise<string> {
  // 1. 查找现有映射
  const existing = await db.get(
    'SELECT backend_id FROM device_mappings WHERE device_id = ?',
    deviceId
  );

  if (existing) {
    return existing.backend_id;  // 返回现有 ID
  }

  // 2. 生成新的 backendId（8字符随机字母数字）
  const backendId = generateBackendId();  // 例如: "abc12345"

  // 3. 保存映射
  await db.run(
    'INSERT INTO device_mappings (device_id, backend_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [deviceId, backendId, name, Date.now(), Date.now()]
  );

  return backendId;
}
```

---

## 8. 错误处理

### Backend 不可用

```typescript
// 情况 1: Backend 未注册
const backend = backends.get(backendId);
if (!backend) {
  return res.status(502).json({
    error: 'Backend not available',
    backendId: backendId
  });
}

// 情况 2: Backend 连接已断开
if (backend.ws.readyState !== WebSocket.OPEN) {
  return res.status(502).json({
    error: 'Backend connection closed',
    backendId: backendId
  });
}
```

### 请求超时

```typescript
// 30秒后仍未收到响应
setTimeout(() => {
  pendingHttpRequests.delete(requestId);
  reject(new Error('Request timeout'));
}, 30000);

// 返回 504 Gateway Timeout
res.status(504).json({
  error: 'Gateway timeout',
  requestId: requestId
});
```

### 认证失败

```typescript
// 客户端未认证到该 Backend
if (!client.authenticatedBackends.has(backendId)) {
  clientWs.send(JSON.stringify({
    type: 'error',
    error: 'Not authenticated to this backend',
    backendId: backendId
  }));
}
```

---

## 9. 健康检查

**Ping/Pong 机制** ([gateway/src/server.ts:269-291](../../gateway/src/server.ts#L269-L291)):

```typescript
// 每 30 秒发送 ping
const pingInterval = setInterval(() => {
  backends.forEach((backend, backendId) => {
    if (!backend.isAlive) {
      // 上次 ping 没有收到 pong，认为连接已断开
      console.log(`Backend ${backendId} disconnected (ping timeout)`);
      handleBackendDisconnect(backendId);
      return;
    }

    // 标记为未响应，等待 pong
    backend.isAlive = false;

    // 发送 ping
    backend.ws.ping();
  });
}, 30000);

// 收到 pong
ws.on('pong', () => {
  backend.isAlive = true;
});
```

---

## 10. 总结

### 转发机制要点

| 传输方式 | 转发方式 | 关联机制 |
|---------|---------|---------|
| **HTTP API** | HTTP → WebSocket → HTTP | requestId (UUID) |
| **WebSocket** | WebSocket → WebSocket | clientId (Gateway生成) |

### 关键组件

1. **Backend 注册表**: `Map<backendId, ConnectedBackend>`
2. **Client 认证表**: `Map<clientId, Set<backendId>>`
3. **请求关联表**: `Map<requestId, Promise>`
4. **持久化存储**: SQLite (deviceId → backendId)

### 数据流

```
客户端 → Gateway → Backend → Gateway → 客户端
        ↑                            ↑
        查找 Backend                  关联响应
        验证认证                      转发响应
```

### 核心代码文件

- **Gateway 服务器**: [gateway/src/server.ts](../../gateway/src/server.ts)
- **Backend 客户端**: [server/src/gateway-client.ts](../../server/src/gateway-client.ts)
- **持久化存储**: [gateway/src/storage.ts](../../gateway/src/storage.ts)
- **类型定义**: [shared/src/index.ts](../../shared/src/index.ts#L762-L965)

Gateway 的转发机制确保了**多个 Backend 可以通过一个 Gateway 统一访问**，同时保持**数据隔离**和**请求准确路由**。🎯
