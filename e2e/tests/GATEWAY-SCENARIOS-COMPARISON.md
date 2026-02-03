# Gateway 测试场景对比

## 快速对比

| 特性 | 多个独立 Gateway | 同一 Gateway 多 Backend |
|------|------------------|------------------------|
| Gateway 服务器数量 | 多个 | 1个 |
| Gateway Secret | 每个不同 | 相同 |
| Backend ID | 每个不同 | 每个不同 |
| API Key | 每个不同 | 每个不同 |
| 适用场景 | 多环境（生产/测试） | 多设备/分布式后端 |
| 文档 | [MULTIPLE-GATEWAYS.md](MULTIPLE-GATEWAYS.md) | [SAME-GATEWAY-MULTI-BACKENDS.md](SAME-GATEWAY-MULTI-BACKENDS.md) |

## 场景 1：多个独立 Gateway 服务器

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端                                 │
└─────────────────────────────────────────────────────────────┘
                  │                    │
                  │                    │
    ┌─────────────┘                    └─────────────┐
    │                                                  │
    ▼                                                  ▼
┌─────────────────────┐                  ┌─────────────────────┐
│  Gateway Server 1   │                  │  Gateway Server 2   │
│  gateway1.com:3200  │                  │  gateway2.com:3201  │
│  Secret: secret-1   │                  │  Secret: secret-2   │
└─────────────────────┘                  └─────────────────────┘
          │                                          │
          │                                          │
          ▼                                          ▼
┌─────────────────────┐                  ┌─────────────────────┐
│     Backend A       │                  │     Backend B       │
│  backend-prod-001   │                  │  backend-stag-001   │
│  Key: prod-key      │                  │  Key: stag-key      │
└─────────────────────┘                  └─────────────────────┘
```

### 配置示例

```bash
# Gateway 1 (生产环境)
GATEWAY1_URL=ws://gateway1.example.com:3200
GATEWAY1_SECRET=production-gateway-secret
GATEWAY1_API_KEY=production-backend-key
GATEWAY1_BACKEND_ID=backend-prod-001

# Gateway 2 (测试环境)
GATEWAY2_URL=ws://gateway2.example.com:3201
GATEWAY2_SECRET=staging-gateway-secret
GATEWAY2_API_KEY=staging-backend-key
GATEWAY2_BACKEND_ID=backend-stag-001
```

### 使用代码

```typescript
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';
import { gateway2Mode } from '../../fixtures/modes/gateway2.config';

registerMode(gateway1Mode);
registerMode(gateway2Mode);

// 切换到 Gateway 1（生产环境）
await switchToMode(page, getMode('gateway1'));

// 切换到 Gateway 2（测试环境）
await switchToMode(page, getMode('gateway2'));
```

### 适用场景

✅ **多环境部署**
- 生产 Gateway + 测试 Gateway
- 不同地区的 Gateway 服务器
- 公司内部 vs 外部 Gateway

✅ **完全独立的基础设施**
- 不同的网络环境
- 不同的安全策略
- 不同的运维团队

✅ **性能比较测试**
- 比较不同 Gateway 的延迟
- 测试 Gateway 容错能力
- 负载均衡测试

---

## 场景 2：同一 Gateway，多个 Backend

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
              ┌─────────────────────────────┐
              │    Gateway Server           │
              │    gateway.com:3200         │
              │    Secret: shared-secret    │
              └─────────────────────────────┘
                    │           │           │
        ┌───────────┼───────────┼───────────┤
        │           │           │           │
        ▼           ▼           ▼           ▼
    ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐
    │Backend│  │Backend│  │Backend│  │Backend│
    │   A   │  │   B   │  │   C   │  │   D   │
    │laptop │  │desktop│  │ cloud │  │mobile │
    │-001   │  │-002   │  │-003   │  │-004   │
    │key-A  │  │key-B  │  │key-C  │  │key-D  │
    └───────┘  └───────┘  └───────┘  └───────┘
```

### 配置示例

```bash
# 共享的 Gateway 配置
GATEWAY_SECRET=shared-gateway-secret

# Backend A: 个人笔记本
GATEWAY_BACKEND_A_ID=backend-laptop-001
GATEWAY_BACKEND_A_KEY=laptop-api-key

# Backend B: 工作台式机
GATEWAY_BACKEND_B_ID=backend-desktop-002
GATEWAY_BACKEND_B_KEY=desktop-api-key

# Backend C: 云服务器
GATEWAY_BACKEND_C_ID=backend-cloud-003
GATEWAY_BACKEND_C_KEY=cloud-api-key

# Backend D: 移动设备
GATEWAY_BACKEND_D_ID=backend-mobile-004
GATEWAY_BACKEND_D_KEY=mobile-api-key
```

### 使用代码

```typescript
import { gatewayBackendAMode } from '../../fixtures/modes/gateway-backend-a.config';
import { gatewayBackendBMode } from '../../fixtures/modes/gateway-backend-b.config';

registerMode(gatewayBackendAMode);
registerMode(gatewayBackendBMode);

// 切换到 Backend A（笔记本）
await switchToMode(page, getMode('gateway-backend-a'));

// 切换到 Backend B（台式机）
await switchToMode(page, getMode('gateway-backend-b'));
```

### 适用场景

✅ **个人多设备访问**
- 笔记本 + 台式机 + 服务器
- 通过一个 Gateway 统一访问
- 无需配置多个 Gateway

✅ **团队协作**
- 团队共享一个 Gateway
- 每个成员连接自己的 Backend
- 统一的网络配置

✅ **分布式后端架构**
- 多个 Backend 处理不同任务
- 通过 Gateway 统一调度
- 负载分配和故障转移

