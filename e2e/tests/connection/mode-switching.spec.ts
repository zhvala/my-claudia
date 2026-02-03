import { test, expect } from '../../helpers/setup';
import { getEnabledModes } from '../../helpers/modes';
import { switchToMode, verifyMode } from '../../helpers/connection';

test.describe('Mode Switching', () => {
  const modes = getEnabledModes();

  test('should switch between all available modes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const mode of modes) {
      console.log(`Switching to ${mode.name}...`);

      await switchToMode(page, mode);
      await verifyMode(page, mode);

      // Send a test message to confirm mode works
      const textarea = page.locator('textarea').first();
      await textarea.fill(`Test from ${mode.name}`);
      await page.click('[data-testid="send-button"]');
      await page.waitForTimeout(2000);

      console.log(`✓ ${mode.name} working`);
    }

    console.log('✓ All mode switches successful');
  });

  test('should maintain session data when switching modes', async ({ page }) => {
    if (modes.length < 2) {
      test.skip('Need at least 2 modes to test switching');
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Start in first mode
    await switchToMode(page, modes[0]);

    // Create session and send message
    const uniqueText = `Message from ${modes[0].name} - ${Date.now()}`;
    const textarea = page.locator('textarea').first();
    await textarea.fill(uniqueText);
    await page.click('[data-testid="send-button"]');
    await page.waitForTimeout(2000);

    // Switch to second mode
    await switchToMode(page, modes[1]);
    await page.waitForTimeout(1000);

    // Switch back to first mode
    await switchToMode(page, modes[0]);
    await page.waitForTimeout(1000);

    // Verify message still exists
    const messageExists = await page.locator(`text="${uniqueText}"`).isVisible().catch(() => false);
    expect(messageExists).toBe(true);

    console.log('✓ Session data persists across mode switches');
  });
});
