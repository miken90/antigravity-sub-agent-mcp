# System Architecture

## High-Level Overview

The Antigravity Sub-Agent MCP Server is a **stdio-based MCP server** that bridges AI agents with Antigravity IDE's Language Server (LS) API. It enables spawning autonomous sub-agents that execute tasks with full codebase access.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Main AI Agent                                │
│                  (Claude, Gemini, GPT, etc.)                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ stdin/stdout (MCP JSON-RPC)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  index.js — MCP Server                                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐           │
│  │  submit_agent      │  │  get_agent_results           │           │
│  │  (non-blocking)    │  │  (batch wait + collect)      │           │
│  └────────┬───────────┘  └──────────┬───────────────────┘           │
│           │                         │                               │
│  ┌────────▼─────────────────────────▼───────────────────┐           │
│  │         Task Registry (Map<taskId, Entry>)           │           │
│  │         In-memory, 30-minute TTL cleanup             │           │
│  └──────────────────────┬───────────────────────────────┘           │
└─────────────────────────┼───────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────┐  ┌──────────────┐  ┌─────────────────┐
│ ls-detector │  │cascade-client│  │ completion-loop  │
│             │  │              │  │                  │
│ PPID detect │  │ startCascade │  │ poll getStatus() │
│ Process scan│  │ sendMessage  │  │ stall detection  │
│ Port probe  │  │ getSteps     │  │ result extract   │
│ API verify  │  │ handleInterac│  │                  │
└─────────────┘  └──────┬───────┘  └────────┬─────────┘
                        │                    │
                        │           ┌────────▼─────────┐
                        │           │  auto-accept.js  │
                        │           │                  │
                        │           │ Build interaction │
                        │           │ payloads for      │
                        │           │ WAITING steps     │
                        │           └────────┬─────────┘
                        │                    │
                        │           ┌────────▼─────────┐
                        │           │  protobuf.js     │
                        │           │                  │
                        │           │ Binary encode/   │
                        │           │ decode fallback  │
                        │           └──────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │  Antigravity Language Server │
         │  (localhost:PORT, TLS/HTTP)  │
         │                              │
         │  Connect Protocol (gRPC)     │
         │  • StartCascade              │
         │  • SendUserCascadeMessage    │
         │  • GetAllCascadeTrajectories │
         │  • GetCascadeTrajectorySteps │
         │  • HandleCascadeUserInteract │
         └──────────────────────────────┘
```

## Component Interactions

### 1. LS Detection Flow

```
autoDetect(workspace?)
  ├─ detectFromParentProcess()          // PPID → read cmdline → extract CSRF + workspace_id
  │   ├─ detectPorts(ppid)              // netstat/lsof → listening ports
  │   └─ findApiPort(ports, csrf)       // HTTPS probe → HTTP fallback
  │
  └─ detectLanguageServers()            // PowerShell/ps aux → find LS processes
      ├─ parseProcessOutput()           // Extract PID, CSRF, workspace_id
      ├─ detectPorts(pid)               // For each instance
      ├─ findApiPort(ports, csrf)       // Probe each
      └─ workspaceIdMatchesPath()       // Match target workspace
```

### 2. Task Execution Flow

```
submit_agent(task, model, ...)
  │
  ├─ ensureConfigured()                 // Auto-detect LS if needed
  ├─ startCascade()                     // Create new conversation
  ├─ sendMessage(cascadeId, prompt)     // Send system prompt + task
  ├─ Register in taskRegistry           // { cascadeId, promise, status }
  │
  └─ Background: smartWait(cascadeId)
      │
      └─ Poll loop (every 2s):
          ├─ getStatus() → stepCount, status
          ├─ Terminal status → extractResult()
          ├─ IDLE → extractResult()
          ├─ Status gone + had steps → extractResult()
          │
          ├─ WAITING_FOR_USER → autoAcceptWaitingStep()
          │   ├─ getSteps() → find WAITING step
          │   ├─ buildInteraction() → typed payload
          │   ├─ handleInteraction() → fire-and-forget
          │   └─ Binary fallback if JSON missed it
          │
          ├─ Stalled RUNNING (3+ idle polls) → check for hidden WAITING
          ├─ Question detected → auto-reply (up to maxReplies)
          └─ Stall timeout → extractResult() with reason
```

### 3. Result Collection Flow

```
get_agent_results([taskId1, taskId2, ...])
  │
  ├─ Promise.allSettled(taskIds.map(await entry.promise))
  ├─ Format results with headers, metadata
  ├─ Cleanup taskRegistry
  └─ Return combined markdown text
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **stdio transport only** | MCP server is spawned by LS as child process; stdio is natural fit |
| **In-memory task registry** | No persistence needed — tasks live within single server session |
| **PPID-first detection** | Most accurate: LS is literally the parent process |
| **Binary protobuf fallback** | LS JSON API has pagination bug (~598 step cap) |
| **Fire-and-forget for interactions** | LS closes stream after processing; ECONNRESET = success |
| **Debounced auto-accept** | Prevents double-accepting same step during poll race conditions |
| **System prompt injection** | Prevents recursive sub-agent spawning (resource exhaustion) |
| **No `.proto` files** | Hand-written field maps avoid proto compilation dependency |

## Security Model

- **CSRF tokens**: Extracted from LS command-line args, sent in every request
- **TLS**: LS uses self-signed certs → `NODE_TLS_REJECT_UNAUTHORIZED=0`
- **Localhost only**: All communication is `127.0.0.1` / `localhost`
- **No external network**: Server makes zero outbound internet requests
- **Sub-agent sandboxing**: System prompt constrains behavior; auto-accept grants full local access by design
- **Security Blocklist**: Dangerous commands (e.g., `rm -rf`, `format`) are blocked by the auto-accept logic
