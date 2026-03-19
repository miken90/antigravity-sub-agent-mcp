# Code Standards

## Language & Runtime

- **JavaScript (ESM)** — All files use `import`/`export` syntax, `package.json` has `"type": "module"`
- **Node.js 18+** — Uses `fetch()` (global), `AbortSignal.timeout()`, `process.ppid`
- No TypeScript, no transpilation, no bundler

## Project Conventions

### File Organization

```
index.js          → Entry point, MCP server, tool definitions
lib/              → All internal modules (flat, no nesting)
docs/             → Internal architecture documentation
```

- One module per concern: detection, client, polling, auto-accept, protobuf
- No shared state between modules except `cascade-client.js` (holds connection config as module-level `_config`)

### Naming

| Element | Convention | Example |
|---|---|---|
| Files | kebab-case | `cascade-client.js`, `auto-accept.js` |
| Functions | camelCase | `autoDetect()`, `smartWait()`, `buildInteraction()` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_MODEL`, `MAX_POLL_DURATION_MS` |
| Enums/Maps | UPPER_SNAKE_CASE keys | `STEP_TYPE_MAP`, `STEP_STATUS_MAP` |
| Private fns | underscore prefix or module-scoped | `_config`, `_statusLog` |

### Exports

- Named exports only (no default exports)
- Public API functions are `export`-ed; internal helpers stay module-scoped
- Re-export aliases where needed: `export { waitForCompletion as smartWait }`

### Error Handling

- **LS API errors**: Caught per-poll iteration, increment `idlePollCount`, retry
- **Streaming RPCs**: ECONNRESET / socket-hang-up treated as success (LS closes stream after processing)
- **Fire-and-forget**: Resolves with `{ ok: false, error }` instead of throwing — caller decides
- **Fatal errors**: Only in `main()` — logs to stderr, exits with code 1

### Logging

- All logs go to **stderr** via `process.stderr.write()` — stdout reserved for MCP stdio transport
- Module-scoped `log()` functions with prefixed tags: `[ls-detector]`, `[completion-loop]`, `[auto-accept]`, `[cascade-client]`
- Short cascade IDs in logs: `cascadeId.substring(0, 8)`

### Dependencies

- **Minimal**: Only 3 runtime dependencies
- **Dev dependencies**: Uses `vitest` for the test suite
- **No `.proto` files** — protobuf encoding/decoding done with hand-written field maps

### Testing Conventions

- Entire test suite is written using `vitest`
- Tests are colocated in the `tests/` directory alongside source definitions
- Coverage spans components like model resolution, LS detection, client logic, polling, and protobuf encoding

### Code Style

- No semicolons enforced (uses semicolons by convention)
- Single quotes for strings
- 4-space indentation
- Arrow functions for callbacks and short helpers
- Template literals for string interpolation
- `const` by default, `let` only when reassignment needed

## API Design Patterns

### Connect Protocol

All LS communication uses Connect Protocol (gRPC-compatible over HTTP):
- JSON body: `Content-Type: application/json`
- Binary body: `Content-Type: application/proto`
- Required headers: `Connect-Protocol-Version: 1`, `X-Codeium-Csrf-Token: <token>`

### State Machine

Cascade statuses follow a state machine:
```
(start) → RUNNING → COMPLETED / FAILED / CANCELLED / ERROR
                  → WAITING_FOR_USER → (auto-accept) → RUNNING
                  → IDLE (treated as completed)
                  → (disappears from API → treated as completed)
```

### Fallback Chains

Multiple fallback strategies used throughout:
1. **Detection**: PPID → process scan + workspace match → first valid instance
2. **API**: JSON → binary protobuf (for step pagination)
3. **File paths**: JSON field extraction → `metadata.toolCall.argumentsJson` → aggressive binary field extraction
4. **Auto-accept**: Typed interaction payload → generic accept → question auto-reply
