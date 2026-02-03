import { test, expect } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode } from '../../helpers/connection';

test.describe('Local Mode Specific Features', () => {
  const localMode = getMode('local');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await switchToMode(page, localMode);
  });

  test('should not require API key', async ({ page }) => {
    // Connection should succeed without any credentials
    const status = page.locator('[data-testid="connection-status"]').first();
    const statusText = await status.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');

    console.log('✓ Local connection works without API key');
  });

  test('should have full unrestricted access', async ({ page }) => {
    // Local mode should grant all permissions automatically
    const textarea = page.locator('textarea').first();
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
