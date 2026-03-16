// Tests for lib/protobuf.js — pure encoding/decoding functions
import { describe, it, expect } from 'vitest';
import {
    encodeVarint,
    encodeStepsRequest,
    decodeBinarySteps,
    countBinarySteps,
    STEP_TYPE_MAP,
    STEP_STATUS_MAP,
    CONTENT_FIELD_MAP,
    NESTED_FIELD_MAPS,
} from '../lib/protobuf.js';
import { detectApiStartIndex } from '../lib/auto-accept.js';

// ── encodeVarint ─────────────────────────────────────────────────────────────

describe('encodeVarint', () => {
    it('encodes 0 as single byte [0x00]', () => {
        const buf = encodeVarint(0);
        expect(buf).toEqual(Buffer.from([0x00]));
    });

    it('encodes small value (1) as single byte', () => {
        const buf = encodeVarint(1);
        expect(buf).toEqual(Buffer.from([0x01]));
    });

    it('encodes 127 (max single-byte) as [0x7f]', () => {
        const buf = encodeVarint(127);
        expect(buf).toEqual(Buffer.from([0x7f]));
    });

    it('encodes 128 as two bytes [0x80, 0x01]', () => {
        const buf = encodeVarint(128);
        expect(buf).toEqual(Buffer.from([0x80, 0x01]));
    });

    it('encodes 300 as two bytes', () => {
        const buf = encodeVarint(300);
        // 300 = 0b100101100 → [0xAC, 0x02]
        expect(buf).toEqual(Buffer.from([0xac, 0x02]));
    });

    it('encodes large value (16384) as three bytes', () => {
        const buf = encodeVarint(16384);
        // 16384 = 0x4000 → [0x80, 0x80, 0x01]
        expect(buf).toEqual(Buffer.from([0x80, 0x80, 0x01]));
    });
});

// ── encodeStepsRequest ───────────────────────────────────────────────────────

describe('encodeStepsRequest', () => {
    it('produces a buffer with cascadeId, startIndex, endIndex', () => {
        const buf = encodeStepsRequest('test-id', 0, 10);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.length).toBeGreaterThan(0);

        // Field 1 (cascadeId): tag=0x0a, length=7, then "test-id"
        expect(buf[0]).toBe(0x0a); // field 1, wire type 2
        expect(buf[1]).toBe(7);    // length of "test-id"
        expect(buf.slice(2, 9).toString('utf-8')).toBe('test-id');
    });

    it('includes correct startIndex and endIndex', () => {
        const buf = encodeStepsRequest('ab', 5, 20);
        // After cascadeId: tag=0x0a, len=2, "ab" → bytes 0-3
        // startIndex: tag=0x10, varint(5) → bytes 4-5
        expect(buf[4]).toBe(0x10); // field 2, wire type 0
        expect(buf[5]).toBe(5);    // startIndex = 5
        // endIndex: tag=0x18, varint(20) → bytes 6-7
        expect(buf[6]).toBe(0x18); // field 3, wire type 0
        expect(buf[7]).toBe(20);   // endIndex = 20
    });

    it('handles empty cascadeId', () => {
        const buf = encodeStepsRequest('', 0, 0);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf[0]).toBe(0x0a);
        expect(buf[1]).toBe(0); // length = 0
    });
});

// ── Enum Maps ────────────────────────────────────────────────────────────────

describe('STEP_STATUS_MAP', () => {
    it('maps 0 to UNSPECIFIED', () => {
        expect(STEP_STATUS_MAP[0]).toBe('CORTEX_STEP_STATUS_UNSPECIFIED');
    });

    it('maps 9 to WAITING', () => {
        expect(STEP_STATUS_MAP[9]).toBe('CORTEX_STEP_STATUS_WAITING');
    });

    it('maps 3 to DONE', () => {
        expect(STEP_STATUS_MAP[3]).toBe('CORTEX_STEP_STATUS_DONE');
    });

    it('has exactly 8 entries', () => {
        expect(Object.keys(STEP_STATUS_MAP)).toHaveLength(8);
    });
});

