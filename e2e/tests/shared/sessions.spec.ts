import { expect } from '../../helpers/setup';
import { testAllModes } from '../../helpers/test-factory';
import { switchToMode } from '../../helpers/connection';

testAllModes('should create and switch between sessions', async (page, mode) => {
  // Create first session
  await page.click('[data-testid="new-session-btn"]');
  await page.waitForTimeout(500);

  const textarea1 = page.locator('textarea').first();
  await textarea1.fill('First session message');
  await page.click('[data-testid="send-button"]');
  await page.waitForTimeout(1000);

  // Create second session
  await page.click('[data-testid="new-session-btn"]');
  await page.waitForTimeout(500);

  const textarea2 = page.locator('textarea').first();
  await textarea2.fill('Second session message');
  await page.click('[data-testid="send-button"]');
  await page.waitForTimeout(1000);

  // Verify we can see both sessions in sidebar
  const sessionList = page.locator('[data-testid="session-list"]').first();
  const sessions = sessionList.locator('[data-testid="session-item"]');
  const count = await sessions.count();

  expect(count).toBeGreaterThanOrEqual(2);
  console.log(`✓ Session creation works in ${mode.name}`);
});

testAllModes('should persist session data across page reload', async (page, mode) => {
  // Send a unique message
  const uniqueText = `Test message ${Date.now()}`;
  const textarea = page.locator('textarea').first();
  await textarea.fill(uniqueText);
  await page.click('[data-testid="send-button"]');
  await page.waitForTimeout(2000);

  // Reload page
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Switch back to mode (connection may have reset)
  await switchToMode(page, mode);
  await page.waitForTimeout(1000);

  // Verify message still exists
  const messageContent = page.locator(`text="${uniqueText}"`);
  await expect(messageContent).toBeVisible({ timeout: 5000 });

  console.log(`✓ Data persistence works in ${mode.name}`);
});
