# Gateway 架构总结

## 一图看懂 Gateway

```
                        ┌─────────────────────────────────────┐
                        │        Gateway Server               │
                        │        (localhost:3200)             │
                        │                                     │
                        │  ┌──────────────────────────────┐  │
                        │  │ Backend 注册表                │  │
                        │  │                              │  │
                        │  │ backends = Map {             │  │
                        │  │   'abc12345' → {             │  │
                        │  │     ws: WebSocket,           │  │
                        │  │     deviceId: 'laptop-001',  │  │
                        │  │     name: 'My Laptop'        │  │
                        │  │   },                         │  │
                        │  │   'def67890' → {             │  │
                        │  │     ws: WebSocket,           │  │
                        │  │     deviceId: 'desktop-002', │  │
                        │  │     name: 'My Desktop'       │  │
                        │  │   }                          │  │
                        │  │ }                            │  │
                        │  └──────────────────────────────┘  │
                        │                                     │
                        │  ┌──────────────────────────────┐  │
                        │  │ 持久化存储 (SQLite)           │  │
                        │  │                              │  │
                        │  │ device_mappings {            │  │
                        │  │   laptop-001 → abc12345      │  │
                        │  │   desktop-002 → def67890     │  │
                        │  │ }                            │  │
                        │  └──────────────────────────────┘  │
                        └──────┬──────────────────┬──────────┘
                               │                  │
                               │ WebSocket        │ WebSocket
                               │                  │
           ┌───────────────────┘                  └───────────────────┐
           │                                                           │
           │                                                           │
    ┌──────▼──────────┐                                   ┌───────────▼──────┐
    │  Backend A       │                                   │  Backend B       │
    │  (abc12345)      │                                   │  (def67890)      │
    │                  │                                   │                  │
    │  localhost:3100  │                                   │  localhost:3100  │
    │                  │                                   │                  │
    │  My Laptop       │                                   │  My Desktop      │
    └──────────────────┘                                   └──────────────────┘


                        ┌─────────────────────────────────────┐
                        │          客户端                      │
                        │                                     │
                        │   请求方式:                          │
                        │                                     │
                        │   HTTP:                             │
                        │   GET /api/proxy/abc12345/api/...  │
                        │       (backendId 在 URL 中)         │
                        │                                     │
                        │   WebSocket:                        │
                        │   { type: 'send_to_backend',       │
                        │     backendId: 'abc12345',         │
                        │     message: {...} }               │
                        │       (backendId 在消息中)          │
                        └─────────────────────────────────────┘
```

## 核心概念

### 1. Backend 注册

```
Backend 启动
    │
    ├─→ 连接 Gateway WebSocket (ws://gateway:3200/ws)
    │
    ├─→ 发送注册消息
    │   { type: 'register',
    │     gatewaySecret: '...',
    │     deviceId: 'stable-uuid',  ← 稳定标识符
    │     name: 'My Laptop' }
    │
    ├─→ Gateway 验证 Secret
    │
    ├─→ Gateway 查询/创建 backendId
    │   deviceId: 'stable-uuid' → backendId: 'abc12345'
    │                                         ↑
    │                              持久化到 SQLite
    │
    └─→ Gateway 返回 backendId
        { type: 'register_result',
          success: true,
          backendId: 'abc12345' }
```

### 2. HTTP 请求转发

```
客户端
    │ GET /api/proxy/abc12345/api/projects
    │ Authorization: Bearer gw-secret:api-key
    │
    ▼
Gateway
    │ 1. 解析 backendId: 'abc12345'
    │ 2. 验证 Gateway Secret
    │ 3. 查找 Backend: backends.get('abc12345')
    │ 4. 创建 requestId: 'uuid-123'
    │ 5. 转换为 WebSocket 消息:
    │    { type: 'http_proxy_request',
    │      requestId: 'uuid-123',
    │      method: 'GET',
    │      path: '/api/projects',
    │      headers: { Authorization: 'Bearer api-key' } }
    │
    ▼
Backend abc12345
    │ 1. 收到代理请求
    │ 2. 转发到本地服务器:
    │    fetch('http://localhost:3100/api/projects', {
    │      headers: { Authorization: 'Bearer api-key' }
    │    })
    │ 3. 获取响应
    │ 4. 返回给 Gateway:
    │    { type: 'http_proxy_response',
    │      requestId: 'uuid-123',  ← 相同的 requestId
    │      status: 200,
    │      body: { data: [...] } }
    │
    ▼
Gateway
    │ 1. 通过 requestId 找到原始请求
    │ 2. resolve Promise
    │ 3. 返回 HTTP 响应
    │
    ▼
客户端
    │ 收到响应: { data: [...] }
```

