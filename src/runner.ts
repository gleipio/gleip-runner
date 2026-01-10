import WebSocket from "ws";
import https from "https";
import http from "http";
import http2 from "http2";
import os from "os";
import crypto from "crypto";
import { Hello, Execute, Result, ServerMessage, BrowserStart, BrowserStop } from "./types";
import { BrowserWSS } from "./browser-wss";
import { BrowserSession } from "./browser-session";

const { version } = require("../package.json");

export class Runner {
  private ws: WebSocket | null = null;
  private token: string;
  private runnerId: string;
  private serverUrl: string;
  private browserWSS: BrowserWSS | null = null;
  private pendingBrowserStart: BrowserStart | null = null;

  constructor(serverUrl: string, token: string) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.runnerId = this.generateRunnerId();
  }

  private generateRunnerId(): string {
    const hostname = os.hostname();
    const uniqueId = crypto.randomBytes(4).toString("hex");
    return `${hostname}-${uniqueId}`;
  }

  connect(): void {
    this.ws = new WebSocket(this.serverUrl);

    this.ws.on("open", () => {
      console.log(`Connected to ${this.serverUrl}`);
      this.sendHello();
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as ServerMessage;
        this.handleMessage(message);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("Disconnected from server");
    });

    this.ws.on("error", (err) => {
      console.error("WebSocket error:", err);
    });
  }

  private sendHello(): void {
    const hello: Hello = {
      type: "hello",
      runnerId: this.runnerId,
      token: this.token,
      version: version,
      capabilities: ["http/s", "browser"],
    };
    this.send(hello);
  }

  private async handleMessage(message: ServerMessage): Promise<void> {
    if (message.type === "execute") {
      await this.handleExecute(message);
    } else if (message.type === "browser:start") {
      await this.handleBrowserStart(message);
    } else if (message.type === "browser:stop") {
      await this.handleBrowserStop(message);
    }
  }

  private async handleExecute(execute: Execute): Promise<void> {
    console.log(`Executing job ${execute.jobId}: ${execute.request.method} ${execute.request.url}`);
    
    const startTime = Date.now();
    let result: Result;
    const options = execute.options ?? {};

    try {
      const httpResponse = options.httpVersion === "2"
        ? await this.executeHttp2(execute)
        : await this.executeHttp1(execute);

      result = {
        type: "result",
        jobId: execute.jobId,
        status: "success",
        response: {
          status: httpResponse.status,
          headers: httpResponse.headers,
          body: httpResponse.body,
          timeMs: Date.now() - startTime,
        },
      };
    } catch (err) {
      result = {
        type: "result",
        jobId: execute.jobId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    this.send(result);
    console.log(`Job ${execute.jobId} completed with status: ${result.status}`);
  }

  private async executeHttp1(execute: Execute): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const options = execute.options ?? {};
    const url = new URL(execute.request.url);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const httpVersion = options.httpVersion ?? "1.1";
    const followRedirects = options.followRedirects ?? true;
    const maxRedirects = options.maxRedirects ?? 10;

    return this.doHttp1Request(execute, transport, url, isHttps, httpVersion, followRedirects, maxRedirects, 0);
  }

  private doHttp1Request(
    execute: Execute,
    transport: typeof http | typeof https,
    url: URL,
    isHttps: boolean,
    httpVersion: string,
    followRedirects: boolean,
    maxRedirects: number,
    redirectCount: number
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const options = execute.options ?? {};
    const timeout = execute.timeoutMs ?? 30000;

    return new Promise((resolve, reject) => {
      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: execute.request.method,
        headers: execute.request.headers,
        timeout,
      };

      if (isHttps) {
        (reqOptions as https.RequestOptions).rejectUnauthorized = options.rejectUnauthorized ?? true;
      }

      if (options.keepAlive !== undefined) {
        reqOptions.agent = isHttps
          ? new https.Agent({ keepAlive: options.keepAlive })
          : new http.Agent({ keepAlive: options.keepAlive });
      }

      console.log(`[${new Date().toISOString()}] ${execute.request.method} ${url.href}`);
      
      const req = transport.request(reqOptions, (res) => {
        if (followRedirects && res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectCount >= maxRedirects) {
            reject(new Error(`Max redirects (${maxRedirects}) exceeded`));
            return;
          }
          const redirectUrl = new URL(res.headers.location, url);
          const redirectTransport = redirectUrl.protocol === "https:" ? https : http;
          this.doHttp1Request(execute, redirectTransport, redirectUrl, redirectUrl.protocol === "https:", httpVersion, followRedirects, maxRedirects, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value) headers[key] = Array.isArray(value) ? value.join(", ") : value;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
        res.on("error", reject);
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      if (execute.request.body) {
        req.write(execute.request.body);
      }
      req.end();
    });
  }

  private async executeHttp2(execute: Execute): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const options = execute.options ?? {};
    const url = new URL(execute.request.url);
    const timeout = execute.timeoutMs ?? 30000;

    return new Promise((resolve, reject) => {
      const client = http2.connect(url.origin, {
        rejectUnauthorized: options.rejectUnauthorized ?? true,
      });

      client.on("error", (err) => {
        client.close();
        reject(err);
      });

      const reqHeaders: http2.OutgoingHttpHeaders = {
        ":method": execute.request.method,
        ":path": url.pathname + url.search,
        ...execute.request.headers,
      };

      console.log(`[${new Date().toISOString()}] ${execute.request.method} ${url.href}`);

      const req = client.request(reqHeaders);
      req.setTimeout(timeout, () => {
        req.close();
        client.close();
        reject(new Error("Request timeout"));
      });

      const chunks: Buffer[] = [];
      let status = 0;
      const responseHeaders: Record<string, string> = {};

      req.on("response", (headers) => {
        status = headers[":status"] as number ?? 0;
        for (const [key, value] of Object.entries(headers)) {
          if (!key.startsWith(":") && value) {
            responseHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
          }
        }
      });

      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        client.close();
        resolve({
          status,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
      req.on("error", (err) => {
        client.close();
        reject(err);
      });

      if (execute.request.body) {
        req.write(execute.request.body);
      }
      req.end();
    });
  }

  private async handleBrowserStart(message: BrowserStart): Promise<void> {
    console.log(`Browser start request for session ${message.sessionId}`);

    // Check if there's already an active session
    if (this.browserWSS?.getSession()?.isActive()) {
      console.log("Browser session already active, ignoring start request");
      return;
    }

    // Store the request and wait for browser WSS to connect
    this.pendingBrowserStart = message;

    // Connect browser WSS if not already connected
    if (!this.browserWSS) {
      this.browserWSS = new BrowserWSS(
        this.serverUrl,
        this.runnerId,
        this.token,
        () => this.handleBrowserWSSConnect(),
        () => this.handleBrowserWSSDisconnect()
      );
      this.browserWSS.connect();
    } else if (this.browserWSS.isConnected()) {
      // Already connected, start immediately
      await this.startBrowser(message);
    }
  }

  private async startBrowser(message: BrowserStart): Promise<void> {
    if (!this.browserWSS) {
      console.error("Cannot start browser: browser WSS not initialized");
      return;
    }

    try {
      const session = new BrowserSession(message.sessionId, message.options);
      await session.start();
      await this.browserWSS.attachSession(session);
      this.pendingBrowserStart = null;
      console.log(`Browser session ${message.sessionId} started successfully`);
    } catch (err) {
      console.error("Failed to start browser:", err);
      this.browserWSS.sendAck(
        message.sessionId,
        "error",
        err instanceof Error ? err.message : String(err)
      );
      this.pendingBrowserStart = null;
    }
  }

  private async handleBrowserStop(message: BrowserStop): Promise<void> {
    console.log(`Browser stop request for session ${message.sessionId}`);

    if (!this.browserWSS) {
      console.log("No browser WSS connection");
      return;
    }

    const session = this.browserWSS.getSession();
    if (session && session.sessionId === message.sessionId) {
      await this.browserWSS.detachSession();
      this.browserWSS.sendAck(message.sessionId, "stopped");
      console.log(`Browser session ${message.sessionId} stopped`);
    } else {
      console.log(`Session ${message.sessionId} not found or mismatch`);
    }
  }

  private handleBrowserWSSConnect(): void {
    console.log("Browser WSS connected");
    // If there's a pending start request, execute it now
    if (this.pendingBrowserStart) {
      this.startBrowser(this.pendingBrowserStart);
    }
  }

  private handleBrowserWSSDisconnect(): void {
    console.log("Browser WSS disconnected, cleaning up browser session");
    this.browserWSS = null;
    this.pendingBrowserStart = null;
  }

  private send(message: Hello | Result): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    if (this.browserWSS) {
      this.browserWSS.disconnect();
      this.browserWSS = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
