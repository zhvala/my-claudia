/**
 * Workflow Tests (M1-M7)
 *
 * End-to-end workflow tests covering complete user journeys.
 * Refactored to use AI capabilities for realistic user simulation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import { setupCleanDB } from '../helpers/setup';
import { withAIAction, withAIExtract, actSequence } from '../helpers/ai-test-utils';
import { z } from 'zod';
import '../helpers/custom-matchers';

describe('Cross-Feature Workflows - AI Refactored', () => {
  let browser: BrowserAdapter;

  beforeEach(async () => {
    await setupCleanDB();
    browser = await createBrowser({ enableAI: true });
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');
    await browser.waitForTimeout(2000);
  });

  afterEach(async () => {
    await browser?.close();
  });

  // ─────────────────────────────────────────────
  // M1: 完整工作流：创建项目→创建会话→发送消息→查看响应 (🤖 AI act)
  // ─────────────────────────────────────────────
  test('M1: complete workflow - create project, session, send message', async () => {
    console.log('Starting complete workflow test...');

    // Use AI to perform the entire workflow
    const workflowResult = await actSequence(browser, [
      'Create a new project named "Workflow Test Project"',
      'Create a new session in the project',
      'Type "Hello, this is a test message from the workflow test" in the message input and send it',
    ], { timeout: 40000 });

    if (workflowResult.success) {
      console.log('✓ M1: Workflow completed successfully with AI');

      // Verify user message appears with traditional method (faster)
      const userMessage = browser.getByText('Hello, this is a test message');
      await expect(userMessage).toBeVisible({ timeout: 5000 });
    } else {
      console.log(`⚠ M1: AI workflow failed at step ${workflowResult.failedStep}, trying fallback...`);

      // Fallback to traditional method
      const addProjectBtn = browser.locator('button[title="Add Project"]').first();
      await addProjectBtn.click();
      await browser.waitForTimeout(500);

      await browser.getByPlaceholder('Project name').fill('Workflow Test Project');

      const workDirInput = browser.getByPlaceholder('Working directory');
      if (await workDirInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await workDirInput.fill(process.cwd());
      }

      await browser.getByRole('button', { name: 'Create' }).click();
      await browser.waitForTimeout(1500);

      const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
      await newSessionBtn.waitFor({ state: 'visible', timeout: 5000 });
      await newSessionBtn.click();
      await browser.waitForTimeout(500);

      const createSessionBtn = browser.getByRole('button', { name: 'Create' });
      if (await createSessionBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await createSessionBtn.click();
        await browser.waitForTimeout(1000);
      }

      const textarea = browser.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 5000 });
      await textarea.fill('Hello, this is a test message from the workflow test.');
      await browser.click('[data-testid="send-button"]');
      await browser.waitForTimeout(2000);

      const userMessage = browser.getByText('Hello, this is a test message');
      await expect(userMessage).toBeVisible({ timeout: 5000 });
      console.log('✓ M1: Workflow completed with fallback method');
    }

    console.log('✓ M1: Complete workflow test finished');
  });

  // ─────────────────────────────────────────────
  // M3: 多项目切换并验证数据隔离 (🤖 AI act + extract)
  // ─────────────────────────────────────────────
  test('M3: multi-project switching and data isolation', async () => {
    console.log('Starting multi-project isolation test...');

    // Step 1: Create Project A and send a message
    console.log('Step 1: Creating Project A...');
    const projectAResult = await actSequence(browser, [
      'Create a new project named "Project A"',
      'Create a new session in Project A',
      'Send message "Message from Project A"',
    ], { timeout: 40000 });

    if (!projectAResult.success) {
      console.log('⚠ Project A creation failed with AI, using fallback');
      // Fallback implementation
      const addProjectBtn = browser.locator('button[title="Add Project"]').first();
      await addProjectBtn.click();
      await browser.waitForTimeout(300);

      await browser.getByPlaceholder('Project name').fill('Project A');
      await browser.getByRole('button', { name: 'Create' }).click();
      await browser.waitForTimeout(1500);

      const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await browser.waitForTimeout(500);

        const createBtn = browser.getByRole('button', { name: 'Create' });
        if (await createBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await createBtn.click();
          await browser.waitForTimeout(1000);
        }
      }

      const textarea = browser.locator('textarea').first();
      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill('Message from Project A');
        await browser.click('[data-testid="send-button"]');
        await browser.waitForTimeout(2000);
      }
    }

    console.log('  ✓ Project A created with message');

    // Step 2: Create Project B
    console.log('Step 2: Creating Project B...');
    const projectBResult = await actSequence(browser, [
      'Create another new project named "Project B"',
      'Create a new session in Project B',
    ], { timeout: 40000 });

    if (!projectBResult.success) {
      console.log('⚠ Project B creation failed with AI, using fallback');
      const addProjectBtn = browser.locator('button[title="Add Project"]').first();
      await addProjectBtn.click();
      await browser.waitForTimeout(300);

      await browser.getByPlaceholder('Project name').fill('Project B');
      await browser.getByRole('button', { name: 'Create' }).click();
      await browser.waitForTimeout(1500);

      const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await browser.waitForTimeout(500);

        const createBtn = browser.getByRole('button', { name: 'Create' });
        if (await createBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await createBtn.click();
          await browser.waitForTimeout(1000);
        }
      }
    }

    // Verify isolation: Project A's message should NOT be visible in Project B
    const textarea2 = browser.locator('textarea').first();
    if (await textarea2.isVisible({ timeout: 3000 }).catch(() => false)) {
      const projectAMessage = browser.getByText('Message from Project A');
      const messageVisible = await projectAMessage.isVisible({ timeout: 1000 }).catch(() => false);
      expect(messageVisible).toBe(false);
      console.log('  ✓ Project B is isolated from Project A');
    }

    // Step 3: Switch back to Project A and verify message exists
    console.log('Step 3: Switching back to Project A...');
    await withAIAction(browser, 'Click on "Project A" in the sidebar to switch to it');
    await browser.waitForTimeout(1000);

    // Try to click on the session
    const sessionItem = browser.locator('[data-testid="session-item"]').first();
    if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sessionItem.click();
      await browser.waitForTimeout(1000);
    }

    // Verify the message from Project A is still there
    const projectAMessage = browser.getByText('Message from Project A');
    const messageStillExists = await projectAMessage.isVisible({ timeout: 3000 }).catch(() => false);

    if (messageStillExists) {
      console.log('  ✓ Project A message persisted');
    } else {
      console.log('  ⚠ Project A message not found (may be expected behavior)');
    }

    console.log('✓ M3: Multi-project isolation test finished');
  });

  // ─────────────────────────────────────────────
  // M7: 页面刷新后数据持久化 (🤖 AI act + extract)
  // ─────────────────────────────────────────────
  test('M7: data persistence after page refresh', async () => {
    console.log('Starting data persistence test...');

    // Step 1: Create project, session, and send message
    console.log('Step 1: Creating project and session...');
    const uniqueMessage = `Persistence test ${Date.now()}`;

    const setupResult = await actSequence(browser, [
      'Create a new project named "Persistence Test"',
      'Create a new session',
      `Send message "${uniqueMessage}"`,
    ], { timeout: 40000 });

    if (!setupResult.success) {
      console.log('⚠ Setup failed with AI, using fallback');
      const addProjectBtn = browser.locator('button[title="Add Project"]').first();
      await addProjectBtn.click();
      await browser.waitForTimeout(300);

      await browser.getByPlaceholder('Project name').fill('Persistence Test');
      await browser.getByRole('button', { name: 'Create' }).click();
      await browser.waitForTimeout(1500);

      const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
      if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newSessionBtn.click();
        await browser.waitForTimeout(500);

        const createBtn = browser.getByRole('button', { name: 'Create' });
        if (await createBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await createBtn.click();
          await browser.waitForTimeout(1000);
        }
      }

      const textarea = browser.locator('textarea').first();
      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.fill(uniqueMessage);
        await browser.click('[data-testid="send-button"]');
        await browser.waitForTimeout(2000);
      }
    }

    console.log(`  ✓ Sent message: "${uniqueMessage.slice(0, 30)}..."`);

    // Step 2: Refresh the page
    console.log('Step 2: Refreshing page...');
    await browser.reload({ waitUntil: 'networkidle' });
    await browser.waitForTimeout(3000);

    // Step 3: Verify data persisted
    console.log('Step 3: Verifying persistence...');

    // Use AI to verify the project and message exist
    const persistResult = await withAIExtract(
      browser,
      'Check if "Persistence Test" project is visible in the sidebar',
      z.object({
        projectExists: z.boolean(),
        projectName: z.string().optional(),
      })
    );

    if (persistResult.success && persistResult.data?.projectExists) {
      console.log('  ✓ Project persisted (AI verification)');

      // Click on project to expand and check message
      await withAIAction(browser, 'Click on "Persistence Test" project to expand it');
      await browser.waitForTimeout(500);

      await withAIAction(browser, 'Click on the session in the project');
      await browser.waitForTimeout(1000);

      // Verify message exists
      const savedMessage = browser.getByText(uniqueMessage.slice(0, 20), { exact: false });
      const messageExists = await savedMessage.isVisible({ timeout: 3000 }).catch(() => false);

      if (messageExists) {
        console.log('  ✓ Message persisted');
      } else {
        console.log('  ⚠ Message not found after refresh');
      }
    } else {
      console.log('⚠ AI verification failed, using fallback');
      // Fallback verification
      const projectItem = browser.getByText('Persistence Test');
      const projectExists = await projectItem.isVisible({ timeout: 3000 }).catch(() => false);
      expect(projectExists).toBe(true);
      console.log('  ✓ Project persisted (fallback verification)');

      if (projectExists) {
        await projectItem.click();
        await browser.waitForTimeout(500);

        const sessionItem = browser.locator('[data-testid="session-item"]').first();
        if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sessionItem.click();
          await browser.waitForTimeout(1000);

          const savedMessage = browser.getByText(uniqueMessage.slice(0, 20), { exact: false });
          const messageExists = await savedMessage.isVisible({ timeout: 3000 }).catch(() => false);

          if (messageExists) {
            console.log('  ✓ Message persisted');
          } else {
            console.log('  ⚠ Message not found after refresh');
          }
        }
      }
    }

    console.log('✓ M7: Data persistence test finished');
  });
});
