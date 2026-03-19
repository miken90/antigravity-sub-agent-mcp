#!/usr/bin/env node

// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Khanh Nguyen

// === Antigravity Sub-Agent MCP Server ===
// Spawns sub-agents in Antigravity IDE via cascade APIs.
// Transport: stdio (run via `command` in mcp_config.json)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { configure, isConfigured, startCascade, sendMessage } from './lib/cascade-client.js';
import { smartWait } from './lib/completion-loop.js';
import { autoDetect } from './lib/ls-detector.js';

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = (msg) => process.stderr.write(`[antigravity-sub-agent-mcp] ${msg}\n`);

// ── Model aliases ─────────────────────────────────────────────────────────────
// Maps friendly names → raw LS model IDs. Default is the IDE's own default.

// @visibleForTesting
export const DEFAULT_MODEL = 'MODEL_PLACEHOLDER_M37'; // Gemini 3.1 Pro (High)

// Built-in defaults — overridden by models.json if present
const BUILTIN_ALIASES = {
    // Gemini
    'gemini-high': 'MODEL_PLACEHOLDER_M37',
    'gemini-low': 'MODEL_PLACEHOLDER_M36',
    'gemini-flash': 'MODEL_PLACEHOLDER_M47',
    // Claude
    'claude-opus': 'MODEL_PLACEHOLDER_M26',
    'claude-sonnet': 'MODEL_PLACEHOLDER_M35',
    // GPT
    'gpt-120b': 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
};

// Load external model config if available (models.json in project root or MODEL_CONFIG_PATH env)
function loadModelAliases() {
    const configPath = process.env.MODEL_CONFIG_PATH
        || resolve(dirname(fileURLToPath(import.meta.url)), 'models.json');
    try {
        const raw = readFileSync(configPath, 'utf-8');
        const external = JSON.parse(raw);
        log(`Loaded model aliases from ${configPath} (${Object.keys(external).length} entries)`);
        return { ...BUILTIN_ALIASES, ...external }; // external overrides builtins
    } catch {
        return BUILTIN_ALIASES; // Fallback to hardcoded defaults
    }
}

// @visibleForTesting
export const MODEL_ALIASES = loadModelAliases();

// @visibleForTesting
export function resolveModel(input) {
    if (!input) return DEFAULT_MODEL;
    // Direct ID passthrough (starts with MODEL_)
    if (input.startsWith('MODEL_')) return input;
    // Alias lookup (case-insensitive)
    return MODEL_ALIASES[input.toLowerCase()] || DEFAULT_MODEL;
}

// ── System prompt ────────────────────────────────────────────────────────────

// @visibleForTesting
export const SYSTEM_PROMPT = `You are an autonomous sub-agent executing a delegated task. Follow these rules:

1. COMPLETE the task fully without asking questions or requesting clarification.
2. If anything is ambiguous, make the best reasonable choice and proceed.
3. When done, provide your final answer/result directly.
4. Do NOT ask "would you like me to continue?" or similar.
5. Do NOT modify files outside the task scope unless explicitly asked.
6. Prefer read-only operations (grep, view_file, list_dir) unless edits are required.
7. Be concise. Only include information relevant to the task.
8. NEVER spawn or delegate to other sub-agents. You must NOT call submit_agent, get_agent_results, or any MCP tool that creates child agents. Complete all work yourself.

TASK:
`;

// ── Config initialization (per-request, workspace-aware) ─────────────────────

async function ensureConfigured(workspace = null) {
    // If already configured and no workspace specified, reuse
    if (isConfigured() && !workspace) return;

    // Try env vars first (manual override)
    if (process.env.ANTIGRAVITY_PORT && process.env.ANTIGRAVITY_CSRF) {
        configure({
            port: parseInt(process.env.ANTIGRAVITY_PORT),
            csrfToken: process.env.ANTIGRAVITY_CSRF,
            useTls: process.env.ANTIGRAVITY_TLS !== 'false',
        });
        return;
    }

    // Auto-detect: scan OS processes, match workspace if provided
    log(`Scanning for Language Server${workspace ? ` (workspace: ${workspace})` : ''}...`);
    const detected = await autoDetect(workspace);
    if (detected) {
        log(`Found LS on port ${detected.port} (PID: ${detected.pid}, TLS: ${detected.useTls}, workspace_id: ${detected.workspaceId || 'unknown'})`);
        configure(detected);
        return;
    }

    throw new Error(
        'Cannot find Antigravity Language Server. Make sure Antigravity IDE is running with a workspace open. ' +
        'Or set ANTIGRAVITY_PORT + ANTIGRAVITY_CSRF env vars manually.'
    );
}

