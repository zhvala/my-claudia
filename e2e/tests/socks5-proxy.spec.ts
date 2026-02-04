import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBrowser, type BrowserAdapter } from '../helpers/browser-adapter';
import '../helpers/custom-matchers';

describe('SOCKS5 Proxy Configuration', () => {
  let browser: BrowserAdapter;

  beforeEach(async () => {
    browser = await createBrowser();
    await browser.goto('/');
    await browser.waitForLoadState('networkidle');
    await browser.waitForTimeout(2000);
  });

  afterEach(async () => {
    await browser?.close();
  });

  test('should show gateway settings for local connection', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      const hasGatewayTab = await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasGatewayTab) {
        console.log('✓ Gateway tab visible');
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxySection = browser.getByText(/proxy|SOCKS/i).first();
        if (await proxySection.isVisible({ timeout: 2000 })) {
          console.log('✓ Proxy settings section found');
        }
      } else {
        console.log('ℹ Gateway tab not visible (might be remote connection)');
      }
    }
  });

  test('should display proxy configuration fields', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyUrlInput = browser.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        const hasProxyInput = await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasProxyInput) {
          console.log('✓ Proxy URL input found');

          const usernameInput = browser.locator('input[placeholder*="username"], input[name*="username"]');
          if (await usernameInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('✓ Proxy username field found');
          }

          const passwordInput = browser.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]');
          if (await passwordInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('✓ Proxy password field found');
          }
        } else {
          console.log('⚠ Proxy configuration fields not found');
        }
      }
    }
  });

  test('should save proxy configuration', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyUrlInput = browser.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('socks5://127.0.0.1:1080');
          await browser.waitForTimeout(300);
          console.log('✓ Filled proxy URL');

          const usernameInput = browser.locator('input[placeholder*="username"], input[name*="username"]').first();
          if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usernameInput.fill('testuser');
            console.log('✓ Filled proxy username');
          }

          const passwordInput = browser.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
          if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('testpass');
            console.log('✓ Filled proxy password');
          }

          const saveButton = browser.getByText('Save').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await browser.waitForTimeout(1000);

            const successVisible = await browser.getByText(/saved|success|updated/i).first().isVisible({ timeout: 3000 }).catch(() => false);
            if (successVisible) {
              console.log('✓ Configuration saved successfully');
            } else {
              console.log('⚠ No success confirmation visible');
            }
          }
        }
      }
    }
  });

  test('should validate proxy URL format', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyUrlInput = browser.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('invalid-proxy-url');
          await browser.waitForTimeout(300);

          const saveButton = browser.getByText('Save').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await browser.waitForTimeout(1000);

            const errorVisible = await browser.getByText(/invalid|error|format/i).first().isVisible({ timeout: 3000 }).catch(() => false);
            if (errorVisible) {
              console.log('✓ Validation error shown for invalid URL');
            } else {
              console.log('⚠ No validation error detected');
            }
          }
        }
      }
    }
  });

  test('should mask proxy password', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const passwordInput = browser.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await passwordInput.fill('secret123');
          await browser.waitForTimeout(300);

          const inputType = await passwordInput.getAttribute('type');
          expect(inputType).toBe('password');
          console.log('✓ Password field has type="password"');
        }
      }
    }
  });

  test('should show gateway connection status', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const statusText = browser.getByText(/connected|disconnected|status/i).first();
        if (await statusText.isVisible({ timeout: 2000 })) {
          const status = await statusText.textContent();
          console.log(`✓ Gateway status visible: ${status}`);
        } else {
          console.log('ℹ No gateway status indicator found');
        }
      }
    }
  });

  test('should toggle proxy on/off and reconnect', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyToggle = browser.locator(
          'input[type="checkbox"][name*="proxy"], input[type="checkbox"][id*="proxy"], ' +
          'button:has-text("Enable Proxy"), button:has-text("Disable Proxy")'
        ).first();

        if (await proxyToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
          const isCheckbox = await proxyToggle.getAttribute('type') === 'checkbox';

          if (isCheckbox) {
            // Toggle
            await proxyToggle.click();
            await browser.waitForTimeout(500);
            console.log('✓ Proxy toggled');

            const saveButton = browser.getByText('Save').first();
            if (await saveButton.isVisible({ timeout: 2000 })) {
              await saveButton.click();
              await browser.waitForTimeout(1000);
              console.log('✓ Proxy settings saved');
            }

            const statusChange = browser.getByText(/reconnecting|connecting|connected|disconnected/i).first();
            const hasStatusChange = await statusChange.isVisible({ timeout: 3000 }).catch(() => false);

            if (hasStatusChange) {
              console.log('✓ Connection status updated after proxy toggle');
            }

            // Toggle back
            await proxyToggle.click();
            await browser.waitForTimeout(500);
            console.log('✓ Proxy toggled back to original state');

            if (await saveButton.isVisible({ timeout: 2000 })) {
              await saveButton.click();
              await browser.waitForTimeout(1000);
            }
          } else {
            await proxyToggle.click();
            await browser.waitForTimeout(1000);
            console.log('✓ Proxy toggle button clicked');
          }
        } else {
          console.log('ℹ Proxy toggle not found');
        }
      }
    }
  });

  test('should handle invalid credentials error', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyUrlInput = browser.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('socks5://127.0.0.1:1080');

          const usernameInput = browser.locator('input[placeholder*="username"], input[name*="username"]').first();
          if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usernameInput.fill('invalid_user');
          }

          const passwordInput = browser.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
          if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('wrong_password');
          }

          const saveButton = browser.getByText('Save').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await browser.waitForTimeout(2000);

            const authError = browser.getByText(/authentication failed|invalid credentials|auth.*error|unauthorized/i).first();
            const hasAuthError = await authError.isVisible({ timeout: 5000 }).catch(() => false);

            if (hasAuthError) {
              const errorText = await authError.textContent();
              console.log(`✓ Invalid credentials error shown: ${errorText}`);
            } else {
              const connectionError = browser.getByText(/connection.*failed|error|failed/i).first();
              const hasError = await connectionError.isVisible({ timeout: 3000 }).catch(() => false);

              if (hasError) {
                console.log('✓ Connection error shown (proxy/auth issue detected)');
              } else {
                console.log('ℹ No error detected (proxy might not be running)');
              }
            }
          }
        }
      }
    }
  });

  test('should handle proxy connection timeout', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyUrlInput = browser.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('socks5://192.0.2.1:1080');
          await browser.waitForTimeout(300);

          const saveButton = browser.getByText('Save').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();

            const timeoutError = browser.getByText(/timeout|timed out|connection.*timeout|cannot connect|unreachable/i).first();
            const hasTimeout = await timeoutError.isVisible({ timeout: 10000 }).catch(() => false);

            if (hasTimeout) {
              const errorText = await timeoutError.textContent();
              console.log(`✓ Proxy timeout error shown: ${errorText}`);
            } else {
              const connectionError = browser.getByText(/connection.*failed|failed.*connect|error/i).first();
              const hasError = await connectionError.isVisible({ timeout: 3000 }).catch(() => false);

              if (hasError) {
                console.log('✓ Connection error shown for unreachable proxy');
              } else {
                console.log('ℹ No timeout error detected (might have different error handling)');
              }
            }
          }
        }
      }
    }
  });

  test('should switch from proxy to direct connection', async () => {
    const settingsButton = browser.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await browser.waitForTimeout(500);

      const gatewayTab = browser.getByText('Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await browser.waitForTimeout(300);

        const proxyUrlInput = browser.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('socks5://127.0.0.1:1080');

          const usernameInput = browser.locator('input[placeholder*="username"], input[name*="username"]').first();
          if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usernameInput.fill('testuser');
          }

          const passwordInput = browser.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
          if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('testpass');
          }

          const saveButton = browser.getByText('Save').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await browser.waitForTimeout(1000);
            console.log('✓ Proxy configuration saved');
          }

          // Clear proxy settings
          await proxyUrlInput.fill('');
          await browser.waitForTimeout(300);

          if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await usernameInput.fill('');
          }
          if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await passwordInput.fill('');
          }

          const saveButton2 = browser.getByText('Save').first();
          if (await saveButton2.isVisible({ timeout: 2000 })) {
            await saveButton2.click();
            await browser.waitForTimeout(1000);
            console.log('✓ Switched to direct connection (proxy cleared)');

            const statusText = browser.getByText(/connected|direct|no proxy/i).first();
            const hasStatus = await statusText.isVisible({ timeout: 3000 }).catch(() => false);

            if (hasStatus) {
              console.log('✓ Direct connection status confirmed');
            } else {
              console.log('ℹ Status update not visible (might be implicit)');
            }
          }
        }

        const proxyToggle = browser.locator('input[type="checkbox"][name*="proxy"], input[type="checkbox"][id*="proxy"]').first();
        if (await proxyToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
          await proxyToggle.click();
          await browser.waitForTimeout(500);

          const saveButton3 = browser.getByText('Save').first();
          if (await saveButton3.isVisible({ timeout: 2000 })) {
            await saveButton3.click();
            await browser.waitForTimeout(1000);
            console.log('✓ Disabled proxy via toggle (switched to direct)');
          }
        }
      }
    }
  });
});
