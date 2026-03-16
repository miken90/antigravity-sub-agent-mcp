# Deployment Guide

## Prerequisites

- **Node.js 18+** installed
- **Antigravity IDE** running with at least one workspace open
- Access to `mcp_config.json` for your AI agent

## Installation

```bash
git clone https://github.com/khanhnguyen/antigravity-sub-agent-mcp.git
cd antigravity-sub-agent-mcp
npm install
```

## Configuration

### Option 1: Auto-Detection (Recommended)

No configuration needed. The server auto-detects the Language Server via:
1. **PPID detection** — Parent process is the LS (when spawned as MCP)
2. **Process scan** — Scans OS processes for `language_server`
3. **First valid instance** — Falls back to whatever LS is running

### Option 2: Environment Variables

Create `.env` or set vars when manual override is needed:

```bash
ANTIGRAVITY_PORT=53525        # LS listening port
ANTIGRAVITY_CSRF=abc123-...   # CSRF token from LS command line
ANTIGRAVITY_TLS=true          # Use HTTPS (default: true)
```

## MCP Integration

Add to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "antigravity-sub-agent": {
      "command": "node",
      "args": ["D:\\path\\to\\antigravity-sub-agent-mcp\\index.js"]
    }
  }
}
```

> **Note**: Use absolute path. On Windows, use double backslashes or forward slashes.

The server runs via **stdio transport** — Antigravity IDE spawns it automatically when an MCP tool is called. No manual server start required.

## Verification

After configuration, test from your AI agent:

1. Call `submit_agent` with a simple task:
   ```
   task: "List all files in the current directory and report the count"
   ```
2. Note the returned `taskId`
3. Call `get_agent_results` with `[taskId]`
4. Verify result contains the file listing

## Debugging

All logs go to **stderr** (visible in Antigravity's MCP output panel):

```
[ls-detector] Checking parent process (PPID=12345)...
[ls-detector] ✓ Parent LS API on port 53525 (TLS: false)
[antigravity-sub-agent-mcp] Transport: stdio
```

### Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| "Cannot find Antigravity Language Server" | IDE not running or no workspace open | Start IDE, open a workspace |
| "API returned 401" | CSRF token mismatch | Restart IDE (new token on each launch) |
| Cascade stalls forever | Unknown step type not handled | Check stderr logs for step type, file an issue |
| Binary protobuf errors | `protobufjs` version mismatch | Run `npm install` to update |

## Platform Notes

### Windows
- Uses PowerShell to detect LS processes (`Get-CimInstance Win32_Process`)
- Uses `netstat -ano` for port detection
- Uses `wmic` for PPID command line reading

### macOS / Linux
- Uses `ps aux | grep language_server` for process detection
- Uses `lsof -iTCP -sTCP:LISTEN` for port detection
- Uses `ps -p <PID> -o command=` for PPID command line reading

## Production Considerations

- **No HTTP server mode** — stdio only; one instance per MCP connection
- **In-memory task registry** — Tasks lost on restart; designed for session-scoped use
- **Self-signed TLS** — `NODE_TLS_REJECT_UNAUTHORIZED=0` is set when TLS detected
- **No rate limiting** — Each `submit_agent` creates a new LS cascade (resource-intensive); avoid spawning 10+ concurrent agents
