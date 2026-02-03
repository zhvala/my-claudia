import { test, expect } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode } from '../../helpers/connection';

test.describe('Remote IP Mode Specific Features', () => {
  const remoteMode = getMode('remote');

  test.skip(!remoteMode.enabled, 'Remote mode not configured');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await switchToMode(page, remoteMode);
  });

  test('should require valid API key', async ({ page }) => {
    const status = page.locator('[data-testid="connection-status"]').first();
    const statusText = await status.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');

    console.log('✓ Remote connection with API key successful');
  });

  test('should reject invalid API key', async ({ page }) => {
    // Try to connect with invalid API key
    await page.click('[data-testid="server-selector"]');
    await page.waitForTimeout(300);

    // Edit current server config
    await page.click('[data-testid="edit-server-btn"]');
    await page.fill('[data-testid="api-key-input"]', 'invalid-key-12345');
    await page.click('[data-testid="save-server-btn"]');
    await page.waitForTimeout(2000);

    // Should show error
    const status = page.locator('[data-testid="connection-status"]').first();
    const statusText = await status.textContent();
    expect(statusText?.toLowerCase()).toMatch(/error|failed|unauthorized/);

    console.log('✓ Invalid API key properly rejected');
  });
});
