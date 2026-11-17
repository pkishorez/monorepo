import { describe, expect, it } from 'vitest';
import { readSystemPrompt, SETTINGS } from '../settings.js';

/*
 * A Session's system prompt: Claude Code's own unless its settings ask for
 * the Agent SDK's minimal one, and never a Setting a picker offers.
 */
describe('readSystemPrompt', () => {
  it("is Claude Code's when the settings leave it out", () =>
    expect(readSystemPrompt({ effort: 'low' })).toBe('claude_code'));

  it('is minimal when the settings ask for it', () =>
    expect(readSystemPrompt({ systemPrompt: 'minimal' })).toBe('minimal'));

  it("is Claude Code's for a value it does not know", () =>
    expect(readSystemPrompt({ systemPrompt: 'other' })).toBe('claude_code'));

  it('is not offered in a picker', () =>
    expect(SETTINGS.map(({ key }) => key)).not.toContain('systemPrompt'));
});
