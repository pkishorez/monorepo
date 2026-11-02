import { describe, expect, it } from 'vitest';
import { queryOptions } from '../options.js';
import type { Questions } from '../questions/index.js';

const config = {
  cwd: '/tmp',
  executable: { path: '/usr/local/bin/claude', env: {} },
  model: 'claude-test',
  effort: 'high',
  permissionMode: 'default',
} as const;

const questions = {} as Questions;

describe("a Claude Agent's system prompt", () => {
  it("is Claude Code's own, with the instructions after it", () => {
    expect(
      queryOptions({ ...config, instructions: 'Show files.' }, questions)
        .systemPrompt,
    ).toEqual({ type: 'preset', preset: 'claude_code', append: 'Show files.' });
  });

  it("is Claude Code's own alone when no instructions are given", () => {
    expect(queryOptions(config, questions).systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
    });
  });

  it('keeps the instructions on a resumed Agent', () => {
    const options = queryOptions(
      { ...config, nativeId: 'native', instructions: 'Show files.' },
      questions,
    );
    expect(options.resume).toBe('native');
    expect(options.systemPrompt).toMatchObject({ append: 'Show files.' });
  });
});
