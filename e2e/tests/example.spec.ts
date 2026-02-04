import { describe, test, expect, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';

describe('Example Test - Verify Setup', () => {
  let browser: BrowserAdapter;

  afterEach(async () => {
    await browser?.close();
  });

  test('should load the application', async () => {
    browser = await createBrowser();
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');

    const title = await browser.title();
    expect(title).toMatch(/My Claudia|Claudia/i);
  });

  test('should have a body element', async () => {
    browser = await createBrowser();
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');

    const bodyText = await browser.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('should load without many console errors', async () => {
    browser = await createBrowser();

    const errors: string[] = [];
    browser.on('console', (msg: any) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await browser.goto('/');
    await browser.waitForLoadState('networkidle');

    expect(errors.length).toBeLessThan(10);
  });
});
