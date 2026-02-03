import { test, expect } from '../../helpers/setup';

/**
 * Minimal test - just navigate and check the page
 */
test('minimal page load', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'test-minimal-screenshot.png' });

  const title = await page.title();
  console.log('Page title:', title);

  expect(title).toContain('Claudia');
});
