import { z } from 'zod';
import type { BrowserAdapter } from './browser-adapter';

/**
 * Common Zod Schemas for AI extraction
 */

export const ProjectDataSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  sessionCount: z.number().optional(),
  isExpanded: z.boolean().optional(),
});

export const FileUploadStatusSchema = z.object({
  filesAttached: z.number(),
  totalSize: z.string().optional(),
  hasError: z.boolean(),
  errorMessage: z.string().optional(),
});

export const SettingsPanelStateSchema = z.object({
  activeTab: z.enum(['general', 'servers', 'import', 'providers', 'security', 'gateway']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  apiKeysConfigured: z.array(z.string()).optional(),
});

export const ImportProgressSchema = z.object({
  currentStep: z.enum(['select', 'scan', 'preview', 'import', 'complete']),
  sessionsFound: z.number().optional(),
  sessionsSelected: z.number().optional(),
});

export const MessageDataSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  hasThinking: z.boolean().optional(),
  hasToolCalls: z.boolean().optional(),
});

export const ProjectListSchema = z.object({
  projects: z.array(z.object({
    name: z.string(),
    isExpanded: z.boolean().optional(),
    sessionCount: z.number().optional(),
  })),
});

export const CommandMenuSchema = z.object({
  isVisible: z.boolean(),
  commands: z.array(z.string()),
});

export const FileListSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    isDirectory: z.boolean(),
  })),
  currentPath: z.string().optional(),
});

/**
 * AI Action with retry and fallback
 */
export async function withAIAction<T = void>(
  browser: BrowserAdapter,
  instruction: string,
  options?: { timeout?: number; retries?: number }
): Promise<{ success: boolean; result?: T; error?: string }> {
  const retries = options?.retries ?? 2;
  const timeout = options?.timeout ?? 30000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await browser.act(instruction, { timeout });
      return { success: true, result: result as T };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // If it's the last attempt, return the error
      if (attempt === retries) {
        return { success: false, error: errorMsg };
      }

      // Wait before retry
      await browser.waitForTimeout(1000 * (attempt + 1));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * AI Extract with validation and retry
 */
export async function withAIExtract<T extends z.ZodTypeAny>(
  browser: BrowserAdapter,
  instruction: string,
  schema: T,
  options?: { timeout?: number; retries?: number }
): Promise<{ success: boolean; data?: z.infer<T>; error?: string }> {
  const retries = options?.retries ?? 2;
  const timeout = options?.timeout ?? 30000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await browser.extract(instruction, schema, { timeout });
      return { success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // If it's the last attempt, return the error
      if (attempt === retries) {
        return { success: false, error: errorMsg };
      }

      // Wait before retry
      await browser.waitForTimeout(1000 * (attempt + 1));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Hybrid approach: Try AI first, fallback to traditional selector
 */
export async function clickWithFallback(
  browser: BrowserAdapter,
  aiInstruction: string,
  traditionalSelector: string,
  options?: { timeout?: number }
): Promise<boolean> {
  const timeout = options?.timeout ?? 10000;

  // Try AI first
  const aiResult = await withAIAction(browser, aiInstruction, { timeout, retries: 1 });
  if (aiResult.success) {
    return true;
  }

  // Fallback to traditional selector
  try {
    const element = browser.locator(traditionalSelector);
    await element.click({ timeout });
    return true;
  } catch (error) {
    console.warn(`Both AI and traditional selector failed. AI error: ${aiResult.error}, Selector: ${traditionalSelector}`);
    return false;
  }
}

/**
 * Fill form using AI
 */
export async function fillFormWithAI(
  browser: BrowserAdapter,
  formData: Record<string, string>,
  submitInstruction?: string,
  options?: { timeout?: number }
): Promise<{ success: boolean; error?: string }> {
  const timeout = options?.timeout ?? 30000;

  try {
    // Fill each field
    for (const [fieldLabel, value] of Object.entries(formData)) {
      const instruction = `Fill the "${fieldLabel}" field with "${value}"`;
      const result = await withAIAction(browser, instruction, { timeout: timeout / 2, retries: 1 });

      if (!result.success) {
        return { success: false, error: `Failed to fill field "${fieldLabel}": ${result.error}` };
      }

      // Small delay between fields
      await browser.waitForTimeout(300);
    }

    // Submit if instruction provided
    if (submitInstruction) {
      const submitResult = await withAIAction(browser, submitInstruction, { timeout: timeout / 2, retries: 1 });
      if (!submitResult.success) {
        return { success: false, error: `Failed to submit: ${submitResult.error}` };
      }
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Execute multiple AI actions in sequence
 */
export async function actSequence(
  browser: BrowserAdapter,
  steps: string[],
  options?: { delayBetweenSteps?: number; timeout?: number }
): Promise<{ success: boolean; error?: string; failedStep?: number }> {
  const delay = options?.delayBetweenSteps ?? 300;
  const timeout = options?.timeout ?? 30000;

  for (let i = 0; i < steps.length; i++) {
    const result = await withAIAction(browser, steps[i], { timeout, retries: 1 });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        failedStep: i
      };
    }

    // Wait between steps
    if (i < steps.length - 1) {
      await browser.waitForTimeout(delay);
    }
  }

  return { success: true };
}

/**
 * Verify page state using AI extraction
 */
export async function verifyWithAI<T extends z.AnyZodObject>(
  browser: BrowserAdapter,
  instruction: string,
  schema: T,
  validator: (data: z.infer<T>) => void,
  options?: { timeout?: number; retries?: number }
): Promise<void> {
  const result = await withAIExtract(browser, instruction, schema, options);

  if (!result.success || !result.data) {
    throw new Error(`AI extraction failed: ${result.error}`);
  }

  validator(result.data);
}

/**
 * Wait for condition using AI observation
 */
export async function waitForConditionAI(
  browser: BrowserAdapter,
  instruction: string,
  schema: z.ZodTypeAny,
  condition: (data: any) => boolean,
  options?: { timeout?: number; pollInterval?: number }
): Promise<boolean> {
  const timeout = options?.timeout ?? 30000;
  const pollInterval = options?.pollInterval ?? 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await withAIExtract(browser, instruction, schema, { timeout: pollInterval, retries: 0 });

    if (result.success && result.data && condition(result.data)) {
      return true;
    }

    await browser.waitForTimeout(pollInterval);
  }

  return false;
}

/**
 * Utility Schemas for common test scenarios
 */
export const Schemas = {
  projectList: ProjectListSchema,
  messageList: z.object({
    messages: z.array(MessageDataSchema),
  }),
  commandMenu: CommandMenuSchema,
  fileList: FileListSchema,
  buttonState: z.object({
    isEnabled: z.boolean(),
    isVisible: z.boolean(),
    text: z.string().optional(),
  }),
  dialogState: z.object({
    isVisible: z.boolean(),
    title: z.string().optional(),
    message: z.string().optional(),
    buttons: z.array(z.string()).optional(),
  }),
  messageCount: z.object({
    messageCount: z.number(),
  }),
  elementVisibility: z.object({
    isVisible: z.boolean(),
    found: z.boolean().optional(),
  }),
};
