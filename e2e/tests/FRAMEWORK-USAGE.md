# 跨模式测试框架使用指南

## 📦 已交付内容

### 1. 模式配置系统
- `e2e/fixtures/modes/local.config.ts` - 本地模式配置
- `e2e/fixtures/modes/remote.config.ts` - 远程 IP 模式配置
- `e2e/fixtures/modes/gateway.config.ts` - 网关模式配置
- `e2e/helpers/modes.ts` - 模式注册表和工具函数

### 2. 连接辅助函数
- `e2e/helpers/connection.ts` - 模式切换、服务器配置、连接等待等函数

### 3. 测试工厂模式
- `e2e/helpers/test-factory.ts` - `testAllModes()` 和 `testModes()` 参数化测试工具

### 4. 测试示例
- `e2e/tests/examples/mode-test-example.spec.ts` - 框架使用示例
- `e2e/tests/shared/*` - 跨模式功能测试（需要调整）
- `e2e/tests/connection/*` - 模式特定测试（需要调整）

### 5. 文档
- `.env.test.example` - 环境变量示例
- `e2e/tests/README-MODES.md` - 测试指南
- `package.json` - 新增测试脚本

## 🚀 快速开始

### 方式一：使用 testAllModes (推荐用于简单测试)

```typescript
import { testAllModes } from '../../helpers/test-factory';

// 这个测试会在所有启用的模式下自动运行
testAllModes('应该能访问主界面', async (page, mode) => {
  // 页面已加载，连接已建立
  const element = page.locator('[class*="server"]');
  await expect(element).toBeVisible();
  console.log(`✓ ${mode.name} 模式下测试通过`);
});
```

### 方式二：手动模式管理 (推荐用于复杂测试)

```typescript
import { test } from '../../helpers/setup';

test('我的测试', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 使用默认连接（Local Server）
  // 或手动切换模式：
  // await switchToMode(page, getMode('gateway'));

  // 你的测试逻辑...
});
```

### 方式三：参考现有测试模式

参考 `e2e/tests/http-migration.spec.ts`，它展示了如何手动管理不同模式的测试。

## 📝 可用的测试脚本

```bash
# 运行所有 E2E 测试
pnpm run test:e2e

# 运行跨模式测试
pnpm run test:e2e:shared

# 运行模式特定测试
pnpm run test:e2e:modes

# 仅运行特定模式
TEST_MODES=local pnpm run test:e2e
TEST_MODES=gateway pnpm run test:e2e
```

## 🎯 三种连接模式

### Local Mode（本地模式）
- **地址**: localhost:3100
- **认证**: 不需要
- **用途**: 开发环境
- **状态**: 默认启用

### Remote IP Mode（远程 IP 模式）
- **地址**: 可配置（如 192.168.1.100:3100）
- **认证**: 需要 API Key
- **用途**: 远程服务器
- **状态**: 通过环境变量启用

### Gateway Mode（网关模式）
- **地址**: 通过网关中继
- **认证**: 双层（Gateway Secret + Backend API Key）
- **用途**: 远程访问，支持 SOCKS5 代理
- **状态**: 测试环境默认启用

## ⚙️ 环境变量配置

复制 `.env.test.example` 到 `.env.test` 并配置：

```bash
# Remote IP Mode（可选）
REMOTE_SERVER_ADDRESS=192.168.1.100:3100
REMOTE_API_KEY=your-api-key-here

# Gateway Mode
GATEWAY_SECRET=test-gateway-secret
GATEWAY_API_KEY=your-gateway-api-key

# SOCKS5 Proxy（可选，用于 Gateway 模式）
SOCKS5_PROXY_URL=socks5://127.0.0.1:1080
SOCKS5_PROXY_USER=proxyuser
SOCKS5_PROXY_PASS=proxypass
```

## 🔧 常用 API

### 模式管理
```typescript
import { getMode, getEnabledModes } from '../../helpers/modes';

// 获取特定模式
const localMode = getMode('local');

// 获取所有启用的模式
const modes = getEnabledModes();
```

### 连接控制
```typescript
import { switchToMode, waitForConnection, verifyMode } from '../../helpers/connection';

// 切换到特定模式
await switchToMode(page, mode);

// 等待连接建立
await waitForConnection(page);

// 验证当前模式
await verifyMode(page, mode);
```

## ⚠️ 注意事项

1. **默认使用简单测试**: 由于模式切换可能复杂，建议先使用默认的 Local Server 进行基础测试
2. **参考现有测试**: `http-migration.spec.ts` 已经有工作的跨模式测试示例
3. **避免过度等待**: 不要使用过长的 `waitForTimeout`，可能导致测试超时
4. **检查元素可见性**: 在操作前先检查元素是否可见

## 📚 更多信息

- 详细测试指南: `e2e/tests/README-MODES.md`
- 示例测试: `e2e/tests/examples/mode-test-example.spec.ts`
- 现有测试参考: `e2e/tests/http-migration.spec.ts`