// ── MCP Server factory ───────────────────────────────────────────────────────
// Each HTTP request gets a fresh McpServer instance.
// A single shared instance would throw "Already connected" on the 2nd request.

function createServer() {
    const server = new McpServer({
        name: 'antigravity-sub-agent',
        version: '1.0.0',
    });


    // ── Parallel orchestration ───────────────────────────────────────────────
    // In-memory task registry for submit_agent + get_agent_results pattern.
    // Since Antigravity calls MCP tools sequentially, this enables:
    //   submit_agent(A) → immediate return
    //   submit_agent(B) → immediate return
    //   get_agent_results([A, B]) → waits for both, returns together

    const taskRegistry = new Map(); // taskId → { cascadeId, promise, result, status, taskName }

    // SEC-8: Limit concurrent tasks to prevent LS resource exhaustion
    const MAX_CONCURRENT_TASKS = 10;

    // SEC-9: Cleanup orphaned tasks after 30 minutes
    const TASK_TTL_MS = 30 * 60 * 1000;
    const _cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of taskRegistry) {
            if (now - entry.startedAt > TASK_TTL_MS && entry.status !== 'running') {
                taskRegistry.delete(id);
                log(`[cleanup] Evicted orphaned task ${id} (age: ${Math.round((now - entry.startedAt) / 60000)}min)`);
            }
        }
    }, 60000);
    _cleanupInterval.unref(); // Don't keep process alive for cleanup

    // Tool: submit_agent (non-blocking — returns taskId immediately)
    server.tool(
        'submit_agent',
        `Spawn an autonomous agent in Antigravity IDE. Returns a taskId INSTANTLY (does NOT wait for completion).

The agent runs as a new Cascade conversation with full codebase access — it can read files, grep, run terminal commands, and edit files. It operates fully autonomously without asking questions. Each agent consumes significant resources (new conversation + model tokens), so only delegate tasks that provide real value.

ALWAYS use this 2-step pattern:
  Step 1: Call submit_agent N times (each returns a taskId in ~1 second)
  Step 2: Call get_agent_results([taskId1, taskId2, ...]) to wait for ALL results at once

All N agents run in parallel. Write self-contained prompts — the agent has ZERO prior context.

WHEN TO USE (high-value tasks):
✅ Implement a scoped feature or bug fix (write code, run tests)
✅ Research/summarize a module, architecture, or large codebase area
✅ Run a build/test suite and report results
✅ Generate boilerplate, migrations, or repetitive code
✅ Perform multi-step analysis that requires reasoning

WHEN NOT TO USE (do it yourself — faster & cheaper):
❌ Read or view files
❌ Simple grep/search operations
❌ Single-file edits that take < 30 seconds
❌ Tasks that just collect information without transforming it

Models: gemini-high (default), gemini-low, gemini-flash, claude-opus, claude-sonnet, gpt-120b.`,
        {
            taskName: z.string().optional().describe('Short task name (3-5 words) for the conversation title'),
            task: z.string().describe('Clear task description for the sub-agent to execute autonomously'),
            model: z.string().optional().describe('Model to use. Aliases: gemini-high (default), gemini-low, gemini-flash, claude-opus, claude-sonnet, gpt-120b.'),
            timeout: z.number().optional().describe('Max wait time in seconds (default: 600)'),
            maxReplies: z.number().optional().describe('Max auto-replies if agent asks questions (default: 3)'),
            workspace: z.string().optional().describe('Workspace root path'),
        },
        async ({ taskName, task, model, timeout = 600, maxReplies = 3, workspace }) => {
            await ensureConfigured(workspace);

            // SEC-8: Reject if too many concurrent tasks
            const activeTasks = [...taskRegistry.values()].filter(e => e.status === 'running').length;
            if (activeTasks >= MAX_CONCURRENT_TASKS) {
                return {
                    content: [{ type: 'text', text: `Error: Max ${MAX_CONCURRENT_TASKS} concurrent tasks reached. Call get_agent_results first to collect finished tasks.` }],
                    isError: true,
                };
            }

            const cascadeId = await startCascade();
            const shortId = cascadeId.substring(0, 8);
            const modelId = resolveModel(model);
            log(`[submit:${shortId}] model=${modelId} task=${taskName || task.substring(0, 50)}`);

            const modelLabel = model || 'gemini-high';
            const prompt = (taskName ? `# ${taskName}\n` : '') + `[Model: ${modelLabel}]\n\n` + SYSTEM_PROMPT + task;
            await sendMessage(cascadeId, prompt, modelId);

            // Start waiting in background (not awaited here!)
            const promise = smartWait(cascadeId, {
                timeoutMs: timeout * 1000,
                maxReplies,
                onProgress: (info) => {
                    const entry = taskRegistry.get(shortId);
                    if (entry) entry.status = `${info.status || 'polling'} steps=${info.stepCount}`;
                    log(`[submit:${shortId}] ${info.status || 'polling'} steps=${info.stepCount} elapsed=${Math.round(info.elapsed / 1000)}s`);
                },
            }).then((result) => {
                const entry = taskRegistry.get(shortId);
                if (entry) {
                    entry.result = result;
                    entry.status = 'done';
                }
                log(`[submit:${shortId}] ✓ Done (steps=${result.stepCount})`);
                return result;
            }).catch((err) => {
                const entry = taskRegistry.get(shortId);
                if (entry) {
                    entry.result = { ok: false, text: err.message, stepCount: 0 };
                    entry.status = 'error';
                }
                log(`[submit:${shortId}] ✗ Error: ${err.message}`);
                return { ok: false, text: err.message, stepCount: 0 };
            });

            taskRegistry.set(shortId, {
                cascadeId,
                promise,
                result: null,
                status: 'running',
                taskName: taskName || task.substring(0, 60),
                model: model || 'gemini-high',
                startedAt: Date.now(),
            });

            return {
                content: [{
                    type: 'text',
                    text: `Task submitted.\n\n**taskId**: \`${shortId}\`\n**taskName**: ${taskName || '(unnamed)'}\n**model**: ${model || 'gemini-high'}\n\nUse \`get_agent_results\` with this taskId to retrieve the result when ready.`,
                }],
            };
        }
    );

    // Tool: get_agent_results (batch wait — waits for all submitted tasks)
    server.tool(
        'get_agent_results',
        `Collect results from submit_agent calls. Blocks until ALL tasks finish, then returns all results together.

Call this AFTER submitting all tasks via submit_agent. Pass the taskIds you received.
Note: Sometimes agents may not finish within the timeout period. In such cases, the result will be returned as is, and you may need to manually check the status of the task in the Antigravity IDE.`,
        {
            taskIds: z.array(z.string()).describe('Array of taskIds from submit_agent calls'),
        },
        async ({ taskIds }) => {
            const results = [];

            // Wait for all tasks in parallel
            const settled = await Promise.allSettled(
                taskIds.map(async (taskId) => {
                    const entry = taskRegistry.get(taskId);
                    if (!entry) {
                        return { taskId, ok: false, text: `Unknown taskId: ${taskId}` };
                    }
                    // Await the background promise
                    const result = await entry.promise;
                    return { taskId, taskName: entry.taskName, model: entry.model, ...result };
                })
            );

            for (const s of settled) {
                if (s.status === 'fulfilled') {
                    results.push(s.value);
                } else {
                    results.push({ taskId: 'unknown', ok: false, text: s.reason?.message || 'Unknown error' });
                }
            }

            // Format output
            const parts = results.map((r, i) => {
                const header = `## Task ${i + 1}: ${r.taskName || r.taskId}`;
                const meta = [`taskId: ${r.taskId}`, `model: ${r.model || '?'}`, `steps: ${r.stepCount || 0}`];
                const body = r.text || '[No response]';
                return `${header}\n_[${meta.join(' | ')}]_\n\n${body}`;
            });

            // Cleanup registry
            for (const taskId of taskIds) {
                taskRegistry.delete(taskId);
            }

            return {
                content: [{
                    type: 'text',
                    text: parts.join('\n\n---\n\n'),
                }],
            };
        }
    );

    return server;
}

// ── Start (stdio only) ───────────────────────────────────────────────────────

async function main() {
    log('Transport: stdio');
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Graceful shutdown — log active tasks and exit cleanly
    const shutdown = (signal) => {
        log(`Received ${signal}. Shutting down...`);
        try {
            server.close?.();
        } catch { /* ignore */ }
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
    log(`Fatal: ${e.message}`);
    process.exit(1);
});