### 3. WebSocket 消息转发

```
客户端
    │ { type: 'send_to_backend',
    │   backendId: 'abc12345',
    │   message: { type: 'create_session', ... } }
    │
    ▼
Gateway
    │ 1. 验证客户端已认证到该 Backend
    │ 2. 查找 Backend: backends.get('abc12345')
    │ 3. 包装消息:
    │    { type: 'forwarded',
    │      clientId: 'client-uuid',  ← Gateway 生成
    │      message: { type: 'create_session', ... } }
    │
    ▼
Backend abc12345
    │ 1. 处理消息
    │ 2. 生成响应
    │ 3. 返回给 Gateway:
    │    { type: 'backend_response',
    │      clientId: 'client-uuid',  ← 相同的 clientId
    │      message: { type: 'session_created', ... } }
    │
    ▼
Gateway
    │ 1. 根据 clientId 查找客户端
    │ 2. 转发响应
    │
    ▼
客户端
    │ 收到响应: { type: 'session_created', ... }
```

## 关键数据结构

### Gateway 维护的映射表

```typescript
// 1. Backend 连接映射
backends: Map<backendId, ConnectedBackend>
{
  'abc12345' → {
    ws: WebSocket,           // ← 指向 Backend 的连接
    deviceId: 'laptop-001',
    name: 'My Laptop',
    isAlive: true
  },
  'def67890' → {
    ws: WebSocket,
    deviceId: 'desktop-002',
    name: 'My Desktop',
    isAlive: true
  }
}

// 2. 客户端连接映射
clients: Map<clientId, ConnectedClient>
{
  'client-uuid-1' → {
    ws: WebSocket,           // ← 指向客户端的连接
    authenticatedBackends: Set(['abc12345', 'def67890']),
    isAlive: true
  }
}

// 3. HTTP 请求关联映射
pendingHttpRequests: Map<requestId, Promise>
{
  'uuid-123' → {
    resolve: (response) => { ... },
    reject: (error) => { ... },
    timeout: setTimeout(..., 30000)
  }
}

// 4. 持久化映射 (SQLite)
device_mappings: Table
{
  deviceId: 'laptop-001'   → backendId: 'abc12345'
  deviceId: 'desktop-002'  → backendId: 'def67890'
}
```

## 请求路由流程

### HTTP 请求

```
URL: /api/proxy/{backendId}/api/projects
                   ↓
        解析 backendId
                   ↓
        backends.get(backendId)
                   ↓
        找到 Backend WebSocket
                   ↓
        发送 http_proxy_request
                   ↓
        等待 http_proxy_response (通过 requestId 关联)
                   ↓
        返回 HTTP 响应
```

### WebSocket 消息

```
消息: { type: 'send_to_backend',
        backendId: 'abc12345',
        message: {...} }
            ↓
验证客户端已认证到该 Backend
            ↓
backends.get(backendId)
            ↓
找到 Backend WebSocket
            ↓
包装为 forwarded 消息
            ↓
Backend 处理并返回 backend_response
            ↓
Gateway 根据 clientId 转发给客户端
```

## 认证流程

### 两层认证

```
Layer 1: Gateway 认证
┌─────────────────────────────────────┐
│ Authorization: Bearer gw-secret:... │  ← Gateway Secret
│                       ↑              │
│              所有 Backend 共享       │
└─────────────────────────────────────┘

Layer 2: Backend 认证
┌─────────────────────────────────────┐
│ Authorization: Bearer gw-secret:api-key │  ← Backend API Key
│                                ↑       │
│                    每个 Backend 不同   │
└─────────────────────────────────────┘
```

### WebSocket 认证流程

```
1. 客户端 → Gateway
   { type: 'gateway_auth', gatewaySecret: '...' }

2. Gateway 验证 Secret
   ✓ 通过

3. 客户端 → Gateway
   { type: 'connect_backend', backendId: 'abc', apiKey: '...' }

4. Gateway → Backend
   { type: 'client_auth', clientId: 'uuid', apiKey: '...' }

5. Backend 验证 API Key
   ✓ 通过

6. Backend → Gateway
   { type: 'client_auth_result', clientId: 'uuid', success: true }

7. Gateway → 客户端
   { type: 'backend_auth_result', backendId: 'abc', success: true }

8. Gateway 记录: clients[uuid].authenticatedBackends.add('abc')
```

