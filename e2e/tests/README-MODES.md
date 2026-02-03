# Connection Mode Testing Guide

This testing framework supports three connection modes:

## Modes

1. **Local Mode** (always enabled)
   - Direct connection to localhost:3100
   - No authentication required
   - Full unrestricted access
   - Best for development

2. **Remote IP Mode** (optional, requires config)
   - Direct connection to remote server via IP/hostname
   - Requires API key authentication
   - Set via environment variables:
     - `REMOTE_SERVER_ADDRESS`
     - `REMOTE_API_KEY`

3. **Gateway Mode** (always enabled in test environment)
   - Connection through Gateway relay service
   - Two-tier authentication (gateway secret + backend API key)
   - Supports SOCKS5 proxy
   - Set via environment variables:
     - `GATEWAY_SECRET`
     - `GATEWAY_API_KEY`
     - `SOCKS5_PROXY_URL` (optional)

## Running Tests

### All modes (enabled ones only)
```bash
pnpm run test:e2e
```

### Specific mode only
```bash
TEST_MODES=local pnpm run test:e2e
TEST_MODES=gateway pnpm run test:e2e
```

### Connection tests only
```bash
pnpm run test:e2e:modes
```

### Shared functionality tests (all modes)
```bash
pnpm run test:e2e:shared
```

## Writing New Tests

### Test works in all modes
```typescript
import { testAllModes } from '../helpers/test-factory';

testAllModes('my test description', async (page, mode) => {
  // Test implementation
  // Will run once per enabled mode
});
```

### Test works in specific modes only
```typescript
import { testModes } from '../helpers/test-factory';

testModes(['local', 'remote'], 'my test', async (page, mode) => {
  // Only runs in Local and Remote IP modes
});
```

### Mode-specific test
```typescript
import { test, expect } from '../helpers/setup';
import { getMode } from '../helpers/modes';
import { switchToMode } from '../helpers/connection';

test('gateway-only feature', async ({ page }) => {
  const gatewayMode = getMode('gateway');
  await switchToMode(page, gatewayMode);

  // Test gateway-specific functionality
});
```

## Test Organization

```
e2e/tests/
├── connection/          # Mode-specific tests
│   ├── local-mode.spec.ts
│   ├── remote-mode.spec.ts
│   ├── gateway-mode.spec.ts
│   └── mode-switching.spec.ts
├── shared/              # Cross-mode tests
│   ├── chat.spec.ts
│   ├── sessions.spec.ts
│   └── tools.spec.ts
└── existing tests...    # Can be converted to use testAllModes()
```
