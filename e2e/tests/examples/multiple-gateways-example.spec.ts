/**
 * Example: How to test with multiple Gateway backends
 *
 * This demonstrates how to register and test multiple gateway backend configurations
 * in the same test suite.
 */

import { test, expect } from '../../helpers/setup';
import { registerMode, getMode, getEnabledModes } from '../../helpers/modes';
import { gateway1Mode } from '../../fixtures/modes/gateway1.config';
import { gateway2Mode } from '../../fixtures/modes/gateway2.config';
import { switchToMode } from '../../helpers/connection';

// Register additional gateway backends
// This only needs to be done once, typically in a setup file
registerMode(gateway1Mode);
registerMode(gateway2Mode);

test.describe('Multiple Gateway Backends', () => {
  test('should list all available gateway backends', async () => {
    const allModes = getEnabledModes();

    console.log('Available modes:');
    allModes.forEach(mode => {
      console.log(`  - ${mode.id}: ${mode.name} (${mode.enabled ? 'enabled' : 'disabled'})`);
    });

    // You should see: local, gateway, gateway1 (if configured), gateway2 (if configured)
  });

  test('should connect to Gateway Backend 1 (if configured)', async ({ page }) => {
    const gateway1 = getMode('gateway1');

    if (!gateway1.enabled) {
      test.skip('Gateway1 not configured (set GATEWAY1_SECRET to enable)');
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Gateway Backend 1
    await switchToMode(page, gateway1);

    // Test basic functionality
    const textarea = page.locator('textarea').first();
    await textarea.fill('Test message on Gateway 1');

    console.log('✓ Gateway Backend 1 connection successful');
  });

  test('should connect to Gateway Backend 2 (if configured)', async ({ page }) => {
    const gateway2 = getMode('gateway2');

    if (!gateway2.enabled) {
      test.skip('Gateway2 not configured (set GATEWAY2_SECRET to enable)');
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Gateway Backend 2
    await switchToMode(page, gateway2);

    // Test basic functionality
    const textarea = page.locator('textarea').first();
    await textarea.fill('Test message on Gateway 2');

    console.log('✓ Gateway Backend 2 connection successful');
  });

  test('should switch between multiple gateways', async ({ page }) => {
    const gateway1 = getMode('gateway1');
    const gateway2 = getMode('gateway2');

    if (!gateway1.enabled || !gateway2.enabled) {
      test.skip('Both gateways must be configured for this test');
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Gateway 1
    console.log('Switching to Gateway 1...');
    await switchToMode(page, gateway1);
    await page.waitForTimeout(2000);

    // Send a message
    let textarea = page.locator('textarea').first();
    await textarea.fill('Message on Gateway 1');
    console.log('✓ Gateway 1 working');

    // Switch to Gateway 2
    console.log('Switching to Gateway 2...');
    await switchToMode(page, gateway2);
    await page.waitForTimeout(2000);

    // Send another message
    textarea = page.locator('textarea').first();
    await textarea.fill('Message on Gateway 2');
    console.log('✓ Gateway 2 working');

    // Switch back to Gateway 1
    console.log('Switching back to Gateway 1...');
    await switchToMode(page, gateway1);
    await page.waitForTimeout(2000);

    console.log('✓ Successfully switched between multiple gateways');
  });
});

/**
 * You can also use testAllModes() with multiple gateways:
 */
import { testAllModes } from '../../helpers/test-factory';

// This will automatically run on all enabled modes, including gateway1 and gateway2
testAllModes('should work on all gateways', async (page, mode) => {
  if (mode.id.startsWith('gateway')) {
    console.log(`Testing on ${mode.name} (${mode.id})`);

    // Your gateway-specific test logic here
    const textarea = page.locator('textarea').first();
    await textarea.fill(`Test on ${mode.name}`);

    console.log(`✓ ${mode.name} test passed`);
  }
});
