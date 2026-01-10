import WebSocket from "ws";
import type {
  BrowserWSSOutgoingMessage,
  BrowserWSSIncomingMessage,
  BrowserHello,
  BrowserFrame,
  BrowserAck,
} from "./types";
import { BrowserSession } from "./browser-session";

export class BrowserWSS {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private token: string;
  private runnerId: string;
  private sessionId: string;
  private session: BrowserSession | null = null;
  private onDisconnect: () => void;
  private onConnect: () => void;

  constructor(
    serverUrl: string,
    runnerId: string,
    token: string,
    sessionId: string,
    onConnect: () => void,
    onDisconnect: () => void
  ) {
    // Convert /runner to /runner/browser
    this.serverUrl = serverUrl.replace(/\/runner$/, "/runner/browser");
    this.runnerId = runnerId;
    this.token = token;
    this.sessionId = sessionId;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
  }

  connect(): void {
    if (this.ws) {
      console.log("Browser WSS already connected");
      return;
    }

    console.log(`Connecting browser WSS to ${this.serverUrl}`);
    this.ws = new WebSocket(this.serverUrl);

    this.ws.on("open", () => {
      console.log("Browser WSS connected");
      this.sendAuth();
      this.onConnect();
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(
          data.toString()
        ) as BrowserWSSIncomingMessage;
        this.handleMessage(message);
      } catch (err) {
        console.error("Failed to parse browser WSS message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("Browser WSS disconnected");
      this.cleanup();
      this.onDisconnect();
    });

    this.ws.on("error", (err) => {
      console.error("Browser WSS error:", err);
    });
  }

  private sendAuth(): void {
    if (!this.ws) return;

    // Send hello message with runnerId and token
    const hello: BrowserHello = {
      type: "browser:hello",
      runnerId: this.runnerId,
      token: this.token,
      sessionId: this.sessionId,
    };
    console.log("Sending browser hello:", JSON.stringify(hello));
    this.send(hello);
  }

  private async handleMessage(
    message: BrowserWSSIncomingMessage
  ): Promise<void> {
    if (message.type === "browser:input") {
      if (
        this.session &&
        this.session.sessionId === message.sessionId &&
        this.session.isActive()
      ) {
        if (!message.action) {
          console.warn("Received browser:input message without action", message);
          return;
        }

        try {
          await this.session.handleInput(message.action);
        } catch (err) {
          console.error("Input handling error:", err);
        }
      }
    }
  }

  async attachSession(session: BrowserSession): Promise<void> {
    if (this.session) {
      console.log("Detaching existing session before attaching new one");
      await this.detachSession();
    }

    this.session = session;

    // Start frame capture
    this.session.startFrameCapture((frame) => {
      this.sendFrame(session.sessionId, frame);
    });

    // Send acknowledgment that browser started
    this.sendAck(session.sessionId, "started");
  }

  async detachSession(): Promise<void> {
    if (this.session) {
      this.session.stopFrameCapture();
      await this.session.stop();
      this.session = null;
    }
  }

  private sendFrame(sessionId: string, data: string): void {
    const frame: BrowserFrame = {
      type: "browser:frame",
      sessionId,
      mime: "image/jpeg",
      data,
    };
    this.send(frame);
  }


  sendAck(sessionId: string, status: "started" | "stopped" | "error", error?: string): void {
    const ack: BrowserAck = {
      type: "browser:ack",
      sessionId,
      status,
      error,
    };
    this.send(ack);
  }

  private send(message: BrowserWSSOutgoingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private cleanup(): void {
    if (this.session) {
      this.session.stopFrameCapture();
      this.session.stop().catch((err) => {
        console.error("Error stopping session during cleanup:", err);
      });
      this.session = null;
    }
  }

  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getSession(): BrowserSession | null {
    return this.session;
  }
}
