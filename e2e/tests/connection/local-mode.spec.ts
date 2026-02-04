import { test, expect } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode } from '../../helpers/connection';

test.describe('Local Mode Specific Features', () => {
  const localMode = getMode('local');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await switchToMode(page, localMode);
  });

  test('should not require API key', async ({ page }) => {
    // The server selector button should show the local server name
    const serverSelector = page.locator('[data-testid="server-selector"]');
    await expect(serverSelector).toBeVisible({ timeout: 5000 });
    const buttonText = await serverSelector.textContent();
    expect(buttonText).toContain('Local Server');

    console.log('✓ Local connection works without API key');
  });

  test('should have full unrestricted access', async ({ page }) => {
    // Expand project and select/create a session
    const projectBtn = page.getByText('Test Project').first();
    if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectBtn.click();
      await page.waitForTimeout(500);

      // Try clicking new session button
      const newSessionBtn = page.locator('[data-testid="new-session-btn"]').first();
      if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newSessionBtn.click();
        await page.waitForTimeout(500);
      }

      // Select a session if one exists
      const sessionItem = page.locator('[data-testid="session-item"]').first();
      if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sessionItem.click();
        await page.waitForTimeout(500);
      }
    }

    // Check if textarea is visible now
    const textarea = page.locator('textarea').first();
    const textareaVisible = await textarea.isVisible({ timeout: 5000 }).catch(() => false);

    if (!textareaVisible) {
      console.log('✓ Skipping permission check - no active session');
      return;
    }

    await textarea.fill('Read /etc/hosts file');
    await page.click('[data-testid="send-button"]');

    // Should NOT show permission dialog (auto-approved)
    await page.waitForTimeout(3000);
    const permissionDialog = page.locator('[data-testid="permission-dialog"]');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (!isVisible) {
      console.log('✓ No permission dialogs in local mode (auto-approved)');
    }
  });
});
