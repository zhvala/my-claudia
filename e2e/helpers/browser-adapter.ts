/**
 * BrowserAdapter - Stagehand + Playwright hybrid
 *
 * Stagehand launches the browser and provides AI capabilities (act/extract/observe).
 * Playwright connects to the same browser via CDP for full API compatibility.
 *
 * Existing tests work unchanged (all methods proxy to Playwright Page).
 * AI features require an API key (ANTHROPIC_API_KEY or OPENAI_API_KEY).
 */
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import type { Page, Locator, Browser } from 'playwright-core';
import type { z } from 'zod';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:1420';

export interface BrowserAdapterOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  browser?: 'chromium' | 'firefox' | 'webkit';
}

const DEFAULT_OPTIONS: BrowserAdapterOptions = {
  headless: true,
  viewport: { width: 1280, height: 720 },
  browser: 'chromium',
};

export class BrowserAdapter {
  private stagehand: Stagehand | null = null;
  private playwrightBrowser: Browser | null = null;
  private _page: Page | null = null;

  /**
   * Launch the browser via Stagehand, then connect Playwright over CDP.
   */
  async launch(opts?: BrowserAdapterOptions): Promise<void> {
    const options = { ...DEFAULT_OPTIONS, ...opts };

    // 1. Stagehand launches the browser
    this.stagehand = new Stagehand({
      env: 'LOCAL',
      localBrowserLaunchOptions: {
        headless: options.headless,
        viewport: options.viewport,
      },
      verbose: process.env.DEBUG ? 1 : 0,
    });
    await this.stagehand.init();

    // 2. Connect Playwright to the same browser via CDP WebSocket
    const wsEndpoint = this.stagehand.connectURL();
    this.playwrightBrowser = await chromium.connectOverCDP(wsEndpoint);

    // 3. Get the Playwright Page (the one Stagehand already opened)
    const contexts = this.playwrightBrowser.contexts();
    const context = contexts[0];
    const pages = context.pages();
    this._page = pages[0];
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    try {
      // Disconnect Playwright first (doesn't close the browser)
      await this.playwrightBrowser?.close();
    } catch {
      // Ignore
    }
    try {
      // Stagehand closes the actual browser
      await this.stagehand?.close();
    } catch {
      // Ignore close errors
    }
    this._page = null;
    this.playwrightBrowser = null;
    this.stagehand = null;
  }

  /**
   * Check if browser is launched
   */
  isLaunched(): boolean {
    return this.stagehand !== null && this._page !== null;
  }

  /**
   * Get the underlying Playwright Page
   */
  get page(): Page {
    if (!this._page) throw new Error('Browser not launched');
    return this._page;
  }

  // ─── Navigation ─────────────────────────────────────────────

  async goto(url: string): Promise<void> {
    const resolvedUrl = url.startsWith('/') ? `${BASE_URL}${url}` : url;
    await this.page.goto(resolvedUrl);
  }

