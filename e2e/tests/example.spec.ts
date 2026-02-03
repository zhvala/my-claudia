import { test, expect } from '@playwright/test';

test.describe('Example Test - Verify Setup', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Basic assertion to verify the page loaded
    await expect(page).toHaveTitle(/My Claudia|Claudia/i);
  });

  test('should have a body element', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify we can interact with the page
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('should load without many console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // We allow some errors since the app might have expected errors
    // This test just verifies the page loads
    expect(errors.length).toBeLessThan(10);
  });
});
