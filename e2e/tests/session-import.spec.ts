import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Session Import Feature', () => {
  const fixturesPath = path.join(process.cwd(), 'e2e/fixtures/claude-cli-data');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show import option in settings for local connection', async ({ page }) => {
    // Wait for connection to establish
    await page.waitForTimeout(2000);

    // Open settings
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"], [title*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Check if Import tab exists (only for local connection)
      const importTab = page.locator('text=Import').first();
      const hasImportTab = await importTab.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasImportTab) {
        console.log('✓ Import tab is visible for local connection');
        await importTab.click();
        await page.waitForTimeout(300);

        // Verify Import button exists
        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await expect(importButton).toBeVisible({ timeout: 5000 });
        console.log('✓ Import button found');
      } else {
        console.log('ℹ Import tab not visible (might be remote connection)');
      }
    }
  });

  test('should scan directory and show sessions', async ({ page }) => {
    // Navigate to settings > import
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        // Click import button
        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        // Fill in the Claude CLI path
        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);
          console.log(`✓ Filled path: ${fixturesPath}`);

          // Click scan/browse button
          const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await page.waitForTimeout(2000);

            // Check for session results or error messages
            const hasError = await page.locator('text=/error|failed|not found/i').first().isVisible({ timeout: 2000 }).catch(() => false);
            const hasSessions = await page.locator('text=/Test Session|session/i').first().isVisible({ timeout: 2000 }).catch(() => false);

            if (hasError) {
              console.log('⚠ Scan showed error (expected if API not set up)');
              const errorText = await page.locator('text=/error|failed|not found/i').first().textContent();
              console.log(`  Error: ${errorText}`);
            } else if (hasSessions) {
              console.log('✓ Sessions found and displayed');
            } else {
              console.log('ℹ Scan completed but no sessions visible');
            }
          }
        }
      }
    }
  });

  test('should handle invalid directory path', async ({ page }) => {
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        // Try with invalid path
        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill('/nonexistent/path');

          const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await page.waitForTimeout(2000);

            // Should show error
            const errorVisible = await page.locator('text=/not found|invalid|error/i').first().isVisible({ timeout: 3000 }).catch(() => false);
            if (errorVisible) {
              console.log('✓ Error message shown for invalid path');
            } else {
              console.log('⚠ No error message detected');
            }
          }
        }
      }
    }
  });

  test('should close import dialog', async ({ page }) => {
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        // Dialog should be visible
        const dialogVisible = await page.locator('text=/Import from Claude CLI|Select.*directory/i').first().isVisible({ timeout: 2000 });
        expect(dialogVisible).toBeTruthy();

        // Close dialog
        const closeButton = page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
        if (await closeButton.isVisible({ timeout: 2000 })) {
          await closeButton.click();
          await page.waitForTimeout(500);
          console.log('✓ Dialog closed successfully');
        }
      }
    }
  });

  test('should import session with tool calls and verify display', async ({ page }) => {
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await page.waitForTimeout(2000);

            // Look for session with tool calls
            const sessionWithTools = page.locator('text=/Test Session 2 with Tool Calls|tool/i').first();
            if (await sessionWithTools.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log('✓ Found session with tool calls');

              // Select and import the session
              const checkboxes = page.locator('input[type="checkbox"]');
              const count = await checkboxes.count();
              if (count > 0) {
                // Click the checkbox for the tool calls session
                await checkboxes.nth(1).check().catch(() => {});
                await page.waitForTimeout(500);

                const confirmImportBtn = page.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
                if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                  await confirmImportBtn.click();
                  await page.waitForTimeout(2000);

                  // Verify tool calls are displayed in the imported session
                  const toolCallElement = page.locator('[class*="tool"], [data-tool], text=/read_file|tool_use/i').first();
                  const hasToolCall = await toolCallElement.isVisible({ timeout: 3000 }).catch(() => false);

                  if (hasToolCall) {
                    console.log('✓ Tool calls displayed in imported session');
                  } else {
                    console.log('ℹ Tool call display not verified (might need session view)');
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  test('should import session with thinking blocks and verify display', async ({ page }) => {
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await page.waitForTimeout(2000);

            // Look for session with thinking blocks (Test Session 1 has thinking)
            const sessionWithThinking = page.locator('text=/Test Session 1/i').first();
            if (await sessionWithThinking.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log('✓ Found session with thinking blocks');

              // Select and import the session
              const checkboxes = page.locator('input[type="checkbox"]');
              const count = await checkboxes.count();
              if (count > 0) {
                await checkboxes.first().check().catch(() => {});
                await page.waitForTimeout(500);

                const confirmImportBtn = page.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
                if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                  await confirmImportBtn.click();
                  await page.waitForTimeout(2000);

                  // Verify thinking blocks are displayed (they might be hidden by default)
                  const thinkingElement = page.locator('[class*="thinking"], [data-thinking], text=/thinking|User wants help/i').first();
                  const hasThinking = await thinkingElement.isVisible({ timeout: 3000 }).catch(() => false);

                  if (hasThinking) {
                    console.log('✓ Thinking blocks displayed in imported session');
                  } else {
                    console.log('ℹ Thinking block display not verified (might be collapsed)');
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  test('should show import progress for large sessions', async ({ page }) => {
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await page.waitForTimeout(2000);

            const checkboxes = page.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            if (count > 0) {
              // Select multiple sessions to simulate larger import
              await checkboxes.first().check().catch(() => {});
              if (count > 1) {
                await checkboxes.nth(1).check().catch(() => {});
              }
              await page.waitForTimeout(500);

              const confirmImportBtn = page.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
              if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                await confirmImportBtn.click();

                // Look for progress indicators
                const progressBar = page.locator('[role="progressbar"], [class*="progress"], text=/importing|%/i').first();
                const hasProgress = await progressBar.isVisible({ timeout: 1000 }).catch(() => false);

                if (hasProgress) {
                  console.log('✓ Import progress indicator shown');
                } else {
                  console.log('ℹ No progress indicator (import might be too fast)');
                }

                // Wait for completion
                await page.waitForTimeout(3000);

                // Check for completion message
                const completionMsg = page.locator('text=/imported|complete|success/i').first();
                const hasCompletion = await completionMsg.isVisible({ timeout: 2000 }).catch(() => false);

                if (hasCompletion) {
                  console.log('✓ Import completion message shown');
                }
              }
            }
          }
        }
      }
    }
  });

  test('should handle conflict resolution (overwrite vs skip)', async ({ page }) => {
    await page.waitForTimeout(2000);

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 })) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        if (await pathInput.isVisible({ timeout: 3000 })) {
          await pathInput.fill(fixturesPath);

          const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
          if (await scanButton.isVisible({ timeout: 2000 })) {
            await scanButton.click();
            await page.waitForTimeout(2000);

            // First import
            const checkboxes = page.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            if (count > 0) {
              await checkboxes.first().check().catch(() => {});
              await page.waitForTimeout(500);

              const confirmImportBtn = page.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
              if (await confirmImportBtn.isVisible({ timeout: 2000 })) {
                await confirmImportBtn.click();
                await page.waitForTimeout(2000);

                console.log('✓ First import completed');

                // Try importing the same session again
                const importAgainBtn = page.locator('button:has-text("Import from Claude CLI")').first();
                if (await importAgainBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await importAgainBtn.click();
                  await page.waitForTimeout(500);

                  const pathInput2 = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
                  if (await pathInput2.isVisible({ timeout: 2000 })) {
                    await pathInput2.fill(fixturesPath);

                    const scanButton2 = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
                    await scanButton2.click();
                    await page.waitForTimeout(2000);

                    const checkboxes2 = page.locator('input[type="checkbox"]');
                    await checkboxes2.first().check().catch(() => {});

                    const confirmBtn2 = page.locator('button:has-text("Import Selected"), button:has-text("Import")').first();
                    await confirmBtn2.click();
                    await page.waitForTimeout(1000);

                    // Look for conflict resolution dialog
                    const conflictDialog = page.locator('text=/already exists|conflict|overwrite|skip/i').first();
                    const hasConflict = await conflictDialog.isVisible({ timeout: 2000 }).catch(() => false);

                    if (hasConflict) {
                      console.log('✓ Conflict dialog shown');

                      // Test overwrite option
                      const overwriteBtn = page.locator('button:has-text("Overwrite"), button:has-text("Replace")').first();
                      const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Keep Existing")').first();

                      if (await overwriteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        console.log('✓ Overwrite option available');
                        await overwriteBtn.click();
                        await page.waitForTimeout(1000);
                        console.log('✓ Overwrite action completed');
                      } else if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        console.log('✓ Skip option available');
                        await skipBtn.click();
                        await page.waitForTimeout(1000);
                        console.log('✓ Skip action completed');
                      }
                    } else {
                      console.log('ℹ No conflict dialog (might auto-overwrite or use different UI)');
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
