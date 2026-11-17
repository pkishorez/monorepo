import { existsSync } from 'node:fs';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { oneShot } from '../one-shot.js';

/*
 * A One-shot Prompt answered by Claude Code, the query stood in for: it
 * runs the small model for one turn, with no tools nor MCP servers, kept
 * nowhere, in a temp folder gone once it is answered; the reply is the
 * result's text, and a result that is no answer fails, saying why.
 */
const live = vi.hoisted(() => ({
  /** What the next query's result is. */
  result: undefined as unknown,
  /** What each query was started with. */
  calls: [] as Array<{ prompt: string; options: Record<string, unknown> }>,
  /** Whether each query's folder was there while it ran. */
  folderThere: [] as Array<boolean>,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({
    prompt,
    options,
  }: {
    prompt: string;
    options: Record<string, unknown>;
  }) => {
    live.calls.push({ prompt, options });
    return (async function* () {
      const { existsSync: there } = await import('node:fs');
      live.folderThere.push(there(options['cwd'] as string));
      if (live.result !== undefined) yield live.result;
    })();
  },
}));

const launch = { path: '/usr/local/bin/claude', env: { HOME: '/home/me' } };

const answered = (result: unknown) => {
  live.result = result;
  live.calls.length = 0;
  live.folderThere.length = 0;
  return Effect.runPromise(Effect.result(oneShot('Name it', launch)));
};

describe('oneShot', () => {
  it("answers with the result's text, from the small model with no tools, kept nowhere, in a folder of its own", async () => {
    const out = await answered({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '  Fix the build \n',
    });
    expect(out).toMatchObject({ _tag: 'Success', success: 'Fix the build' });
    const [call] = live.calls;
    expect(call!.prompt).toBe('Name it');
    expect(call!.options).toMatchObject({
      pathToClaudeCodeExecutable: '/usr/local/bin/claude',
      env: { HOME: '/home/me' },
      model: 'haiku',
      tools: [],
      strictMcpConfig: true,
      persistSession: false,
      maxTurns: 1,
    });
    expect(live.folderThere).toEqual([true]);
    expect(existsSync(call!.options['cwd'] as string)).toBe(false);
  });

  it('fails, saying why, when Claude Code answers with an error', async () => {
    const out = await answered({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Not logged in',
    });
    expect(out).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'Not logged in' },
    });
  });

  it('fails, saying why, when the turn did not end in an answer', async () => {
    const out = await answered({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      errors: [],
    });
    expect(out).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'error_max_turns' },
    });
  });

  it('fails when Claude Code gives no result', async () => {
    const out = await answered(undefined);
    expect(out).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'Claude Code gave no result' },
    });
  });
});
