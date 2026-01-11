import { chromium, Browser, Page, Request } from "patchright";
import type { BrowserStart, BrowserInputAction, BrowserTraffic } from "./types";
import { applyStealth, getRealisticUserAgent } from "./stealth";

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private requestTimings: Map<Request, number> = new Map();
  private trafficCallback: ((traffic: BrowserTraffic) => void) | null = null;
  private onBrowserClose: (() => void) | null = null;
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

    console.log(`Starting browser session ${this.sessionId}`);

    this.browser = await chromium.launch({
      headless: false,
      channel: "chrome",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-infobars",
        "--window-position=0,0",
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list",
      ],
    });

    // Detect when browser is closed by the user
    this.browser.on("disconnected", () => {
      console.log(`Browser closed by user for session ${this.sessionId}`);
      if (this.onBrowserClose) {
        this.onBrowserClose();
      }
    });

    const context = await this.browser.newContext({
      viewport,
      userAgent: getRealisticUserAgent(),
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "America/New_York",
      permissions: [],
      colorScheme: "light",
      // Don't set extraHTTPHeaders - let browser set them naturally
      // This avoids header ordering issues that can be detected
      bypassCSP: false,
      ignoreHTTPSErrors: true,
    });



    this.page = await context.newPage();

    // Apply comprehensive stealth scripts to the page
    await applyStealth(this.page);

    console.log(`Browser session ${this.sessionId} started`);
  }

  async navigateToInitialUrl(): Promise<void> {
    if (this.options?.url && this.page) {
      console.log(`Navigating to ${this.options.url}`);
      await this.page.goto(this.options.url);
    }
  }

  async stop(): Promise<void> {
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

  setOnBrowserClose(callback: () => void): void {
    this.onBrowserClose = callback;
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
        await this.page.goto(event.url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        break;

      case "refresh":
        await this.page.reload({
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        break;
    }
  }

  getPage(): Page | null {
    return this.page;
  }
}
