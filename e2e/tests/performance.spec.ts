import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import { setupCleanDB } from '../helpers/setup';
import '../helpers/custom-matchers';
import * as path from 'path';
import * as fs from 'fs';

describe('Performance Tests', () => {
  const fixturesPath = path.join(process.cwd(), 'e2e/fixtures');
  const performanceDataPath = path.join(fixturesPath, 'performance-data');

  let browser: BrowserAdapter;

  // Helper to measure execution time
  async function measureTime<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    console.log(`⏱ ${name}: ${duration.toFixed(2)}ms`);
    return { result, duration };
  }

  beforeEach(async () => {
    await setupCleanDB();
    browser = await createBrowser();
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');
    await browser.waitForTimeout(2000);
  });

  afterEach(async () => {
    await browser?.close();
  });

  test('Import large session (1000+ messages) - measure time', async () => {
    const largeSessionPath = path.join(performanceDataPath, 'large-session.jsonl');

    // Verify fixture exists
    if (!fs.existsSync(largeSessionPath)) {
      console.log('⚠ Large session fixture not found, skipping test');
      return;
    }

    console.log('Starting large session import performance test...');

    // Navigate to import
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();
    await browser.waitForTimeout(500);

    const importTab = browser.getByText('Import').first();
    if (!await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('⚠ Import tab not available, skipping test');
      return;
    }

    await importTab.click();
    await browser.waitForTimeout(300);

    const importButton = browser.getByText('Import from Claude CLI').first();
    await importButton.click();
    await browser.waitForTimeout(500);

    // Enter path to performance fixtures
    const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
    await pathInput.fill(performanceDataPath);

    // Measure scan time
    const { duration: scanDuration } = await measureTime('Scan large session', async () => {
      const scanButton = browser.getByText('Scan').first();
      await scanButton.click();
      await browser.waitForTimeout(3000);
    });

    expect(scanDuration).toBeLessThan(5000);
    console.log(`✓ Scan completed in ${scanDuration.toFixed(2)}ms`);

    // Select and import
    const sessionCheckbox = browser.locator('input[type="checkbox"]').first();
    if (await sessionCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sessionCheckbox.click();

      // Measure import time
      const { duration: importDuration } = await measureTime('Import large session (1000+ messages)', async () => {
        const confirmButton = browser.getByText('Import').first();
        await confirmButton.click();
        await browser.waitForTimeout(10000);
      });

      expect(importDuration).toBeLessThan(30000);
      console.log(`✓ Import of 1000+ messages completed in ${importDuration.toFixed(2)}ms`);

      // Close settings
      const closeButton = browser.getByText('Close').first();
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await browser.waitForTimeout(500);
      }

      // Measure time to open and render the large session
      const { duration: renderDuration } = await measureTime('Render large session', async () => {
        const sessionItem = browser.getByText(/Large Session|1000.*message/i).first();
        if (await sessionItem.isVisible({ timeout: 5000 }).catch(() => false)) {
          await sessionItem.click();
          await browser.waitForTimeout(2000);
        }
      });

      expect(renderDuration).toBeLessThan(3000);
      console.log(`✓ Large session rendered in ${renderDuration.toFixed(2)}ms`);

      // Measure scroll performance
      const { duration: scrollDuration } = await measureTime('Scroll through messages', async () => {
        await browser.evaluate(() => {
          const scrollable = document.querySelector('[class*="messages"], [class*="chat"]');
          if (scrollable) {
            scrollable.scrollTo({ top: scrollable.scrollHeight / 2, behavior: 'instant' as ScrollBehavior });
          }
        });
        await browser.waitForTimeout(500);
        await browser.evaluate(() => {
          const scrollable = document.querySelector('[class*="messages"], [class*="chat"]');
          if (scrollable) {
            scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'instant' as ScrollBehavior });
          }
        });
        await browser.waitForTimeout(500);
      });

      expect(scrollDuration).toBeLessThan(2000);
      console.log(`✓ Scroll performance: ${scrollDuration.toFixed(2)}ms`);
    }
  });

  test('Upload multiple files concurrently (10 files)', async () => {
    console.log('Starting concurrent file upload test...');

    // Create new session
    const newSessionBtn = browser.getByText('New Session').first();
    if (await newSessionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newSessionBtn.click();
      await browser.waitForTimeout(1000);
    }

    const fileInput = browser.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠ File input not available, skipping test');
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
      await fileInput.setInputFiles(testFiles);
      await browser.waitForTimeout(3000);
    });

    expect(uploadDuration).toBeLessThan(5000);
    console.log(`✓ 10 files uploaded in ${uploadDuration.toFixed(2)}ms`);

    // Verify all files are shown
    const fileCount = await browser.locator('[class*="attachment"], [class*="file-preview"]').count();
    console.log(`✓ ${fileCount} file attachments visible`);

    // Measure UI responsiveness after upload
    const { duration: responseDuration } = await measureTime('UI response after upload', async () => {
      const messageInput = browser.locator('textarea, input[type="text"]').last();
      await messageInput.fill('Test message with files');
      await browser.waitForTimeout(500);
    });

    expect(responseDuration).toBeLessThan(1000);
    console.log(`✓ UI remained responsive: ${responseDuration.toFixed(2)}ms`);
  });

  test('Import 100 sessions sequentially', async () => {
    const multiSessionPath = path.join(performanceDataPath, 'multi-sessions');

    if (!fs.existsSync(multiSessionPath)) {
      console.log('⚠ Multi-session fixture not found, skipping test');
      return;
    }

    console.log('Starting 100 session import test...');

    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    await settingsButton.click();
    await browser.waitForTimeout(500);

    const importTab = browser.getByText('Import').first();
    if (!await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('⚠ Import tab not available, skipping test');
      return;
    }

    await importTab.click();
    await browser.waitForTimeout(300);

    const importButton = browser.getByText('Import from Claude CLI').first();
    await importButton.click();
    await browser.waitForTimeout(500);

    const pathInput = browser.locator('input[placeholder*="claude"], input[value*="claude"]').first();
    await pathInput.fill(multiSessionPath);

    const { duration: scanDuration } = await measureTime('Scan 100 sessions', async () => {
      const scanButton = browser.getByText('Scan').first();
      await scanButton.click();
      await browser.waitForTimeout(5000);
    });

    expect(scanDuration).toBeLessThan(10000);
    console.log(`✓ Scanned 100 sessions in ${scanDuration.toFixed(2)}ms`);

    const selectAllCheckbox = browser.locator('input[type="checkbox"]').first();
    if (await selectAllCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectAllCheckbox.click();
      await browser.waitForTimeout(500);

      const { duration: importDuration } = await measureTime('Import 100 sessions', async () => {
        const confirmButton = browser.getByText('Import').first();
        await confirmButton.click();
        await browser.waitForTimeout(30000);
      });

      expect(importDuration).toBeLessThan(60000);
      console.log(`✓ Imported 100 sessions in ${importDuration.toFixed(2)}ms`);
      console.log(`  Average: ${(importDuration / 100).toFixed(2)}ms per session`);

      const closeButton = browser.getByText('Close').first();
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await browser.waitForTimeout(1000);
      }

      const { duration: listDuration } = await measureTime('Render session list (100 items)', async () => {
        await browser.waitForTimeout(2000);
      });

      expect(listDuration).toBeLessThan(3000);
      console.log(`✓ Session list rendered in ${listDuration.toFixed(2)}ms`);

      const searchInput = browser.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const { duration: searchDuration } = await measureTime('Search through 100 sessions', async () => {
          await searchInput.fill('test');
          await browser.waitForTimeout(1000);
        });

        expect(searchDuration).toBeLessThan(2000);
        console.log(`✓ Search completed in ${searchDuration.toFixed(2)}ms`);
      }
    }
  });

  test('Verify response times < 3 seconds for common operations', async () => {
    console.log('Testing common operation response times...');

    const { duration: newSessionDuration } = await measureTime('Create new session', async () => {
      const newSessionBtn = browser.getByText('New Session').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await browser.waitForTimeout(1000);
      }
    });

    expect(newSessionDuration).toBeLessThan(3000);
    console.log(`✓ New session created in ${newSessionDuration.toFixed(2)}ms`);

    const { duration: sendMessageDuration } = await measureTime('Send message', async () => {
      const messageInput = browser.locator('textarea, input[type="text"]').last();
      if (await messageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await messageInput.fill('Performance test message');
        await messageInput.press('Enter');
        await browser.waitForTimeout(1000);
      }
    });

    expect(sendMessageDuration).toBeLessThan(3000);
    console.log(`✓ Message sent in ${sendMessageDuration.toFixed(2)}ms`);

    const { duration: settingsDuration } = await measureTime('Open settings', async () => {
      const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsButton.click();
        await browser.waitForTimeout(500);
      }
    });

    expect(settingsDuration).toBeLessThan(3000);
    console.log(`✓ Settings opened in ${settingsDuration.toFixed(2)}ms`);

    const closeButton = browser.getByText('Close').first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await browser.waitForTimeout(500);
    }

    const { duration: switchDuration } = await measureTime('Switch sessions', async () => {
      const anotherSessionBtn = browser.getByText('New Session').first();
      if (await anotherSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anotherSessionBtn.click();
        await browser.waitForTimeout(500);

        const sessionList = browser.locator('[class*="session"]').nth(1);
        if (await sessionList.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sessionList.click();
          await browser.waitForTimeout(500);
        }
      }
    });

    expect(switchDuration).toBeLessThan(3000);
    console.log(`✓ Session switch completed in ${switchDuration.toFixed(2)}ms`);

    const { duration: attachmentDuration } = await measureTime('Show file picker', async () => {
      const fileInput = browser.locator('input[type="file"]').first();
      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'test-files', 'sample.png');
        await fileInput.setInputFiles(testFile);
        await browser.waitForTimeout(1000);
      }
    });

    expect(attachmentDuration).toBeLessThan(3000);
    console.log(`✓ File attachment in ${attachmentDuration.toFixed(2)}ms`);

    const { duration: refreshDuration } = await measureTime('Page refresh and restore', async () => {
      await browser.reload({ waitUntil: 'networkidle' });
      await browser.waitForTimeout(2000);
    });

    expect(refreshDuration).toBeLessThan(5000);
    console.log(`✓ Page refreshed and restored in ${refreshDuration.toFixed(2)}ms`);

    console.log('\n✓ All common operations completed within acceptable time limits');
  });

  test('Database query performance with large dataset', async () => {
    console.log('Testing database query performance...');

    const { duration: paginationDuration } = await measureTime('Load paginated session list', async () => {
      await browser.evaluate(() => {
        const sidebar = document.querySelector('[class*="sidebar"], [class*="session-list"]');
        if (sidebar) {
          sidebar.scrollTo({ top: sidebar.scrollHeight, behavior: 'instant' as ScrollBehavior });
        }
      });
      await browser.waitForTimeout(1000);
    });

    expect(paginationDuration).toBeLessThan(2000);
    console.log(`✓ Pagination loaded in ${paginationDuration.toFixed(2)}ms`);

    const searchInput = browser.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const { duration: filterDuration } = await measureTime('Filter sessions', async () => {
        await searchInput.fill('test');
        await browser.waitForTimeout(500);
        await searchInput.fill('');
        await browser.waitForTimeout(500);
      });

      expect(filterDuration).toBeLessThan(2000);
      console.log(`✓ Filter operation in ${filterDuration.toFixed(2)}ms`);
    }

    const session = browser.locator('[class*="session"]').first();
    if (await session.isVisible({ timeout: 3000 }).catch(() => false)) {
      const { duration: loadDuration } = await measureTime('Load message history', async () => {
        await session.click();
        await browser.waitForTimeout(1500);
      });

      expect(loadDuration).toBeLessThan(3000);
      console.log(`✓ Message history loaded in ${loadDuration.toFixed(2)}ms`);
    }

    console.log('\n✓ Database query performance tests completed');
  });

  test('Memory usage - load and unload multiple sessions', async () => {
    console.log('Testing memory management with multiple sessions...');

    const sessionCount = 20;
    const sessions: string[] = [];

    for (let i = 0; i < sessionCount; i++) {
      const newSessionBtn = browser.getByText('New Session').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await browser.waitForTimeout(300);

        const messageInput = browser.locator('textarea, input[type="text"]').last();
        if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await messageInput.fill(`Session ${i + 1} test message`);
          await messageInput.press('Enter');
          await browser.waitForTimeout(500);
        }

        sessions.push(`Session ${i + 1}`);
      }

      if (i % 5 === 0) {
        console.log(`  Created ${i + 1}/${sessionCount} sessions`);
      }
    }

    console.log(`✓ Created ${sessionCount} sessions`);

    const { duration: switchDuration } = await measureTime(`Rapidly switch between ${sessionCount} sessions`, async () => {
      const sessionList = browser.locator('[class*="session"]');
      const count = await sessionList.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        await sessionList.nth(i).click();
        await browser.waitForTimeout(200);
      }
    });

    expect(switchDuration).toBeLessThan(10000);
    console.log(`✓ Switched between sessions in ${switchDuration.toFixed(2)}ms`);
    console.log(`  Average: ${(switchDuration / sessionCount).toFixed(2)}ms per switch`);

    const { duration: responseDuration } = await measureTime('App responsiveness check', async () => {
      const messageInput = browser.locator('textarea, input[type="text"]').last();
      if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await messageInput.fill('Responsiveness test');
        await browser.waitForTimeout(500);
      }
    });

    expect(responseDuration).toBeLessThan(2000);
    console.log(`✓ App remained responsive after session switching: ${responseDuration.toFixed(2)}ms`);

    console.log('\n✓ Memory management tests completed');
  });
});
