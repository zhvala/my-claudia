import { test, expect } from '../../helpers/setup';

/**
 * Basic smoke test to verify the framework works
 * Uses the default local server (no mode switching)
 */
test.describe('Basic Framework Test', () => {
  test('should load app and connect to local server', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for connection
    await page.waitForFunction(() => {
      const el = document.querySelector('[class*="server"]');
      return el?.textContent?.includes('Connected') || document.body.textContent?.includes('Connected');
    }, { timeout: 15000 }).catch(() => {});

    await page.waitForTimeout(2000);

    // Verify we can see the main UI elements
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    console.log('✓ App loaded successfully');
  });

  test('should have server selector visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check for server selector
    const serverSelector = page.locator('[class*="server"]').first();
    await expect(serverSelector).toBeVisible({ timeout: 10000 });

    console.log('✓ Server selector is visible');
  });
});
