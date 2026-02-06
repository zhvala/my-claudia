import { test, expect, beforeAll, afterAll } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';

let browser: BrowserAdapter;

beforeAll(async () => {
  console.log('=== AI Success Test ===');
  browser = await createBrowser({ headless: true });
  await browser.goto('/');
  await browser.waitForLoadState('networkidle');

  // 准备页面状态
  const addProjectBtn = browser.locator('button[title="Add Project"]').first();
  await addProjectBtn.click();
  await browser.waitForTimeout(500);

  const projectNameInput = browser.locator('input[placeholder*="Project name"]');
  await projectNameInput.fill('AI Test');

  const createBtn = browser.locator('button:has-text("Create")').first();
  await createBtn.click();
  await browser.waitForTimeout(1000);

  const addSessionBtn = browser.locator('button[title*="New Session"]').first();
  await addSessionBtn.click();
  await browser.waitForTimeout(500);

  const createSessionBtn = browser.locator('button:has-text("Create")').last();
  await createSessionBtn.click();
  await browser.waitForTimeout(1500);

  console.log('=== Page ready ===');
}, 30000);

afterAll(async () => {
  await browser?.close();
});

test('AI can find and interact with message input', async () => {
  console.log('=== Starting AI test ===');

  try {
    // 使用 AI 查找并点击 message input
    await browser.act('Click on the message input textarea');
    console.log('✅ AI act completed successfully');

    // 验证：使用传统方法检查 input 是否获得焦点
    const textarea = browser.locator('textarea[placeholder*="Type a message"]');
    const isFocused = await textarea.evaluate((el) => el === document.activeElement);

    console.log('Textarea focused:', isFocused);
    expect(isFocused).toBe(true);
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}, 60000);
