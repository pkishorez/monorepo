import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RawOut } from '../../../contract/index.js';
import type { Part, Projected } from '../../../../contract/projection/index.js';
import type { Raw } from '../../../../contract/raw/index.js';
import { project, TOOL_OUTPUT_MAX } from '../index.js';

/** Turns captured from the real Claude Code by `claude.e2e.test.ts`. */
const fixture = (name: string): ReadonlyArray<RawOut> =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  ) as ReadonlyArray<RawOut>;

const raw = (out: RawOut): Raw => ({
  id: 'raw',
  sessionId: 'session',
  turnId: 'turn',
  harness: 'claude',
  kind: out.kind,
  agentId: out.agentId ?? null,
  payload: out.payload,
  at: 0,
});

const of = (payload: Raw['payload'], agentId?: string) =>
  project(raw({ kind: 'test', payload, ...(agentId ? { agentId } : {}) }));

const projectAll = (outs: ReadonlyArray<RawOut>) =>
  outs.map((out) => ({ kind: out.kind, projected: project(raw(out)) }));

const partsOf = (projected: Projected | null): ReadonlyArray<Part> =>
  projected?.parts ?? [];

describe('project, on a captured turn that reads a file', () => {
  const turn = projectAll(fixture('read'));

  it('shows nothing for system/init', () => {
    expect(turn.find((r) => r.kind === 'system/init')?.projected).toBeNull();
  });

  it('shows the Read call with its path as the title', () => {
    const call = turn
      .flatMap((r) => partsOf(r.projected))
      .find((p) => p.type === 'toolCall');
    expect(call).toMatchObject({
      type: 'toolCall',
      tool: 'read',
      name: 'Read',
    });
    expect(call?.type === 'toolCall' && call.title).toMatch(/note\.txt$/);
  });

  it('shows the tool result as a tool message pointing at the call', () => {
    const tool = turn.find((r) => r.kind === 'user')?.projected;
    expect(tool?.role).toBe('tool');
    expect(tool?.agentId).toBeNull();
    expect(tool?.parts[0]).toMatchObject({
      type: 'toolResult',
      truncated: false,
      isError: false,
    });
    expect(JSON.stringify(tool?.parts)).toContain('PINEAPPLE-42');
  });

  it('ends the turn as done with usage', () => {
    const end = turn.find((r) => r.kind === 'result')?.projected;
    expect(end?.role).toBe('system');
    const part = end?.parts[0];
    expect(part).toMatchObject({ type: 'turnEnded', status: 'done' });
    expect(
      part?.type === 'turnEnded' && part.usage?.outputTokens,
    ).toBeGreaterThan(0);
    expect(part?.type === 'turnEnded' && part.usage?.costUsd).toBeGreaterThan(
      0,
    );
  });

  it('shows the final answer, stored before streaming, as assistant text', () => {
    const text = turn
      .flatMap((r) => partsOf(r.projected))
      .flatMap((p) => (p.type === 'text' ? [p.text] : []))
      .join('');
    expect(text).toContain('PINEAPPLE-42');
  });
});

describe('project, on a captured turn that streams a long answer', () => {
  const outs = fixture('stream');
  const turn = projectAll(outs);
  const chunks = turn.flatMap((r) =>
    partsOf(r.projected).flatMap((p) => (p.type === 'textChunk' ? [p] : [])),
  );
  const whole = outs.find((o) => o.kind === 'assistant')?.payload as {
    message: { id: string; content: ReadonlyArray<{ text: unknown }> };
  };

  it('shows each chunk as an assistant message of one textChunk', () => {
    const shown = turn.filter((r) => r.kind === 'text.chunk');
    expect(shown.length).toBeGreaterThan(1);
    for (const { projected } of shown) {
      expect(projected).toMatchObject({ agentId: null, role: 'assistant' });
      expect(projected?.parts).toHaveLength(1);
    }
  });

  it("names the chunks after the whole block's message id and index", () => {
    expect(new Set(chunks.map((c) => c.streamId))).toEqual(
      new Set([`${whole.message.id}:0`]),
    );
    expect(chunks.every((c) => c.channel === 'text')).toBe(true);
  });

  it('stores the whole text block as a pointer to the chunks', () => {
    expect(whole.message.content[0]?.text).toEqual({
      $stream: chunks[0]?.streamId,
    });
    expect(chunks.map((c) => c.text).join('').length).toBeGreaterThan(400);
  });

  it('shows nothing for the whole record: its chunks show the text', () => {
    expect(turn.find((r) => r.kind === 'assistant')?.projected).toBeNull();
  });
});

