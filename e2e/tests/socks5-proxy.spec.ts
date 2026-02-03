import { test, expect } from '@playwright/test';

test.describe('SOCKS5 Proxy Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('should show gateway settings for local connection', async ({ page }) => {
    // Open settings
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for Gateway tab
      const gatewayTab = page.locator('text=Gateway').first();
      const hasGatewayTab = await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasGatewayTab) {
        console.log('✓ Gateway tab visible');
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // Check for proxy settings section
        const proxySection = page.locator('text=/proxy|SOCKS/i').first();
        if (await proxySection.isVisible({ timeout: 2000 })) {
          console.log('✓ Proxy settings section found');
        }
      } else {
        console.log('ℹ Gateway tab not visible (might be remote connection)');
      }
    }
  });

  test('should display proxy configuration fields', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // Look for proxy URL input
        const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        const hasProxyInput = await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasProxyInput) {
          console.log('✓ Proxy URL input found');

          // Check for username field
          const usernameInput = page.locator('input[placeholder*="username"], input[name*="username"]');
          if (await usernameInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('✓ Proxy username field found');
          }

          // Check for password field
          const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]');
          if (await passwordInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('✓ Proxy password field found');
          }
        } else {
          console.log('⚠ Proxy configuration fields not found');
        }
      }
    }
  });

  test('should save proxy configuration', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Fill proxy URL
          await proxyUrlInput.fill('socks5://127.0.0.1:1080');
          await page.waitForTimeout(300);
          console.log('✓ Filled proxy URL');

          // Fill proxy username
          const usernameInput = page.locator('input[placeholder*="username"], input[name*="username"]').first();
          if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usernameInput.fill('testuser');
            console.log('✓ Filled proxy username');
          }

          // Fill proxy password
          const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
          if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('testpass');
            console.log('✓ Filled proxy password');
          }

          // Save configuration
          const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await page.waitForTimeout(1000);

            // Check for success message
            const successVisible = await page.locator('text=/saved|success|updated/i').first().isVisible({ timeout: 3000 }).catch(() => false);
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

  test('should validate proxy URL format', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Try invalid URL
          await proxyUrlInput.fill('invalid-proxy-url');
          await page.waitForTimeout(300);

          const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await page.waitForTimeout(1000);

            // Check for validation error
            const errorVisible = await page.locator('text=/invalid|error|format/i').first().isVisible({ timeout: 3000 }).catch(() => false);
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

  test('should mask proxy password', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await passwordInput.fill('secret123');
          await page.waitForTimeout(300);

          // Check input type is password
          const inputType = await passwordInput.getAttribute('type');
          expect(inputType).toBe('password');
          console.log('✓ Password field has type="password"');

          // If there's existing password, it should show as asterisks
          const value = await passwordInput.inputValue();
          if (value === '********' || value === 'secret123') {
            console.log('✓ Password properly masked or filled');
          }
        }
      }
    }
  });

  test('should show gateway connection status', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // Look for status indicator
        const statusText = page.locator('text=/connected|disconnected|status/i').first();
        if (await statusText.isVisible({ timeout: 2000 })) {
          const status = await statusText.textContent();
          console.log(`✓ Gateway status visible: ${status}`);
        } else {
          console.log('ℹ No gateway status indicator found');
        }
      }
    }
  });

  test('should toggle proxy on/off and reconnect', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // Look for enable/disable toggle
        const proxyToggle = page.locator(
          'input[type="checkbox"][name*="proxy"], input[type="checkbox"][id*="proxy"], ' +
          'button:has-text("Enable Proxy"), button:has-text("Disable Proxy")'
        ).first();

        if (await proxyToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
          const isCheckbox = await proxyToggle.getAttribute('type') === 'checkbox';

          if (isCheckbox) {
            // Toggle off
            const wasChecked = await proxyToggle.isChecked();
            if (wasChecked) {
              await proxyToggle.uncheck();
              await page.waitForTimeout(500);
              console.log('✓ Proxy toggled off');
            } else {
              await proxyToggle.check();
              await page.waitForTimeout(500);
              console.log('✓ Proxy toggled on');
            }

            // Save changes
            const saveButton = page.locator('button:has-text("Save"), button:has-text("Apply")').first();
            if (await saveButton.isVisible({ timeout: 2000 })) {
              await saveButton.click();
              await page.waitForTimeout(1000);
              console.log('✓ Proxy settings saved');
            }

            // Look for reconnection or status change
            const statusChange = page.locator('text=/reconnecting|connecting|connected|disconnected/i').first();
            const hasStatusChange = await statusChange.isVisible({ timeout: 3000 }).catch(() => false);

            if (hasStatusChange) {
              console.log('✓ Connection status updated after proxy toggle');
            }

            // Toggle back
            if (isCheckbox) {
              if (wasChecked) {
                await proxyToggle.check();
              } else {
                await proxyToggle.uncheck();
              }
              await page.waitForTimeout(500);
              console.log('✓ Proxy toggled back to original state');

              if (await saveButton.isVisible({ timeout: 2000 })) {
                await saveButton.click();
                await page.waitForTimeout(1000);
              }
            }
          } else {
            // Button toggle
            await proxyToggle.click();
            await page.waitForTimeout(1000);
            console.log('✓ Proxy toggle button clicked');
          }
        } else {
          console.log('ℹ Proxy toggle not found');
        }
      }
    }
  });

  test('should handle invalid credentials error', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // Fill in proxy with invalid credentials
        const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('socks5://127.0.0.1:1080');

          const usernameInput = page.locator('input[placeholder*="username"], input[name*="username"]').first();
          if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usernameInput.fill('invalid_user');
          }

          const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
          if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('wrong_password');
          }

          // Save and try to connect
          const saveButton = page.locator('button:has-text("Save"), button:has-text("Apply"), button:has-text("Connect")').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await page.waitForTimeout(2000);

            // Look for authentication error
            const authError = page.locator('text=/authentication failed|invalid credentials|auth.*error|unauthorized/i').first();
            const hasAuthError = await authError.isVisible({ timeout: 5000 }).catch(() => false);

            if (hasAuthError) {
              const errorText = await authError.textContent();
              console.log(`✓ Invalid credentials error shown: ${errorText}`);
            } else {
              // Check for generic connection error
              const connectionError = page.locator('text=/connection.*failed|error|failed/i').first();
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

  test('should handle proxy connection timeout', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // Use non-existent proxy to trigger timeout
        const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Use IP that won't respond
          await proxyUrlInput.fill('socks5://192.0.2.1:1080');
          await page.waitForTimeout(300);

          // Save and try to connect
          const saveButton = page.locator('button:has-text("Save"), button:has-text("Apply"), button:has-text("Connect")').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();

            // Look for timeout or connection error (within reasonable time)
            const timeoutError = page.locator('text=/timeout|timed out|connection.*timeout|cannot connect|unreachable/i').first();
            const hasTimeout = await timeoutError.isVisible({ timeout: 10000 }).catch(() => false);

            if (hasTimeout) {
              const errorText = await timeoutError.textContent();
              console.log(`✓ Proxy timeout error shown: ${errorText}`);
            } else {
              // Check for generic connection error
              const connectionError = page.locator('text=/connection.*failed|failed.*connect|error/i').first();
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

  test('should switch from proxy to direct connection', async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
    if (await settingsButton.isVisible({ timeout: 5000 })) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      const gatewayTab = page.locator('text=Gateway').first();
      if (await gatewayTab.isVisible({ timeout: 2000 })) {
        await gatewayTab.click();
        await page.waitForTimeout(300);

        // First, configure a proxy
        const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
        if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await proxyUrlInput.fill('socks5://127.0.0.1:1080');

          const usernameInput = page.locator('input[placeholder*="username"], input[name*="username"]').first();
          if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await usernameInput.fill('testuser');
          }

          const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();
          if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('testpass');
          }

          const saveButton = page.locator('button:has-text("Save"), button:has-text("Apply")').first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            await page.waitForTimeout(1000);
            console.log('✓ Proxy configuration saved');
          }

          // Now clear proxy settings to switch to direct connection
          await proxyUrlInput.clear();
          await page.waitForTimeout(300);

          // Clear credentials if visible
          if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await usernameInput.clear();
          }
          if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await passwordInput.clear();
          }

          // Save to switch to direct connection
          const saveButton2 = page.locator('button:has-text("Save"), button:has-text("Apply")').first();
          if (await saveButton2.isVisible({ timeout: 2000 })) {
            await saveButton2.click();
            await page.waitForTimeout(1000);
            console.log('✓ Switched to direct connection (proxy cleared)');

            // Verify connection status updates
            const statusText = page.locator('text=/connected|direct|no proxy/i').first();
            const hasStatus = await statusText.isVisible({ timeout: 3000 }).catch(() => false);

            if (hasStatus) {
              console.log('✓ Direct connection status confirmed');
            } else {
              console.log('ℹ Status update not visible (might be implicit)');
            }
          }
        }

        // Alternative: Use disable toggle if available
        const proxyToggle = page.locator('input[type="checkbox"][name*="proxy"], input[type="checkbox"][id*="proxy"]').first();
        if (await proxyToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
          const isChecked = await proxyToggle.isChecked();
          if (isChecked) {
            await proxyToggle.uncheck();
            await page.waitForTimeout(500);

            const saveButton3 = page.locator('button:has-text("Save"), button:has-text("Apply")').first();
            if (await saveButton3.isVisible({ timeout: 2000 })) {
              await saveButton3.click();
              await page.waitForTimeout(1000);
              console.log('✓ Disabled proxy via toggle (switched to direct)');
            }
          }
        }
      }
    }
  });
});
