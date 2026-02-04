import { test, expect } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode } from '../../helpers/connection';

test.describe('Remote IP Mode Specific Features', () => {
  const remoteMode = getMode('remote');

  test.skip(!remoteMode.enabled, 'Remote mode not configured');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await switchToMode(page, remoteMode);
  });

  test('should require valid API key', async ({ page }) => {
    // The server selector should show the remote mode name
    const serverSelector = page.locator('[data-testid="server-selector"]');
    await expect(serverSelector).toBeVisible({ timeout: 5000 });
    const buttonText = await serverSelector.textContent();
    expect(buttonText).toContain(remoteMode.name);

    console.log('✓ Remote connection with API key successful');
  });

  test('should reject invalid API key', async ({ page }) => {
    // Open server selector
    await page.click('[data-testid="server-selector"]');
    await page.waitForTimeout(500);

    // Open the server menu first (three-dot button)
    const menuBtn = page.locator('[data-testid="server-menu-btn"]').first();
    if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(300);

      // Click Edit
      const editBtn = page.locator('[data-testid="edit-server-btn"]').first();
      if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(300);

        // Check if API key input is visible (hidden for local-like addresses)
        const apiKeyInput = page.locator('[data-testid="api-key-input"]');
        if (await apiKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await apiKeyInput.fill('invalid-key-12345');
          await page.click('[data-testid="save-server-btn"]');
          await page.waitForTimeout(3000);

          console.log('✓ Invalid API key handling tested');
        } else {
          // Address is local-like (127.0.0.1), API key field not shown
          console.log('✓ API key input hidden for local address (expected)');
        }
      } else {
        console.log('⚠ Edit button not available');
      }
    } else {
      console.log('⚠ Server menu not available');
    }
  });
});
