import { test, expect, beforeAll, afterAll } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';

let browser: BrowserAdapter;

beforeAll(async () => {
  console.log('=== Starting debug test ===');
  browser = await createBrowser({ headless: true });
  await browser.goto('/');
  await browser.waitForLoadState('networkidle');

  // 先设置好页面状态：创建项目和会话
  console.log('=== Setting up project and session ===');

  // 使用传统 Playwright API 创建项目和会话
  const addProjectBtn = browser.locator('button[title="Add Project"]').first();
  await addProjectBtn.click();
  await browser.waitForTimeout(500);

  const projectNameInput = browser.locator('input[placeholder*="Project name"]');
  await projectNameInput.fill('AI Test Project');

  const createBtn = browser.locator('button:has-text("Create")').first();
  await createBtn.click();
  await browser.waitForTimeout(1000);

  // 创建会话 - 点击 Create 按钮完成创建
  const addSessionBtn = browser.locator('button[title*="New Session"]').first();
  await addSessionBtn.click();
  await browser.waitForTimeout(500);

  // 点击 Create 按钮完成会话创建（不填名称）
  const createSessionBtn = browser.locator('button:has-text("Create")').last();
  await createSessionBtn.click();
  await browser.waitForTimeout(1500);

  console.log('=== Browser ready with active session ===');
}, 30000);

afterAll(async () => {
  await browser?.close();
});

test('Debug Schema - Check raw model response', async () => {
  console.log('=== Testing simple act operation ===');

  try {
    // 最简单的操作：点击文本输入框
    const result = await browser.act('Click on the message input textarea');
    console.log('✅ Act succeeded:', result);
    expect(result).toBeDefined();
  } catch (error: any) {
    console.error('❌ Act failed:', error.message);
    console.error('Error details:', JSON.stringify(error, null, 2));

    // 打印错误栈
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }

    // 如果有原始响应，打印它
    if (error.response) {
      console.error('Raw response:', JSON.stringify(error.response, null, 2));
    }

    throw error;
  }
}, 60000);
