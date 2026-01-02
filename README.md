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

## License

MIT
