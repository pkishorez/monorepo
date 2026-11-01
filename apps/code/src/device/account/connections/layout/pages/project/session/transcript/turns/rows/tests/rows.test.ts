import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@kestack/connect/code';
import { kept, thread, threaded, UNTHREADED } from '../rows.ts';
import { keptTurns, turnsOf } from '../../turns.ts';

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

  it('say when Connect Resumed them, and steers of one stay yours', () => {
    const rows = thread([
      message(
        [
          {
            type: 'turnStarted',
            text: 'Connect restarted and cut off your last turn.',
            steered: false,
            resumed: true,
          },
        ],
        { role: 'user', turnId: 't2' },
      ),
      message([{ type: 'turnStarted', text: 'also this', steered: true }], {
        role: 'user',
        turnId: 't2',
      }),
    ]);
    expect(rows).toMatchObject([
      { kind: 'turn', resumed: true, agentStarted: false },
      { kind: 'turn', text: 'also this', steered: true, resumed: false },
    ]);
  });
});

describe('threaded again', () => {
  const chunk = (streamId: string, text: string): Part => ({
    type: 'textChunk',
    streamId,
    channel: 'text',
    text,
  });
  const session = () => [
    message([{ type: 'turnStarted', text: 'one', steered: false }], {
      role: 'user',
    }),
    message([call('a')]),
    message([result('a')], { role: 'tool' }),
    message([{ type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }], {
      role: 'system',
    }),
    message([{ type: 'turnEnded', status: 'done' }]),
    message([{ type: 'turnStarted', text: 'two', steered: false }], {
      role: 'user',
      turnId: 't2',
    }),
    message([call('b', 'subagent')], { turnId: 't2' }),
    message([call('c')], { agentId: 'b', turnId: 't2' }),
    message([chunk('s', 'Half')], { turnId: 't2' }),
  ];

  it('sorts its Messages by id when they come out of order', () => {
    const messages = session();
    expect(thread(messages.toReversed())).toEqual(thread(messages));
  });

  it('keeps every row that did not change, a summed usage included, and the list when none did', () => {
    const messages = session();
    const before = thread(messages);
    const after = kept(before, thread([...messages]));
    expect(after).toBe(before);
  });

  it('makes anew only the rows a new Message changed', () => {
    const messages = session();
    const before = thread(messages);
    const after = kept(
      before,
      thread([...messages, message([chunk('s', ' done.')], { turnId: 't2' })]),
    );
    expect(after).not.toBe(before);
    const changed = after.filter((row, at) => row !== before[at]);
    expect(changed.map((row) => row.kind === 'text' && row.text)).toEqual([
      'Half done.',
    ]);
  });

  it('makes a subagent anew when a step of its own does, keeping the steps that did not', () => {
    const messages = session();
    const before = thread(messages);
    const after = kept(
      before,
      thread([
        ...messages,
        message([result('c')], { role: 'tool', agentId: 'b', turnId: 't2' }),
      ]),
    );
    const subagent = (rows: typeof before) =>
      rows.find((row) => row.kind === 'subagent')!;
    expect(subagent(after)).not.toBe(subagent(before));
    expect(after[0]).toBe(before[0]);
  });

  it('keeps each turn whose rows it kept', () => {
    const messages = session();
    const first = thread(messages);
    const before = turnsOf(first);
    const rows = kept(
      first,
      thread([...messages, message([chunk('s', ' done.')], { turnId: 't2' })]),
    );
    const after = keptTurns(before, turnsOf(rows));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });
});

describe('threaded', () => {
  const chunk = (streamId: string, text: string): Part => ({
    type: 'textChunk',
    streamId,
    channel: 'text',
    text,
  });
  const session = () => [
    message([{ type: 'turnStarted', text: 'one', steered: false }], {
      role: 'user',
    }),
    message([call('a')]),
    message([result('a')], { role: 'tool' }),
    message([{ type: 'turnEnded', status: 'done' }]),
    message([{ type: 'turnStarted', text: 'two', steered: false }], {
      role: 'user',
      turnId: 't2',
    }),
    message([call('b', 'subagent')], { turnId: 't2' }),
    message([call('c')], { agentId: 'b', turnId: 't2' }),
    message([{ type: 'turnStarted', text: 'and', steered: true }], {
      role: 'user',
      turnId: 't2',
    }),
    message([chunk('s', 'Half')], { turnId: 't2' }),
  ];

  it('threads a session a turn at a time as thread does it whole', () => {
    const messages = session();
    expect(threaded(UNTHREADED, messages).rows).toEqual(thread(messages));
    expect(threaded(UNTHREADED, messages.toReversed()).rows).toEqual(
      thread(messages),
    );
  });

  it('says a turn cut off before its end, with a turn after it, is no longer writing, as thread does', () => {
    const cut = [
      message([{ type: 'turnStarted', text: 'one', steered: false }], {
        role: 'user',
      }),
      message([chunk('s', 'Half')]),
    ];
    const before = threaded(UNTHREADED, cut);
    expect(before.rows.at(-1)).toMatchObject({ writing: true });
    const messages = [
      ...cut,
      message([{ type: 'turnStarted', text: 'two', steered: false }], {
        role: 'user',
        turnId: 't2',
      }),
    ];
    const after = threaded(before, messages);
    expect(after.rows).toEqual(thread(messages));
    expect(after.rows[1]).toMatchObject({ writing: false });
  });

  it('is the same when no turn changed', () => {
    const messages = session();
    const before = threaded(UNTHREADED, messages);
    expect(threaded(before, [...messages])).toBe(before);
  });

  it('threads again only the turn a new Message is in, keeping its rows that did not change', () => {
    const messages = session();
    const before = threaded(UNTHREADED, messages);
    const after = threaded(before, [
      ...messages,
      message([chunk('s', ' done.')], { turnId: 't2' }),
    ]);
    expect(after.turns.get('t1')).toBe(before.turns.get('t1'));
    const changed = after.rows.filter((row, at) => row !== before.rows[at]);
    expect(changed.map((row) => row.kind === 'text' && row.text)).toEqual([
      'Half done.',
    ]);
  });
});
