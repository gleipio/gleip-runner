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

export type ServerMessage = Execute;
export type ClientMessage = Hello | Result;
