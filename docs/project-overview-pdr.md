# Antigravity Sub-Agent MCP Server — Project Overview & PDR

## Product Vision

Enable main AI agents (Claude, Gemini, GPT) to **delegate tasks to autonomous sub-agents** running inside Antigravity IDE. The server bridges MCP (Model Context Protocol) with the IDE's Language Server API, providing full lifecycle management for spawned sub-agents.

## Problem Statement

AI agents operating via MCP lack the ability to spawn parallel workers within Antigravity IDE. Tasks that could be parallelized (research, code generation, testing) run sequentially, wasting time. Additionally, sub-agents require manual approval for every tool action (file writes, terminal commands, browser actions), making unattended operation impossible.

## Solution

A **stdio MCP server** that:
1. Exposes 2 tools: `submit_agent` (non-blocking spawn) and `get_agent_results` (batch wait)
2. Auto-detects the running Antigravity Language Server (via PPID or process scan)
3. Creates cascades (conversations) via the LS HTTP API
4. Polls for completion with smart stall detection
5. Auto-accepts all WAITING tool actions (commands, file writes, reads, browser)
6. Extracts and returns the final text result

## Target Users

- AI agent developers building multi-agent orchestration on Antigravity IDE
- Power users delegating complex tasks from a main agent to parallel sub-agents

## Technical Constraints

| Constraint | Detail |
|---|---|
| Runtime | Node.js 18+ (ESM) |
| Transport | stdio only (no HTTP server) |
| Protocol | MCP SDK v1.12+ |
| LS API | Connect Protocol (gRPC-over-HTTP) with JSON + binary protobuf |
| TLS | Self-signed certs (rejectUnauthorized disabled) |
| Auth | CSRF token from LS command-line args |
| Platform | Windows, macOS, Linux |

## Core Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework (tool registration, stdio transport) |
| `protobufjs` | Binary protobuf encoding/decoding for LS API fallback |
| `zod` | Schema validation for MCP tool parameters |

## Success Metrics

- Sub-agent spawns in < 2s (cascade creation + message send)
- Auto-accept handles all known step types without manual intervention
- Parallel tasks (N agents) complete in ~1× single-agent time (true parallelism)
- Stall detection catches stuck cascades within 60s

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LS JSON API ignores pagination | Steps > 598 are lost | Binary protobuf fallback |
| LS reports RUNNING when actually WAITING | Cascade stalls | Stalled-running detection (3+ idle polls → check steps) |
| Multiple LS instances on same machine | Wrong instance targeted | PPID detection (primary) + workspace path matching (fallback) |
| Sub-agent spawns recursive sub-agents | Resource exhaustion | System prompt explicitly forbids sub-agent delegation |

## Non-Goals (v1)

- HTTP/SSE transport (stdio only for now)
- Conversation history / context passing between sub-agents
- Custom system prompts per invocation
- Token usage tracking or cost estimation
