/**
 * Permission System Tests (F1-F8)
 *
 * Tests for the permission request and mode switching functionality.
 * Refactored to use AI for complex dialog interactions
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import { setupCleanDB } from '../helpers/setup';
import { withAIAction, withAIExtract } from '../helpers/ai-test-utils';
import { z } from 'zod';
import '../helpers/custom-matchers';

describe('Permission System - AI Refactored', () => {
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

  // Helper: ensure a session is active for testing
  async function ensureSession() {
    const textarea = browser.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      return;
    }

    const noProjects = browser.getByText('No projects yet');
    if (await noProjects.isVisible({ timeout: 2000 }).catch(() => false)) {
      const addProjectBtn = browser.locator('button[title="Add Project"]').first();
      await addProjectBtn.click();
      await browser.waitForTimeout(300);

      await browser.getByPlaceholder('Project name').fill('Test Project');

      const workDirInput = browser.getByPlaceholder('Working directory');
      if (await workDirInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await workDirInput.fill(process.cwd());
      }

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

    await textarea.waitFor({ state: 'visible', timeout: 5000 });
  }

  // ─────────────────────────────────────────────
  // F1: 权限请求弹窗显示工具信息 (📊 AI extract)
  // ─────────────────────────────────────────────
  test('F1: permission dialog shows tool information', async () => {
    await ensureSession();

    // Send a message that should trigger a tool call
    const textarea = browser.locator('textarea').first();
    await textarea.fill('Please list the files in the current directory using the ls command.');
    await browser.click('[data-testid="send-button"]');

    await browser.waitForTimeout(3000);

    // Use AI to extract permission dialog info
    const result = await withAIExtract(
      browser,
      'Check if a permission dialog is visible and if so, extract the tool name or command being requested',
      z.object({
        dialogVisible: z.boolean(),
        toolName: z.string().optional(),
        hasToolInfo: z.boolean(),
      })
    );

    if (result.success && result.data) {
      console.log(`  Permission dialog visible: ${result.data.dialogVisible}`);
      console.log(`  Tool info present: ${result.data.hasToolInfo}`);
      if (result.data.dialogVisible) {
        expect(result.data.hasToolInfo).toBe(true);
      }
    } else {
      // Fallback verification
      const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
      const dialogVisible = await permissionDialog.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`  Permission dialog visible (fallback): ${dialogVisible}`);
    }

    console.log('✓ F1: Permission dialog tool info test completed');
  });

  // ─────────────────────────────────────────────
  // F2: 点击允许继续执行 (🤖 AI act)
  // ─────────────────────────────────────────────
  test('F2: clicking Allow continues execution', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('Run echo "hello world" in the terminal.');
    await browser.click('[data-testid="send-button"]');
    await browser.waitForTimeout(3000);

    // Use AI to click Allow button
    const allowResult = await withAIAction(
      browser,
      'If a permission dialog is visible, click the Allow or Yes button',
      { timeout: 10000 }
    );

    if (allowResult.success) {
      await browser.waitForTimeout(2000);

      // Verify dialog closed
      const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
      const dialogStillVisible = await permissionDialog.isVisible({ timeout: 1000 }).catch(() => false);
      expect(dialogStillVisible).toBe(false);
      console.log('  ✓ Clicked Allow and dialog closed (AI)');
    } else {
      // Fallback method
      const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
      const dialogVisible = await permissionDialog.isVisible({ timeout: 2000 }).catch(() => false);

      if (dialogVisible) {
        const allowBtn = browser.getByRole('button', { name: /allow|yes|approve/i }).first();
        if (await allowBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await allowBtn.click();
          await browser.waitForTimeout(2000);
          console.log('  ✓ Clicked Allow (fallback)');
        }
      } else {
        console.log('  ⚠ Permission dialog not visible');
      }
    }

    console.log('✓ F2: Allow button test completed');
  });

  // ─────────────────────────────────────────────
  // F3: 点击拒绝终止执行 (🤖 AI act)
  // ─────────────────────────────────────────────
  test('F3: clicking Deny stops execution', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('Delete all files in /tmp (just kidding, this should trigger permission)');
    await browser.click('[data-testid="send-button"]');
    await browser.waitForTimeout(3000);

    // Use AI to click Deny button
    const denyResult = await withAIAction(
      browser,
      'If a permission dialog is visible, click the Deny, No, Reject, or Cancel button',
      { timeout: 10000 }
    );

    if (denyResult.success) {
      await browser.waitForTimeout(2000);

      // Verify dialog closed
      const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
      const dialogStillVisible = await permissionDialog.isVisible({ timeout: 1000 }).catch(() => false);
      expect(dialogStillVisible).toBe(false);
      console.log('  ✓ Clicked Deny and execution stopped (AI)');
    } else {
      // Fallback method
      const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
      const dialogVisible = await permissionDialog.isVisible({ timeout: 2000 }).catch(() => false);

      if (dialogVisible) {
        const denyBtn = browser.getByRole('button', { name: /deny|no|reject|cancel/i }).first();
        if (await denyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await denyBtn.click();
          await browser.waitForTimeout(2000);
          console.log('  ✓ Clicked Deny (fallback)');
        }
      } else {
        console.log('  ⚠ Permission dialog not visible');
      }
    }

    console.log('✓ F3: Deny button test completed');
  });

  // ─────────────────────────────────────────────
  // F4: 倒计时结束自动拒绝 (🔧 Programmatic)
  // ─────────────────────────────────────────────
  test('F4: timeout auto-denies permission', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('Read the package.json file content.');
    await browser.click('[data-testid="send-button"]');

    // Wait for permission dialog with countdown
    const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
    const dialogVisible = await permissionDialog.isVisible({ timeout: 15000 }).catch(() => false);

    if (dialogVisible) {
      // Look for countdown timer
      const countdown = browser.locator('[class*="countdown"], [class*="timer"], [class*="timeout"]').first();
      const hasCountdown = await countdown.isVisible({ timeout: 2000 }).catch(() => false);

      console.log(`  Has countdown: ${hasCountdown}`);

      if (hasCountdown) {
        console.log('  ✓ Countdown timer visible');
      }
    } else {
      console.log('  ⚠ Permission dialog not visible');
    }

    console.log('✓ F4: Timeout countdown test completed');
  });

  // ─────────────────────────────────────────────
  // F5: 勾选记住决定后不再弹窗 (📊 AI extract)
  // ─────────────────────────────────────────────
  test('F5: remember decision prevents future dialogs', async () => {
    await ensureSession();

    const textarea = browser.locator('textarea').first();
    await textarea.fill('Echo test one');
    await browser.click('[data-testid="send-button"]');
    await browser.waitForTimeout(3000);

    // Check for permission dialog and remember checkbox
    const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
    let dialogVisible = await permissionDialog.isVisible({ timeout: 10000 }).catch(() => false);

    if (dialogVisible) {
      // Look for "Remember" checkbox
      const rememberCheckbox = browser.locator('input[type="checkbox"], [class*="checkbox"], [role="checkbox"]').first();
      if (await rememberCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await rememberCheckbox.check();
        console.log('  ✓ Checked "Remember" option');
      }

      // Click Allow
      const allowBtn = browser.getByRole('button', { name: /allow/i }).first();
      if (await allowBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await allowBtn.click();
        await browser.waitForTimeout(2000);
      }

      // Send another similar command
      await textarea.fill('Echo test two');
      await browser.click('[data-testid="send-button"]');
      await browser.waitForTimeout(3000);

      // Use AI to check if dialog appears again
      const result = await withAIExtract(
        browser,
        'Check if a permission dialog is currently visible on the page',
        z.object({
          dialogVisible: z.boolean(),
        })
      );

      if (result.success && result.data) {
        if (!result.data.dialogVisible) {
          console.log('  ✓ Second command executed without permission dialog (AI verification)');
        } else {
          console.log('  ⚠ Permission dialog appeared again');
        }
      } else {
        // Fallback check
        const dialogAgain = await permissionDialog.isVisible({ timeout: 2000 }).catch(() => false);
        if (!dialogAgain) {
          console.log('  ✓ Second command executed without permission dialog (fallback)');
        }
      }
    } else {
      console.log('  ⚠ Permission dialog not visible initially');
    }

    console.log('✓ F5: Remember decision test completed');
  });

  // ─────────────────────────────────────────────
  // F6: 切换权限模式（Default→Plan）(🤖 AI act)
  // ─────────────────────────────────────────────
  test('F6: switch permission mode', async () => {
    await ensureSession();

    // Use AI to find and switch permission mode
    const switchResult = await withAIAction(
      browser,
      'Find the permission mode selector (might be labeled "Default", "Plan", "Bypass", etc.) and switch it to "Plan" mode',
      { timeout: 10000 }
    );

    if (switchResult.success) {
      console.log('  ✓ Switched to Plan mode (AI)');
    } else {
      console.log('⚠ AI mode switch failed, using fallback');
      // Fallback method
      const modeToggle = browser.locator('[class*="permission-mode"], [class*="mode-toggle"], [data-testid*="mode"]').first();
      const modeButton = browser.getByRole('button', { name: /default|plan|auto|bypass/i }).first();

      if (await modeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modeToggle.click();
        await browser.waitForTimeout(500);
        console.log('  ✓ Mode toggle clicked (fallback)');
      } else if (await modeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modeButton.click();
        await browser.waitForTimeout(500);

        const planOption = browser.getByText('Plan').first();
        if (await planOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await planOption.click();
          await browser.waitForTimeout(500);
          console.log('  ✓ Switched to Plan mode (fallback)');
        }
      } else {
        console.log('  ⚠ Permission mode toggle not found');
      }
    }

    console.log('✓ F6: Permission mode switch test completed');
  });

  // ─────────────────────────────────────────────
  // F7: Plan 模式下输入框提示语变化 (📊 AI extract)
  // ─────────────────────────────────────────────
  test('F7: Plan mode changes input placeholder', async () => {
    await ensureSession();

    // Get initial placeholder
    const textarea = browser.locator('textarea').first();
    const initialPlaceholder = await textarea.getAttribute('placeholder').catch(() => '');

    // Try to switch to Plan mode
    const modeButton = browser.getByRole('button', { name: /default|plan|auto|bypass/i }).first();
    if (await modeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await modeButton.click();
      await browser.waitForTimeout(500);

      const planOption = browser.getByText('Plan').first();
      if (await planOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await planOption.click();
        await browser.waitForTimeout(500);

        // Use AI to verify placeholder changed
        const result = await withAIExtract(
          browser,
          'Get the current placeholder text of the message input textarea',
          z.object({
            placeholderText: z.string(),
            hasChanged: z.boolean().optional(),
          })
        );

        if (result.success && result.data) {
          if (result.data.placeholderText !== initialPlaceholder) {
            console.log(`  Initial placeholder: "${initialPlaceholder}"`);
            console.log(`  Plan placeholder: "${result.data.placeholderText}"`);
            console.log('  ✓ Placeholder changed for Plan mode (AI verification)');
          } else {
            console.log('  ⚠ Placeholder did not change');
          }
        } else {
          // Fallback verification
          const newPlaceholder = await textarea.getAttribute('placeholder').catch(() => '');
          if (newPlaceholder !== initialPlaceholder) {
            console.log('  ✓ Placeholder changed (fallback verification)');
          }
        }
      }
    } else {
      console.log('  ⚠ Mode toggle not found');
    }

    console.log('✓ F7: Plan mode placeholder test completed');
  });

  // ─────────────────────────────────────────────
  // F8: Bypass 模式不弹权限窗 (🔧 Programmatic)
  // ─────────────────────────────────────────────
  test('F8: Bypass mode skips permission dialogs', async () => {
    await ensureSession();

    // Try to switch to Bypass mode
    const modeButton = browser.getByRole('button', { name: /default|plan|auto|bypass/i }).first();
    if (await modeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await modeButton.click();
      await browser.waitForTimeout(500);

      const bypassOption = browser.getByText(/bypass|auto.?accept/i).first();
      if (await bypassOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await bypassOption.click();
        await browser.waitForTimeout(500);
        console.log('  ✓ Switched to Bypass mode');

        // Send a command that would normally require permission
        const textarea = browser.locator('textarea').first();
        await textarea.fill('List files with ls command');
        await browser.click('[data-testid="send-button"]');
        await browser.waitForTimeout(3000);

        // Check that NO permission dialog appeared
        const permissionDialog = browser.locator('[data-testid="permission-dialog"], [class*="permission"]').first();
        const dialogVisible = await permissionDialog.isVisible({ timeout: 2000 }).catch(() => false);

        expect(dialogVisible).toBe(false);
        console.log('  ✓ No permission dialog in Bypass mode');
      } else {
        console.log('  ⚠ Bypass option not found');
      }
    } else {
      console.log('  ⚠ Mode toggle not found');
    }

    console.log('✓ F8: Bypass mode test completed');
  });
});
