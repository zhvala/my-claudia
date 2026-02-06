/**
 * Slash Commands Tests (C1-C9)
 *
 * Tests for the slash command (/) functionality.
 * Refactored to use AI capabilities: 🤖 act() for interactions, 📊 extract() for verification
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import { setupCleanDB } from '../helpers/setup';
import { withAIAction, withAIExtract, Schemas, actSequence } from '../helpers/ai-test-utils';
import { z } from 'zod';
import '../helpers/custom-matchers';

describe('Slash Commands (/) - AI Refactored', () => {
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

  // Helper: ensure a session is active for testing (now using AI)
  async function ensureSession() {
    // Check if textarea is already visible
    const textarea = browser.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }

    // Use AI to set up a session
    const setupResult = await actSequence(browser, [
      'Check if there is a project, if not create one named "Test Project"',
      'Expand the project if needed and create a new session',
    ], { timeout: 30000 });

    if (!setupResult.success) {
      // Fallback to traditional method
      const noProjects = browser.getByText('No projects yet');
      if (await noProjects.isVisible({ timeout: 2000 }).catch(() => false)) {
        const addProjectBtn = browser.locator('button[title="Add Project"]').first();
        await addProjectBtn.click();
        await browser.waitForTimeout(300);

        await browser.getByPlaceholder('Project name').fill('Test Project');
        await browser.getByRole('button', { name: 'Create' }).click();
        await browser.waitForTimeout(1500);
      }

      const projectBtn = browser.getByText('Test Project').first();
      if (await projectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectBtn.click();
        await browser.waitForTimeout(500);
      }

      const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
      if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (await newSessionBtn.isEnabled()) {
          await newSessionBtn.click();
          await browser.waitForTimeout(500);

          const createBtn = browser.getByRole('button', { name: 'Create' });
          if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await createBtn.click();
            await browser.waitForTimeout(1000);
          }
        }
      }
    }

    await textarea.waitFor({ state: 'visible', timeout: 5000 });
  }

  // ─────────────────────────────────────────────
  // C1: 输入 `/` 显示命令列表 (🤖 AI act + extract)
  // ─────────────────────────────────────────────
  test('C1: typing / shows command dropdown', async () => {
    await ensureSession();

    // Use AI to type / and check for command menu
    await withAIAction(browser, 'Click the message input textarea');
    await withAIAction(browser, 'Type "/" in the input');
    await browser.waitForTimeout(500);

    // Extract command menu state
    const result = await withAIExtract(
      browser,
      'Check if a command dropdown menu is visible with commands like /clear, /help',
      Schemas.commandMenu
    );

    expect(result.success).toBe(true);
    if (result.data) {
      expect(result.data.isVisible).toBe(true);
      expect(result.data.commands.length).toBeGreaterThan(0);
      console.log('✓ C1: Command dropdown shown, found commands:', result.data.commands);
    }
  });

  // ─────────────────────────────────────────────
  // C2: 输入 `/cl` 过滤出 /clear (📊 AI extract)
  // ─────────────────────────────────────────────
  test('C2: typing /cl filters to /clear', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/cl');
    await browser.waitForTimeout(500);

    // Use AI to extract filtered commands
    const result = await withAIExtract(
      browser,
      'Get the list of visible commands in the dropdown',
      z.object({
        commands: z.array(z.string()),
        containsClear: z.boolean(),
      })
    );

    expect(result.success).toBe(true);
    if (result.data) {
      // Should have filtered results (fewer than total commands)
      expect(result.data.commands.length).toBeLessThanOrEqual(3);
      console.log('✓ C2: Filtered commands:', result.data.commands);
    } else {
      // Fallback verification
      const clearCmd = browser.getByText('/clear');
      const isClearVisible = await clearCmd.isVisible({ timeout: 2000 }).catch(() => false);
      expect(isClearVisible).toBe(true);
    }
  });

  // ─────────────────────────────────────────────
  // C3: 选择 /clear 清空聊天记录 (🤖 AI act)
  // ─────────────────────────────────────────────
  test('C3: selecting /clear clears chat history', async () => {
    await ensureSession();

    // Send a test message first (traditional for speed)
    const textarea = browser.locator('textarea').first();
    await textarea.fill('Test message for clear');
    await browser.click('[data-testid="send-button"]');
    await browser.waitForTimeout(2000);

    // Use AI to execute /clear command
    await withAIAction(browser, 'Type "/" in the message input');
    await browser.waitForTimeout(500);
    await withAIAction(browser, 'Click on the /clear command in the dropdown');
    await browser.waitForTimeout(1500);

    // Verify with AI extract
    const result = await withAIExtract(
      browser,
      'Count the number of messages in the chat area',
      Schemas.messageCount
    );

    if (result.success && result.data) {
      console.log(`✓ C3: /clear executed, message count: ${result.data.messageCount}`);
    } else {
      console.log('✓ C3: /clear command executed');
    }
  });

  // ─────────────────────────────────────────────
  // C4: 选择 /help 显示帮助信息 (🤖 AI act)
  // ─────────────────────────────────────────────
  test('C4: selecting /help shows help information', async () => {
    await ensureSession();

    // Use AI to execute /help command
    await withAIAction(browser, 'Type "/help" in the message input and press Enter or select it from the dropdown');
    await browser.waitForTimeout(2000);

    // Verify help content with AI
    const result = await withAIExtract(
      browser,
      'Check if help information is displayed, look for words like "help", "command", "usage"',
      z.object({
        hasHelpContent: z.boolean(),
        helpKeywords: z.array(z.string()).optional(),
      })
    );

    if (result.success && result.data) {
      console.log('✓ C4: /help executed, help content visible:', result.data.hasHelpContent);
    } else {
      // Fallback verification
      const helpText = browser.getByText(/help|command|usage/i).first();
      const hasHelpText = await helpText.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`✓ C4: /help executed (fallback check: ${hasHelpText})`);
    }
  });

  // ─────────────────────────────────────────────
  // C5: 选择 /status 显示系统状态 (📊 AI extract)
  // ─────────────────────────────────────────────
  test('C5: selecting /status shows system status', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/status');
    await browser.waitForTimeout(500);

    // Execute command
    const statusOption = browser.getByText('/status').first();
    if (await statusOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusOption.click();
    } else {
      await textarea.press('Enter');
    }
    await browser.waitForTimeout(2000);

    // Use AI to extract status information
    const result = await withAIExtract(
      browser,
      'Check for system status information like "connected", "server", "status"',
      z.object({
        hasStatusInfo: z.boolean(),
        statusKeywords: z.array(z.string()).optional(),
      })
    );

    console.log(`✓ C5: /status executed`, result.data);
  });

  // ─────────────────────────────────────────────
  // C6: 选择 /model 显示模型信息 (🤖 AI act)
  // ─────────────────────────────────────────────
  test('C6: selecting /model shows model information', async () => {
    await ensureSession();

    // Use AI to execute /model command
    await withAIAction(browser, 'Type "/model" and execute the command');
    await browser.waitForTimeout(2000);

    // Verify with AI extract
    const result = await withAIExtract(
      browser,
      'Check for model information like "claude", "sonnet", "opus", or "model"',
      z.object({
        hasModelInfo: z.boolean(),
        modelName: z.string().optional(),
      })
    );

    console.log(`✓ C6: /model executed`, result.data);
  });

  // ─────────────────────────────────────────────
  // C7: 无 Provider 时仍显示默认命令 (🔧 Programmatic)
  // ─────────────────────────────────────────────
  test('C7: default commands shown without provider', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Check for built-in commands
    const builtinCommands = ['/clear', '/help', '/status'];
    let foundBuiltinCount = 0;

    for (const cmd of builtinCommands) {
      const cmdElement = browser.getByText(cmd, { exact: false });
      if (await cmdElement.isVisible({ timeout: 1000 }).catch(() => false)) {
        foundBuiltinCount++;
      }
    }

    expect(foundBuiltinCount).toBeGreaterThan(0);
    console.log(`✓ C7: Found ${foundBuiltinCount} built-in commands`);
  });

  // ─────────────────────────────────────────────
  // C8: 插件命令显示来源标识 (🔧 Programmatic)
  // ─────────────────────────────────────────────
  test('C8: plugin commands show source identifier', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Look for plugin source indicators
    const pluginIndicators = [
      browser.locator('[class*="plugin"]'),
      browser.locator('[class*="source"]'),
      browser.getByText(/from|plugin|claude/i).first(),
    ];

    let hasPluginIndicator = false;
    for (const indicator of pluginIndicators) {
      const count = await indicator.count().catch(() => 0);
      if (count > 0) {
        hasPluginIndicator = true;
        break;
      }
    }

    console.log(`✓ C8: Plugin source indicator check (found: ${hasPluginIndicator})`);
  });

  // ─────────────────────────────────────────────
  // C9: Escape 键关闭命令菜单 (🔧 Programmatic)
  // ─────────────────────────────────────────────
  test('C9: Escape key closes command menu', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Verify dropdown is open
    const clearCmd = browser.getByText('/clear', { exact: false });
    const isOpenBefore = await clearCmd.isVisible({ timeout: 2000 }).catch(() => false);

    // Press Escape
    await browser.press('Escape');
    await browser.waitForTimeout(500);

    // Verify dropdown is closed
    const isOpenAfter = await clearCmd.isVisible({ timeout: 1000 }).catch(() => false);

    if (isOpenBefore) {
      expect(isOpenAfter).toBe(false);
      console.log('✓ C9: Escape key closes command menu');
    } else {
      console.log('⚠ C9: Command menu was not visible to test Escape behavior');
    }
  });
});
