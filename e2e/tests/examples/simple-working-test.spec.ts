/**
 * Simple working test - demonstrates the recommended approach
 */

import { test, expect } from '../../helpers/setup';

test.describe('Simple Tests (Recommended Approach)', () => {
  test('should load app and see Local Server connection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check for server selector - it should show "Local Server"
    const serverText = await page.textContent('body');
    expect(serverText).toContain('Local Server');

    console.log('✓ App loaded, Local Server visible');
  });

  test('should be able to see projects in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check for projects section (case-insensitive)
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('projects');

    console.log('✓ Projects section visible');
  });

  test('should have settings button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for Settings
    const settingsBtn = page.getByText('Settings');
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });

    console.log('✓ Settings button found');
  });
});
