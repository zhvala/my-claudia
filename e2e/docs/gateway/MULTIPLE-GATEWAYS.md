# 多 Gateway Backend 支持文档

## 概述

测试框架现已支持同时配置和测试多个 Gateway backend。这在以下场景中非常有用：

- 测试生产环境和测试环境的不同 gateway
- 比较不同 gateway 配置的性能
- 验证多个后端服务器的兼容性
- 测试 gateway 之间的切换功能

## 架构变更

### 1. 灵活的模式 ID 系统

之前的架构限制模式 ID 只能是 `'local' | 'remote' | 'gateway'`，现在已改为支持任意字符串：

```typescript
// 之前
id: 'local' | 'remote' | 'gateway';

// 现在
id: string;  // 支持 'gateway1', 'gateway2', 'gateway-prod' 等
```

### 2. 动态模式注册

新增 `registerMode()` 函数，允许在运行时注册新的模式：

```typescript
import { registerMode } from '../../helpers/modes';
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';

registerMode(gateway1Mode);
```

## 配置方法

### 方式一：环境变量配置（推荐）

在 `.env.test` 文件中配置多个 gateway：

```bash
# Gateway Backend 1 (生产环境)
GATEWAY1_URL=ws://gateway1.example.com:3200
GATEWAY1_SECRET=prod-gateway-secret
GATEWAY1_API_KEY=prod-api-key
GATEWAY1_BACKEND_ID=backend-prod-001  # 可选
GATEWAY1_PROXY_URL=socks5://proxy.example.com:1080
GATEWAY1_PROXY_USER=proxyuser
GATEWAY1_PROXY_PASS=proxypass

# Gateway Backend 2 (测试环境)
GATEWAY2_URL=ws://gateway2.example.com:3201
GATEWAY2_SECRET=staging-gateway-secret
GATEWAY2_API_KEY=staging-api-key
GATEWAY2_BACKEND_ID=backend-staging-001  # 可选
```

### 方式二：创建自定义配置文件

创建新文件 `e2e/fixtures/modes/my-gateway.config.ts`：

```typescript
import type { ModeConfig } from '../../helpers/modes';

export const myGatewayMode: ModeConfig = {
  id: 'my-custom-gateway',  // 任意唯一 ID
  name: 'My Custom Gateway',  // 显示名称
  enabled: !!process.env.MY_GATEWAY_SECRET,
  serverAddress: 'gateway.mycompany.com:3200',
  requiresAuth: true,
  gatewayUrl: 'ws://gateway.mycompany.com:3200',
  gatewaySecret: process.env.MY_GATEWAY_SECRET || '',
  backendId: process.env.MY_BACKEND_ID,
  apiKey: process.env.MY_API_KEY || '',

  // 可选：代理配置
  proxyUrl: process.env.MY_PROXY_URL,
  proxyAuth: process.env.MY_PROXY_USER ? {
    username: process.env.MY_PROXY_USER,
    password: process.env.MY_PROXY_PASS || ''
  } : undefined,
};
```

然后注册：

```typescript
import { registerMode } from '../../helpers/modes';
import { myGatewayMode } from '../../fixtures/modes/my-gateway.config';

registerMode(myGatewayMode);
```

## 使用方法

### 1. 在测试中手动切换

```typescript
import { test } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode } from '../../helpers/connection';
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';
import { registerMode } from '../../helpers/modes';

// 注册模式
registerMode(gateway1Mode);

test('test on gateway1', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const gateway1 = getMode('gateway1');

  if (!gateway1.enabled) {
    test.skip('Gateway1 未配置');
  }

  // 切换到 Gateway 1
  await switchToMode(page, gateway1);

  // 测试逻辑...
  const textarea = page.locator('textarea').first();
  await textarea.fill('在 Gateway 1 上测试');
});
```

### 2. 使用 testAllModes 自动测试所有模式

```typescript
import { testAllModes } from '../../helpers/test-factory';
import { registerMode } from '../../helpers/modes';
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';
import { gateway2Mode } from '../../fixtures/modes/gateway2.config';

// 注册所有 gateway
registerMode(gateway1Mode);
registerMode(gateway2Mode);

// 这个测试会在所有启用的模式上运行，包括 gateway1 和 gateway2
testAllModes('应该能发送消息', async (page, mode) => {
  const textarea = page.locator('textarea').first();
  await textarea.fill(`在 ${mode.name} 上测试`);

  console.log(`✓ ${mode.name} 测试通过`);
});
```

### 3. 只在特定 Gateway 上运行测试

