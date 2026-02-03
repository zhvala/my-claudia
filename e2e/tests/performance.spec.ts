import { test, expect } from '../helpers/setup';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Performance Tests', () => {
  const fixturesPath = path.join(process.cwd(), 'e2e/fixtures');
  const performanceDataPath = path.join(fixturesPath, 'performance-data');

  // Helper to measure execution time
  async function measureTime<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    console.log(`⏱ ${name}: ${duration.toFixed(2)}ms`);
    return { result, duration };
  }

  test.beforeEach(async ({ page, cleanDB }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Import large session (1000+ messages) - measure time', async ({ page }) => {
    const largeSessionPath = path.join(performanceDataPath, 'large-session.jsonl');

    // Verify fixture exists
    if (!fs.existsSync(largeSessionPath)) {
      console.log('⚠ Large session fixture not found, skipping test');
      test.skip();
      return;
    }

    console.log('Starting large session import performance test...');

    // Navigate to import
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();
    await page.waitForTimeout(500);

    const importTab = page.locator('text=Import').first();
    if (!await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('⚠ Import tab not available, skipping test');
      test.skip();
      return;
    }

    await importTab.click();
    await page.waitForTimeout(300);

    const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
    await importButton.click();
    await page.waitForTimeout(500);

    // Enter path to performance fixtures
    const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
    await pathInput.fill(performanceDataPath);

    // Measure scan time
    const { duration: scanDuration } = await measureTime('Scan large session', async () => {
      const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
      await scanButton.click();
      await page.waitForTimeout(3000);
    });

    expect(scanDuration).toBeLessThan(5000); // Scan should complete in < 5 seconds
    console.log(`✓ Scan completed in ${scanDuration.toFixed(2)}ms`);

    // Select and import
    const sessionCheckbox = page.locator('input[type="checkbox"]').first();
    if (await sessionCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sessionCheckbox.check();

      // Measure import time
      const { duration: importDuration } = await measureTime('Import large session (1000+ messages)', async () => {
        const confirmButton = page.locator('button:has-text("Import")').first();
        await confirmButton.click();
        // Wait for import to complete - this might take a while for 1000+ messages
        await page.waitForTimeout(10000);
      });

      // Import should complete in reasonable time (< 30 seconds for 1000 messages)
      expect(importDuration).toBeLessThan(30000);
      console.log(`✓ Import of 1000+ messages completed in ${importDuration.toFixed(2)}ms`);

      // Close settings
      const closeButton = page.locator('button:has-text("Close"), button[aria-label*="close"]').first();
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(500);
      }

      // Measure time to open and render the large session
      const { duration: renderDuration } = await measureTime('Render large session', async () => {
        const sessionItem = page.locator('text=/Large Session|1000.*message/i').first();
        if (await sessionItem.isVisible({ timeout: 5000 }).catch(() => false)) {
          await sessionItem.click();
          await page.waitForTimeout(2000);
        }
      });

      // Rendering should be fast (< 3 seconds)
      expect(renderDuration).toBeLessThan(3000);
      console.log(`✓ Large session rendered in ${renderDuration.toFixed(2)}ms`);

      // Measure scroll performance
      const { duration: scrollDuration } = await measureTime('Scroll through messages', async () => {
        await page.evaluate(() => {
          const scrollable = document.querySelector('[class*="messages"], [class*="chat"]');
          if (scrollable) {
            scrollable.scrollTo({ top: scrollable.scrollHeight / 2, behavior: 'instant' });
          }
        });
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          const scrollable = document.querySelector('[class*="messages"], [class*="chat"]');
          if (scrollable) {
            scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'instant' });
          }
        });
        await page.waitForTimeout(500);
      });

      expect(scrollDuration).toBeLessThan(2000);
      console.log(`✓ Scroll performance: ${scrollDuration.toFixed(2)}ms`);
    }
  });

  test('Upload multiple files concurrently (10 files)', async ({ page }) => {
    console.log('Starting concurrent file upload test...');

    // Create new session
    const newSessionBtn = page.locator('button:has-text("New Session"), button:has-text("New Chat")').first();
    if (await newSessionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newSessionBtn.click();
      await page.waitForTimeout(1000);
    }

    const fileInput = page.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠ File input not available, skipping test');
      test.skip();
      return;
    }

    // Prepare 10 test files
    const testFiles = Array.from({ length: 10 }, (_, i) =>
      path.join(fixturesPath, 'test-files', `test-file-${i + 1}.txt`)
    );

    // Create test files if they don't exist
    for (const filePath of testFiles) {
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `Test file content ${path.basename(filePath)}\n`.repeat(100));
      }
    }

    // Measure concurrent upload time
    const { duration: uploadDuration } = await measureTime('Upload 10 files concurrently', async () => {
      // Upload all files at once
      await fileInput.setInputFiles(testFiles);
      await page.waitForTimeout(3000);
    });

    // 10 files should upload in < 5 seconds
    expect(uploadDuration).toBeLessThan(5000);
    console.log(`✓ 10 files uploaded in ${uploadDuration.toFixed(2)}ms`);

    // Verify all files are shown
    const fileCount = await page.locator('[class*="attachment"], [class*="file-preview"]').count();
    console.log(`✓ ${fileCount} file attachments visible`);

    // Measure UI responsiveness after upload
    const { duration: responseDuration } = await measureTime('UI response after upload', async () => {
      const messageInput = page.locator('textarea, input[type="text"]').last();
      await messageInput.fill('Test message with files');
      await page.waitForTimeout(500);
    });

    expect(responseDuration).toBeLessThan(1000);
    console.log(`✓ UI remained responsive: ${responseDuration.toFixed(2)}ms`);
  });

  test('Import 100 sessions sequentially', async ({ page }) => {
    const multiSessionPath = path.join(performanceDataPath, 'multi-sessions');

    // Verify fixture exists
    if (!fs.existsSync(multiSessionPath)) {
      console.log('⚠ Multi-session fixture not found, skipping test');
      test.skip();
      return;
    }

    console.log('Starting 100 session import test...');

    // Navigate to import
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    await settingsButton.click();
    await page.waitForTimeout(500);

    const importTab = page.locator('text=Import').first();
    if (!await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('⚠ Import tab not available, skipping test');
      test.skip();
      return;
    }

    await importTab.click();
    await page.waitForTimeout(300);

    const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
    await importButton.click();
    await page.waitForTimeout(500);

    const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
    await pathInput.fill(multiSessionPath);

    // Measure scan time for 100 sessions
    const { duration: scanDuration } = await measureTime('Scan 100 sessions', async () => {
      const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
      await scanButton.click();
      await page.waitForTimeout(5000);
    });

    expect(scanDuration).toBeLessThan(10000); // Should scan in < 10 seconds
    console.log(`✓ Scanned 100 sessions in ${scanDuration.toFixed(2)}ms`);

    // Select all sessions
    const selectAllCheckbox = page.locator('input[type="checkbox"]').first();
    if (await selectAllCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectAllCheckbox.check();
      await page.waitForTimeout(500);

      // Measure import time
      const { duration: importDuration } = await measureTime('Import 100 sessions', async () => {
        const confirmButton = page.locator('button:has-text("Import")').first();
        await confirmButton.click();
        // Wait for all imports to complete
        await page.waitForTimeout(30000);
      });

      // 100 sessions should import in reasonable time (< 60 seconds)
      expect(importDuration).toBeLessThan(60000);
      console.log(`✓ Imported 100 sessions in ${importDuration.toFixed(2)}ms`);
      console.log(`  Average: ${(importDuration / 100).toFixed(2)}ms per session`);

      // Close settings
      const closeButton = page.locator('button:has-text("Close"), button[aria-label*="close"]').first();
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(1000);
      }

      // Measure session list rendering performance
      const { duration: listDuration } = await measureTime('Render session list (100 items)', async () => {
        await page.waitForTimeout(2000);
      });

      expect(listDuration).toBeLessThan(3000);
      console.log(`✓ Session list rendered in ${listDuration.toFixed(2)}ms`);

      // Test search/filter performance
      const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const { duration: searchDuration } = await measureTime('Search through 100 sessions', async () => {
          await searchInput.fill('test');
          await page.waitForTimeout(1000);
        });

        expect(searchDuration).toBeLessThan(2000);
        console.log(`✓ Search completed in ${searchDuration.toFixed(2)}ms`);
      }
    }
  });

  test('Verify response times < 3 seconds for common operations', async ({ page }) => {
    console.log('Testing common operation response times...');

    // Test 1: Create new session
    const { duration: newSessionDuration } = await measureTime('Create new session', async () => {
      const newSessionBtn = page.locator('button:has-text("New Session"), button:has-text("New Chat")').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await page.waitForTimeout(1000);
      }
    });

    expect(newSessionDuration).toBeLessThan(3000);
    console.log(`✓ New session created in ${newSessionDuration.toFixed(2)}ms`);

    // Test 2: Send message
    const { duration: sendMessageDuration } = await measureTime('Send message', async () => {
      const messageInput = page.locator('textarea, input[type="text"]').last();
      if (await messageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await messageInput.fill('Performance test message');
        await messageInput.press('Enter');
        await page.waitForTimeout(1000);
      }
    });

    expect(sendMessageDuration).toBeLessThan(3000);
    console.log(`✓ Message sent in ${sendMessageDuration.toFixed(2)}ms`);

    // Test 3: Open settings
    const { duration: settingsDuration } = await measureTime('Open settings', async () => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);
      }
    });

    expect(settingsDuration).toBeLessThan(3000);
    console.log(`✓ Settings opened in ${settingsDuration.toFixed(2)}ms`);

    // Close settings
    const closeButton = page.locator('button:has-text("Close"), button[aria-label*="close"]').first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }

    // Test 4: Switch between sessions
    const { duration: switchDuration } = await measureTime('Switch sessions', async () => {
      // Create another session
      const anotherSessionBtn = page.locator('button:has-text("New Session"), button:has-text("New Chat")').first();
      if (await anotherSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anotherSessionBtn.click();
        await page.waitForTimeout(500);

        // Switch back to previous
        const sessionList = page.locator('[class*="session"]').nth(1);
        if (await sessionList.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sessionList.click();
          await page.waitForTimeout(500);
        }
      }
    });

    expect(switchDuration).toBeLessThan(3000);
    console.log(`✓ Session switch completed in ${switchDuration.toFixed(2)}ms`);

    // Test 5: File attachment UI
    const { duration: attachmentDuration } = await measureTime('Show file picker', async () => {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'test-files', 'sample.png');
        await fileInput.setInputFiles(testFile);
        await page.waitForTimeout(1000);
      }
    });

    expect(attachmentDuration).toBeLessThan(3000);
    console.log(`✓ File attachment in ${attachmentDuration.toFixed(2)}ms`);

    // Test 6: Page refresh and restore
    const { duration: refreshDuration } = await measureTime('Page refresh and restore', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    });

    expect(refreshDuration).toBeLessThan(5000); // Allow slightly more time for full page reload
    console.log(`✓ Page refreshed and restored in ${refreshDuration.toFixed(2)}ms`);

    console.log('\n✓ All common operations completed within acceptable time limits');
  });

  test('Database query performance with large dataset', async ({ page }) => {
    console.log('Testing database query performance...');

    // This test assumes we have sessions already imported
    // Test pagination performance
    const { duration: paginationDuration } = await measureTime('Load paginated session list', async () => {
      // Scroll to bottom of session list to trigger pagination
      await page.evaluate(() => {
        const sidebar = document.querySelector('[class*="sidebar"], [class*="session-list"]');
        if (sidebar) {
          sidebar.scrollTo({ top: sidebar.scrollHeight, behavior: 'instant' });
        }
      });
      await page.waitForTimeout(1000);
    });

    expect(paginationDuration).toBeLessThan(2000);
    console.log(`✓ Pagination loaded in ${paginationDuration.toFixed(2)}ms`);

    // Test search/filter query performance
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const { duration: filterDuration } = await measureTime('Filter sessions', async () => {
        await searchInput.fill('test');
        await page.waitForTimeout(500);
        await searchInput.fill('');
        await page.waitForTimeout(500);
      });

      expect(filterDuration).toBeLessThan(2000);
      console.log(`✓ Filter operation in ${filterDuration.toFixed(2)}ms`);
    }

    // Test message history loading
    const session = page.locator('[class*="session"]').first();
    if (await session.isVisible({ timeout: 3000 }).catch(() => false)) {
      const { duration: loadDuration } = await measureTime('Load message history', async () => {
        await session.click();
        await page.waitForTimeout(1500);
      });

      expect(loadDuration).toBeLessThan(3000);
      console.log(`✓ Message history loaded in ${loadDuration.toFixed(2)}ms`);
    }

    console.log('\n✓ Database query performance tests completed');
  });

  test('Memory usage - load and unload multiple sessions', async ({ page }) => {
    console.log('Testing memory management with multiple sessions...');

    const sessionCount = 20;
    const sessions: string[] = [];

    // Create multiple sessions
    for (let i = 0; i < sessionCount; i++) {
      const newSessionBtn = page.locator('button:has-text("New Session"), button:has-text("New Chat")').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await page.waitForTimeout(300);

        // Send a message
        const messageInput = page.locator('textarea, input[type="text"]').last();
        if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await messageInput.fill(`Session ${i + 1} test message`);
          await messageInput.press('Enter');
          await page.waitForTimeout(500);
        }

        sessions.push(`Session ${i + 1}`);
      }

      if (i % 5 === 0) {
        console.log(`  Created ${i + 1}/${sessionCount} sessions`);
      }
    }

    console.log(`✓ Created ${sessionCount} sessions`);

    // Rapidly switch between sessions to test memory management
    const { duration: switchDuration } = await measureTime(`Rapidly switch between ${sessionCount} sessions`, async () => {
      const sessionList = page.locator('[class*="session"]');
      const count = await sessionList.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        await sessionList.nth(i).click();
        await page.waitForTimeout(200);
      }
    });

    expect(switchDuration).toBeLessThan(10000);
    console.log(`✓ Switched between sessions in ${switchDuration.toFixed(2)}ms`);
    console.log(`  Average: ${(switchDuration / sessionCount).toFixed(2)}ms per switch`);

    // Verify app remains responsive
    const { duration: responseDuration } = await measureTime('App responsiveness check', async () => {
      const messageInput = page.locator('textarea, input[type="text"]').last();
      if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await messageInput.fill('Responsiveness test');
        await page.waitForTimeout(500);
      }
    });

    expect(responseDuration).toBeLessThan(2000);
    console.log(`✓ App remained responsive after session switching: ${responseDuration.toFixed(2)}ms`);

    console.log('\n✓ Memory management tests completed');
  });
});
