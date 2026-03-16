// Tests for lib/ls-detector.js — process parsing, workspace ID matching
import { describe, it, expect } from 'vitest';
import { parseProcessOutput, pathToWorkspaceId, workspaceIdMatchesPath } from '../lib/ls-detector.js';

// ── parseProcessOutput ───────────────────────────────────────────────────────

describe('parseProcessOutput — Windows format', () => {
    it('parses ProcessId + CommandLine blocks', () => {
        const stdout = [
            'ProcessId   : 12345',
            'CommandLine : language_server.exe --csrf_token abcdef12-3456-7890-abcd-ef1234567890 --workspace_id file_Users_test',
            '',
            'ProcessId   : 67890',
            'CommandLine : language_server.exe --csrf_token 11111111-2222-3333-4444-555555555555 --workspace_id file_Another',
        ].join('\r\n');

        const result = parseProcessOutput(stdout);
        expect(result).toHaveLength(2);
        expect(result[0].pid).toBe('12345');
        expect(result[0].csrfToken).toBe('abcdef12-3456-7890-abcd-ef1234567890');
        expect(result[0].workspaceId).toBe('file_Users_test');
        expect(result[1].pid).toBe('67890');
    });

    it('handles block without workspace_id', () => {
        const stdout = [
            'ProcessId   : 99999',
            'CommandLine : language_server.exe --csrf_token aabb1122-3344-5566-7788-99aabbccddee',
        ].join('\r\n');

        const result = parseProcessOutput(stdout);
        expect(result).toHaveLength(1);
        expect(result[0].workspaceId).toBeNull();
    });

    it('skips blocks without csrf_token', () => {
        const stdout = [
            'ProcessId   : 11111',
            'CommandLine : unrelated_process.exe --some-flag',
        ].join('\r\n');

        const result = parseProcessOutput(stdout);
        expect(result).toHaveLength(0);
    });

    it('returns empty for empty string', () => {
        expect(parseProcessOutput('')).toHaveLength(0);
    });
});

// parseProcessOutput uses os.platform() internally to decide the parsing format.
// On Windows, it always uses the Windows block format. Unix tests only run on non-Windows.
const isWindows = process.platform === 'win32';
const describeUnix = isWindows ? describe.skip : describe;

describeUnix('parseProcessOutput — Unix format', () => {
    it('parses ps aux lines', () => {
        const stdout = [
            'user  12345  0.5  1.2  12345 67890 ?  Sl  10:00  0:05 /path/language_server --csrf_token aabbccdd-1122-3344-5566-778899aabbcc --workspace_id file_home_user_project',
        ].join('\n');

        const result = parseProcessOutput(stdout);
        expect(result).toHaveLength(1);
        expect(result[0].pid).toBe('12345');
        expect(result[0].csrfToken).toBe('aabbccdd-1122-3344-5566-778899aabbcc');
        expect(result[0].workspaceId).toBe('file_home_user_project');
    });

    it('parses multiple lines', () => {
        const stdout = [
            'user  111  0.0  0.0  0 0 ?  S  00:00  0:00 /srv/ls --csrf_token 11111111-1111-1111-1111-111111111111',
            'user  222  0.0  0.0  0 0 ?  S  00:00  0:00 /srv/ls --csrf_token 22222222-2222-2222-2222-222222222222 --workspace_id file_ws2',
        ].join('\n');

        const result = parseProcessOutput(stdout);
        expect(result).toHaveLength(2);
        expect(result[0].workspaceId).toBeNull();
        expect(result[1].workspaceId).toBe('file_ws2');
    });
});

// ── pathToWorkspaceId ────────────────────────────────────────────────────────

describe('pathToWorkspaceId', () => {
    it('converts Unix path to workspace ID', () => {
        expect(pathToWorkspaceId('/Users/foo/my-project')).toBe('file_Users_foo_my_project');
    });

    it('converts root-relative path', () => {
        expect(pathToWorkspaceId('/home/user/code')).toBe('file_home_user_code');
    });

    it('strips trailing slashes', () => {
        expect(pathToWorkspaceId('/tmp/test/')).toBe('file_tmp_test');
    });

    it('converts hyphens to underscores', () => {
        expect(pathToWorkspaceId('/my-cool-project')).toBe('file_my_cool_project');
    });

    it('returns null for null input', () => {
        expect(pathToWorkspaceId(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(pathToWorkspaceId(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(pathToWorkspaceId('')).toBeNull();
    });
});

// ── workspaceIdMatchesPath ───────────────────────────────────────────────────

describe('workspaceIdMatchesPath', () => {
    it('matches exact workspace ID', () => {
        expect(workspaceIdMatchesPath('file_Users_foo_project', '/Users/foo/project')).toBe(true);
    });

    it('matches with prefix (workspace is parent)', () => {
        // workspaceId is parent of target path
        expect(workspaceIdMatchesPath('file_Users_foo', '/Users/foo/project')).toBe(true);
    });

    it('matches with prefix (target is parent)', () => {
        expect(workspaceIdMatchesPath('file_Users_foo_project_sub', '/Users/foo/project')).toBe(true);
    });

    it('returns false for non-matching paths', () => {
        expect(workspaceIdMatchesPath('file_Users_bar', '/Users/foo/project')).toBe(false);
    });

    it('returns false when workspaceId is null', () => {
        expect(workspaceIdMatchesPath(null, '/Users/foo')).toBe(false);
    });

    it('returns false when targetPath is null', () => {
        expect(workspaceIdMatchesPath('file_Users_foo', null)).toBe(false);
    });

    it('returns false when both are null', () => {
        expect(workspaceIdMatchesPath(null, null)).toBe(false);
    });
});
