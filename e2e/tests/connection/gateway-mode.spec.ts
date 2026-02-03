import { test, expect } from '../../helpers/setup';
import { getMode } from '../../helpers/modes';
import { switchToMode, fetchGatewayBackendId } from '../../helpers/connection';

test.describe('Gateway Mode Specific Features', () => {
  const gatewayMode = getMode('gateway');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Fetch backend ID dynamically
    if (!gatewayMode.backendId) {
      gatewayMode.backendId = await fetchGatewayBackendId(gatewayMode.apiKey!);
    }

    await switchToMode(page, gatewayMode);
  });

  test('should connect through gateway relay', async ({ page }) => {
    const status = page.locator('[data-testid="connection-status"]').first();
    const statusText = await status.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');

    console.log('✓ Gateway relay connection successful');
  });

  test('should configure SOCKS5 proxy', async ({ page }) => {
    if (!gatewayMode.proxyUrl) {
      test.skip('Proxy not configured');
    }

    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="gateway-tab"]');
    await page.waitForTimeout(500);

    // Verify proxy settings visible
    const proxyInput = page.locator('[data-testid="proxy-url-input"]').first();
    await expect(proxyInput).toBeVisible();

    const proxyValue = await proxyInput.inputValue();
    expect(proxyValue).toBe(gatewayMode.proxyUrl);

    console.log('✓ SOCKS5 proxy configuration persisted');
  });

  test('should save and update proxy credentials', async ({ page }) => {
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="gateway-tab"]');
    await page.waitForTimeout(500);

    // Update proxy
    const proxyInput = page.locator('[data-testid="proxy-url-input"]').first();
    await proxyInput.fill('socks5://127.0.0.1:9999');

    const usernameInput = page.locator('[data-testid="proxy-username-input"]').first();
    await usernameInput.fill('testuser');

    const passwordInput = page.locator('[data-testid="proxy-password-input"]').first();
    await passwordInput.fill('testpass');

    // Save
    await page.click('[data-testid="save-gateway-config"]');
    await page.waitForTimeout(1000);

    // Reload and verify
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="gateway-tab"]');
    await page.waitForTimeout(500);

    const savedUsername = await usernameInput.inputValue();
    expect(savedUsername).toBe('testuser');

    // Password should be masked
    const savedPassword = await passwordInput.inputValue();
    expect(savedPassword).toMatch(/^\*+$/);

    console.log('✓ Proxy credentials saved and masked');
  });
});
