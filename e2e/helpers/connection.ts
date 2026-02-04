/**
 * Connection mode helpers for E2E tests
 *
 * Migrated from Playwright Page to BrowserAdapter.
 */
import type { BrowserAdapter } from './browser-adapter';
import type { ModeConfig } from './modes';

/**
 * Switch to a specific connection mode in the UI
 */
export async function switchToMode(browser: BrowserAdapter, mode: ModeConfig): Promise<void> {
  // 1. Check if we're already on this mode
  const serverSelector = browser.locator('[data-testid="server-selector"]').first();
  await serverSelector.waitFor({ state: 'visible', timeout: 10000 });

  const currentText = await serverSelector.textContent();
  if (currentText?.includes(mode.name)) {
    console.log(`Already in ${mode.name} mode`);
    return;
  }

  // 2. Open server selector
  await serverSelector.click();
  await browser.waitForTimeout(500);

  // 3. Check if mode with this name already exists
  const modeOption = browser.getByText(mode.name, { exact: false }).first();
  const modeExists = await modeOption.isVisible({ timeout: 2000 }).catch(() => false);

  if (modeExists) {
    await modeOption.click();
    await browser.waitForTimeout(2000);
  } else {
    // For gateway modes, fetch backend ID if not set
    if (mode.gatewayUrl && !mode.backendId) {
      try {
        mode.backendId = await fetchGatewayBackendId(mode.apiKey);
      } catch {
        console.log('Could not fetch gateway backend ID, proceeding without it');
      }
    }
    await createModeConfig(browser, mode);
  }

  // 4. Wait for connection
  const connectionTimeout = mode.gatewayUrl ? 20000 : 10000;
  const connected = await waitForConnection(browser, connectionTimeout);
  if (!connected && mode.gatewayUrl) {
    console.log('Gateway connection not established - tests requiring interaction will fail');
  }
}

/**
 * Create a new server configuration for a mode
 */
export async function createModeConfig(browser: BrowserAdapter, mode: ModeConfig): Promise<void> {
  await browser.getByText('Add Server').click();
  await browser.waitForTimeout(500);

  await browser.getByPlaceholder('Server name').fill(mode.name);

  if (mode.gatewayUrl) {
    await browser.getByRole('button', { name: 'Gateway' }).click();
    await browser.waitForTimeout(300);

    await browser.getByPlaceholder('Gateway URL (e.g., https://gateway.example.com)').fill(mode.gatewayUrl!);

    const gatewaySecretPlaceholder = browser.getByPlaceholder(/Gateway Secret/).first();
    await gatewaySecretPlaceholder.fill(mode.gatewaySecret!);

    await browser.getByPlaceholder('Backend ID (from Gateway)').fill(mode.backendId || '');

    const apiKeyPlaceholder = browser.getByPlaceholder(/Backend API Key/).first();
    await apiKeyPlaceholder.fill(mode.apiKey || '');

    if (mode.proxyUrl) {
      await browser.getByPlaceholder(/Proxy URL/).fill(mode.proxyUrl);
      if (mode.proxyAuth) {
        await browser.getByPlaceholder(/Proxy Username/).fill(mode.proxyAuth.username);
        await browser.getByPlaceholder(/Proxy Password/).fill(mode.proxyAuth.password);
      }
    }
  } else {
    const directBtn = browser.getByRole('button', { name: 'Direct' });
    if (await directBtn.isVisible().catch(() => false)) {
      await directBtn.click();
      await browser.waitForTimeout(300);
    }

    await browser.getByPlaceholder('Address (e.g., 192.168.1.100:3100)').fill(mode.serverAddress);

    if (mode.requiresAuth && mode.apiKey) {
      const apiKeyInput = browser.getByPlaceholder(/API Key/);
      if (await apiKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await apiKeyInput.fill(mode.apiKey);
      }
    }
  }

  await browser.click('[data-testid="save-server-btn"]');
  await browser.waitForTimeout(1000);

  // Select the newly created server
  const serverSelector = browser.locator('[data-testid="server-selector"]').first();
  await serverSelector.click();
  await browser.waitForTimeout(500);

  const newModeOption = browser.getByText(mode.name, { exact: false }).first();
  if (await newModeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newModeOption.click();
    await browser.waitForTimeout(1000);
  }
}

/**
 * Ensure an active session is selected (expand project + create/select session)
 */
export async function ensureActiveSession(browser: BrowserAdapter): Promise<void> {
  const textarea = browser.locator('textarea').first();
  if (await textarea.isVisible().catch(() => false)) {
    return;
  }

  // Try selecting an existing session
  const sessionItem = browser.locator('[data-testid="session-item"]').first();
  if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sessionItem.click();
    await browser.waitForTimeout(500);
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }
  }

  // Check if "No projects yet" is shown
  const noProjects = browser.getByText('No projects yet');
  if (await noProjects.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('[ensureActiveSession] No projects - creating one...');
    const addProjectBtn = browser.locator('button[title="Add Project"]').first();
    if (await addProjectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addProjectBtn.click();
      await browser.waitForTimeout(300);

      await browser.getByPlaceholder('Project name').fill('Test Project');
      const createProjectBtn = browser.getByRole('button', { name: 'Create' });
      if (await createProjectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createProjectBtn.click();
        await browser.waitForTimeout(1500);
      }
    }
  }

  // Expand a project
  const projectBtn = browser.getByText('Test Project').first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await browser.waitForTimeout(500);

    const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
    const expanded = await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)
      || await sessionItem.isVisible({ timeout: 500 }).catch(() => false);

    if (!expanded) {
      console.log('[ensureActiveSession] Project not expanded, clicking again...');
      await projectBtn.click();
      await browser.waitForTimeout(500);
    }
  }

  // Select existing session
  if (await sessionItem.isVisible({ timeout: 1000 }).catch(() => false)) {
    await sessionItem.click();
    await browser.waitForTimeout(500);
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }
  }

  // Create new session
  const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
  if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isEnabled = await newSessionBtn.isEnabled().catch(() => false);
    if (isEnabled) {
      await newSessionBtn.click();
      await browser.waitForTimeout(500);

      const createBtn = browser.getByRole('button', { name: 'Create' });
      if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createBtn.click();
        await browser.waitForTimeout(1000);
      }
    }
  }

  // Verify textarea is visible
  await textarea.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
    console.log('Could not ensure active session');
  });
}

/**
 * Wait for connection to be established
 */
export async function waitForConnection(browser: BrowserAdapter, timeout: number = 15000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
    if (await newSessionBtn.isVisible().catch(() => false)) {
      if (await newSessionBtn.isEnabled().catch(() => false)) {
        console.log('Connection established');
        return true;
      }
    }
    await browser.waitForTimeout(500);
  }

  console.log('Connection not established within timeout');
  return false;
}

/**
 * Verify connection mode is active
 */
export async function verifyMode(browser: BrowserAdapter, mode: ModeConfig): Promise<void> {
  const serverSelector = browser.locator('[data-testid="server-selector"]').first();
  const currentText = await serverSelector.textContent();

  if (!currentText?.includes(mode.name)) {
    throw new Error(`Expected mode "${mode.name}" but got "${currentText}"`);
  }

  console.log(`Mode verified: ${mode.name}`);
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
            headers,
          });
          console.log(`Deleted stale server config: ${name}`);
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
  for (let i = 0; i < 15; i++) {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await globalThis.fetch('http://localhost:3100/api/server/gateway/status', {
        headers,
      });
      const data = await response.json();

      if (data.data?.backendId) {
        return data.data.backendId;
      }
    } catch {
      // Ignore and retry
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Backend not registered with gateway after 15 attempts');
}
