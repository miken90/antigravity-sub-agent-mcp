# Codebase Summary

## Overview

| Metric | Value |
|---|---|
| Language | JavaScript (ESM) |
| Total Source Files | 6 |
| Total LOC (source) | ~1,317 |
| Dependencies | 3 (`@modelcontextprotocol/sdk`, `protobufjs`, `zod`) |
| MCP Tools | 2 (`submit_agent`, `get_agent_results`) |
| License | MIT |

## File Map

```
antigravity-sub-agent-mcp/          (root)
├── index.js               275 LOC  MCP server, tool definitions, model aliases
├── lib/
│   ├── ls-detector.js     278 LOC  LS process discovery (PPID + scan + port probe)
│   ├── auto-accept.js     277 LOC  WAITING step detection + interaction payloads
│   ├── protobuf.js        294 LOC  Binary protobuf encode/decode with field maps
│   ├── completion-loop.js 252 LOC  Poll orchestration, stall detection, result extraction
│   └── cascade-client.js  241 LOC  HTTP client (JSON, streaming, binary, fire-and-forget)
├── docs/                           Internal architecture documentation
│   ├── architecture.md             System diagram + request flow
│   ├── auto-accept.md             Step type handling details
│   ├── cascade-client.md          API function reference
│   └── protobuf.md                Binary protocol details
├── package.json                    Project config (ESM, Node 18+)
├── README.md                       User-facing documentation
├── CHANGELOG.md                    Release history
├── CONTRIBUTING.md                 Contribution guide
├── CODE_OF_CONDUCT.md              Contributor Covenant
└── LICENSE                         MIT License
```

## Module Responsibilities

### `index.js` — MCP Server Entry Point
- Creates `McpServer` instance with stdio transport
- Registers 2 tools: `submit_agent` (non-blocking) and `get_agent_results` (batch wait)
- Manages in-memory task registry (`Map<taskId, {cascadeId, promise, result, status}>`)
- Resolves model aliases (e.g., `gemini-high` → `MODEL_PLACEHOLDER_M37`)
- Injects system prompt forbidding recursive sub-agent spawning

### `lib/ls-detector.js` — Language Server Discovery
- **PPID detection**: Reads parent process command line for `--csrf_token` and `--workspace_id`
- **Process scan**: PowerShell (Win) or `ps aux` (Unix) to find `language_server` processes
- **Port detection**: `netstat` (Win) or `lsof` (Unix) to find listening ports
- **API probe**: HTTPS then HTTP on each port, hitting `GetUserStatus` endpoint
- **Workspace matching**: Converts filesystem paths to LS workspace IDs for multi-instance targeting

### `lib/cascade-client.js` — HTTP Client
- 4 transport methods: `callApi` (JSON), `callApiStream` (streaming), `callApiFireAndForget` (interaction), `callApiBinary` (protobuf)
- Public API: `startCascade`, `sendMessage`, `getStatus`, `getSteps`, `handleInteraction`, `acceptAction`
- Handles Connect Protocol headers (`Connect-Protocol-Version`, `X-Codeium-Csrf-Token`)
- Treats ECONNRESET/socket-hang-up as success for streaming RPCs

### `lib/completion-loop.js` — Poll Orchestration
- Polls `getStatus()` every 2s until terminal state or timeout
- Auto-accepts WAITING steps via `autoAcceptWaitingStep()`
- Detects stalled-running cascades (RUNNING + no step progress for 3+ polls)
- Auto-replies to agent questions (up to `maxReplies` times)
- Status-aware stall thresholds: 60s for active agents, 30s for agents with no steps
- Extracts final text from NOTIFY_USER, PLANNER_RESPONSE, or TASK_BOUNDARY steps

### `lib/auto-accept.js` — Interaction Builder
- Handles 7+ step types: RUN_COMMAND, CODE_ACTION, VIEW_FILE, LIST_DIRECTORY, SEARCH, SEND_COMMAND_INPUT, BROWSER_SUBAGENT
- Multi-fallback file path extraction (JSON fields → metadata → binary protobuf fields)
- Debounce mechanism (15s expiry) prevents double-accepting same step
- Binary protobuf fallback when JSON API misses WAITING steps

### `lib/protobuf.js` — Binary Protocol
- Hand-written encoder (`encodeStepsRequest`) and decoder (`decodeBinarySteps`) — no `.proto` files
- 3 enum maps: step status (8 values), step type (20+ values), content fields (16 mappings)
- Nested field maps for 15 content types (runCommand, codeAction, notifyUser, etc.)
- Generic decoder with string-vs-nested heuristic (>90% printable bytes = string)
- Workaround for LS `startIndex` bug via `detectApiStartIndex()`

## Data Flow

```
Main Agent → [MCP stdio] → index.js
  → ls-detector.js → auto-detect LS port + CSRF
  → cascade-client.js → StartCascade + SendUserCascadeMessage
  → completion-loop.js → poll getStatus() every 2s
    → auto-accept.js → handle WAITING steps
      → protobuf.js → binary fallback if JSON API fails
  → extract result → [MCP stdio] → Main Agent
```
