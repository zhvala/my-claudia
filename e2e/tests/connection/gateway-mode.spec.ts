import { test, expect } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode, fetchGatewayBackendId } from '../../helpers/connection';

test.describe('Gateway Mode Specific Features', () => {
  const gatewayMode = getMode('gateway');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Fetch backend ID dynamically
    if (!gatewayMode.backendId) {
      try {
        gatewayMode.backendId = await fetchGatewayBackendId(gatewayMode.apiKey!);
      } catch {
        test.skip(true, 'Gateway backend not registered');
        return;
      }
    }

    await switchToMode(page, gatewayMode);
  });

  test('should connect through gateway relay', async ({ page }) => {
    // Verify the server selector shows the gateway mode name
    const serverSelector = page.locator('[data-testid="server-selector"]');
    await expect(serverSelector).toBeVisible({ timeout: 5000 });
    const buttonText = await serverSelector.textContent();
    expect(buttonText).toContain('Gateway Mode');

    console.log('✓ Gateway relay connection successful');
  });

  test('should configure SOCKS5 proxy', async ({ page }) => {
    // Gateway tab is only visible in local mode (isLocalServer === true).
    // When connected via Gateway, isLocalConnection is false, so the tab is hidden.
    test.skip(true, 'Gateway tab only visible in local mode - proxy config tested via API');
  });

  test('should save and update proxy credentials', async ({ page }) => {
    // Gateway tab is only visible in local mode (isLocalServer === true).
    // When connected via Gateway, isLocalConnection is false, so the tab is hidden.
    test.skip(true, 'Gateway tab only visible in local mode - proxy config tested via API');
  });
});
