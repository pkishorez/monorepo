import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@kestack/connect/code';
import { thread } from '../rows.ts';

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

  it('gives a call what the user answered, from its own part, before or after its result', () => {
    const answered = (toolCallId: string): Part => ({
      type: 'questionAnswered',
      toolCallId,
      answers: { '0': ['Red'] },
    });
    const rows = thread([
      message([call('a'), call('b'), call('c')]),
      message([answered('a')], { role: 'tool' }),
      message([result('a'), result('b'), answered('b')], { role: 'tool' }),
    ]);
    expect(
      rows.map((row) => (row.kind === 'tool' ? row.answered : row.kind)),
    ).toEqual([answered('a'), answered('b'), null]);
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

  it('stops a call whose failed result reports the interrupt of a cancelled turn', () => {
    const rows = thread([
      message([call('a'), call('b')]),
      message([result('a', true)], { role: 'tool' }),
      message([{ type: 'text', text: 'a failed, trying b' }]),
      message([result('b', true)], { role: 'tool' }),
      message([{ type: 'turnEnded', status: 'cancelled' }], { role: 'system' }),
    ]);
    expect(
      rows.map((row) => (row.kind === 'tool' ? row.state : row.kind)),
    ).toEqual(['failed', 'stopped', 'text', 'ended']);
  });

  it('times a turn from its start to its end', () => {
    const start = message(
      [{ type: 'turnStarted', text: 'hi', steered: false }],
      {
        role: 'user',
      },
    );
    const end = message([{ type: 'turnEnded', status: 'done' }], {
      role: 'system',
    });
    expect(thread([start, end]).at(-1)).toMatchObject({
      kind: 'ended',
      duration: end.at - start.at,
    });
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

  it("puts a subagent's prompt from its call first when it sent none of its own", () => {
    const rows = thread([
      message([
        {
          type: 'toolCall',
          id: 'sub',
          tool: 'subagent',
          name: 'Agent',
          title: 'Count lines',
          input: { description: 'Count lines', prompt: 'Run wc -l' },
        },
      ]),
      message([{ type: 'text', text: 'six' }], { agentId: 'sub' }),
    ]);
    expect(rows).toMatchObject([
      {
        kind: 'subagent',
        rows: [
          { kind: 'prompt', text: 'Run wc -l' },
          { kind: 'text', text: 'six' },
        ],
      },
    ]);
  });

  it("drops a subagent's last words when they are its report", () => {
    const rows = thread([
      message([call('sub', 'subagent')]),
      message([{ type: 'text', text: 'ok\n' }], { agentId: 'sub' }),
      message([result('sub')], { role: 'tool' }),
    ]);
    expect(rows).toMatchObject([
      { kind: 'subagent', rows: [], result: { output: 'ok' } },
    ]);
  });

  describe('streamed chunks', () => {
    const chunk = (
      streamId: string,
      text: string,
      channel: 'text' | 'reasoning' = 'text',
    ): Part => ({ type: 'textChunk', streamId, channel, text });

    it('joins a stream in order where its first chunk is, writing until something follows', () => {
      const first = message([chunk('r', 'Hmm. ', 'reasoning')]);
      const rows = thread([
        first,
        message([chunk('r', 'Ok.', 'reasoning')]),
        message([chunk('s', 'One. ')]),
        message([call('a')]),
        message([chunk('s', 'Two. ')]),
        message([chunk('s', 'Three.')]),
      ]);
      expect(rows).toEqual([
        {
          kind: 'reasoning',
          id: `${first.id}:0`,
          text: 'Hmm. Ok.',
          writing: false,
        },
        expect.objectContaining({
          kind: 'text',
          text: 'One. Two. Three.',
          writing: true,
        }),
        expect.objectContaining({ kind: 'tool', state: 'running' }),
      ]);
    });

    it('stops writing once the turn ends, a cancelled one keeping its chunks', () => {
      const rows = thread([
        message([chunk('s', 'Half ')]),
        message([chunk('s', 'a thought')]),
        message([{ type: 'turnEnded', status: 'cancelled' }], {
          role: 'system',
        }),
      ]);
      expect(rows).toMatchObject([
        { kind: 'text', text: 'Half a thought', writing: false },
        { kind: 'ended', status: 'cancelled' },
      ]);
    });

    it("keeps a subagent's streams in it, and drops its streamed report", () => {
      const rows = thread([
        message([call('sub', 'subagent')]),
        message([chunk('m', 'Main ')]),
        message([chunk('x', 'Looking ')], { agentId: 'sub' }),
        message([chunk('m', 'goes on.')]),
        message([chunk('x', 'around.')], { agentId: 'sub' }),
        message([chunk('y', 'o')], { agentId: 'sub' }),
        message([chunk('y', 'k')], { agentId: 'sub' }),
        message([result('sub')], { role: 'tool' }),
      ]);
      expect(rows).toMatchObject([
        {
          kind: 'subagent',
          rows: [{ kind: 'text', text: 'Looking around.', writing: false }],
        },
        { kind: 'text', text: 'Main goes on.', writing: false },
      ]);
    });
  });
});

describe('turns', () => {
  it('carry their files, and say when the agent started them', () => {
    const image = { name: 'a.png', mime: 'image/png', size: 3, data: 'AAA' };
    const rows = thread([
      message(
        [
          {
            type: 'turnStarted',
            text: 'look',
            steered: false,
            attachments: [image],
          },
        ],
        { role: 'user', turnId: 't1' },
      ),
      message([{ type: 'turnEnded', status: 'done' }], {
        role: 'system',
        turnId: 't1',
      }),
      message(
        [{ type: 'turnStarted', text: '', steered: false, agentStarted: true }],
        { role: 'user', turnId: 't2' },
      ),
    ]);
    expect(rows).toMatchObject([
      { kind: 'turn', attachments: [image], agentStarted: false },
      { kind: 'ended', turnId: 't1' },
      { kind: 'turn', attachments: [], agentStarted: true },
    ]);
  });
});
