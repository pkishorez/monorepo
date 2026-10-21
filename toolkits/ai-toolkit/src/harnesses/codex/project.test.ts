import { readFileSync } from 'node:fs';
import type { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { RawOut } from '../../harness/index.js';
import type { Part, Projected } from '../../projection/index.js';
import type { Raw } from '../../raw/index.js';
import { OUTPUT_LIMIT, project } from './project.js';

// Records captured from live Codex 0.154 turns (codex.e2e.test.ts with
// AI_TOOLKIT_CAPTURE set).
const fixture = (name: string): ReadonlyArray<RawOut> =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  ) as ReadonlyArray<RawOut>;

const toRaw = (out: RawOut, index = 0): Raw => ({
  id: `raw-${index}`,
  sessionId: 'session',
  turnId: 'turn',
  harness: 'codex',
  kind: out.kind,
  agentId: out.agentId ?? null,
  payload: out.payload,
  at: index,
});

const isUsage = (projected: Projected) =>
  projected.parts.every((part) => part.type === 'usage');

// Usage records are tested on their own; the stories below are about the rest.
const projectAll = (outs: ReadonlyArray<RawOut>): ReadonlyArray<Projected> =>
  outs.flatMap((out, index) => {
    const projected = project(toRaw(out, index));
    return projected === null || isUsage(projected) ? [] : [projected];
  });

const partsOf = (messages: ReadonlyArray<Projected>): ReadonlyArray<Part> =>
  messages.flatMap((message) => message.parts);

const one = (kind: string, payload: unknown, agentId?: string) =>
  project(
    toRaw(
      agentId === undefined
        ? { kind, payload: payload as Schema.Json }
        : { kind, payload: payload as Schema.Json, agentId },
    ),
  );

describe('project: a shell command and a new file', () => {
  const messages = projectAll(fixture('shell'));
  const parts = partsOf(messages);

  it('drops the echoed user message', () => {
    expect(messages.some((message) => message.role === 'user')).toBe(false);
    expect(messages).toHaveLength(6);
  });

  it('shows a command as a bash tool call titled by the bare command', () => {
    expect(messages[0]).toEqual({
      agentId: null,
      role: 'assistant',
      parts: [
        {
          type: 'toolCall',
          id: 'exec-9f02ad9d-aa79-47c6-aaa2-17c8d7ff1323',
          tool: 'bash',
          name: 'commandExecution',
          title: 'echo e2e-shell-ok',
          input: {
            command: "/bin/zsh -lc 'echo e2e-shell-ok'",
            cwd: '/var/folders/pz/hmz20bpd067fdqmt3d9nzgy40000gn/T/ai-toolkit-codex-e2e-b0osMM',
          },
        },
      ],
    });
    expect(messages[1]).toEqual({
      agentId: null,
      role: 'tool',
      parts: [
        {
          type: 'toolResult',
          toolCallId: 'exec-9f02ad9d-aa79-47c6-aaa2-17c8d7ff1323',
          output: 'e2e-shell-ok\n',
          truncated: false,
          isError: false,
        },
      ],
    });
  });

  it('shows an added file as a write, titled by the end of its path', () => {
    const call = parts.find(
      (part) => part.type === 'toolCall' && part.name === 'fileChange',
    );
    expect(call).toMatchObject({ tool: 'write' });
    expect(call?.type === 'toolCall' && call.title.endsWith('/note.txt')).toBe(
      true,
    );
    expect(
      parts.find(
        (part) =>
          part.type === 'toolResult' &&
          part.toolCallId === 'exec-1b0a7f85-009b-4937-8409-ee6d126e9c3d',
      ),
    ).toMatchObject({ output: 'hi\n', isError: false });
  });

  it('drops empty reasoning and messages, and ends the turn as done', () => {
    expect(parts.some((part) => part.type === 'reasoning')).toBe(false);
    expect(parts.filter((part) => part.type === 'text')).toEqual([
      { type: 'text', text: 'done' },
    ]);
    expect(parts.at(-1)).toEqual({ type: 'turnEnded', status: 'done' });
  });
});

