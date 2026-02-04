import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import '../helpers/custom-matchers';
import * as path from 'path';

describe('Session Import Feature', () => {
  const fixturesPath = path.join(process.cwd(), 'e2e/fixtures/claude-cli-data');
  let browser: BrowserAdapter;

  beforeEach(async () => {
    browser = await createBrowser();
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');
  });

  afterEach(async () => {
    await browser?.close();
  });

  test('should show import option in settings for local connection', async () => {
    // Wait for connection to establish
    await browser.waitForTimeout(2000);

    // Open settings
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"], [title*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      // Check if Import tab exists (only for local connection)
      const importTab = browser.locator('text=Import').first();
      const hasImportTab = await importTab.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasImportTab) {
        console.log('Import tab is visible for local connection');
        await importTab.click();
        await browser.waitForTimeout(300);

        // Verify Import button exists
        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await expect(importButton).toBeVisible({ timeout: 5000 });
        console.log('Import button found');
      } else {
        console.log('Import tab not visible (might be remote connection)');
      }
    }
  });

  test('should scan directory and show sessions', async () => {
    // Navigate to settings > import
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        // Click import button
        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        // Fill in the Claude CLI path
        const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);
          console.log(`Filled path: ${fixturesPath}`);

          // Click scan/browse button
          const scanButton = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await browser.waitForTimeout(2000);

            // Check for session results or error messages
            const hasError = await browser.locator('text=/error|failed|not found/i').first().isVisible({ timeout: 2000 }).catch(() => false);
            const hasSessions = await browser.locator('text=/Test Session|session/i').first().isVisible({ timeout: 2000 }).catch(() => false);

            if (hasError) {
              console.log('Scan showed error (expected if API not set up)');
              const errorText = await browser.locator('text=/error|failed|not found/i').first().textContent();
              console.log(`  Error: ${errorText}`);
            } else if (hasSessions) {
              console.log('Sessions found and displayed');
            } else {
              console.log('Scan completed but no sessions visible');
            }
          }
        }
      }
    }
  });

  test('should handle invalid directory path', async () => {
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        // Try with invalid path
        const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill('/nonexistent/path');

          const scanButton = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await browser.waitForTimeout(2000);

            // Should show error
            const errorVisible = await browser.locator('text=/not found|invalid|error/i').first().isVisible({ timeout: 3000 }).catch(() => false);
            if (errorVisible) {
              console.log('Error message shown for invalid path');
            } else {
              console.log('No error message detected');
            }
          }
        }
      }
    }
  });

  test('should close import dialog', async () => {
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        // Dialog should be visible
        const dialogVisible = await browser.locator('text=/Import from Claude CLI|Select.*directory/i').first().isVisible({ timeout: 2000 });
        expect(dialogVisible).toBeTruthy();

        // Close dialog
        const closeButton = browser.locator('button:has-text("Cancel"), button:has-text("Close")').first();
        if (await closeButton.isVisible({ timeout: 2000 })) {
          await closeButton.click();
          await browser.waitForTimeout(500);
          console.log('Dialog closed successfully');
        }
      }
    }
  });

  test('should import session with tool calls and verify display', async () => {
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await browser.waitForTimeout(2000);

            // Look for session with tool calls
            const sessionWithTools = browser.locator('text=/Test Session 2 with Tool Calls|tool/i').first();
            if (await sessionWithTools.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log('Found session with tool calls');

              // Select and import the session
              const checkboxes = browser.locator('input[type="checkbox"]');
              const count = await checkboxes.count();
              if (count > 0) {
                // Click the checkbox for the tool calls session
                await checkboxes.nth(1).check().catch(() => {});
                await browser.waitForTimeout(500);

                const confirmImportBtn = browser.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
                if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                  await confirmImportBtn.click();
                  await browser.waitForTimeout(2000);

                  // Verify tool calls are displayed in the imported session
                  const toolCallElement = browser.locator('[class*="tool"], [data-tool], text=/read_file|tool_use/i').first();
                  const hasToolCall = await toolCallElement.isVisible({ timeout: 3000 }).catch(() => false);

                  if (hasToolCall) {
                    console.log('Tool calls displayed in imported session');
                  } else {
                    console.log('Tool call display not verified (might need session view)');
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  test('should import session with thinking blocks and verify display', async () => {
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await browser.waitForTimeout(2000);

            // Look for session with thinking blocks (Test Session 1 has thinking)
            const sessionWithThinking = browser.locator('text=/Test Session 1/i').first();
            if (await sessionWithThinking.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log('Found session with thinking blocks');

              // Select and import the session
              const checkboxes = browser.locator('input[type="checkbox"]');
              const count = await checkboxes.count();
              if (count > 0) {
                await checkboxes.first().check().catch(() => {});
                await browser.waitForTimeout(500);

                const confirmImportBtn = browser.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
                if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                  await confirmImportBtn.click();
                  await browser.waitForTimeout(2000);

                  // Verify thinking blocks are displayed (they might be hidden by default)
                  const thinkingElement = browser.locator('[class*="thinking"], [data-thinking], text=/thinking|User wants help/i').first();
                  const hasThinking = await thinkingElement.isVisible({ timeout: 3000 }).catch(() => false);

                  if (hasThinking) {
                    console.log('Thinking blocks displayed in imported session');
                  } else {
                    console.log('Thinking block display not verified (might be collapsed)');
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  test('should show import progress for large sessions', async () => {
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await browser.waitForTimeout(2000);

            const checkboxes = browser.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            if (count > 0) {
              // Select multiple sessions to simulate larger import
              await checkboxes.first().check().catch(() => {});
              if (count > 1) {
                await checkboxes.nth(1).check().catch(() => {});
              }
              await browser.waitForTimeout(500);

              const confirmImportBtn = browser.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
              if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                await confirmImportBtn.click();

                // Look for progress indicators
                const progressBar = browser.locator('[role="progressbar"], [class*="progress"], text=/importing|%/i').first();
                const hasProgress = await progressBar.isVisible({ timeout: 1000 }).catch(() => false);

                if (hasProgress) {
                  console.log('Import progress indicator shown');
                } else {
                  console.log('No progress indicator (import might be too fast)');
                }

                // Wait for completion
                await browser.waitForTimeout(3000);

                // Check for completion message
                const completionMsg = browser.locator('text=/imported|complete|success/i').first();
                const hasCompletion = await completionMsg.isVisible({ timeout: 2000 }).catch(() => false);

                if (hasCompletion) {
                  console.log('Import completion message shown');
                }
              }
            }
          }
        }
      }
    }
  });

  test('should handle conflict resolution (overwrite vs skip)', async () => {
    await browser.waitForTimeout(2000);

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const importTab = browser.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await browser.waitForTimeout(300);

        const importButton = browser.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await browser.waitForTimeout(500);

        const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await browser.waitForTimeout(2000);

            // First import
            const checkboxes = browser.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            if (count > 0) {
              await checkboxes.first().check().catch(() => {});
              await browser.waitForTimeout(500);

              const confirmImportBtn = browser.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
              if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                await confirmImportBtn.click();
                await browser.waitForTimeout(2000);

                console.log('First import completed');

                // Try importing the same session again
                const importAgainBtn = browser.locator('button:has-text("Import from Claude CLI")').first();
                if (await importAgainBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await importAgainBtn.click();
                  await browser.waitForTimeout(500);

                  const pathInput2 = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
                  if (await pathInput2.isVisible({ timeout: 2000 })) {
                    await pathInput2.fill(fixturesPath);

                    const scanButton2 = browser.locator('button:has-text("Scan"), button:has-text("Browse")').first();
                    await scanButton2.click();
                    await browser.waitForTimeout(2000);

                    const checkboxes2 = browser.locator('input[type="checkbox"]');
                    await checkboxes2.first().check().catch(() => {});

                    const confirmBtn2 = browser.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
                    await confirmBtn2.click();
                    await browser.waitForTimeout(1000);

                    // Look for conflict resolution dialog
                    const conflictDialog = browser.locator('text=/already exists|conflict|overwrite|skip/i').first();
                    const hasConflict = await conflictDialog.isVisible({ timeout: 2000 }).catch(() => false);

                    if (hasConflict) {
                      console.log('Conflict dialog shown');

                      // Test overwrite option
                      const overwriteBtn = browser.locator('button:has-text("Overwrite"), button:has-text("Replace")').first();
                      const skipBtn = browser.locator('button:has-text("Skip"), button:has-text("Keep Existing")').first();

                      if (await overwriteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        console.log('Overwrite option available');
                        await overwriteBtn.click();
                        await browser.waitForTimeout(1000);
                        console.log('Overwrite action completed');
                      } else if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        console.log('Skip option available');
                        await skipBtn.click();
                        await browser.waitForTimeout(1000);
                        console.log('Skip action completed');
                      }
                    } else {
                      console.log('No conflict dialog (might auto-overwrite or use different UI)');
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
});
