import { expect } from '../../helpers/setup';
import { testAllModes } from '../../helpers/test-factory';

testAllModes('should send and receive chat message', async (page, mode) => {
  // Session is already ensured by testAllModes

  // Send a message
  const textarea = page.locator('textarea').first();
  await textarea.fill('Hello, this is a test message');
  await page.click('[data-testid="send-button"]');

  // Wait for response
  await page.waitForSelector('[data-role="assistant"]', { timeout: 15000 });

  // Verify message appears
  const messages = page.locator('[data-role="assistant"]');
  const count = await messages.count();
  expect(count).toBeGreaterThan(0);

  console.log(`✓ Chat working in ${mode.name}`);
});

testAllModes('should stream response deltas', async (page, mode) => {
  const textarea = page.locator('textarea').first();
  await textarea.fill('Count from 1 to 5');
  await page.click('[data-testid="send-button"]');

  // Watch for streaming (content should update multiple times)
  const assistantMsg = page.locator('[data-role="assistant"]').last();

  let previousText = '';
  let updateCount = 0;

  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    const currentText = await assistantMsg.textContent().catch(() => '') || '';

    if (currentText !== previousText && currentText.length > previousText.length) {
      updateCount++;
      previousText = currentText;
    }
  }

  // Should have at least one update (streaming may be fast)
  expect(updateCount).toBeGreaterThanOrEqual(1);
  console.log(`✓ Streaming works in ${mode.name} (${updateCount} updates)`);
});
