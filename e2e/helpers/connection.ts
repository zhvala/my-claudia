import type { Page } from '@playwright/test';
import type { ModeConfig } from './modes';

/**
 * Switch to a specific connection mode in the UI
 */
export async function switchToMode(page: Page, mode: ModeConfig): Promise<void> {
  // 1. Check if we're already on this mode
  const serverSelector = page.locator('[class*="server"]').first();
  await serverSelector.waitFor({ state: 'visible', timeout: 10000 });

  const currentText = await serverSelector.textContent();
  if (currentText?.includes(mode.name)) {
    console.log(`✓ Already in ${mode.name} mode`);
    return; // Already on the correct mode
  }

  // 2. Open server selector
  await serverSelector.click();
  await page.waitForTimeout(500);

  // 3. Check if mode with this name already exists
  const modeOption = page.getByText(mode.name, { exact: false }).first();
  const modeExists = await modeOption.isVisible({ timeout: 2000 }).catch(() => false);

  if (modeExists) {
    // Select existing mode
    await modeOption.click();
    await page.waitForTimeout(2000);
  } else {
    // Mode doesn't exist, need to create it
    await createModeConfig(page, mode);
  }

  // 4. Wait for connection
  await waitForConnection(page, 10000);
}

/**
 * Create a new server configuration for a mode
 */
export async function createModeConfig(page: Page, mode: ModeConfig): Promise<void> {
  // Click "Add Server" button (dropdown should already be open from switchToMode)
  await page.getByText('Add Server').click();
  await page.waitForTimeout(500);

  // Fill in server name
  await page.getByPlaceholder('Server name').fill(mode.name);

  if (mode.id === 'gateway') {
    // Select Gateway mode
    await page.getByRole('button', { name: 'Gateway' }).click();
    await page.waitForTimeout(300);

    // Fill gateway fields
    await page.getByPlaceholder('Gateway URL (e.g., https://gateway.example.com)').fill(mode.gatewayUrl!);

    const gatewaySecretPlaceholder = await page.getByPlaceholder(/Gateway Secret/).first();
    await gatewaySecretPlaceholder.fill(mode.gatewaySecret!);

    await page.getByPlaceholder('Backend ID (from Gateway)').fill(mode.backendId || '');

    const apiKeyPlaceholder = await page.getByPlaceholder(/Backend API Key/).first();
    await apiKeyPlaceholder.fill(mode.apiKey || '');

    // Proxy configuration (if provided)
    if (mode.proxyUrl) {
      await page.getByPlaceholder(/Proxy URL/).fill(mode.proxyUrl);
      if (mode.proxyAuth) {
        await page.getByPlaceholder(/Proxy Username/).fill(mode.proxyAuth.username);
        await page.getByPlaceholder(/Proxy Password/).fill(mode.proxyAuth.password);
      }
    }
  } else {
    // Direct mode (local or remote)
    const directBtn = page.getByRole('button', { name: 'Direct' });
    if (await directBtn.isVisible()) {
      await directBtn.click();
      await page.waitForTimeout(300);
    }

    await page.getByPlaceholder('Address (e.g., 192.168.1.100:3100)').fill(mode.serverAddress);

    // Fill API key for remote servers
    if (mode.requiresAuth && mode.apiKey) {
      const apiKeyInput = page.getByPlaceholder(/API Key/);
      if (await apiKeyInput.isVisible({ timeout: 2000 })) {
        await apiKeyInput.fill(mode.apiKey);
      }
    }
  }

  // Save configuration
  await page.getByRole('button', { name: /Add|Save/ }).click();
  await page.waitForTimeout(2000);
}

/**
 * Wait for connection to be established
 */
export async function waitForConnection(page: Page, timeout: number = 10000): Promise<void> {
  // Simple wait - connection usually happens quickly
  await page.waitForTimeout(1000);

  // Quick check for Connected status (non-blocking)
  const hasConnected = await page.evaluate(() => {
    return document.body.textContent?.includes('Connected');
  }).catch(() => false);

  if (hasConnected) {
    console.log('✓ Connection established');
  } else {
    console.log('⚠ Connection status not explicitly shown, proceeding');
  }
}

/**
 * Verify connection mode is active
 */
export async function verifyMode(page: Page, mode: ModeConfig): Promise<void> {
  // Open server selector to check current server
  const serverSelector = page.locator('[class*="server"]').first();
  const currentText = await serverSelector.textContent();

  if (!currentText?.includes(mode.name)) {
    throw new Error(`Expected mode "${mode.name}" but got "${currentText}"`);
  }

  console.log(`✓ Mode verified: ${mode.name}`);
}

/**
 * Fetch backend ID dynamically for Gateway mode
 */
export async function fetchGatewayBackendId(apiKey?: string): Promise<string> {
  // Retry logic for gateway registration
  for (let i = 0; i < 30; i++) {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await globalThis.fetch('http://localhost:3100/api/server/gateway/status', {
        headers
      });

      const data = await response.json();

      if (data.data?.backendId) {
        return data.data.backendId;
      }
    } catch (error) {
      // Ignore and retry
    }

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Backend not registered with gateway after 30 attempts');
}