describe('project: a sub-agent', () => {
  const messages = projectAll(fixture('subagent'));
  const spawnId = 'exec-f8db9fcd-65e9-4e2e-9a45-9ff5567a2777';

  it('shows the spawn as a subagent tool call titled by its prompt', () => {
    const spawn = partsOf(messages).find(
      (part) => part.type === 'toolCall' && part.tool === 'subagent',
    );
    expect(spawn).toMatchObject({ id: spawnId, name: 'spawnAgent' });
  });

  it("puts the sub-agent's prompt, work and answer under its spawn call", () => {
    const child = messages.filter((message) => message.agentId === spawnId);
    expect(child.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
    expect(child[1]?.parts[0]).toMatchObject({
      type: 'toolCall',
      tool: 'bash',
    });
  });

  it("answers the spawn call with the sub-agent's finished turn, not the spawn", () => {
    const results = partsOf(messages).filter(
      (part) => part.type === 'toolResult' && part.toolCallId === spawnId,
    );
    expect(results).toEqual([
      {
        type: 'toolResult',
        toolCallId: spawnId,
        output: expect.stringContaining('from-child'),
        truncated: false,
        isError: false,
      },
    ]);
  });

  it('shows a wait as an ordinary tool, and only the main agent ends the turn', () => {
    const parts = partsOf(messages);
    expect(
      parts.find((part) => part.type === 'toolCall' && part.name === 'wait'),
    ).toMatchObject({ tool: 'other' });
    expect(parts.filter((part) => part.type === 'turnEnded')).toEqual([
      { type: 'turnEnded', status: 'done' },
    ]);
  });
});

describe('project: steer and cancel', () => {
  it('drops the steered user message (the engine records it)', () => {
    const messages = projectAll(fixture('steer'));
    expect(messages.some((message) => message.role === 'user')).toBe(false);
    expect(partsOf(messages).at(-1)).toEqual({
      type: 'turnEnded',
      status: 'done',
    });
  });

  it('ends an interrupted turn as cancelled', () => {
    const parts = partsOf(projectAll(fixture('cancel')));
    expect(parts.at(-1)).toEqual({ type: 'turnEnded', status: 'cancelled' });
  });
});

describe('project: single records', () => {
  const item = (fields: Record<string, unknown>) => ({
    threadId: 'main',
    turnId: 't',
    item: fields,
  });

  it('trims long output and flags it', () => {
    const projected = one(
      'item/completed',
      item({
        type: 'commandExecution',
        id: 'c',
        command: 'yes',
        cwd: '/',
        status: 'completed',
        aggregatedOutput: 'y\n'.repeat(OUTPUT_LIMIT),
        exitCode: 0,
      }),
    );
    expect(projected?.parts[0]).toMatchObject({
      truncated: true,
      isError: false,
    });
    const part = projected?.parts[0];
    expect(part?.type === 'toolResult' && part.output.length).toBe(
      OUTPUT_LIMIT,
    );
  });

  it('marks a non-zero exit code as an error', () => {
    expect(
      one(
        'item/completed',
        item({
          type: 'commandExecution',
          id: 'c',
          command: 'false',
          cwd: '/',
          status: 'failed',
          aggregatedOutput: '',
          exitCode: 1,
        }),
      )?.parts[0],
    ).toMatchObject({ isError: true });
  });

  it('maps file changes to edit, write or delete by their kinds', () => {
    const change = (type: string) => ({
      path: `/a/${type}.ts`,
      kind: { type },
      diff: '',
    });
    const tool = (changes: ReadonlyArray<unknown>) =>
      one(
        'item/started',
        item({ type: 'fileChange', id: 'f', changes, status: 'inProgress' }),
      )?.parts[0];
    expect(tool([change('update')])).toMatchObject({
      tool: 'edit',
      title: '/a/update.ts',
    });
    expect(tool([change('delete')])).toMatchObject({ tool: 'delete' });
    expect(tool([change('add'), change('update')])).toMatchObject({
      tool: 'edit',
      title: '/a/add.ts +1 more',
    });
  });

  it('shows mcp and web tools', () => {
    expect(
      one(
        'item/started',
        item({
          type: 'mcpToolCall',
          id: 'm',
          server: 'docs',
          tool: 'search',
          status: 'inProgress',
          arguments: { q: 'x' },
          result: null,
          error: null,
        }),
      )?.parts[0],
    ).toMatchObject({ tool: 'mcp', name: 'docs/search', input: { q: 'x' } });
    expect(
      one(
        'item/completed',
        item({
          type: 'mcpToolCall',
          id: 'm',
          server: 'docs',
          tool: 'search',
          status: 'completed',
          arguments: {},
          result: { content: [{ type: 'text', text: 'found' }] },
          error: null,
        }),
      )?.parts[0],
    ).toMatchObject({ toolCallId: 'm', output: 'found', isError: false });
    expect(
      one(
        'item/started',
        item({ type: 'webSearch', id: 'w', query: 'effect 4', action: null }),
      )?.parts[0],
    ).toMatchObject({ tool: 'web', title: 'effect 4' });
  });

  it('projects reasoning, plans and errors', () => {
    expect(
      one(
        'item/completed',
        item({
          type: 'reasoning',
          id: 'r',
          summary: ['Thinking'],
          content: [],
        }),
      ),
    ).toEqual({
      agentId: null,
      role: 'assistant',
      parts: [{ type: 'reasoning', text: 'Thinking' }],
    });
    expect(
      one('turn/plan/updated', {
        threadId: 'main',
        turnId: 't',
        explanation: null,
        plan: [{ step: 'Read', status: 'completed' }],
      })?.parts,
    ).toEqual([
      { type: 'codex.plan', steps: [{ step: 'Read', status: 'completed' }] },
    ]);
    expect(
      one('error', {
        threadId: 'main',
        turnId: 't',
        willRetry: true,
        error: { message: 'Reconnecting', additionalDetails: null },
      })?.parts,
    ).toEqual([{ type: 'error', message: 'Reconnecting (retrying)' }]);
  });

  it('ends a failed turn with its error', () => {
    expect(
      one('turn/completed', {
        threadId: 'main',
        turn: {
          id: 't',
          items: [],
          status: 'failed',
          error: { message: 'model not supported', additionalDetails: null },
        },
      })?.parts,
    ).toEqual([
      { type: 'turnEnded', status: 'failed', error: 'model not supported' },
    ]);
  });

  it("shows each token usage update as the last model call's usage", () => {
    const usage = {
      totalTokens: 0,
      inputTokens: 120,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 0,
      outputTokens: 7,
      reasoningOutputTokens: 0,
    };
    expect(
      one('thread/tokenUsage/updated', {
        threadId: 'main',
        turnId: 't',
        tokenUsage: { total: usage, last: usage, modelContextWindow: 1 },
      }),
    ).toEqual({
      agentId: null,
      role: 'system',
      parts: [
        {
          type: 'usage',
          usage: { inputTokens: 120, outputTokens: 7, cacheReadTokens: 20 },
        },
      ],
    });
  });

  it('keeps unknown records in Raw only', () => {
    expect(
      one('item/completed', item({ type: 'hookPrompt', id: 'h' })),
    ).toBeNull();
    expect(one('something/new', {})).toBeNull();
  });
});