describe('STEP_TYPE_MAP', () => {
    it('maps 21 to RUN_COMMAND', () => {
        expect(STEP_TYPE_MAP[21]).toBe('CORTEX_STEP_TYPE_RUN_COMMAND');
    });

    it('maps 5 to CODE_ACTION', () => {
        expect(STEP_TYPE_MAP[5]).toBe('CORTEX_STEP_TYPE_CODE_ACTION');
    });

    it('maps 82 to NOTIFY_USER', () => {
        expect(STEP_TYPE_MAP[82]).toBe('CORTEX_STEP_TYPE_NOTIFY_USER');
    });

    it('maps 85 to BROWSER_SUBAGENT', () => {
        expect(STEP_TYPE_MAP[85]).toBe('CORTEX_STEP_TYPE_BROWSER_SUBAGENT');
    });

    it('maps 100 to SEND_COMMAND_INPUT', () => {
        expect(STEP_TYPE_MAP[100]).toBe('CORTEX_STEP_TYPE_SEND_COMMAND_INPUT');
    });

    it('has at least 15 entries', () => {
        expect(Object.keys(STEP_TYPE_MAP).length).toBeGreaterThanOrEqual(15);
    });
});

describe('CONTENT_FIELD_MAP', () => {
    it('maps field 28 to runCommand', () => {
        expect(CONTENT_FIELD_MAP[28]).toBe('runCommand');
    });

    it('maps field 10 to codeAction', () => {
        expect(CONTENT_FIELD_MAP[10]).toBe('codeAction');
    });

    it('maps field 94 to notifyUser', () => {
        expect(CONTENT_FIELD_MAP[94]).toBe('notifyUser');
    });
});

describe('NESTED_FIELD_MAPS', () => {
    it('has runCommand with commandLine field', () => {
        expect(NESTED_FIELD_MAPS.runCommand[23]).toBe('commandLine');
    });

    it('has notifyUser with notificationContent field', () => {
        expect(NESTED_FIELD_MAPS.notifyUser[2]).toBe('notificationContent');
    });

    it('has plannerResponse with response field', () => {
        expect(NESTED_FIELD_MAPS.plannerResponse[1]).toBe('response');
    });

    it('has at least 10 content type mappings', () => {
        expect(Object.keys(NESTED_FIELD_MAPS).length).toBeGreaterThanOrEqual(10);
    });
});

// ── decodeBinarySteps / countBinarySteps ─────────────────────────────────────

describe('decodeBinarySteps', () => {
    it('returns empty array for empty buffer', () => {
        const result = decodeBinarySteps(Buffer.alloc(0));
        expect(result).toEqual([]);
    });

    it('returns empty array for invalid protobuf', () => {
        const result = decodeBinarySteps(Buffer.from([0xff, 0xff]));
        expect(result).toEqual([]);
    });
});

describe('countBinarySteps', () => {
    it('returns 0 for empty buffer', () => {
        expect(countBinarySteps(Buffer.alloc(0))).toBe(0);
    });
});

// ── detectApiStartIndex ──────────────────────────────────────────────────────

describe('detectApiStartIndex', () => {
    it('returns requestedFrom when steps match expected range', () => {
        // Requested 5 steps (from=10, range=5), got 5 → started at 10
        expect(detectApiStartIndex(5, 5, 10)).toBe(10);
    });

    it('returns 0 when more steps than expected (API bug)', () => {
        // Requested 5 steps, got 15 → API started at 0
        expect(detectApiStartIndex(15, 5, 10)).toBe(0);
    });

    it('returns requestedFrom when fewer steps (cascade not done)', () => {
        expect(detectApiStartIndex(3, 5, 10)).toBe(10);
    });
});
