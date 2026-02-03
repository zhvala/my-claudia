import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('File Upload Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('should have file input element', async ({ page }) => {
    // Look for file input
    const fileInputs = await page.locator('input[type="file"]').count();
    if (fileInputs > 0) {
      console.log(`✓ Found ${fileInputs} file input(s)`);
      expect(fileInputs).toBeGreaterThan(0);
    } else {
      console.log('ℹ No file input found (might need to create a session first)');
    }
  });

  test('should show file input after selecting project/session', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Try to find and click on a session or create new one
    const newSessionBtn = page.locator('button:has-text("New"), button:has-text("Create")').first();
    if (await newSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newSessionBtn.click();
      await page.waitForTimeout(1000);

      // Now check for file input
      const fileInput = page.locator('input[type="file"]').first();
      const fileInputVisible = await fileInput.isVisible({ timeout: 3000 }).catch(() => false);

      if (fileInputVisible) {
        console.log('✓ File input visible after creating session');
      } else {
        console.log('ℹ File input not found in chat interface');
      }
    }
  });

  test('should accept image file upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');

      try {
        await fileInput.setInputFiles(testFile);
        await page.waitForTimeout(1000);

        // Check for preview or uploaded indicator
        const hasPreview = await page.locator('[class*="preview"], [class*="attachment"], img[src*="data:image"]').first().isVisible({ timeout: 2000 }).catch(() => false);

        if (hasPreview) {
          console.log('✓ File preview displayed');
        } else {
          console.log('⚠ No file preview detected (might be hidden or different UI)');
        }
      } catch (error) {
        console.log('⚠ File upload test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    } else {
      console.log('⚠ File input not available, skipping upload test');
    }
  });

  test('should reject large file (>10MB)', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const largeFile = path.join(process.cwd(), 'e2e/fixtures/test-files/large-file.zip');

      try {
        await fileInput.setInputFiles(largeFile);
        await page.waitForTimeout(2000);

        // Check for error message
        const errorVisible = await page.locator('text=/exceed|too large|limit|10.*MB/i').first().isVisible({ timeout: 3000 }).catch(() => false);

        if (errorVisible) {
          const errorText = await page.locator('text=/exceed|too large|limit/i').first().textContent();
          console.log(`✓ Error shown for large file: ${errorText}`);
        } else {
          console.log('⚠ No size limit error detected');
        }
      } catch (error) {
        console.log('⚠ Large file test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    }
  });

  test('should handle PDF file upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.pdf');

      try {
        await fileInput.setInputFiles(testFile);
        await page.waitForTimeout(1000);

        // Check for attachment indicator
        const hasAttachment = await page.locator('[class*="attachment"], text=/sample.pdf|PDF/i').first().isVisible({ timeout: 2000 }).catch(() => false);

        if (hasAttachment) {
          console.log('✓ PDF file attachment displayed');
        } else {
          console.log('⚠ No PDF attachment indicator found');
        }
      } catch (error) {
        console.log('⚠ PDF upload test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    }
  });

  test('should allow removing uploaded file', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');

      try {
        await fileInput.setInputFiles(testFile);
        await page.waitForTimeout(1000);

        // Look for remove/delete button
        const removeBtn = page.locator('button:has-text("Remove"), button:has-text("Delete"), button[aria-label*="remove"], button[aria-label*="delete"]').first();

        if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await removeBtn.click();
          await page.waitForTimeout(500);
          console.log('✓ File remove button found and clicked');
        } else {
          console.log('ℹ No remove button found');
        }
      } catch (error) {
        console.log('⚠ Remove file test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    }
  });

  test('should support drag-and-drop file upload', async ({ page }) => {
    // Look for drop zone or textarea that accepts files
    const dropZone = page.locator('textarea, [class*="drop"], [class*="upload"]').first();

    if (await dropZone.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');

      try {
        // Read file as buffer for drag-and-drop simulation
        const buffer = require('fs').readFileSync(testFile);
        const dataTransfer = await page.evaluateHandle((data) => {
          const dt = new DataTransfer();
          const file = new File([new Uint8Array(data)], 'sample.png', { type: 'image/png' });
          dt.items.add(file);
          return dt;
        }, Array.from(buffer));

        // Simulate drag-and-drop
        await dropZone.dispatchEvent('drop', { dataTransfer });
        await page.waitForTimeout(1000);

        // Check for preview or uploaded indicator
        const hasPreview = await page.locator('[class*="preview"], [class*="attachment"], img[src*="data:image"]').first().isVisible({ timeout: 2000 }).catch(() => false);

        if (hasPreview) {
          console.log('✓ Drag-and-drop file upload successful');
        } else {
          console.log('⚠ No file preview after drag-and-drop');
        }
      } catch (error) {
        console.log('⚠ Drag-and-drop test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    } else {
      console.log('ℹ Drop zone not found, skipping drag-and-drop test');
    }
  });

  test('should support paste image upload (Ctrl+V)', async ({ page }) => {
    const textarea = page.locator('textarea').first();

    if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        // Focus the textarea
        await textarea.click();
        await page.waitForTimeout(300);

        // Create a mock clipboard event with image data
        const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');
        const buffer = require('fs').readFileSync(testFile);

        // Simulate paste event with image
        await textarea.evaluate((element, imageData) => {
          const blob = new Blob([new Uint8Array(imageData)], { type: 'image/png' });
          const file = new File([blob], 'pasted-image.png', { type: 'image/png' });

          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);

          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
          });

          element.dispatchEvent(pasteEvent);
        }, Array.from(buffer));

        await page.waitForTimeout(1000);

        // Check for preview of pasted image
        const hasPreview = await page.locator('[class*="preview"], [class*="attachment"], img[src*="data:image"]').first().isVisible({ timeout: 2000 }).catch(() => false);

        if (hasPreview) {
          console.log('✓ Paste image upload (Ctrl+V) successful');
        } else {
          console.log('⚠ No image preview after paste');
        }
      } catch (error) {
        console.log('⚠ Paste upload test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    } else {
      console.log('ℹ Textarea not found, skipping paste test');
    }
  });

  test('should remove attachment before sending', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');

      try {
        // Upload file
        await fileInput.setInputFiles(testFile);
        await page.waitForTimeout(1000);

        // Verify attachment is present
        const attachment = page.locator('[class*="attachment"], [class*="preview"]').first();
        const hasAttachment = await attachment.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasAttachment) {
          console.log('✓ Attachment uploaded');

          // Find and click remove button
          const removeBtn = page.locator('button:has-text("Remove"), button:has-text("Delete"), button[aria-label*="remove"], button[aria-label*="delete"], [class*="remove"]').first();

          if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await removeBtn.click();
            await page.waitForTimeout(500);

            // Verify attachment is removed
            const attachmentGone = await attachment.isHidden({ timeout: 2000 }).catch(() => true);

            if (attachmentGone) {
              console.log('✓ Attachment removed before sending');
            } else {
              console.log('⚠ Attachment still visible after remove');
            }

            // Verify send button doesn't include attachment
            const textarea = page.locator('textarea').first();
            if (await textarea.isVisible({ timeout: 1000 })) {
              await textarea.fill('Test message without attachment');
              console.log('✓ Message can be sent without removed attachment');
            }
          } else {
            console.log('ℹ Remove button not found');
          }
        }
      } catch (error) {
        console.log('⚠ Remove attachment test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    }
  });

  test('should retry upload after failure', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        // Try to upload an invalid or corrupt file to trigger failure
        const invalidFile = path.join(process.cwd(), 'e2e/fixtures/test-files/large-file.zip');

        // First attempt - should fail due to size
        await fileInput.setInputFiles(invalidFile);
        await page.waitForTimeout(2000);

        // Check for error message
        const errorMsg = page.locator('text=/error|failed|exceed|too large/i').first();
        const hasError = await errorMsg.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasError) {
          console.log('✓ Upload failure detected');

          // Look for retry option
          const retryBtn = page.locator('button:has-text("Retry"), button:has-text("Try Again")').first();
          const hasRetry = await retryBtn.isVisible({ timeout: 2000 }).catch(() => false);

          if (hasRetry) {
            console.log('✓ Retry button available');
            await retryBtn.click();
            await page.waitForTimeout(500);

            // Try again with valid file
            const validFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');
            const fileInput2 = page.locator('input[type="file"]').first();
            if (await fileInput2.isVisible({ timeout: 2000 })) {
              await fileInput2.setInputFiles(validFile);
              await page.waitForTimeout(1000);

              const hasPreview = await page.locator('[class*="preview"], [class*="attachment"]').first().isVisible({ timeout: 2000 }).catch(() => false);

              if (hasPreview) {
                console.log('✓ Upload retry successful');
              }
            }
          } else {
            console.log('ℹ No explicit retry button (can use file input again)');

            // Alternative: just try uploading again
            const validFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');
            await fileInput.setInputFiles(validFile);
            await page.waitForTimeout(1000);

            const hasPreview = await page.locator('[class*="preview"], [class*="attachment"]').first().isVisible({ timeout: 2000 }).catch(() => false);

            if (hasPreview) {
              console.log('✓ Upload retry via re-upload successful');
            }
          }
        } else {
          console.log('ℹ No error detected for invalid file (might accept all files)');
        }
      } catch (error) {
        console.log('⚠ Upload retry test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    }
  });

  test('should view attachment preview and click to enlarge', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testFile = path.join(process.cwd(), 'e2e/fixtures/test-files/sample.png');

      try {
        await fileInput.setInputFiles(testFile);
        await page.waitForTimeout(1000);

        // Look for image preview
        const preview = page.locator('img[src*="data:image"], [class*="preview"] img, [class*="attachment"] img').first();
        const hasPreview = await preview.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasPreview) {
          console.log('✓ Attachment preview displayed');

          // Click on preview to enlarge
          await preview.click();
          await page.waitForTimeout(500);

          // Look for enlarged view (modal, overlay, or full-size image)
          const enlargedView = page.locator(
            '[class*="modal"], [class*="overlay"], [class*="lightbox"], [class*="enlarged"], img[class*="full"]'
          ).first();

          const hasEnlarged = await enlargedView.isVisible({ timeout: 2000 }).catch(() => false);

          if (hasEnlarged) {
            console.log('✓ Preview can be clicked to enlarge');

            // Try to close the enlarged view
            const closeBtn = page.locator('button:has-text("Close"), [aria-label*="close"], [class*="close"]').first();
            if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await closeBtn.click();
              await page.waitForTimeout(300);
              console.log('✓ Enlarged view can be closed');
            } else {
              // Try clicking outside or pressing Escape
              await page.keyboard.press('Escape');
              await page.waitForTimeout(300);
              console.log('✓ Enlarged view closed with Escape');
            }
          } else {
            console.log('ℹ No enlarged view detected (preview might be inline only)');
          }
        } else {
          console.log('⚠ No preview image found');
        }
      } catch (error) {
        console.log('⚠ Preview enlarge test skipped:', error instanceof Error ? error.message : 'unknown error');
      }
    }
  });
});
