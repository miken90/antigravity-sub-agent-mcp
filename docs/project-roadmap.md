# Project Roadmap

## Current State: v1.0.0 (Stable)

Core functionality complete. 2 MCP tools (`submit_agent`, `get_agent_results`), full auto-accept, LS auto-detection, binary protobuf fallback.

---

## Phase 1: Reliability & Observability (v1.1)

### 1.1 Structured Logging
- Replace `process.stderr.write()` with configurable log levels (DEBUG, INFO, WARN, ERROR)
- Add `LOG_LEVEL` env var support
- JSON log format option for machine parsing

### 1.2 Retry Logic
- Exponential backoff for transient LS API failures
- Distinguish retriable (network timeout) from non-retriable (auth failure)

### 1.3 Health Check Tool
- New `check_health` MCP tool: verify LS connectivity, return port/TLS/workspace info
- Useful for debugging configuration issues

### 1.4 Task Status Tool
- New `get_task_status` MCP tool: check progress of submitted tasks without blocking
- Return current step count, status, elapsed time

---

## Phase 2: Developer Experience (v1.2)

### 2.1 Custom System Prompts
- Allow `systemPrompt` parameter in `submit_agent` to override default instructions
- Merge behavior: custom prompt + always-included safety rules

### 2.2 Context Passing
- Optional `context` parameter for passing structured data to sub-agents
- Injected after system prompt, before task description

### 2.3 TypeScript Types
- Generate `.d.ts` declarations for library consumers
- JSDoc comments on all public APIs

### 2.4 Test Suite (Completed)
- Unit tests for `buildInteraction()`, `protobuf` encode/decode, `pathToWorkspaceId()`
- Integrated `vitest` as the primary dev dependency
- Mock LS API endpoints for integration testing

---

## Phase 3: Scalability (v2.0)

### 3.1 HTTP/SSE Transport
- Add optional HTTP server mode alongside stdio
- Enable remote agent orchestration

### 3.2 Callback/Streaming Results
- Progressive result streaming via MCP notifications
- Real-time step-by-step visibility

### 3.3 Token Usage Tracking
- Extract and report model token consumption per cascade
- Cost estimation via model pricing tables

### 3.4 Conversation History
- Pass previous cascade results as context to new sub-agents
- Enable multi-turn agent workflows

---

## Future Ideas

- **Agent templates**: Pre-built prompts for common tasks (code review, testing, docs)
- **Priority queues**: Rate limit concurrent cascades to prevent LS overload
- **Workspace isolation**: Restrict sub-agent file access to specific directories
- **MCP resource providers**: Expose cascade history as MCP resources