```typescript
import { testModes } from '../../helpers/test-factory';
import { registerMode } from '../../helpers/modes';
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';
import { gateway2Mode } from '../../fixtures/modes/gateway2.config';

registerMode(gateway1Mode);
registerMode(gateway2Mode);

// 只在 gateway1 和 gateway2 上运行，跳过 local 和 remote
testModes(['gateway1', 'gateway2'], '测试所有 gateway', async (page, mode) => {
  console.log(`在 ${mode.name} 上测试 gateway 特定功能`);

  // Gateway 特定的测试逻辑...
});
```

### 4. 测试 Gateway 之间的切换

```typescript
import { test } from '../../helpers/setup';
import { getMode, registerMode } from '../../helpers/modes';
import { switchToMode } from '../../helpers/connection';
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';
import { gateway2Mode } from '../../fixtures/modes/gateway2.config';

registerMode(gateway1Mode);
registerMode(gateway2Mode);

test('在多个 gateway 之间切换', async ({ page }) => {
  const gateway1 = getMode('gateway1');
  const gateway2 = getMode('gateway2');

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 切换到 Gateway 1
  await switchToMode(page, gateway1);
  await page.locator('textarea').first().fill('Message on Gateway 1');
  console.log('✓ Gateway 1 工作正常');

  // 切换到 Gateway 2
  await switchToMode(page, gateway2);
  await page.locator('textarea').first().fill('Message on Gateway 2');
  console.log('✓ Gateway 2 工作正常');

  // 切换回 Gateway 1
  await switchToMode(page, gateway1);
  console.log('✓ 切换回 Gateway 1 成功');
});
```

## 完整示例

参考 [multiple-gateways-example.spec.ts](examples/multiple-gateways-example.spec.ts) 获取完整的使用示例。

## 运行测试

```bash
# 运行所有测试（包括所有配置的 gateway）
pnpm playwright test

# 运行多 gateway 示例
pnpm playwright test e2e/tests/examples/multiple-gateways-example.spec.ts

# 使用 UI 模式调试
pnpm playwright test e2e/tests/examples/multiple-gateways-example.spec.ts --ui
```

## 注意事项

1. **启用条件**: Gateway 只有在配置了相应的环境变量（如 `GATEWAY1_SECRET`）时才会启用
2. **Backend ID**: 如果不预先配置 `BACKEND_ID`，框架会在运行时动态获取
3. **代理配置**: 代理配置是可选的，只有配置了 `PROXY_URL` 才会使用
4. **模式 ID 唯一性**: 确保每个 gateway 的 `id` 是唯一的，避免冲突
5. **注册时机**: 在使用 `testAllModes()` 之前，需要先调用 `registerMode()` 注册所有自定义模式

## 最佳实践

1. **命名规范**: 建议使用 `gateway1`, `gateway2`, `gateway-prod`, `gateway-staging` 等有意义的 ID
2. **环境分离**: 为不同环境（生产、测试）使用不同的 gateway 配置
3. **集中注册**: 在测试套件的 setup 文件中集中注册所有模式，避免重复注册
4. **条件跳过**: 使用 `test.skip()` 在 gateway 未配置时跳过相关测试

## 故障排查

### Gateway 没有出现在可用模式列表中

检查：
- 环境变量是否正确配置（如 `GATEWAY1_SECRET`）
- 是否调用了 `registerMode()`
- 配置文件中 `enabled` 字段是否为 `true`

### 切换 Gateway 失败

检查：
- Gateway 服务器是否正常运行
- `gatewayUrl` 是否正确
- `gatewaySecret` 是否匹配服务器配置
- Backend 是否已注册到 Gateway

### Backend ID 获取失败

检查：
- Backend 服务器是否启动
- Backend 是否成功注册到 Gateway
- API Key 是否正确
- 网络连接是否正常

## API 参考

### registerMode(mode: ModeConfig): void

注册一个新的连接模式。

```typescript
registerMode({
  id: 'my-gateway',
  name: 'My Gateway',
  enabled: true,
  // ... 其他配置
});
```

### getMode(id: string): ModeConfig

获取指定 ID 的模式配置。

```typescript
const gateway1 = getMode('gateway1');
```

### getEnabledModes(): ModeConfig[]

获取所有已启用的模式。

```typescript
const enabledModes = getEnabledModes();
console.log(`共有 ${enabledModes.length} 个可用模式`);
```

## 相关文档

- [框架使用指南](FRAMEWORK-USAGE.md)
- [测试状态报告](TEST-STATUS.md)
- [完整测试报告](../TEST-REPORT.md)
- [示例代码](examples/multiple-gateways-example.spec.ts)
