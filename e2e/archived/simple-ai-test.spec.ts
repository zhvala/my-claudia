import { test, expect, beforeAll, afterAll } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';

let browser: BrowserAdapter;

beforeAll(async () => {
  console.log('=== Starting simple AI test ===');
  browser = await createBrowser({ headless: true });
  await browser.goto('/');
  await browser.waitForLoadState('networkidle');
  console.log('=== Browser ready ===');
}, 30000);

afterAll(async () => {
  await browser?.close();
});

test('Simple AI test - direct act call', async () => {
  console.log('=== Calling browser.act() ===');

  try {
    await browser.act('Click on the message input textarea');
    console.log('✅ AI act succeeded');
  } catch (error: any) {
    console.error('❌ AI act failed:', error.message);
    throw error;
  }
}, 60000);
