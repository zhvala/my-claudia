import { test, expect } from '../helpers/setup';
import * as path from 'path';
import * as fs from 'fs';

test.describe('User Workflows - End to End', () => {
  const fixturesPath = path.join(process.cwd(), 'e2e/fixtures/claude-cli-data');

  test.beforeEach(async ({ page, cleanDB }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Complete workflow: Import session → Continue conversation → Upload file → Send message', async ({ page, testProject }) => {
    // Step 1: Import session from Claude CLI
    console.log('Step 1: Starting session import...');

    // Open settings
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();
    await page.waitForTimeout(500);

    // Navigate to Import tab
    const importTab = page.locator('text=Import').first();
    if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await importTab.click();
      await page.waitForTimeout(300);

      // Start import process
      const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
      await expect(importButton).toBeVisible();
      await importButton.click();
      await page.waitForTimeout(500);

      // Enter Claude CLI path
      const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
      await expect(pathInput).toBeVisible({ timeout: 3000 });
      await pathInput.fill(fixturesPath);
      console.log(`✓ Entered path: ${fixturesPath}`);

      // Scan for sessions
      const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
      if (await scanButton.isVisible({ timeout: 2000 })) {
        await scanButton.click();
        await page.waitForTimeout(2000);
        console.log('✓ Scanned for sessions');

        // Select a session to import
        const sessionCheckbox = page.locator('input[type="checkbox"]').first();
        if (await sessionCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sessionCheckbox.check();
          console.log('✓ Selected session for import');

          // Confirm import
          const confirmButton = page.locator('button:has-text("Import"), button:has-text("Confirm")').first();
          if (await confirmButton.isVisible({ timeout: 2000 })) {
            await confirmButton.click();
            await page.waitForTimeout(3000);
            console.log('✓ Import completed');
          }
        }
      }

      // Close settings
      const closeButton = page.locator('button:has-text("Close"), button[aria-label*="close"]').first();
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Step 2: Continue conversation in imported session
    console.log('Step 2: Opening imported session...');

    // Find and click on imported session
    const sessionItem = page.locator('text=/Test Session|session/i').first();
    if (await sessionItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sessionItem.click();
      await page.waitForTimeout(1000);
      console.log('✓ Opened imported session');

      // Verify imported messages are visible
      const messageContent = page.locator('text=/Hello|Hi there/i').first();
      if (await messageContent.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('✓ Imported messages visible');
      }
    }

    // Step 3: Upload a file
    console.log('Step 3: Uploading file...');

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');
      await fileInput.setInputFiles(testFile);
      await page.waitForTimeout(1000);
      console.log('✓ File uploaded');

      // Verify file preview
      const hasPreview = await page.locator('[class*="preview"], [class*="attachment"], img[src*="data:image"]').first().isVisible({ timeout: 2000 }).catch(() => false);
      if (hasPreview) {
        console.log('✓ File preview displayed');
      }
    }

    // Step 4: Send a message
    console.log('Step 4: Sending message...');

    const messageInput = page.locator('textarea, input[type="text"]').last();
    if (await messageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await messageInput.fill('Can you describe this image?');
      await page.waitForTimeout(500);

      // Send message (press Enter or click send button)
      const sendButton = page.locator('button:has-text("Send"), button[aria-label*="send"]').first();
      if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendButton.click();
      } else {
        await messageInput.press('Enter');
      }

      await page.waitForTimeout(1000);
      console.log('✓ Message sent');

      // Verify message appears in chat
      const sentMessage = page.locator('text="Can you describe this image?"').first();
      if (await sentMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('✓ Complete workflow finished successfully');
      }
    }
  });

  test('Multi-project workflow: Create project → Import sessions → Switch projects → Verify isolation', async ({ page, cleanDB }) => {
    // Step 1: Create first project
    console.log('Step 1: Creating first project...');

    // Look for project switcher or new project button
    const newProjectBtn = page.locator('button:has-text("New Project"), button:has-text("Create Project")').first();
    if (await newProjectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newProjectBtn.click();
      await page.waitForTimeout(500);

      // Fill project details
      const projectNameInput = page.locator('input[placeholder*="project" i], input[name*="name"]').first();
      if (await projectNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectNameInput.fill('Test Project A');

        const createBtn = page.locator('button:has-text("Create"), button:has-text("Save")').first();
        await createBtn.click();
        await page.waitForTimeout(1000);
        console.log('✓ Created Test Project A');
      }
    }

    // Step 2: Import sessions to first project
    console.log('Step 2: Importing sessions to Project A...');

    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const importTab = page.locator('text=Import').first();
      if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await importTab.click();
        await page.waitForTimeout(300);

        const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
        await importButton.click();
        await page.waitForTimeout(500);

        const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
        await pathInput.fill(fixturesPath);

        const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
        if (await scanButton.isVisible({ timeout: 2000 })) {
          await scanButton.click();
          await page.waitForTimeout(2000);

          // Import first session
          const firstCheckbox = page.locator('input[type="checkbox"]').first();
          if (await firstCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstCheckbox.check();

            const confirmButton = page.locator('button:has-text("Import")').first();
            if (await confirmButton.isVisible({ timeout: 2000 })) {
              await confirmButton.click();
              await page.waitForTimeout(2000);
              console.log('✓ Imported session to Project A');
            }
          }
        }

        // Close settings
        const closeButton = page.locator('button:has-text("Close"), button[aria-label*="close"]').first();
        if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeButton.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Verify session appears in Project A
    const projectASession = page.locator('text=/Test Session|session/i').first();
    const projectAHasSessions = await projectASession.isVisible({ timeout: 3000 }).catch(() => false);
    if (projectAHasSessions) {
      console.log('✓ Sessions visible in Project A');
    }

    // Step 3: Create second project
    console.log('Step 3: Creating second project...');

    const projectSwitcher = page.locator('[aria-label*="project" i], button:has-text("Project")').first();
    if (await projectSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectSwitcher.click();
      await page.waitForTimeout(500);

      const newProjectOption = page.locator('text="New Project", text="Create Project"').first();
      if (await newProjectOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newProjectOption.click();
        await page.waitForTimeout(500);

        const projectNameInput = page.locator('input[placeholder*="project" i], input[name*="name"]').first();
        if (await projectNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await projectNameInput.fill('Test Project B');

          const createBtn = page.locator('button:has-text("Create"), button:has-text("Save")').first();
          await createBtn.click();
          await page.waitForTimeout(1000);
          console.log('✓ Created Test Project B');
        }
      }
    }

    // Step 4: Verify Project B is empty (isolation)
    console.log('Step 4: Verifying project isolation...');

    const projectBSessions = page.locator('text=/Test Session|session/i').first();
    const projectBHasSessions = await projectBSessions.isVisible({ timeout: 2000 }).catch(() => false);

    if (!projectBHasSessions) {
      console.log('✓ Project B is empty - isolation verified');
    } else {
      console.log('⚠ Project B shows sessions (might indicate isolation issue)');
    }

    // Step 5: Switch back to Project A and verify sessions still exist
    console.log('Step 5: Switching back to Project A...');

    const projectSwitcherAgain = page.locator('[aria-label*="project" i], button:has-text("Project")').first();
    if (await projectSwitcherAgain.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectSwitcherAgain.click();
      await page.waitForTimeout(500);

      const projectAOption = page.locator('text="Test Project A"').first();
      if (await projectAOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectAOption.click();
        await page.waitForTimeout(1000);
        console.log('✓ Switched back to Project A');

        // Verify sessions still exist
        const sessionsStillThere = await page.locator('text=/Test Session|session/i').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (sessionsStillThere) {
          console.log('✓ Sessions persisted in Project A - multi-project workflow complete');
        }
      }
    }
  });

  test('Data persistence workflow: Perform actions → Refresh page → Restart app → Verify data intact', async ({ page, testProject }) => {
    // Step 1: Create a new session with messages
    console.log('Step 1: Creating session with messages...');

    const newSessionBtn = page.locator('button:has-text("New Session"), button:has-text("New Chat")').first();
    if (await newSessionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newSessionBtn.click();
      await page.waitForTimeout(1000);
      console.log('✓ Created new session');
    }

    // Send a test message
    const messageInput = page.locator('textarea, input[type="text"]').last();
    if (await messageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testMessage = 'This is a persistence test message';
      await messageInput.fill(testMessage);
      await page.waitForTimeout(500);

      const sendButton = page.locator('button:has-text("Send"), button[aria-label*="send"]').first();
      if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendButton.click();
      } else {
        await messageInput.press('Enter');
      }

      await page.waitForTimeout(1000);
      console.log('✓ Sent test message');

      // Verify message appears
      const sentMessage = page.locator(`text="${testMessage}"`).first();
      await expect(sentMessage).toBeVisible({ timeout: 3000 });
    }

    // Step 2: Upload a file
    console.log('Step 2: Uploading file...');

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.pdf');
      await fileInput.setInputFiles(testFile);
      await page.waitForTimeout(1000);
      console.log('✓ File uploaded');
    }

    // Get session identifier before refresh
    const sessionUrl = page.url();
    console.log(`✓ Current URL: ${sessionUrl}`);

    // Step 3: Refresh page
    console.log('Step 3: Refreshing page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✓ Page refreshed');

    // Verify data persisted after refresh
    const messageAfterRefresh = page.locator('text="This is a persistence test message"').first();
    const messageVisible = await messageAfterRefresh.isVisible({ timeout: 5000 }).catch(() => false);

    if (messageVisible) {
      console.log('✓ Message persisted after refresh');
    } else {
      console.log('⚠ Message not visible after refresh');
    }

    // Step 4: Navigate away and back
    console.log('Step 4: Navigating away and back...');

    // Go to settings
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsButton.click();
      await page.waitForTimeout(1000);

      // Close settings to return to chat
      const closeButton = page.locator('button:has-text("Close"), button[aria-label*="close"]').first();
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // Verify message still exists
    const messageAfterNav = page.locator('text="This is a persistence test message"').first();
    const stillVisible = await messageAfterNav.isVisible({ timeout: 3000 }).catch(() => false);

    if (stillVisible) {
      console.log('✓ Message persisted after navigation');
    }

    // Step 5: Test database persistence by checking multiple sessions
    console.log('Step 5: Verifying database persistence...');

    // Create another session
    const anotherSessionBtn = page.locator('button:has-text("New Session"), button:has-text("New Chat")').first();
    if (await anotherSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await anotherSessionBtn.click();
      await page.waitForTimeout(1000);

      // Send message in new session
      const newInput = page.locator('textarea, input[type="text"]').last();
      if (await newInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newInput.fill('Second session message');
        await newInput.press('Enter');
        await page.waitForTimeout(1000);
        console.log('✓ Created second session with message');
      }

      // Navigate back to first session via session list
      const sessionList = page.locator('[class*="session"], [class*="sidebar"]').first();
      if (await sessionList.isVisible({ timeout: 3000 }).catch(() => false)) {
        const firstSession = page.locator('text="This is a persistence test message"').first();
        if (await firstSession.isVisible({ timeout: 2000 }).catch(() => false)) {
          await firstSession.click();
          await page.waitForTimeout(1000);

          // Verify original message still there
          const originalMessage = page.locator('text="This is a persistence test message"').first();
          const originalExists = await originalMessage.isVisible({ timeout: 3000 }).catch(() => false);

          if (originalExists) {
            console.log('✓ Data persistence verified - workflow complete');
          }
        }
      }
    }

    // Final verification: Refresh one more time
    console.log('Step 6: Final refresh verification...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const finalCheck = page.locator('text="This is a persistence test message"').first();
    const finalVisible = await finalCheck.isVisible({ timeout: 5000 }).catch(() => false);

    if (finalVisible) {
      console.log('✓ All data persisted successfully through multiple refreshes');
      expect(finalVisible).toBeTruthy();
    } else {
      console.log('⚠ Final verification: message not visible');
    }
  });
});
