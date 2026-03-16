// Tests for index.js — model resolution, aliases, system prompt
import { describe, it, expect } from 'vitest';
import { resolveModel, MODEL_ALIASES, DEFAULT_MODEL, SYSTEM_PROMPT } from '../index.js';

// ── resolveModel ─────────────────────────────────────────────────────────────

describe('resolveModel', () => {
    it('returns DEFAULT_MODEL when input is null', () => {
        expect(resolveModel(null)).toBe(DEFAULT_MODEL);
    });

    it('returns DEFAULT_MODEL when input is undefined', () => {
        expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
    });

    it('returns DEFAULT_MODEL when input is empty string', () => {
        expect(resolveModel('')).toBe(DEFAULT_MODEL);
    });

    it('passes through direct MODEL_ IDs', () => {
        expect(resolveModel('MODEL_CUSTOM_123')).toBe('MODEL_CUSTOM_123');
    });

    it('resolves gemini-high alias', () => {
        expect(resolveModel('gemini-high')).toBe('MODEL_PLACEHOLDER_M37');
    });

    it('resolves gemini-low alias', () => {
        expect(resolveModel('gemini-low')).toBe('MODEL_PLACEHOLDER_M36');
    });

    it('resolves gemini-flash alias', () => {
        expect(resolveModel('gemini-flash')).toBe('MODEL_PLACEHOLDER_M47');
    });

    it('resolves claude-opus alias', () => {
        expect(resolveModel('claude-opus')).toBe('MODEL_PLACEHOLDER_M26');
    });

    it('resolves claude-sonnet alias', () => {
        expect(resolveModel('claude-sonnet')).toBe('MODEL_PLACEHOLDER_M35');
    });

    it('resolves gpt-120b alias', () => {
        expect(resolveModel('gpt-120b')).toBe('MODEL_OPENAI_GPT_OSS_120B_MEDIUM');
    });

    it('is case-insensitive for aliases', () => {
        expect(resolveModel('GEMINI-HIGH')).toBe(resolveModel('gemini-high'));
        expect(resolveModel('Claude-Opus')).toBe(resolveModel('claude-opus'));
    });

    it('returns DEFAULT_MODEL for unknown alias', () => {
        expect(resolveModel('nonexistent-model')).toBe(DEFAULT_MODEL);
    });
});

// ── MODEL_ALIASES ────────────────────────────────────────────────────────────

describe('MODEL_ALIASES', () => {
    it('has at least 6 aliases', () => {
        expect(Object.keys(MODEL_ALIASES).length).toBeGreaterThanOrEqual(6);
    });

    it('all values start with MODEL_', () => {
        for (const [alias, id] of Object.entries(MODEL_ALIASES)) {
            expect(id).toMatch(/^MODEL_/);
        }
    });

    it('has gemini, claude, and gpt models', () => {
        const aliases = Object.keys(MODEL_ALIASES);
        expect(aliases.some(a => a.startsWith('gemini'))).toBe(true);
        expect(aliases.some(a => a.startsWith('claude'))).toBe(true);
        expect(aliases.some(a => a.startsWith('gpt'))).toBe(true);
    });
});

// ── DEFAULT_MODEL ────────────────────────────────────────────────────────────

describe('DEFAULT_MODEL', () => {
    it('starts with MODEL_', () => {
        expect(DEFAULT_MODEL).toMatch(/^MODEL_/);
    });

    it('matches gemini-high alias', () => {
        expect(DEFAULT_MODEL).toBe(MODEL_ALIASES['gemini-high']);
    });
});

// ── SYSTEM_PROMPT ────────────────────────────────────────────────────────────

describe('SYSTEM_PROMPT', () => {
    it('contains autonomy instruction', () => {
        expect(SYSTEM_PROMPT).toContain('COMPLETE the task fully');
    });

    it('forbids asking questions', () => {
        expect(SYSTEM_PROMPT).toContain('without asking questions');
    });

    it('forbids spawning sub-agents', () => {
        expect(SYSTEM_PROMPT).toContain('NEVER spawn');
        expect(SYSTEM_PROMPT).toContain('submit_agent');
    });

    it('prefers read-only operations', () => {
        expect(SYSTEM_PROMPT).toContain('read-only');
    });

    it('ends with TASK: marker', () => {
        expect(SYSTEM_PROMPT.trim()).toMatch(/TASK:\s*$/);
    });
});
