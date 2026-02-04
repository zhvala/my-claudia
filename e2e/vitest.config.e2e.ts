import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/tests/**/*.spec.ts'],
    pool: 'forks',
    fileParallelism: false, // Sequential execution for DB consistency
    testTimeout: 60000,
    retry: process.env.CI ? 2 : 0,
    allowOnly: !process.env.CI,
    globalSetup: ['./e2e/setup/global-setup.ts'],
    reporters: ['default'],
    setupFiles: ['./e2e/helpers/custom-matchers.ts'],
  },
});
