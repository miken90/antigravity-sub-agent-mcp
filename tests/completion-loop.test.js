// Tests for lib/completion-loop.js — terminal status, question detection, result extraction
import { describe, it, expect } from 'vitest';
import { isTerminal, isAskingQuestion, getPollInterval } from '../lib/completion-loop.js';

// ── isTerminal ───────────────────────────────────────────────────────────────

describe('isTerminal', () => {
    it('COMPLETED is terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_COMPLETED')).toBe(true);
    });

    it('FAILED is terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_FAILED')).toBe(true);
    });

    it('CANCELLED is terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_CANCELLED')).toBe(true);
    });

    it('ERROR is terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_ERROR')).toBe(true);
    });

    it('RUNNING is not terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_RUNNING')).toBe(false);
    });

    it('WAITING_FOR_USER is not terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_WAITING_FOR_USER')).toBe(false);
    });

    it('IDLE is not terminal', () => {
        expect(isTerminal('CASCADE_RUN_STATUS_IDLE')).toBe(false);
    });

    it('null is not terminal', () => {
        expect(isTerminal(null)).toBe(false);
    });

    it('UNKNOWN is not terminal', () => {
        expect(isTerminal('UNKNOWN')).toBe(false);
    });

    it('empty string is not terminal', () => {
        expect(isTerminal('')).toBe(false);
    });
});

// ── isAskingQuestion ─────────────────────────────────────────────────────────

describe('isAskingQuestion', () => {
    it('returns false for null step', () => {
        expect(isAskingQuestion(null)).toBe(false);
    });

    it('returns false for undefined step', () => {
        expect(isAskingQuestion(undefined)).toBe(false);
    });

    it('returns false for empty step', () => {
        expect(isAskingQuestion({})).toBe(false);
    });

    // Protobuf flags
    it('detects askForUserFeedback flag', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { askForUserFeedback: true, notificationContent: 'Done!' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('detects isBlocking flag', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { isBlocking: true, notificationContent: 'Waiting for input' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    // NOTIFY_USER with question content
    it('detects question mark in NOTIFY_USER', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { notificationContent: 'Should I continue?' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('detects "please confirm" in NOTIFY_USER', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { notificationContent: 'Please confirm the changes' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('detects "please choose" in NOTIFY_USER', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { notificationContent: 'Please choose an option' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('detects "please select" in NOTIFY_USER', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { notificationContent: 'Please select a file' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('does not detect plain statement in NOTIFY_USER', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_NOTIFY_USER',
            notifyUser: { notificationContent: 'Task completed successfully.' },
        };
        expect(isAskingQuestion(step)).toBe(false);
    });

    // PLANNER_RESPONSE with question
    it('detects question in PLANNER_RESPONSE', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
            plannerResponse: { response: 'What framework do you prefer?' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('detects question in modifiedResponse', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
            plannerResponse: { modifiedResponse: 'Would you like me to proceed?' },
        };
        expect(isAskingQuestion(step)).toBe(true);
    });

    it('does not detect statement in PLANNER_RESPONSE', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
            plannerResponse: { response: 'Here is the implementation.' },
        };
        expect(isAskingQuestion(step)).toBe(false);
    });

    // Non-question types
    it('returns false for RUN_COMMAND step', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_RUN_COMMAND',
            runCommand: { commandLine: 'npm test' },
        };
        expect(isAskingQuestion(step)).toBe(false);
    });

    it('returns false for CODE_ACTION step', () => {
        const step = {
            type: 'CORTEX_STEP_TYPE_CODE_ACTION',
            codeAction: { targetFile: '/tmp/f.js' },
        };
        expect(isAskingQuestion(step)).toBe(false);
    });
});

// ── getPollInterval (PERF-3) ─────────────────────────────────────────────────

describe('getPollInterval', () => {
    it('returns 1s (1000ms) for first 5 seconds', () => {
        expect(getPollInterval(0)).toBe(1000);
        expect(getPollInterval(1000)).toBe(1000);
        expect(getPollInterval(4999)).toBe(1000);
    });

    it('returns 2s (2000ms) between 5-30 seconds', () => {
        expect(getPollInterval(5000)).toBe(2000);
        expect(getPollInterval(15000)).toBe(2000);
        expect(getPollInterval(29999)).toBe(2000);
    });

    it('returns 5s (5000ms) after 30 seconds', () => {
        expect(getPollInterval(30000)).toBe(5000);
        expect(getPollInterval(60000)).toBe(5000);
        expect(getPollInterval(300000)).toBe(5000);
    });
});
