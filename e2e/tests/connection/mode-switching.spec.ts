import { test, expect } from '../../helpers/setup';
import { getEnabledModes } from '../../helpers/modes';
import { switchToMode, verifyMode } from '../../helpers/connection';

test.describe('Mode Switching', () => {
  const modes = getEnabledModes();

  test('should switch between all available modes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    for (const mode of modes) {
      console.log(`Switching to ${mode.name}...`);

      await switchToMode(page, mode);
      await verifyMode(page, mode);

      console.log(`✓ ${mode.name} working`);
    }

    console.log('✓ All mode switches successful');
  });

  test('should maintain server selector after switching', async ({ page }) => {
    if (modes.length < 2) {
      test.skip(true, 'Need at least 2 modes to test switching');
      return;
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Switch to first mode
    await switchToMode(page, modes[0]);

    // Verify server selector shows mode name
    const serverSelector = page.locator('[data-testid="server-selector"]');
    const text1 = await serverSelector.textContent();
    expect(text1).toContain(modes[0].name);

    // Switch to second mode
    await switchToMode(page, modes[1]);

    // Verify server selector shows new mode name
    const text2 = await serverSelector.textContent();
    expect(text2).toContain(modes[1].name);

    console.log('✓ Server selector updates correctly when switching modes');
  });
});
