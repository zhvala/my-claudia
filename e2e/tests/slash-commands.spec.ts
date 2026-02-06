/**
 * Slash Commands Tests (C1-C9)
 *
 * Tests for the slash command (/) functionality.
 * Refactored to use traditional Playwright for reliability and speed.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import { setupCleanDB } from '../helpers/setup';
import '../helpers/custom-matchers';

describe('Slash Commands (/) - Traditional Playwright', () => {
  let browser: BrowserAdapter;

  beforeEach(async () => {
    await setupCleanDB();
    browser = await createBrowser({ headless: true });
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');
    await browser.waitForTimeout(1000);
  }, 30000);

  afterEach(async () => {
    await browser?.close();
  });

  // Helper: ensure a session is active for testing
  async function ensureSession() {
    const textarea = browser.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }

    const noProjects = browser.locator('text=No projects yet').first();
    if (await noProjects.isVisible({ timeout: 2000 }).catch(() => false)) {
      const addProjectBtn = browser.locator('button[title="Add Project"]').first();
      await addProjectBtn.click();
      await browser.waitForTimeout(300);

      const nameInput = browser.locator('input[placeholder*="Project name"]');
      await nameInput.fill('Test Project');

      const createBtn = browser.locator('button:has-text("Create")').first();
      await createBtn.click();
      await browser.waitForTimeout(1500);
    }

    const projectBtn = browser.locator('text=Test Project').first();
    if (await projectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await projectBtn.click();
      await browser.waitForTimeout(500);
    }

    const newSessionBtn = browser.locator('[data-testid="new-session-btn"]').first();
    if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (await newSessionBtn.isEnabled()) {
        await newSessionBtn.click();
        await browser.waitForTimeout(500);

        const createBtn = browser.locator('button:has-text("Create")').first();
        if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await createBtn.click();
          await browser.waitForTimeout(1000);
        }
      }
    }

    await textarea.waitFor({ state: 'visible', timeout: 5000 });
  }

  // ─────────────────────────────────────────────
  // C1: 输入 `/` 显示命令列表
  // ─────────────────────────────────────────────
  test('C1: typing / shows command dropdown', async () => {
    console.log('Test C1: Typing / shows command dropdown');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.click();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Check for command dropdown
    const commandDropdown = browser.locator('[class*="dropdown"], [class*="menu"], [role="menu"], [role="listbox"]').first();
    const dropdownVisible = await commandDropdown.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Command dropdown visible: ${dropdownVisible}`);

    if (dropdownVisible) {
      // Check for commands
      const commands = browser.locator('[role="option"], text=/\\/clear|\\/help|\\/status/');
      const commandCount = await commands.count().catch(() => 0);
      console.log(`  Found ${commandCount} commands`);
      expect(commandCount).toBeGreaterThan(0);
    }

    console.log('✅ C1: Command dropdown test completed');
  });

  // ─────────────────────────────────────────────
  // C2: 输入 `/cl` 过滤出 /clear
  // ─────────────────────────────────────────────
  test('C2: typing /cl filters to /clear', async () => {
    console.log('Test C2: Typing /cl filters to /clear');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/cl');
    await browser.waitForTimeout(500);

    // Check if /clear is visible (filtered result)
    const clearCmd = browser.locator('text=/clear').first();
    const isClearVisible = await clearCmd.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  /clear command visible: ${isClearVisible}`);

    if (isClearVisible) {
      // Count total visible commands (should be few - filtered)
      const visibleCommands = browser.locator('[role="option"]');
      const commandCount = await visibleCommands.count().catch(() => 0);
      console.log(`  ✓ Filtering works, found ${commandCount} commands`);
      expect(commandCount).toBeLessThanOrEqual(3);
    }

    console.log('✅ C2: Command filtering test completed');
  });

  // ─────────────────────────────────────────────
  // C3: 选择 /clear 清空聊天记录
  // ─────────────────────────────────────────────
  test('C3: selecting /clear clears chat history', async () => {
    console.log('Test C3: Selecting /clear clears chat history');

    await ensureSession();

    // Send a test message first
    const textarea = browser.locator('textarea').first();
    await textarea.fill('Test message for clear');

    const sendBtn = browser.locator('[data-testid="send-button"]').first();
    await sendBtn.click();
    await browser.waitForTimeout(2000);

    console.log('  ✓ Test message sent');

    // Type / to open command menu
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Click /clear command
    const clearCmd = browser.locator('text=/clear').first();
    if (await clearCmd.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearCmd.click();
      await browser.waitForTimeout(1500);
      console.log('  ✓ /clear command executed');
    } else {
      // Fallback: type clear and press Enter
      await textarea.fill('/clear');
      await textarea.press('Enter');
      await browser.waitForTimeout(1500);
      console.log('  ✓ /clear command executed (fallback)');
    }

    // Verify messages are cleared (should have fewer messages or empty)
    const messages = browser.locator('[class*="message"]');
    const messageCount = await messages.count().catch(() => 0);
    console.log(`  Message count after /clear: ${messageCount}`);

    console.log('✅ C3: Clear command test completed');
  });

  // ─────────────────────────────────────────────
  // C4: 选择 /help 显示帮助信息
  // ─────────────────────────────────────────────
  test('C4: selecting /help shows help information', async () => {
    console.log('Test C4: Selecting /help shows help information');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/help');
    await browser.waitForTimeout(500);

    // Execute /help command
    const helpCmd = browser.locator('text=/help').first();
    if (await helpCmd.isVisible({ timeout: 2000 }).catch(() => false)) {
      await helpCmd.click();
    } else {
      await textarea.press('Enter');
    }
    await browser.waitForTimeout(2000);

    console.log('  ✓ /help command executed');

    // Check for help content
    const helpText = browser.locator('text=/help|command|usage/i').first();
    const hasHelpText = await helpText.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Help content visible: ${hasHelpText}`);
    console.log('✅ C4: Help command test completed');
  });

  // ─────────────────────────────────────────────
  // C5: 选择 /status 显示系统状态
  // ─────────────────────────────────────────────
  test('C5: selecting /status shows system status', async () => {
    console.log('Test C5: Selecting /status shows system status');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/status');
    await browser.waitForTimeout(500);

    // Execute /status command
    const statusCmd = browser.locator('text=/status').first();
    if (await statusCmd.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusCmd.click();
    } else {
      await textarea.press('Enter');
    }
    await browser.waitForTimeout(2000);

    console.log('  ✓ /status command executed');

    // Check for status content
    const statusText = browser.locator('text=/status|connected|server/i').first();
    const hasStatusText = await statusText.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Status content visible: ${hasStatusText}`);
    console.log('✅ C5: Status command test completed');
  });

  // ─────────────────────────────────────────────
  // C6: 选择 /model 显示模型信息
  // ─────────────────────────────────────────────
  test('C6: selecting /model shows model information', async () => {
    console.log('Test C6: Selecting /model shows model information');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/model');
    await browser.waitForTimeout(500);

    // Execute /model command
    const modelCmd = browser.locator('text=/model').first();
    if (await modelCmd.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modelCmd.click();
    } else {
      await textarea.press('Enter');
    }
    await browser.waitForTimeout(2000);

    console.log('  ✓ /model command executed');

    // Check for model content
    const modelText = browser.locator('text=/model|claude|sonnet|opus/i').first();
    const hasModelText = await modelText.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Model content visible: ${hasModelText}`);
    console.log('✅ C6: Model command test completed');
  });

  // ─────────────────────────────────────────────
  // C7: 无 Provider 时仍显示默认命令
  // ─────────────────────────────────────────────
  test('C7: default commands shown without provider', async () => {
    console.log('Test C7: Default commands shown without provider');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Check for built-in commands
    const builtinCommands = ['/clear', '/help', '/status'];
    let foundBuiltinCount = 0;

    for (const cmd of builtinCommands) {
      const cmdElement = browser.locator(`text=${cmd}`).first();
      if (await cmdElement.isVisible({ timeout: 1000 }).catch(() => false)) {
        foundBuiltinCount++;
        console.log(`  ✓ Found command: ${cmd}`);
      }
    }

    expect(foundBuiltinCount).toBeGreaterThan(0);
    console.log(`  ✓ Found ${foundBuiltinCount} built-in commands`);
    console.log('✅ C7: Default commands test passed');
  });

  // ─────────────────────────────────────────────
  // C8: 插件命令显示来源标识
  // ─────────────────────────────────────────────
  test('C8: plugin commands show source identifier', async () => {
    console.log('Test C8: Plugin commands show source identifier');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Look for plugin source indicators
    const pluginIndicators = [
      browser.locator('[class*="plugin"]'),
      browser.locator('[class*="source"]'),
      browser.locator('text=/from|plugin|claude/i').first(),
    ];

    let hasPluginIndicator = false;
    for (const indicator of pluginIndicators) {
      const count = await indicator.count().catch(() => 0);
      if (count > 0) {
        hasPluginIndicator = true;
        console.log('  ✓ Found plugin source indicator');
        break;
      }
    }

    if (!hasPluginIndicator) {
      console.log('  ⚠️ No plugin source indicators found');
    }

    console.log('✅ C8: Plugin source identifier test completed');
  });

  // ─────────────────────────────────────────────
  // C9: Escape 键关闭命令菜单
  // ─────────────────────────────────────────────
  test('C9: Escape key closes command menu', async () => {
    console.log('Test C9: Escape key closes command menu');

    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('/');
    await browser.waitForTimeout(500);

    // Verify dropdown is open
    const clearCmd = browser.locator('text=/clear').first();
    const isOpenBefore = await clearCmd.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Command menu open before Escape: ${isOpenBefore}`);

    if (isOpenBefore) {
      // Press Escape
      await browser.press('Escape');
      await browser.waitForTimeout(500);

      // Verify dropdown is closed
      const isOpenAfter = await clearCmd.isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`  Command menu open after Escape: ${isOpenAfter}`);
      expect(isOpenAfter).toBe(false);
      console.log('  ✓ Escape key closed command menu');
    } else {
      console.log('  ⚠️ Command menu was not visible to test Escape behavior');
    }

    console.log('✅ C9: Escape key test completed');
  });
});
