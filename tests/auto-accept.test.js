// Tests for lib/auto-accept.js — buildInteraction() all step type branches + command blocklist
import { describe, it, expect } from 'vitest';
import { buildInteraction, isBlockedCommand, BLOCKED_COMMANDS } from '../lib/auto-accept.js';

const TRAJ_ID = 'test-trajectory-id';

// ── Null / edge cases ────────────────────────────────────────────────────────

describe('buildInteraction — edge cases', () => {
    it('returns null when trajectoryId is missing', () => {
        expect(buildInteraction(null, 0, {})).toBeNull();
    });

    it('returns null when stepIndex is undefined', () => {
        expect(buildInteraction(TRAJ_ID, undefined, {})).toBeNull();
    });

    it('returns null when step is null', () => {
        expect(buildInteraction(TRAJ_ID, 0, null)).toBeNull();
    });

    it('returns null when step is missing', () => {
        expect(buildInteraction(TRAJ_ID, 0)).toBeNull();
    });
});

// ── RUN_COMMAND ──────────────────────────────────────────────────────────────

describe('buildInteraction — RUN_COMMAND', () => {
    it('builds runCommand payload with exact command', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
            runCommand: { commandLine: 'npm test' },
        };
        const result = buildInteraction(TRAJ_ID, 5, step);
        expect(result).toEqual({
            trajectoryId: TRAJ_ID,
            stepIndex: 5,
            runCommand: {
                confirm: true,
                proposedCommandLine: 'npm test',
                submittedCommandLine: 'npm test',
            },
        });
    });

    it('uses step.runCommand.command fallback', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
            runCommand: { command: 'ls -la' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.runCommand.proposedCommandLine).toBe('ls -la');
    });

    it('handles empty command', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
            runCommand: {},
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.runCommand.proposedCommandLine).toBe('');
    });
});

// ── CODE_ACTION ──────────────────────────────────────────────────────────────

describe('buildInteraction — CODE_ACTION', () => {
    it('builds filePermission with targetFile', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: { targetFile: '/home/user/file.js' },
        };
        const result = buildInteraction(TRAJ_ID, 3, step);
        expect(result.filePermission).toEqual({
            allow: true,
            scope: 'PERMISSION_SCOPE_ONCE',
            absolutePathUri: '/home/user/file.js',
        });
    });

    it('uses filePath as fallback', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: { filePath: '/tmp/test.txt' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('/tmp/test.txt');
    });

    it('falls back to metadata.toolCall.argumentsJson for TargetFile', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: {},
            metadata: {
                toolCall: {
                    argumentsJson: JSON.stringify({ TargetFile: '/app/src/main.js' }),
                },
            },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('/app/src/main.js');
    });

    it('falls back to AbsolutePath from metadata', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: {},
            metadata: {
                toolCall: {
                    argumentsJson: JSON.stringify({ AbsolutePath: '/app/config.json' }),
                },
            },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('/app/config.json');
    });

    it('falls back to binary field 25 (Windows path)', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: { '25': 'D:\\Projects\\file.js' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('D:\\Projects\\file.js');
    });

    it('falls back to codeAction.confirm when no filePath found', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: {},
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.codeAction).toEqual({ confirm: true });
    });
});

// ── VIEW_FILE / LIST_DIRECTORY / SEARCH ──────────────────────────────────────

describe('buildInteraction — read-only operations', () => {
    it('handles VIEW_FILE with absolutePathUri', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_VIEW_FILE',
            viewFile: { absolutePathUri: 'file:///tmp/test.txt' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.allow).toBe(true);
        expect(result.filePermission.absolutePathUri).toBe('file:///tmp/test.txt');
    });

    it('handles VIEW_FILE with filePermissionRequest fallback', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_VIEW_FILE',
            viewFile: { filePermissionRequest: { absolutePathUri: 'file:///app/f.js' } },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('file:///app/f.js');
    });

    it('handles LIST_DIRECTORY', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_LIST_DIRECTORY',
            listDirectory: { directoryPathUri: '/home/user/project' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.allow).toBe(true);
    });

    it('handles SEARCH with metadata fallback', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_SEARCH',
            metadata: {
                toolCall: {
                    argumentsJson: JSON.stringify({ SearchPath: '/app/src' }),
                },
            },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toContain('app');
    });

    it('handles READ_URL_CONTENT with Url from metadata', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_READ_URL_CONTENT',
            metadata: {
                toolCall: {
                    argumentsJson: JSON.stringify({ Url: 'https://example.com' }),
                },
            },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        // URL gets file:// prepended since it doesn't start with file://
        expect(result.filePermission).toBeDefined();
    });

    it('uses confirm fallback when no path found', () => {
        const step = { type: 'CORTEX_STEP_TYPE_VIEW_FILE', viewFile: {} };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.confirm).toBe(true);
    });
});

