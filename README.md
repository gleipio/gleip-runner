# gleip-runner

WebSocket-based job runner that executes HTTP requests on behalf of Gleip.

## Installation

```bash
npm install -g gleip-runner
```

Or run directly with npx:

```bash
npx gleip-runner --token YOUR_TOKEN
```

## Usage

```bash
gleip-runner --token <token> [--server <wss://url>]
```

- `--token` - Required. Authentication token for the runner.
- `--server` - Optional. WebSocket server URL (default: `wss://app.gleip.io/ws/runner`).

## Protocol

### Messages sent by runner

**Hello** - Sent on connection:
```json
{
  "type": "hello",
  "runnerId": "runner-123",
  "capabilities": ["http/s"]
}
```

**Result** - Sent after executing a job:
```json
{
  "type": "result",
  "jobId": "job-456",
  "status": "success",
  "response": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": "{\"ok\":true}",
    "timeMs": 150
  }
}
```

### Messages received by runner

**Execute** - Request to execute an HTTP request:
```json
{
  "type": "execute",
  "jobId": "job-456",
  "kind": "http",
  "request": {
    "method": "GET",
    "url": "https://api.example.com/data",
    "headers": { "Authorization": "Bearer token" },
    "body": null
  },
  "timeoutMs": 30000
}
```

## Programmatic Usage

```typescript
import { Runner } from "gleip-runner";

const runner = new Runner("wss://your-server.com", "my-runner");
runner.connect();

// To disconnect
runner.disconnect();
```

## License

MIT
