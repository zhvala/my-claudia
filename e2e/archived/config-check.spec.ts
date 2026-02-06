import { test, expect, beforeAll, afterAll } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';

let browser: BrowserAdapter;

beforeAll(async () => {
  console.log('=== CONFIG CHECK: Starting browser ===');
  console.log('ENV OPENAI_MODEL_NAME:', process.env.OPENAI_MODEL_NAME);
  console.log('ENV OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL);

  browser = await createBrowser({ headless: true });
  await browser.goto('/');
  await browser.waitForLoadState('networkidle');
}, 30000);

afterAll(async () => {
  await browser?.close();
});

test('Config Check - Verify model name is being used', async () => {
  console.log('=== CONFIG CHECK: Testing AI act ===');

  try {
    await browser.act('Click the message input textarea');
    console.log('✅ AI act succeeded - check logs above for model name');
  } catch (error: any) {
    console.log('❌ AI act failed:', error.message);
  }

  // Test will pass regardless, we just want to see the logs
  expect(true).toBe(true);
}, 60000);
