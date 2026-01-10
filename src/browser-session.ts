import { chromium } from "playwright-extra";
import { Browser, Page, Request } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin());
import type { BrowserStart, BrowserInputAction, BrowserTraffic } from "./types";

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private frameInterval: NodeJS.Timeout | null = null;
  private requestTimings: Map<Request, number> = new Map();
  private trafficCallback: ((traffic: BrowserTraffic) => void) | null = null;
  public sessionId: string;
  public url: string | undefined;
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
    const headless = this.options?.headless ?? true;

    console.log(`Starting browser session ${this.sessionId} (headless: ${headless})`);

    const args = [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--headless=new",
    ];

    this.browser = await chromium.launch({
      headless: false, // Must be false to use --headless=new from args
      channel: "chrome",
      args,
    });

    const context = await this.browser.newContext({
      viewport,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "America/New_York",
      permissions: ["geolocation"],
      geolocation: { latitude: 40.7128, longitude: -74.006 },
    });

    this.page = await context.newPage();

    console.log(`Browser session ${this.sessionId} started`);
  }

  async navigateToInitialUrl(): Promise<void> {
    if (this.options?.url && this.page) {
      console.log(`Navigating to ${this.options.url}`);
      await this.page.goto(this.options.url);
    }
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

  startTrafficCapture(callback: (traffic: BrowserTraffic) => void): void {
    if (!this.page) {
      throw new Error("No active page");
    }

    this.trafficCallback = callback;

    this.page.on("request", (request) => {
      this.requestTimings.set(request, Date.now());
    });

    this.page.on("response", async (response) => {
      if (!this.trafficCallback) return;

      const request = response.request();
      const startTime = this.requestTimings.get(request);
      const timeMs = startTime ? Date.now() - startTime : 0;
      this.requestTimings.delete(request);

      const reqHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers())) {
        reqHeaders[key] = value;
      }

      const resHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers())) {
        resHeaders[key] = value;
      }

      let body: string | undefined;
      try {
        const buffer = await response.body();
        body = buffer.toString("utf-8");
      } catch {
        // Body may not be available for some responses
      }

      const traffic: BrowserTraffic = {
        type: "browser:traffic",
        sessionId: this.sessionId,
        request: {
          method: request.method(),
          url: request.url(),
          headers: reqHeaders,
          body: request.postData() ?? undefined,
        },
        response: {
          status: response.status(),
          statusText: response.statusText(),
          headers: resHeaders,
          body,
          timeMs,
        },
      };

      this.trafficCallback(traffic);
    });

    this.page.on("requestfailed", (request) => {
      if (!this.trafficCallback) return;

      this.requestTimings.delete(request);

      const reqHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers())) {
        reqHeaders[key] = value;
      }

      const failure = request.failure();
      const isTimeout = failure?.errorText?.toLowerCase().includes("timeout");

      const traffic: BrowserTraffic = {
        type: "browser:traffic",
        sessionId: this.sessionId,
        request: {
          method: request.method(),
          url: request.url(),
          headers: reqHeaders,
          body: request.postData() ?? undefined,
        },
        error: failure?.errorText ?? "Request failed",
        timedOut: isTimeout,
      };

      this.trafficCallback(traffic);
    });
  }

  stopTrafficCapture(): void {
    this.trafficCallback = null;
    this.requestTimings.clear();
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

      case "navigate":
        console.log("Navigating to:", event.url);
        await this.page.goto(event.url);
        break;

      case "refresh":
        await this.page.reload();
        break;
    }
  }

  getPage(): Page | null {
    return this.page;
  }
}
