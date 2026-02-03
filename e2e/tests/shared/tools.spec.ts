import { expect } from '../../helpers/setup';
import { testAllModes } from '../../helpers/test-factory';

testAllModes('should execute bash tool and show results', async (page, mode) => {
  const textarea = page.locator('textarea').first();
  await textarea.fill('Run: echo "Hello from bash"');
  await page.click('[data-testid="send-button"]');

  // Wait for tool execution
  await page.waitForSelector('[data-testid="tool-use"]', { timeout: 15000 });

  // Verify tool name
  const toolName = page.locator('[data-testid="tool-name"]').first();
  await expect(toolName).toContainText('bash');

  // Verify tool result appears
  const toolResult = page.locator('[data-testid="tool-result"]').first();
  await expect(toolResult).toBeVisible({ timeout: 10000 });

  const resultText = await toolResult.textContent();
  expect(resultText).toContain('Hello from bash');

  console.log(`✓ Tool execution works in ${mode.name}`);
});
