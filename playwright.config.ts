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
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Start servers before tests
  webServer: [
    {
      command: 'cd server && pnpm run dev',
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