## 健康监控

```
每 30 秒:
    ├─→ 检查所有 Backend
    │   ├─→ 如果上次 ping 未收到 pong
    │   │   └─→ 认为连接断开，清理资源
    │   └─→ 发送新的 ping
    │
    └─→ 检查所有客户端
        └─→ 同样的 ping/pong 机制
```

## 文件位置

| 组件 | 文件路径 |
|------|---------|
| Gateway 服务器 | [gateway/src/server.ts](../../gateway/src/server.ts) |
| Gateway 启动 | [gateway/src/index.ts](../../gateway/src/index.ts) |
| Gateway 存储 | [gateway/src/storage.ts](../../gateway/src/storage.ts) |
| Backend 客户端 | [server/src/gateway-client.ts](../../server/src/gateway-client.ts) |
| 类型定义 | [shared/src/index.ts](../../shared/src/index.ts#L762-L965) |
| 桌面端 Transport | [apps/desktop/src/hooks/transport/GatewayTransport.ts](../../apps/desktop/src/hooks/transport/GatewayTransport.ts) |

## 数据库表结构

```sql
-- Gateway 数据库: ~/.my-claudia/gateway/gateway.db

-- Backend 映射表
CREATE TABLE device_mappings (
  device_id TEXT PRIMARY KEY,      -- Backend 提供的稳定 ID
  backend_id TEXT UNIQUE NOT NULL, -- Gateway 分配的 backendId (8字符)
  name TEXT,                       -- 显示名称
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Backend 重启后，deviceId 相同，分配到相同的 backendId
-- 客户端配置保存 backendId，无需更新
```

## 消息类型速查

### Backend → Gateway
- `register`: Backend 注册
- `client_auth_result`: 客户端认证结果
- `backend_response`: 响应消息
- `http_proxy_response`: HTTP 代理响应

### Client → Gateway
- `gateway_auth`: Gateway 认证
- `list_backends`: 列出 Backend
- `connect_backend`: 连接 Backend
- `send_to_backend`: 发送消息

### Gateway → Backend
- `register_result`: 注册结果
- `client_auth`: 客户端认证请求
- `forwarded`: 转发的客户端消息
- `http_proxy_request`: HTTP 代理请求

### Gateway → Client
- `gateway_auth_result`: Gateway 认证结果
- `backends_list`: Backend 列表
- `backend_auth_result`: Backend 认证结果
- `error`: 错误消息

## 关键特性

### ✅ 持久化
- Backend ID 持久化到 SQLite
- Backend 重启后保持相同 ID
- 客户端配置无需更新

### ✅ 健康监控
- Ping/Pong 机制
- 30秒超时检测
- 自动清理断开连接

### ✅ 请求关联
- HTTP: 通过 requestId (UUID)
- WebSocket: 通过 clientId (UUID)
- 30秒超时保护

### ✅ 数据隔离
- 每个 Backend 独立处理
- 客户端必须先认证
- 消息不会跨 Backend 泄露

### ✅ 双层认证
- Gateway Secret（所有 Backend 共享）
- Backend API Key（每个 Backend 独立）

## 详细文档链接

📖 [Gateway Backend 路由机制](GATEWAY-BACKEND-ROUTING.md) - 客户端如何指定 Backend
📖 [Gateway 请求转发机制](GATEWAY-REQUEST-FORWARDING.md) - Gateway 如何转发请求
📖 [同一 Gateway 多 Backend](SAME-GATEWAY-MULTI-BACKENDS.md) - 使用指南
📖 [Gateway 场景对比](GATEWAY-SCENARIOS-COMPARISON.md) - 场景选择
📖 [快速参考](GATEWAY-QUICK-REFERENCE.md) - 速查手册

## 测试示例

- [路由演示](examples/gateway-routing-demo.spec.ts) - 演示路由机制
- [多 Backend 测试](examples/same-gateway-multi-backends.spec.ts) - 完整测试

---

**这个架构的核心价值**：
1. 🌐 **NAT 穿透** - Backend 在防火墙后也能被访问
2. 🔀 **统一入口** - 多个 Backend 通过一个 Gateway 访问
3. 🔐 **双层安全** - Gateway + Backend 两层认证
4. 💾 **持久稳定** - Backend ID 持久化，重启不变
5. 📡 **实时监控** - 健康检查，自动故障转移