describe('project, on a captured turn with a subagent inside a subagent', () => {
  const outs = fixture('subagent');
  const turn = projectAll(outs);
  const calls = turn.flatMap((r) =>
    partsOf(r.projected).flatMap((p) =>
      p.type === 'toolCall' ? [{ agentId: r.projected?.agentId, call: p }] : [],
    ),
  );
  const [outer, inner] = calls;

  it('shows each Agent call as a subagent titled by its description', () => {
    expect(outer?.call.tool).toBe('subagent');
    expect(outer?.agentId).toBeNull();
    expect(outer?.call.title).not.toBe('Agent');
  });

  it('puts the nested call under the outer call', () => {
    expect(inner?.call.tool).toBe('subagent');
    expect(inner?.agentId).toBe(outer?.call.id);
  });

  it("drops the subagent's prompt, which arrives as a user text message", () => {
    const prompt = outs.findIndex(
      (o) => o.kind === 'user' && o.agentId === outer?.call.id,
    );
    expect(prompt).toBeGreaterThanOrEqual(0);
    expect(turn[prompt]?.projected).toBeNull();
  });

  it("shows the subagent's report without Claude Code's agentId note", () => {
    const report = turn
      .flatMap((r) => partsOf(r.projected))
      .find((p) => p.type === 'toolResult' && p.toolCallId === outer?.call.id);
    expect(report?.type === 'toolResult' && report.output).toBeTruthy();
    expect(JSON.stringify(report)).not.toContain('SendMessage');
    expect(JSON.stringify(report)).not.toContain('<usage>');
  });

  it('shows nothing for task progress frames', () => {
    for (const r of turn.filter((r) => r.kind.startsWith('system/task'))) {
      expect(r.projected).toBeNull();
    }
  });
});

describe('project, on a captured cancelled turn', () => {
  const turn = projectAll(fixture('cancel'));

  it('ends the turn as cancelled', () => {
    expect(
      turn.find((r) => r.kind === 'result')?.projected?.parts[0],
    ).toMatchObject({ type: 'turnEnded', status: 'cancelled' });
  });

  it('shows the rejected tool call as an error result and drops the interrupt note', () => {
    const users = turn.filter((r) => r.kind === 'user');
    expect(users[0]?.projected?.parts[0]).toMatchObject({ isError: true });
    expect(users[1]?.projected).toBeNull();
  });
});

describe('project, on captured Agent Questions, one answered and one declined', () => {
  const turn = projectAll(fixture('question'));
  const answered = turn.filter((r) => r.kind === 'question.answered');
  const results = turn.filter((r) => r.kind === 'user');

  it('shows what the user answered, by Item id, each choice whole', () => {
    expect(answered[0]?.projected).toEqual({
      agentId: null,
      role: 'tool',
      parts: [
        {
          type: 'questionAnswered',
          toolCallId: 'toolu_01MKda9iJ4cKnNYkkzMphTV2',
          answers: { '0': ['Green'], '1': ['Apple', 'Banana'] },
        },
      ],
    });
    expect(partsOf(results[0]?.projected ?? null)[0]).toMatchObject({
      type: 'toolResult',
      toolCallId: 'toolu_01MKda9iJ4cKnNYkkzMphTV2',
      isError: false,
    });
  });

  it('shows a declined one as answered with null, its result an error', () => {
    expect(partsOf(answered[1]?.projected ?? null)).toEqual([
      {
        type: 'questionAnswered',
        toolCallId: 'toolu_01Hghi1qJY2khkVh7YHb29VF',
        answers: null,
      },
    ]);
    expect(partsOf(results[1]?.projected ?? null)[0]).toMatchObject({
      type: 'toolResult',
      toolCallId: 'toolu_01Hghi1qJY2khkVh7YHb29VF',
      isError: true,
    });
  });

  it('shows nothing for a record of answers it cannot read', () => {
    expect(
      project(
        raw({
          kind: 'question.answered',
          payload: { toolUseId: 'toolu_1', answers: { '0': 'Green' } },
        }),
      ),
    ).toBeNull();
  });
});

