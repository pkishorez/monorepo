import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@kestack/ai-toolkit/api';
import { thread } from './thread.ts';

let n = 0;
const message = (
  parts: ReadonlyArray<Part>,
  options: { agentId?: string; role?: Message['role']; turnId?: string } = {},
): Message => ({
  id: String(n++).padStart(4, '0'),
  sessionId: 's',
  turnId: options.turnId ?? 't1',
  agentId: options.agentId ?? null,
  role: options.role ?? 'assistant',
  parts,
  at: n,
});

const call = (id: string, tool: 'bash' | 'subagent' = 'bash'): Part => ({
  type: 'toolCall',
  id,
  tool,
  name: tool,
  title: id,
  input: {},
});
const result = (toolCallId: string, isError = false): Part => ({
  type: 'toolResult',
  toolCallId,
  output: 'ok',
  truncated: false,
  isError,
});

describe('thread', () => {
  it('pairs a tool call with its result, and is running without one', () => {
    const rows = thread([
      message([{ type: 'turnStarted', text: 'hi', steered: false }], {
        role: 'user',
      }),
      message([call('a'), call('b'), call('c')]),
      message([result('a'), result('b', true)], { role: 'tool' }),
    ]);
    expect(
      rows.map((row) => (row.kind === 'tool' ? row.state : row.kind)),
    ).toEqual(['turn', 'done', 'failed', 'running']);
  });

  it('stops a call with no result once its turn has ended, and sums usage parts', () => {
    const rows = thread([
      message([call('a')]),
      message(
        [{ type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }],
        { role: 'system' },
      ),
      message(
        [
          {
            type: 'usage',
            usage: { inputTokens: 5, outputTokens: 1, costUsd: 0.5 },
          },
        ],
        { role: 'system' },
      ),
      message([{ type: 'turnEnded', status: 'cancelled' }], { role: 'system' }),
    ]);
    expect(rows).toMatchObject([
      { kind: 'tool', state: 'stopped' },
      {
        kind: 'ended',
        status: 'cancelled',
        usage: { inputTokens: 15, outputTokens: 3, costUsd: 0.5 },
      },
    ]);
  });

  it('prefers the turnEnded usage', () => {
    const rows = thread([
      message([{ type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }], {
        role: 'system',
      }),
      message(
        [
          {
            type: 'turnEnded',
            status: 'done',
            usage: { inputTokens: 9, outputTokens: 9 },
          },
        ],
        { role: 'system' },
      ),
    ]);
    expect(rows).toMatchObject([{ kind: 'ended', usage: { inputTokens: 9 } }]);
  });

  it('nests a subagent, its prompt first, and a subagent of it', () => {
    const rows = thread([
      message([call('sub', 'subagent')]),
      message([{ type: 'text', text: 'look around' }], {
        agentId: 'sub',
        role: 'user',
      }),
      message([call('inner', 'subagent')], { agentId: 'sub' }),
      message([{ type: 'text', text: 'deep' }], { agentId: 'inner' }),
      message([result('sub')], { role: 'tool' }),
    ]);
    expect(rows).toMatchObject([
      {
        kind: 'subagent',
        state: 'done',
        rows: [
          { kind: 'prompt', text: 'look around' },
          {
            kind: 'subagent',
            state: 'running',
            rows: [{ kind: 'text', text: 'deep' }],
          },
        ],
      },
    ]);
  });
});