// ── SEND_COMMAND_INPUT ───────────────────────────────────────────────────────

describe('buildInteraction — SEND_COMMAND_INPUT', () => {
    it('builds sendCommandInput payload', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT',
            sendCommandInput: { input: 'y\n' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.sendCommandInput).toEqual({
            confirm: true,
            proposedInput: 'y\n',
            submittedInput: 'y\n',
        });
    });

    it('handles empty input', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT',
            sendCommandInput: {},
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.sendCommandInput.proposedInput).toBe('');
    });
});

// ── BROWSER_SUBAGENT ─────────────────────────────────────────────────────────

describe('buildInteraction — BROWSER_SUBAGENT', () => {
    it('builds browserAction confirm', () => {
        const step = { type: 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT' };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.browserAction).toEqual({ confirm: true });
    });

    it('handles OPEN_BROWSER_URL', () => {
        const step = { type: 'CORTEX_STEP_TYPE_OPEN_BROWSER_URL' };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.browserAction).toEqual({ confirm: true });
    });

    it('handles BROWSER_ACTION', () => {
        const step = { type: 'CORTEX_STEP_TYPE_BROWSER_ACTION' };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.browserAction).toEqual({ confirm: true });
    });
});

// ── Unknown step types ───────────────────────────────────────────────────────

describe('buildInteraction — unknown types', () => {
    it('uses filePermission for unknown type with metadata path', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_SOMETHING_NEW',
            metadata: {
                toolCall: {
                    argumentsJson: JSON.stringify({ TargetFile: '/tmp/new.js' }),
                },
            },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('/tmp/new.js');
    });

    it('uses confirm for unknown type with no file path', () => {
        const step = { type: 'CORTEX_STEP_TYPE_UNKNOWN_999' };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.confirm).toBe(true);
    });

    it('uses codeAction.targetFile for unknown type', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_WEIRD',
            codeAction: { targetFile: '/opt/file.rs' },
        };
        const result = buildInteraction(TRAJ_ID, 0, step);
        expect(result.filePermission.absolutePathUri).toBe('/opt/file.rs');
    });
});

// ── Blocked commands (SEC-7) ─────────────────────────────────────────────────

describe('isBlockedCommand', () => {
    it('blocks rm -rf /', () => {
        expect(isBlockedCommand('rm -rf /')).toBe(true);
    });

    it('blocks rm -rf /usr', () => {
        expect(isBlockedCommand('rm -rf /usr')).toBe(true);
    });

    it('blocks format command', () => {
        expect(isBlockedCommand('format C:')).toBe(true);
    });

    it('blocks shutdown', () => {
        expect(isBlockedCommand('shutdown -h now')).toBe(true);
    });

    it('blocks reboot', () => {
        expect(isBlockedCommand('reboot')).toBe(true);
    });

    it('blocks mkfs', () => {
        expect(isBlockedCommand('mkfs.ext4 /dev/sda1')).toBe(true);
    });

    it('allows safe commands', () => {
        expect(isBlockedCommand('npm install')).toBe(false);
        expect(isBlockedCommand('ls -la')).toBe(false);
        expect(isBlockedCommand('git status')).toBe(false);
        expect(isBlockedCommand('rm -rf node_modules')).toBe(false);  // not root-level
        expect(isBlockedCommand('cat /etc/hosts')).toBe(false);
    });

    it('allows rm in workspace directories', () => {
        expect(isBlockedCommand('rm -rf ./build')).toBe(false);
        expect(isBlockedCommand('rm -rf dist')).toBe(false);
    });

    it('has at least 5 patterns', () => {
        expect(BLOCKED_COMMANDS.length).toBeGreaterThanOrEqual(5);
    });
});

describe('buildInteraction — blocked RUN_COMMAND', () => {
    it('returns null for blocked command', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
            runCommand: { commandLine: 'rm -rf /' },
        };
        expect(buildInteraction(TRAJ_ID, 0, step)).toBeNull();
    });

    it('allows safe command through', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
            runCommand: { commandLine: 'npm test' },
        };
        expect(buildInteraction(TRAJ_ID, 0, step)).not.toBeNull();
    });
});
