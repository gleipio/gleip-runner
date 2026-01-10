import { chromium, Browser, Page } from "playwright";
import type { BrowserStart, BrowserInputAction } from "./types";

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private frameInterval: NodeJS.Timeout | null = null;
  public sessionId: string;
  public options: BrowserStart["options"];

  constructor(sessionId: string, options?: BrowserStart["options"]) {
    this.sessionId = sessionId;
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.browser) {
      throw new Error("Browser already started");
    }

    const viewport = this.options?.viewport || { width: 1280, height: 800 };
    const headless = this.options?.headless ?? false;

    console.log(`Starting browser session ${this.sessionId} (headless: ${headless})`);

    this.browser = await chromium.launch({ headless });
    const context = await this.browser.newContext({ viewport });
    this.page = await context.newPage();

    console.log(`Browser session ${this.sessionId} started`);
  }

  async stop(): Promise<void> {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log(`Browser session ${this.sessionId} stopped`);
    }
  }

  isActive(): boolean {
    return this.browser !== null && this.page !== null;
  }

  async captureFrame(): Promise<string> {
    if (!this.page) {
      throw new Error("No active page");
    }

    const screenshot = await this.page.screenshot({
      type: "jpeg",
      quality: 60,
    });

    return screenshot.toString("base64");
  }

  startFrameCapture(callback: (frame: string) => void): void {
    if (this.frameInterval) {
      return;
    }

    // Capture frame every 200ms (~5 FPS)
    this.frameInterval = setInterval(async () => {
      try {
        const frame = await this.captureFrame();
        callback(frame);
      } catch (err) {
        console.error("Frame capture error:", err);
      }
    }, 200);
  }

  stopFrameCapture(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  async handleInput(event: BrowserInputAction): Promise<void> {
    if (!this.page) {
      throw new Error("No active page");
    }

    switch (event.kind) {
      case "click":
        await this.page.mouse.click(event.x, event.y, { button: event.button });
        break;

      case "dblclick":
        await this.page.mouse.dblclick(event.x, event.y);
        break;

      case "move":
        await this.page.mouse.move(event.x, event.y);
        break;

      case "scroll":
        await this.page.mouse.move(event.x, event.y);
        await this.page.mouse.wheel(event.deltaX, event.deltaY);
        break;

      case "keydown":
        await this.page.keyboard.down(event.key);
        break;

      case "keyup":
        await this.page.keyboard.up(event.key);
        break;

      case "type":
        await this.page.keyboard.type(event.text);
        break;
    }
  }

  getPage(): Page | null {
    return this.page;
  }
}
