import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run sequentially for DB consistency
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid DB conflicts
  reporter: [
    ['html'],
    ['list']
  ],
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Start servers before tests (order: gateway → backend → desktop)
  webServer: [
    {
      command: 'cd gateway && GATEWAY_SECRET=test-secret-my-claudia-2026 pnpm run dev',
      port: 3200,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd server && GATEWAY_URL=ws://localhost:3200 GATEWAY_SECRET=test-secret-my-claudia-2026 GATEWAY_NAME=TestBackend pnpm run dev',
      port: 3100,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd apps/desktop && pnpm run dev',
      port: 1420,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 }
      },
    },
  ],
});
