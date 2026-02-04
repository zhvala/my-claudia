import { expect } from '../../helpers/setup';
import { testAllModes } from '../../helpers/test-factory';

testAllModes('should execute bash tool and show results', async (page, mode) => {
  const textarea = page.locator('textarea').first();
  await textarea.fill('Run: echo "Hello from bash"');
  await page.click('[data-testid="send-button"]');

  // Wait for the assistant response to appear (tool execution completes)
  await page.waitForSelector('[data-role="assistant"]', { timeout: 20000 });
  await page.waitForTimeout(2000);

  // The tool call list may be collapsed - look for the "tool call" summary button and click it
  const collapsedSummary = page.getByText(/tool call/);
  if (await collapsedSummary.isVisible({ timeout: 3000 }).catch(() => false)) {
    await collapsedSummary.click();
    await page.waitForTimeout(500);
  }

  // Now look for individual tool-use item
  const toolUse = page.locator('[data-testid="tool-use"]').first();
  await expect(toolUse).toBeVisible({ timeout: 5000 });

  // Verify tool name
  const toolName = page.locator('[data-testid="tool-name"]').first();
  await expect(toolName).toContainText('Bash');

  // Click the tool call to expand it and see the result
  await toolUse.click();
  await page.waitForTimeout(500);

  // Verify tool result appears after expanding
  const toolResult = page.locator('[data-testid="tool-result"]').first();
  await expect(toolResult).toBeVisible({ timeout: 5000 });

  const resultText = await toolResult.textContent();
  expect(resultText).toContain('Hello from bash');

  console.log(`✓ Tool execution works in ${mode.name}`);
});
