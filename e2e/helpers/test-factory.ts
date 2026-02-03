import { test as base, expect } from './setup';
import { getEnabledModes, type ModeConfig } from './modes';
import { switchToMode, verifyMode } from './connection';
import type { Page } from '@playwright/test';

/**
 * Wait for the app to be fully loaded and ready
 * Based on the pattern from http-migration.spec.ts
 */
async function waitForAppReady(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Simple wait for connection - no need to verify "Connected" status
  // since the default Local Server auto-connects
  await page.waitForTimeout(500);
}

/**
 * Create parameterized tests that run on all enabled modes
 */
export function testAllModes(
  description: string,
  testFn: (page: Page, mode: ModeConfig) => Promise<void>
) {
  const enabledModes = getEnabledModes();

  for (const mode of enabledModes) {
    base(`${description} [${mode.name}]`, async ({ page }) => {
      // Wait for app to be ready
      await waitForAppReady(page);

      // Switch to this mode
      await switchToMode(page, mode);
      await verifyMode(page, mode);

      // Run the actual test
      await testFn(page, mode);
    });
  }
}

/**
 * Create parameterized tests for specific modes only
 */
export function testModes(
  modeIds: Array<'local' | 'remote' | 'gateway'>,
  description: string,
  testFn: (page: Page, mode: ModeConfig) => Promise<void>
) {
  const enabledModes = getEnabledModes().filter(m => modeIds.includes(m.id));

  for (const mode of enabledModes) {
    base(`${description} [${mode.name}]`, async ({ page }) => {
      // Wait for app to be ready
      await waitForAppReady(page);

      // Switch to this mode
      await switchToMode(page, mode);
      await verifyMode(page, mode);

      // Run the actual test
      await testFn(page, mode);
    });
  }
}
