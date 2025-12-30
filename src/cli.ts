#!/usr/bin/env node

import { Runner } from "./runner";

const DEFAULT_SERVER = "wss://app.gleip.io/ws/runner";

function parseArgs(args: string[]): { token?: string; server: string } {
  let token: string | undefined;
  let server = DEFAULT_SERVER;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && args[i + 1]) {
      token = args[++i];
    } else if (args[i] === "--server" && args[i + 1]) {
      server = args[++i];
    }
  }

  return { token, server };
}

const { token, server } = parseArgs(process.argv.slice(2));

if (!token) {
  console.error("Usage: gleip-runner --token <token> [--server <wss://url>]");
  console.error("\nOptions:");
  console.error("  --token   Required. Authentication token");
  console.error("  --server  Optional. WebSocket server URL (default: wss://app.gleip.io/ws/runner)");
  process.exit(1);
}

const runner = new Runner(server, token);

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  runner.disconnect();
  process.exit(0);
});

process.on("SIGTERM", () => {
  runner.disconnect();
  process.exit(0);
});

runner.connect();
