# E2E Tests Quick Start Guide

## Initial Setup (One Time)

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Generate performance test fixtures**
   ```bash
   pnpm run fixtures:generate
   ```
   This creates:
   - Large session with 1000+ messages (769KB)
   - 100 test sessions for batch import testing
   - 10 test files for concurrent upload testing

## Running Tests

### Run All E2E Tests
```bash
pnpm run test:e2e
```

### Run Specific Test Suites

**User Workflow Tests** (end-to-end user scenarios)
```bash
pnpm run test:e2e:workflows
```

**Performance Tests** (load and speed testing)
```bash
pnpm run test:e2e:performance
```

### Interactive Testing

**UI Mode** (recommended for development)
```bash
pnpm run test:e2e:ui
```
- Visual test runner
- See tests execute in real-time
- Time travel through test steps
- Great for debugging

**Headed Mode** (see browser)
```bash
pnpm run test:e2e:headed
```

**Debug Mode** (step through tests)
```bash
pnpm run test:e2e:debug
```

### Run Individual Tests

By test name:
```bash
npx playwright test -g "Complete workflow"
```

By file:
```bash
npx playwright test e2e/tests/user-workflows.spec.ts
```

Specific test in a file:
```bash
npx playwright test e2e/tests/performance.spec.ts -g "large session"
```

## What Gets Tested

### User Workflows
- ✅ Complete workflow: Import → Continue conversation → Upload file → Send message
- ✅ Multi-project: Create projects → Import sessions → Switch → Verify isolation
- ✅ Data persistence: Actions → Refresh → Restart → Verify data intact

### Performance
- ✅ Import large session (1000+ messages) - target: < 30s
- ✅ Upload 10 files concurrently - target: < 5s
- ✅ Import 100 sessions - target: < 60s
- ✅ Common operations - target: < 3s each
- ✅ Database query performance
- ✅ Memory management with multiple sessions

## Prerequisites

Tests require both server and desktop app to be running. Playwright will automatically start them if not running:

- Server: http://localhost:3100
- Desktop: http://localhost:1420

Or start manually:
```bash
# Terminal 1 - Server
pnpm run server:dev

# Terminal 2 - Desktop
pnpm run desktop:dev

# Terminal 3 - Tests
pnpm run test:e2e
```

## Test Results

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Troubleshooting

### "Large session fixture not found"
Run: `pnpm run fixtures:generate`

### Tests are slow or timing out
- Check system resources
- Close other applications
- Increase timeouts in test files if needed

### Database conflicts
Tests run sequentially to avoid conflicts. If you see DB errors:
- Ensure no other tests are running
- Check server is not in use by another process

### Import tests fail
- Verify server has file system access
- Check fixture paths are correct
- Ensure Claude CLI data fixtures exist

## Development Tips

1. **Use UI mode** for developing new tests:
   ```bash
   pnpm run test:e2e:ui
   ```

2. **Run specific tests** while developing:
   ```bash
   npx playwright test -g "your test name"
   ```

3. **Update snapshots** if UI changes:
   ```bash
   npx playwright test --update-snapshots
   ```

4. **See what Playwright sees**:
   - Use headed mode: `pnpm run test:e2e:headed`
   - Add `await page.pause()` in test code

## CI/CD

Tests are configured for CI with:
- 2 retry attempts
- Screenshots on failure
- Trace on first retry
- HTML and list reporters

## Performance Benchmarks

Expected performance on typical dev machine:

| Operation | Threshold | Typical |
|-----------|-----------|---------|
| Create session | 3s | ~500ms |
| Import 1000 msgs | 30s | ~15s |
| Upload 10 files | 5s | ~2s |
| Import 100 sessions | 60s | ~30s |

## Next Steps

- Read [tests/README.md](./tests/README.md) for detailed documentation
- Check [helpers/performance.ts](./helpers/performance.ts) for performance utilities
- See [fixtures/performance-data/README.md](./fixtures/performance-data/README.md) for fixture details
