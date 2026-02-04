import type { Page } from '@playwright/test';
import type { ModeConfig } from './modes';

/**
 * Switch to a specific connection mode in the UI
 */
export async function switchToMode(page: Page, mode: ModeConfig): Promise<void> {
  // 1. Check if we're already on this mode
  const serverSelector = page.locator('[data-testid="server-selector"]').first();
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
    // For gateway modes, fetch backend ID if not set
    if (mode.gatewayUrl && !mode.backendId) {
      try {
        mode.backendId = await fetchGatewayBackendId(mode.apiKey);
      } catch {
        console.log('⚠ Could not fetch gateway backend ID, proceeding without it');
      }
    }
    // Mode doesn't exist, need to create it
    await createModeConfig(page, mode);
  }

  // 4. Wait for connection (gateway needs longer for multi-step handshake)
  const connectionTimeout = mode.gatewayUrl ? 20000 : 10000;
  const connected = await waitForConnection(page, connectionTimeout);
  if (!connected && mode.gatewayUrl) {
    console.log('⚠ Gateway connection not established - tests requiring interaction will fail');
  }
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

  if (mode.gatewayUrl) {
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
    if (await directBtn.isVisible().catch(() => false)) {
      await directBtn.click();
      await page.waitForTimeout(300);
    }

    await page.getByPlaceholder('Address (e.g., 192.168.1.100:3100)').fill(mode.serverAddress);

    // Fill API key for remote servers
    if (mode.requiresAuth && mode.apiKey) {
      const apiKeyInput = page.getByPlaceholder(/API Key/);
      if (await apiKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await apiKeyInput.fill(mode.apiKey);
      }
    }
  }

  // Save configuration
  await page.click('[data-testid="save-server-btn"]');
  await page.waitForTimeout(1000);

  // After saving, the new server appears in the dropdown but isn't auto-selected.
  // Open dropdown and click on the new server to switch to it.
  const serverSelector = page.locator('[data-testid="server-selector"]').first();
  await serverSelector.click();
  await page.waitForTimeout(500);

  const newModeOption = page.getByText(mode.name, { exact: false }).first();
  if (await newModeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newModeOption.click();
    await page.waitForTimeout(1000);
  }
}

/**
 * Ensure an active session is selected (expand project + create/select session)
 */
export async function ensureActiveSession(page: Page): Promise<void> {
  // Check if textarea is already visible (session already selected)
  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible().catch(() => false)) {
    return;
  }

  // Try selecting an existing session first
  const sessionItem = page.locator('[data-testid="session-item"]').first();
  if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sessionItem.click();
    await page.waitForTimeout(500);
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }
  }

  // Check if "No projects yet" is shown - need to create a project first
  const noProjects = page.getByText('No projects yet');
  if (await noProjects.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('[ensureActiveSession] No projects - creating one...');
    const addProjectBtn = page.locator('button[title="Add Project"]').first();
    if (await addProjectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addProjectBtn.click();
      await page.waitForTimeout(300);

      await page.getByPlaceholder('Project name').fill('Test Project');
      const createProjectBtn = page.getByRole('button', { name: 'Create' });
      if (await createProjectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createProjectBtn.click();
        await page.waitForTimeout(1500);
      }
    }
  }

  // Expand a project by clicking it (may need to click twice if already selected but collapsed)
  const projectBtn = page.getByText('Test Project').first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);

    // Check if project expanded by looking for new-session-btn or session-item
    const newSessionBtn = page.locator('[data-testid="new-session-btn"]').first();
    const expanded = await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)
      || await sessionItem.isVisible({ timeout: 500 }).catch(() => false);

    if (!expanded) {
      // Click again to expand (first click may have just selected, not expanded)
      console.log('[ensureActiveSession] Project not expanded, clicking again...');
      await projectBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Check if sessions appeared after expanding
  if (await sessionItem.isVisible({ timeout: 1000 }).catch(() => false)) {
    await sessionItem.click();
    await page.waitForTimeout(500);
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }
  }

  // No sessions exist under the project - create one
  const newSessionBtn = page.locator('[data-testid="new-session-btn"]').first();
  if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isEnabled = await newSessionBtn.isEnabled().catch(() => false);
    if (isEnabled) {
      await newSessionBtn.click();
      await page.waitForTimeout(500);

      // The session creation dialog may open - click "Create" to confirm
      const createBtn = page.getByRole('button', { name: 'Create' });
      if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  }

  // Verify textarea is now visible
  await textarea.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
    console.log('⚠ Could not ensure active session');
  });
}

/**
 * Wait for connection to be established
 * Polls the "New Session" button's enabled state as a proxy for isConnected.
 * The button is disabled when !isConnected.
 */
export async function waitForConnection(page: Page, timeout: number = 15000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check if "New Session" button is enabled (disabled={!isConnected})
    const newSessionBtn = page.locator('[data-testid="new-session-btn"]').first();
    if (await newSessionBtn.isVisible().catch(() => false)) {
      if (await newSessionBtn.isEnabled().catch(() => false)) {
        console.log('✓ Connection established');
        return true;
      }
    }

    await page.waitForTimeout(500);
  }

  console.log('⚠ Connection not established within timeout');
  return false;
}

/**
 * Verify connection mode is active
 */
export async function verifyMode(page: Page, mode: ModeConfig): Promise<void> {
  // Open server selector to check current server
  const serverSelector = page.locator('[data-testid="server-selector"]').first();
  const currentText = await serverSelector.textContent();

  if (!currentText?.includes(mode.name)) {
    throw new Error(`Expected mode "${mode.name}" but got "${currentText}"`);
  }

  console.log(`✓ Mode verified: ${mode.name}`);
}

/**
 * Delete a server config by name via REST API (for cleanup)
 */
export async function deleteServerByName(name: string, apiKey?: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const listRes = await globalThis.fetch('http://localhost:3100/api/servers', { headers });
    const listData = await listRes.json();

    if (listData.success && Array.isArray(listData.data)) {
      for (const server of listData.data) {
        if (server.name === name && !server.isDefault) {
          await globalThis.fetch(`http://localhost:3100/api/servers/${server.id}`, {
            method: 'DELETE',
            headers
          });
          console.log(`✓ Deleted stale server config: ${name}`);
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Fetch backend ID dynamically for Gateway mode
 */
export async function fetchGatewayBackendId(apiKey?: string): Promise<string> {
  // Retry logic for gateway registration
  for (let i = 0; i < 15; i++) {
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

  throw new Error('Backend not registered with gateway after 15 attempts');
}