✅ **开发和测试**
- 本地开发环境
- Docker 容器
- 远程测试服务器
- 都通过同一个 Gateway 访问

---

## 详细对比

### 网络拓扑

**多 Gateway**:
```
Client → Gateway1 → Backend1
Client → Gateway2 → Backend2
```
- 独立的网络路径
- Gateway 之间无关联

**同一 Gateway**:
```
Client → Gateway → Backend1
              └─→ Backend2
              └─→ Backend3
```
- 共享网络路径
- Gateway 统一调度

### 认证流程

**多 Gateway**:
```
Gateway1:
  Secret: secret1
  Backend: key1

Gateway2:
  Secret: secret2
  Backend: key2
```
- 每个 Gateway 独立认证
- 不同的 Secret

**同一 Gateway**:
```
Gateway:
  Secret: shared-secret
  Backend A: key-A
  Backend B: key-B
  Backend C: key-C
```
- Gateway 认证共享
- Backend 认证独立

### 配置复杂度

**多 Gateway**:
```bash
# 需要配置多个 Gateway
GATEWAY1_URL=...
GATEWAY1_SECRET=...
GATEWAY1_API_KEY=...

GATEWAY2_URL=...
GATEWAY2_SECRET=...
GATEWAY2_API_KEY=...
```
- 配置项较多
- 每个 Gateway 完整配置

**同一 Gateway**:
```bash
# Gateway 配置只需一次
GATEWAY_SECRET=shared-secret

# 每个 Backend 只需 ID 和 Key
GATEWAY_BACKEND_A_ID=...
GATEWAY_BACKEND_A_KEY=...

GATEWAY_BACKEND_B_ID=...
GATEWAY_BACKEND_B_KEY=...
```
- 配置更简洁
- Gateway 配置复用

### 故障影响范围

**多 Gateway**:
- Gateway1 挂了 → 只影响 Backend1
- Gateway2 正常 → Backend2 不受影响
- **故障隔离性好**

**同一 Gateway**:
- Gateway 挂了 → 所有 Backend 都无法访问
- **单点故障风险**
- 需要 Gateway 高可用方案

### 性能特点

**多 Gateway**:
- 每个 Gateway 独立承载
- 性能瓶颈分散
- 适合高负载场景

**同一 Gateway**:
- Gateway 是性能瓶颈
- 需要足够的 Gateway 性能
- 适合中小规模场景

---

## 如何选择？

### 选择多个独立 Gateway，如果你需要：

1. ✅ 测试多个环境（生产、测试、开发）
2. ✅ 不同地理位置的 Gateway
3. ✅ 完全独立的安全域
4. ✅ 高可用和故障隔离
5. ✅ 不同的运维策略

**示例**：
```typescript
// 在生产 Gateway 上测试
await switchToMode(page, getMode('gateway-prod'));
await runProductionTests();

// 在测试 Gateway 上测试
await switchToMode(page, getMode('gateway-staging'));
await runStagingTests();
```

### 选择同一 Gateway 多 Backend，如果你需要：

1. ✅ 访问多个个人设备
2. ✅ 团队共享 Gateway 基础设施
3. ✅ 简化网络配置
4. ✅ 统一的访问入口
5. ✅ 分布式后端架构

**示例**：
```typescript
// 在笔记本上开发
await switchToMode(page, getMode('gateway-backend-laptop'));
await developFeature();

// 在服务器上测试
await switchToMode(page, getMode('gateway-backend-server'));
await runServerTests();

// 在台式机上部署
await switchToMode(page, getMode('gateway-backend-desktop'));
await deployToProduction();
```

---

## 混合使用

你也可以**同时使用两种模式**：

```typescript
// Gateway 1: 生产环境，单一后端
registerMode(gateway1Mode);

// Gateway 2: 测试环境，多个后端
registerMode(gateway2BackendAMode);  // 测试机器 A
registerMode(gateway2BackendBMode);  // 测试机器 B
registerMode(gateway2BackendCMode);  // 测试机器 C

// 测试流程
test('跨环境测试', async ({ page }) => {
  // 1. 在测试环境开发
  await switchToMode(page, getMode('gateway2-backend-a'));
  await developFeature();

  // 2. 在测试环境验证
  await switchToMode(page, getMode('gateway2-backend-b'));
  await verifyFeature();

  // 3. 在生产环境部署
  await switchToMode(page, getMode('gateway1'));
  await deployToProduction();
});
```

---

## 相关文档

- [Gateway Backend 路由机制](GATEWAY-BACKEND-ROUTING.md) - **详细技术原理**
- [多 Gateway 文档](MULTIPLE-GATEWAYS.md)
- [同一 Gateway 多 Backend 文档](SAME-GATEWAY-MULTI-BACKENDS.md)
- [框架使用指南](FRAMEWORK-USAGE.md)
- [示例代码 - 多 Gateway](examples/multiple-gateways-example.spec.ts)
- [示例代码 - 同一 Gateway](examples/same-gateway-multi-backends.spec.ts)
- [路由演示](examples/gateway-routing-demo.spec.ts)

---

## 总结

| 你想要... | 使用方案 |
|----------|---------|
| 测试生产和测试环境 | 多个独立 Gateway |
| 访问多个个人设备 | 同一 Gateway 多 Backend |
| 不同地区的服务器 | 多个独立 Gateway |
| 团队共享基础设施 | 同一 Gateway 多 Backend |
| 高可用故障隔离 | 多个独立 Gateway |
| 简化网络配置 | 同一 Gateway 多 Backend |
| 分布式任务调度 | 同一 Gateway 多 Backend |
| 多环境性能对比 | 多个独立 Gateway |

**两种方案都完全支持，可以根据实际需求选择或混合使用！**
