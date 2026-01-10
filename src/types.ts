export type Hello = {
  type: "hello";
  runnerId: string;
  token: string;
  version: string;
  capabilities: string[];
};

export type Result = {
  type: "result";
  jobId: string;
  status: "success" | "error";
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
    timeMs: number;
  };
  error?: string;
};

export type HttpOptions = {
  httpVersion?: "1.0" | "1.1" | "2";
  followRedirects?: boolean;
  maxRedirects?: number;
  keepAlive?: boolean;
  rejectUnauthorized?: boolean;
};

export type Execute = {
  type: "execute";
  jobId: string;
  kind: "http";
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  };
  options?: HttpOptions;
  timeoutMs?: number;
};

// Browser control messages (Control WSS)
export type BrowserStart = {
  type: "browser:start";
  sessionId: string;
  options?: {
    viewport?: { width: number; height: number };
    headless?: boolean;
  };
};

export type BrowserStop = {
  type: "browser:stop";
  sessionId: string;
};

// Browser WSS messages (frames and input)
export type BrowserHello = {
  type: "hello";
  runnerId: string;
  token: string;
};

export type BrowserFrame = {
  type: "browser:frame";
  sessionId: string;
  mime: "image/jpeg";
  data: string; // base64
};

export type KeyModifiers = {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

export type BrowserInputAction =
  | { kind: "click"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { kind: "dblclick"; x: number; y: number }
  | { kind: "move"; x: number; y: number }
  | { kind: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "keydown"; key: string; modifiers?: KeyModifiers }
  | { kind: "keyup"; key: string; modifiers?: KeyModifiers }
  | { kind: "type"; text: string };

export type BrowserInputEvent = {
  type: "browser:input";
  sessionId: string;
  event: BrowserInputAction;
};

export type BrowserAck = {
  type: "browser:ack";
  sessionId: string;
  status: "started" | "stopped" | "error";
  error?: string;
};

export type ServerMessage = Execute | BrowserStart | BrowserStop;
export type ClientMessage = Hello | Result;
export type BrowserWSSOutgoingMessage = BrowserHello | BrowserFrame | BrowserAck;
export type BrowserWSSIncomingMessage = BrowserInputEvent;
