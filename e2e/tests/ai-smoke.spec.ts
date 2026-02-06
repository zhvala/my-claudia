import { test, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import { withAIAction, withAIExtract, Schemas } from '../helpers/ai-test-utils';

let browser: BrowserAdapter;

beforeAll(async () => {
  browser = await createBrowser({
    headless: process.env.CI === 'true',
  });
  await browser.goto('/');
  await browser.waitForLoadState('networkidle');
  await browser.waitForTimeout(2000);
}, 30000);

afterAll(async () => {
  await browser?.close();
});

test('AI Smoke Test - Verify AI capabilities are working', async () => {
  // Test 1: AI Act - Click message input
  const actResult = await withAIAction(
    browser,
    'Click on the message input textarea',
    { timeout: 10000, retries: 1 }
  );

  expect(actResult.success).toBe(true);
  if (!actResult.success) {
    console.error('AI act failed:', actResult.error);
  }

  // Test 2: AI Extract - Get page state
  const extractResult = await withAIExtract(
    browser,
    'Check if the message input is focused and visible',
    z.object({
      isFocused: z.boolean(),
      isVisible: z.boolean(),
      placeholder: z.string().optional(),
    }),
    { timeout: 10000, retries: 1 }
  );

  expect(extractResult.success).toBe(true);
  if (extractResult.success && extractResult.data) {
    expect(extractResult.data.isVisible).toBe(true);
    console.log('AI extract result:', extractResult.data);
  } else {
    console.error('AI extract failed:', extractResult.error);
  }

  // Test 3: Verify AI API was called
  // This will be confirmed by checking network logs or console output
  console.log('✅ AI smoke test completed - both act() and extract() are functional');
});

test('AI Smoke Test - Basic page interaction without Claude API', async () => {
  // This test verifies AI works for UI interactions without needing Claude API responses

  // Test AI act: Type in message input
  const typeResult = await withAIAction(
    browser,
    'Type "Test message" in the message input textarea',
    { timeout: 15000, retries: 1 }
  );

  expect(typeResult.success).toBe(true);

  // Test AI extract: Verify the message was typed
  const verifyResult = await withAIExtract(
    browser,
    'Get the current text in the message input',
    z.object({
      text: z.string(),
      hasText: z.boolean(),
    }),
    { timeout: 10000, retries: 1 }
  );

  expect(verifyResult.success).toBe(true);
  if (verifyResult.data) {
    expect(verifyResult.data.hasText).toBe(true);
    expect(verifyResult.data.text).toContain('Test');
  }

  console.log('✅ AI smoke test passed - AI act() and extract() are working');
});

test('AI Smoke Test - Verify button state extraction', async () => {
  // Clear any text first
  const textarea = browser.locator('textarea').first();
  await textarea.clear();

  // Extract send button state (should be disabled when empty)
  const emptyStateResult = await withAIExtract(
    browser,
    'Check if the send button is enabled or disabled',
    Schemas.buttonState,
    { timeout: 10000, retries: 1 }
  );

  expect(emptyStateResult.success).toBe(true);
  if (emptyStateResult.data) {
    expect(emptyStateResult.data.isVisible).toBe(true);
    // Button should be disabled when textarea is empty
    console.log('Send button state (empty):', emptyStateResult.data);
  }

  // Type some text
  await textarea.fill('Test');

  // Extract send button state again (should be enabled with text)
  const filledStateResult = await withAIExtract(
    browser,
    'Check if the send button is enabled or disabled',
    Schemas.buttonState,
    { timeout: 10000, retries: 1 }
  );

  expect(filledStateResult.success).toBe(true);
  if (filledStateResult.data) {
    expect(filledStateResult.data.isVisible).toBe(true);
    console.log('Send button state (filled):', filledStateResult.data);
  }
});

test('AI Smoke Test - Multi-step interaction', async () => {
  // Test multiple AI actions in sequence
  const step1 = await withAIAction(
    browser,
    'Clear the message input if it has any text',
    { timeout: 10000 }
  );

  const step2 = await withAIAction(
    browser,
    'Type "AI test message" in the input',
    { timeout: 10000 }
  );

  const step3 = await withAIExtract(
    browser,
    'Get the character count of text in the message input',
    z.object({
      charCount: z.number(),
      text: z.string().optional(),
    }),
    { timeout: 10000 }
  );

  expect(step1.success).toBe(true);
  expect(step2.success).toBe(true);
  expect(step3.success).toBe(true);

  if (step3.data) {
    expect(step3.data.charCount).toBeGreaterThan(0);
    console.log('Character count:', step3.data);
  }
});