describe('project, on hand-made records', () => {
  it('trims long tool output and joins text blocks', () => {
    const long = 'x'.repeat(TOOL_OUTPUT_MAX + 10);
    const projected = of({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [{ type: 'text', text: long }],
          },
        ],
      },
    });
    expect(projected?.parts[0]).toMatchObject({
      type: 'toolResult',
      toolCallId: 't1',
      truncated: true,
      isError: false,
    });
    const part = projected?.parts[0];
    expect(part?.type === 'toolResult' && part.output.length).toBe(
      TOOL_OUTPUT_MAX,
    );
  });

  it('keeps the images a tool gave back, whole, beside its text', () => {
    const projected = of({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [
              { type: 'text', text: 'A screenshot' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'iVBOR',
                },
              },
            ],
          },
        ],
      },
    });
    expect(projected?.parts[0]).toEqual({
      type: 'toolResult',
      toolCallId: 't1',
      output: 'A screenshot',
      truncated: false,
      isError: false,
      images: [{ mediaType: 'image/png', data: 'iVBOR' }],
    });
  });

  it('keeps inline reasoning and text, and drops empty (redacted) thinking', () => {
    const projected = of(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '', signature: 's' },
            { type: 'thinking', thinking: 'Let me look.', signature: 's' },
            { type: 'text', text: 'Hi' },
          ],
        },
      },
      'toolu_parent',
    );
    expect(projected).toEqual({
      agentId: 'toolu_parent',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'Let me look.' },
        { type: 'text', text: 'Hi' },
      ],
    });
  });

  it('shows nothing for blocks that point at their chunks', () => {
    const pointer = (streamId: string) => ({ $stream: streamId });
    expect(
      of({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: pointer('m:0'), signature: 's' },
            { type: 'text', text: pointer('m:1') },
          ],
        },
      }),
    ).toBeNull();
    const projected = of({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: pointer('m:0') },
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} },
        ],
      },
    });
    expect(projected?.parts.map((p) => p.type)).toEqual(['toolCall']);
  });

  it("shows a text.chunk as a textChunk, with its subagent's id", () => {
    const chunk = { streamId: 'msg_1:0', channel: 'reasoning', text: 'Hmm.' };
    expect(
      project(raw({ kind: 'text.chunk', payload: chunk, agentId: 'toolu_1' })),
    ).toEqual({
      agentId: 'toolu_1',
      role: 'assistant',
      parts: [{ type: 'textChunk', ...chunk }],
    });
    expect(
      project(
        raw({ kind: 'text.chunk', payload: { ...chunk, channel: 'other' } }),
      ),
    ).toBeNull();
  });

  it('maps tool names to kinds and short titles', () => {
    const call = (name: string, input: Record<string, string>) =>
      of({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'x', name, input }] },
      })?.parts[0];
    expect(call('Bash', { command: 'pnpm test\nmore' })).toMatchObject({
      tool: 'bash',
      title: 'pnpm test',
    });
    expect(call('Grep', { pattern: 'TODO', path: 'src' })).toMatchObject({
      tool: 'search',
      title: 'TODO in src',
    });
    expect(call('MultiEdit', { file_path: '/a.ts' })).toMatchObject({
      tool: 'edit',
      title: '/a.ts',
    });
    expect(call('WebFetch', { url: 'https://x.dev' })).toMatchObject({
      tool: 'web',
      title: 'https://x.dev',
    });
    expect(call('TodoWrite', {})).toMatchObject({ tool: 'todo' });
    expect(call('mcp__github__get_issue', {})).toMatchObject({
      tool: 'mcp',
      title: 'github: get_issue',
    });
    expect(call('Skill', {})).toMatchObject({ tool: 'other', title: 'Skill' });
  });

  it('shows an Agent Question as a question titled by what it asks', () => {
    const ask = (questions: ReadonlyArray<Record<string, string>>) =>
      of({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'x',
              name: 'AskUserQuestion',
              input: { questions },
            },
          ],
        },
      })?.parts[0];
    expect(
      ask([{ header: 'Colour', question: 'Which colour?' }]),
    ).toMatchObject({ tool: 'question', title: 'Which colour?' });
    expect(
      ask([
        { header: 'Colour', question: 'Which colour?' },
        { header: 'Fruits', question: 'Which fruits?' },
      ]),
    ).toMatchObject({ tool: 'question', title: 'Colour, Fruits' });
  });

  it('ends a failed turn with its errors', () => {
    expect(
      of({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        errors: ['too many turns'],
        usage: { input_tokens: 1, output_tokens: 2 },
      })?.parts[0],
    ).toEqual({
      type: 'turnEnded',
      status: 'failed',
      error: 'too many turns',
      usage: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it('shows a compaction boundary', () => {
    expect(
      of({
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'auto', pre_tokens: 1000 },
      }),
    ).toEqual({
      agentId: null,
      role: 'system',
      parts: [{ type: 'claude.compaction', trigger: 'auto' }],
    });
  });

  it('shows nothing for a plain user message or an unknown record', () => {
    expect(
      of({ type: 'user', message: { role: 'user', content: 'hello' } }),
    ).toBeNull();
    expect(of({ type: 'rate_limit_event' })).toBeNull();
    expect(of('not an object')).toBeNull();
  });
});
