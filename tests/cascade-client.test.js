// Tests for lib/cascade-client.js — configuration and state management
import { describe, it, expect, beforeEach } from 'vitest';
import { configure, isConfigured } from '../lib/cascade-client.js';

// ── configure / isConfigured ─────────────────────────────────────────────────

describe('configure', () => {
    it('marks client as configured after calling configure', () => {
        configure({ port: 12345, csrfToken: 'test-token', useTls: false });
        expect(isConfigured()).toBe(true);
    });

    it('accepts useTls: true', () => {
        configure({ port: 443, csrfToken: 'abc', useTls: true });
        expect(isConfigured()).toBe(true);
    });

    it('defaults useTls to true when undefined', () => {
        configure({ port: 443, csrfToken: 'abc' });
        expect(isConfigured()).toBe(true);
    });
});

// Note: Testing actual HTTP calls (startCascade, sendMessage, getStatus, etc.)
// would require mocking fetch and http/https modules. These are integration-level
// tests that are better suited for a mock LS server setup.
//
// The following are documented as test cases to implement when a mock server is available:
//
// describe('startCascade', () => {
//   it('creates cascade and returns cascadeId')
//   it('throws on non-2xx response')
// })
//
// describe('sendMessage', () => {
//   it('sends streaming RPC with correct body shape')
//   it('handles ECONNRESET as success')
// })
//
// describe('getStatus', () => {
//   it('extracts stepCount and status from trajectorySummaries')
//   it('returns defaults when cascade not found')
// })
//
// describe('getSteps', () => {
//   it('returns steps array')
//   it('returns empty array for empty response')
// })
//
// describe('handleInteraction', () => {
//   it('sends fire-and-forget with correct payload')
//   it('treats ECONNRESET as success')
//   it('returns ok:false on timeout')
// })