  async reload(opts?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    await this.page.reload(opts);
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void> {
    await this.page.waitForLoadState(state);
  }

  async waitForTimeout(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  url(): string {
    return this.page.url();
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  async content(): Promise<string> {
    return this.page.content();
  }

  async textContent(selector: string): Promise<string | null> {
    return this.page.textContent(selector);
  }

  // ─── Screenshot ─────────────────────────────────────────────

  async screenshot(opts?: { path?: string; fullPage?: boolean }): Promise<Buffer> {
    return this.page.screenshot(opts);
  }

  // ─── Element Finding ────────────────────────────────────────

  locator(selector: string): LocatorAdapter {
    return new LocatorAdapter(this, selector, 'css');
  }

  getByText(text: string, opts?: { exact?: boolean }): LocatorAdapter {
    return new LocatorAdapter(this, text, 'text', opts);
  }

  getByRole(role: string, opts?: { name?: string | RegExp }): LocatorAdapter {
    return new LocatorAdapter(this, role, 'role', opts);
  }

  getByPlaceholder(text: string | RegExp): LocatorAdapter {
    return new LocatorAdapter(this, typeof text === 'string' ? text : text.source, 'placeholder', { isRegex: text instanceof RegExp });
  }

  getByTestId(testId: string): LocatorAdapter {
    return new LocatorAdapter(this, testId, 'testid');
  }

  // ─── Events ─────────────────────────────────────────────────

  on(event: string, handler: (...args: any[]) => void): void {
    this.page.on(event as any, handler);
  }

  // ─── Keyboard ───────────────────────────────────────────────

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  // ─── Evaluate ───────────────────────────────────────────────

  async evaluate<R>(fn: (...args: any[]) => R, ...args: any[]): Promise<R> {
    return this.page.evaluate(fn as any, ...args);
  }

  // ─── Wait ───────────────────────────────────────────────────

  async waitForSelector(selector: string, opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void> {
    await this.page.waitForSelector(selector, opts);
  }

  async waitForEvent(event: string, opts?: { timeout?: number }): Promise<any> {
    return this.page.waitForEvent(event as any, opts);
  }

  // ─── Click shorthand ───────────────────────────────────────

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  // ─── CDP ────────────────────────────────────────────────────

  async getCDPSession() {
    return this.page.context().newCDPSession(this.page);
  }

  // ─── No-op (kept for LocatorAdapter compatibility) ──────────

  markDirty(): void {
    // No-op: agent-browser snapshot cache no longer used
  }

  // ─── Stagehand AI Methods ──────────────────────────────────

  get aiEnabled(): boolean {
    return !!(process.env.STAGEHAND_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  }

  private requireAI(): void {
    if (!this.stagehand) throw new Error('Browser not launched');
    if (!this.aiEnabled) throw new Error('Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use act/extract/observe');
  }

  /**
   * Perform an action described in natural language.
   * Example: await browser.act('Click the login button')
   */
  async act(instruction: string, opts?: Record<string, unknown>) {
    this.requireAI();
    return this.stagehand!.act({ action: instruction, ...opts });
  }

  /**
   * Extract structured data from the page using a zod schema.
   * Example:
   *   const data = await browser.extract('Get the page title', z.object({ title: z.string() }))
   */
  async extract<T extends z.AnyZodObject>(instruction: string, schema: T, opts?: Record<string, unknown>) {
    this.requireAI();
    return this.stagehand!.extract({ instruction, schema, ...opts });
  }

  /**
   * Observe the page and discover actionable elements.
   * Example: const elements = await browser.observe('Find all buttons')
   */
  async observe(instruction: string, opts?: Record<string, unknown>) {
    this.requireAI();
    return this.stagehand!.observe({ instruction, ...opts });
  }
}

// ─── Locator Types ──────────────────────────────────────────

type LocatorType = 'css' | 'text' | 'role' | 'placeholder' | 'testid';

interface LocatorOpts {
  exact?: boolean;
  name?: string | RegExp;
  isRegex?: boolean;
}

/**
 * LocatorAdapter - Provides a Playwright Locator-compatible interface.
 * All interactions delegate to the underlying Playwright Page locators.
 */
export class LocatorAdapter {
  private browser: BrowserAdapter;
  private selector: string;
  private type: LocatorType;
  private opts: LocatorOpts;
  private _index: number | null = null;
  private _first = false;
  private _last = false;

  constructor(browser: BrowserAdapter, selector: string, type: LocatorType, opts?: LocatorOpts) {
    this.browser = browser;
    this.selector = selector;
    this.type = type;
    this.opts = opts || {};
  }

  protected toPlaywrightLocator(): Locator {
    const page = this.browser.page;
    let locator: Locator;

    switch (this.type) {
      case 'css':
        locator = page.locator(this.selector);
        break;
      case 'text':
        if (this.opts.exact) {
          locator = page.getByText(this.selector, { exact: true });
        } else {
          locator = page.getByText(this.selector);
        }
        break;
      case 'role':
        if (this.opts.name) {
          locator = page.getByRole(this.selector as any, { name: this.opts.name });
        } else {
          locator = page.getByRole(this.selector as any);
        }
        break;
      case 'placeholder':
        if (this.opts.isRegex) {
          locator = page.getByPlaceholder(new RegExp(this.selector));
        } else {
          locator = page.getByPlaceholder(this.selector);
        }
        break;
      case 'testid':
        locator = page.getByTestId(this.selector);
        break;
      default:
        locator = page.locator(this.selector);
    }

    if (this._first) return locator.first();
    if (this._last) return locator.last();
    if (this._index !== null) return locator.nth(this._index);

    return locator;
  }

  // ─── Index Modifiers ─────────────────────────────────────

  first(): LocatorAdapter {
    const clone = this.clone();
    clone._first = true;
    clone._last = false;
    clone._index = null;
    return clone;
  }

  last(): LocatorAdapter {
    const clone = this.clone();
    clone._last = true;
    clone._first = false;
    clone._index = null;
    return clone;
  }

  nth(index: number): LocatorAdapter {
    const clone = this.clone();
    clone._index = index;
    clone._first = false;
    clone._last = false;
    return clone;
  }

  private clone(): LocatorAdapter {
    const c = new LocatorAdapter(this.browser, this.selector, this.type, this.opts);
    c._index = this._index;
    c._first = this._first;
    c._last = this._last;
    return c;
  }

  // ─── Chaining ──────────────────────────────────────────────

  locator(selector: string): LocatorAdapter {
    const parentLocator = this.toPlaywrightLocator();
    return new ChainedLocatorAdapter(this.browser, parentLocator.locator(selector));
  }

  // ─── Interactions ─────────────────────────────────────────

  async click(): Promise<void> {
    await this.toPlaywrightLocator().click();
    this.browser.markDirty();
  }

  async fill(text: string): Promise<void> {
    await this.toPlaywrightLocator().fill(text);
    this.browser.markDirty();
  }

  async press(key: string): Promise<void> {
    await this.toPlaywrightLocator().press(key);
    this.browser.markDirty();
  }

  async check(): Promise<void> {
    await this.toPlaywrightLocator().check();
    this.browser.markDirty();
  }

  async uncheck(): Promise<void> {
    await this.toPlaywrightLocator().uncheck();
    this.browser.markDirty();
  }

  async hover(): Promise<void> {
    await this.toPlaywrightLocator().hover();
  }

  async setInputFiles(files: string | string[]): Promise<void> {
    await this.toPlaywrightLocator().setInputFiles(files);
    this.browser.markDirty();
  }

  async dispatchEvent(type: string, eventInit?: any): Promise<void> {
    await this.toPlaywrightLocator().dispatchEvent(type, eventInit);
    this.browser.markDirty();
  }

  // ─── Queries ──────────────────────────────────────────────

  async isVisible(opts?: { timeout?: number }): Promise<boolean> {
    try {
      return await this.toPlaywrightLocator().isVisible(opts);
    } catch {
      return false;
    }
  }

  async isEnabled(): Promise<boolean> {
    try {
      return await this.toPlaywrightLocator().isEnabled();
    } catch {
      return false;
    }
  }

  async textContent(): Promise<string | null> {
    return this.toPlaywrightLocator().textContent();
  }

  async innerText(): Promise<string> {
    return this.toPlaywrightLocator().innerText();
  }

  async count(): Promise<number> {
    return this.toPlaywrightLocator().count();
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.toPlaywrightLocator().getAttribute(name);
  }

  async inputValue(): Promise<string> {
    return this.toPlaywrightLocator().inputValue();
  }

  // ─── Wait ─────────────────────────────────────────────────

  async waitFor(opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void> {
    await this.toPlaywrightLocator().waitFor(opts);
    this.browser.markDirty();
  }
}

/**
 * ChainedLocatorAdapter - Wraps a Playwright Locator directly for chained locator calls.
 */
class ChainedLocatorAdapter extends LocatorAdapter {
  private _locator: Locator;

  constructor(browser: BrowserAdapter, locator: Locator) {
    super(browser, '', 'css');
    this._locator = locator;
  }

  protected override toPlaywrightLocator(): Locator {
    if ((this as any)._first) return this._locator.first();
    if ((this as any)._last) return this._locator.last();
    if ((this as any)._index !== null) return this._locator.nth((this as any)._index);
    return this._locator;
  }

  override locator(selector: string): LocatorAdapter {
    return new ChainedLocatorAdapter((this as any).browser, this._locator.locator(selector));
  }
}

/**
 * Create a new BrowserAdapter instance and launch the browser
 */
export async function createBrowser(opts?: BrowserAdapterOptions): Promise<BrowserAdapter> {
  const browser = new BrowserAdapter();
  await browser.launch(opts);
  return browser;
}
