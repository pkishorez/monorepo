import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Exit, Fiber, Scope, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HarnessSession, RawOut } from '../../harness/index.js';
import type { Part, Projected } from '../../projection/index.js';
import type { Raw } from '../../raw/index.js';
import { claude } from './index.js';
import { restore } from './sdk-session/index.js';

/** Every message the Agent SDK's query yields, as the harness reads it. */
const sdkMessages = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => {
  const sdk =
    await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>();
  const query: typeof sdk.query = (params) => {
    const live = sdk.query(params);
    const tee: typeof live = new Proxy(live, {
      get: (target, key) => {
        if (key === Symbol.asyncIterator) return () => tee;
        if (key === 'next') {
          return async (...args: []) => {
            const result = await target.next(...args);
            if (result.done !== true) {
              sdkMessages.push(
                JSON.parse(JSON.stringify(result.value)) as Record<
                  string,
                  unknown
                >,
              );
            }
            return result;
          };
        }
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return tee;
  };
  return { ...sdk, query };
});

/**
 * Runs the real local Claude Code. Opt in with AI_TOOLKIT_E2E=1; set
 * AI_TOOLKIT_CAPTURE=<dir> to also write every turn's records there as JSON
 * (the project fixtures were captured this way).
 */
const enabled = process.env['AI_TOOLKIT_E2E'] === '1';
const capture = process.env['AI_TOOLKIT_CAPTURE'];
const MODEL = 'claude-haiku-5-5';
const SECRET = 'PINEAPPLE-42';

const asRaw = (out: RawOut, index: number): Raw => ({
  id: String(index).padStart(6, '0'),
  sessionId: 'e2e',
  turnId: 'e2e',
  harness: 'claude',
  kind: out.kind,
  agentId: out.agentId ?? null,
  payload: out.payload,
  at: index,
});

const projectAll = (outs: ReadonlyArray<RawOut>): ReadonlyArray<Projected> =>
  outs.flatMap((out, i) => {
    const projected = claude.project(asRaw(out, i));
    return projected === null ? [] : [projected];
  });

const parts = (messages: ReadonlyArray<Projected>): ReadonlyArray<Part> =>
  messages.flatMap((m) => m.parts);

const toolCalls = (messages: ReadonlyArray<Projected>) =>
  parts(messages).flatMap((p) => (p.type === 'toolCall' ? [p] : []));

/** The answer's text, whole or streamed in chunks. */
const texts = (messages: ReadonlyArray<Projected>) =>
  parts(messages)
    .flatMap((p) =>
      p.type === 'text' || (p.type === 'textChunk' && p.channel === 'text')
        ? [p.text]
        : [],
    )
    .join('\n');

/**
 * Restores every stored assistant record from the turn's chunks and checks
 * it against what the SDK sent: nothing is lost, though no text is kept twice.
 */
const expectRestorable = (outs: ReadonlyArray<RawOut>) => {
  const chunks = new Map<string, string[]>();
  for (const out of outs) {
    if (out.kind !== 'text.chunk') continue;
    const { streamId, text } = out.payload as {
      streamId: string;
      text: string;
    };
    chunks.set(streamId, [...(chunks.get(streamId) ?? []), text]);
  }
  const stored = outs.filter((o) => o.kind === 'assistant');
  expect(stored.length).toBeGreaterThan(0);
  for (const out of stored) {
    const uuid = (out.payload as { uuid: string }).uuid;
    const original = sdkMessages.find((m) => m['uuid'] === uuid);
    expect(original).toBeDefined();
    expect(restore(out.payload, chunks)).toEqual(original);
  }
};

const lastTurnEnd = (messages: ReadonlyArray<Projected>) =>
  parts(messages)
    .flatMap((p) => (p.type === 'turnEnded' ? [p] : []))
    .at(-1);

const save = (name: string, outs: ReadonlyArray<RawOut>) => {
  if (capture !== undefined) {
    writeFileSync(join(capture, `${name}.json`), JSON.stringify(outs, null, 2));
  }
};

/**
 * Runs one turn, calling `during` once with the first record that matches
 * `when` (to steer or cancel mid-turn), and collects every record.
 */
const runTurn = (
  session: HarnessSession,
  text: string,
  options?: {
    readonly when: (out: RawOut) => boolean;
    readonly during: Effect.Effect<void, unknown>;
  },
) =>
  Effect.gen(function* () {
    const outs: RawOut[] = [];
    const forks: Array<Fiber.Fiber<void, unknown>> = [];
    yield* session.turn(text).pipe(
      Stream.runForEach((out) =>
        Effect.gen(function* () {
          outs.push(out);
          if (
            options !== undefined &&
            forks.length === 0 &&
            options.when(out)
          ) {
            forks.push(yield* Effect.forkChild(options.during));
          }
        }),
      ),
    );
    for (const fork of forks) yield* Fiber.join(fork);
    return outs;
  });

const hasToolCall = (name: string) => (out: RawOut) =>
  out.kind === 'assistant' &&
  JSON.stringify(out.payload).includes(`"name":"${name}"`);

describe.skipIf(!enabled)('claude harness against the real Claude Code', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-toolkit-claude-e2e-'));
  let scope: Scope.Closeable;
  let session: HarnessSession;
  const run = <A>(effect: Effect.Effect<A, unknown>) =>
    Effect.runPromise(effect);

  beforeAll(async () => {
    writeFileSync(join(cwd, 'note.txt'), `The secret word is ${SECRET}.\n`);
    scope = await run(Scope.make());
    session = await run(
      claude
        .open({ cwd, model: MODEL, settings: { effort: 'low' } })
        .pipe(Scope.provide(scope)),
    );
  });

  afterAll(async () => {
    if (scope !== undefined) await run(Scope.close(scope, Exit.void));
  });

  it('lists the models this login can run by their full ids, one the default', async () => {
    const models = await run(claude.availableModels!);
    const ids = models.map((model) => model.id);
    expect(ids).toContain(MODEL);
    expect(ids).not.toContain('default');
    expect(models.filter((model) => model.isDefault)).toHaveLength(1);
  }, 60_000);

  it('reads a file: a Read tool call, its result, and a done turn', async () => {
    const outs = await run(
      runTurn(
        session,
        'Use the Read tool to read note.txt, then tell me the secret word.',
      ),
    );
    save('read', outs);
    const messages = projectAll(outs);
    const read = toolCalls(messages).find((c) => c.name === 'Read');
    expect(read?.tool).toBe('read');
    expect(read?.title).toContain('note.txt');
    const result = parts(messages).find(
      (p) => p.type === 'toolResult' && p.toolCallId === read?.id,
    );
    expect(result).toMatchObject({ isError: false });
    expect(JSON.stringify(result)).toContain(SECRET);
    expect(outs.at(-1)?.kind).toBe('result');
    expect(lastTurnEnd(messages)?.status).toBe('done');
    expect(await run(session.nativeId)).toBeTypeOf('string');
  }, 120_000);

  it('streams a long answer in chunks of a few sentences; the whole points at them', async () => {
    const outs = await run(
      runTurn(
        session,
        'Without using any tools, write about 8 sentences about octopuses ' +
          'as one paragraph.',
      ),
    );
    save('stream', outs);
    const messages = projectAll(outs);
    const chunks = parts(messages).flatMap((p) =>
      p.type === 'textChunk' && p.channel === 'text' ? [p] : [],
    );
    const streamIds = [...new Set(chunks.map((c) => c.streamId))];
    expect(streamIds).toHaveLength(1);
    expect(chunks.length).toBeGreaterThan(1);
    // The whole record comes after its chunks, holding a pointer to them.
    const wholeAt = outs.findIndex((o) =>
      JSON.stringify(o.payload).includes(`{"$stream":"${streamIds[0]}"}`),
    );
    expect(outs[wholeAt]?.kind).toBe('assistant');
    expect(outs.findLastIndex((o) => o.kind === 'text.chunk')).toBeLessThan(
      wholeAt,
    );
    // It shows no text twice: only the chunks show the answer.
    expect(parts(messages).some((p) => p.type === 'text')).toBe(false);
    const { uuid } = outs[wholeAt]!.payload as { uuid: string };
    const sent = sdkMessages.find((m) => m['uuid'] === uuid) as {
      message: { content: ReadonlyArray<{ text: string }> };
    };
    expect(sent.message.content[0]?.text.length).toBeGreaterThan(400);
    expect(chunks.map((c) => c.text).join('')).toBe(
      sent.message.content[0]?.text,
    );
    expectRestorable(outs);
    expect(outs.at(-1)?.kind).toBe('result');
  }, 120_000);

  it('runs a subagent whose records carry the spawning tool call id', async () => {
    const outs = await run(
      runTurn(
        session,
        'This is a test of nested subagents. Use the Agent tool to start a ' +
          'general-purpose subagent, and give it exactly this task: "You must ' +
          'not read any file yourself. Your only allowed action is one call ' +
          'to the Agent tool, starting a general-purpose subagent that reads ' +
          'note.txt and reports the secret word. Report that word back." ' +
          'Then tell me the word.',
      ),
    );
    save('subagent', outs);
    expectRestorable(outs);
    const messages = projectAll(outs);
    const spawn = toolCalls(messages.filter((m) => m.agentId === null)).find(
      (c) => c.tool === 'subagent',
    );
    expect(spawn).toBeDefined();
    const children = messages.filter((m) => m.agentId === spawn?.id);
    expect(children.length).toBeGreaterThan(0);
    // The nested call is made by the first subagent, so it carries that
    // subagent's id. Claude Code streams only task_* frames for the nested
    // subagent's own work, not its messages, so it has no records here.
    const nested = toolCalls(children).find((c) => c.tool === 'subagent');
    expect(nested).toBeDefined();
    const nestedTask = outs.find(
      (o) =>
        o.kind === 'system/task_started' &&
        JSON.stringify(o.payload).includes(`"tool_use_id":"${nested?.id}"`),
    );
    expect(nestedTask).toBeDefined();
    expect(outs.at(-1)?.kind).toBe('result');
  }, 300_000);

  it('steers mid-turn: the steer joins the turn, which ends once', async () => {
    const outs = await run(
      runTurn(
        session,
        'Run the Bash command `sleep 5; echo one`, then reply with the word DONE.',
        {
          when: hasToolCall('Bash'),
          during: session.steer(
            'Also, at the very end of your reply, add the word BANANA.',
          ),
        },
      ),
    );
    save('steer', outs);
    expectRestorable(outs);
    const messages = projectAll(outs);
    expect(texts(messages)).toContain('BANANA');
    expect(outs.at(-1)?.kind).toBe('result');
    expect(lastTurnEnd(messages)?.status).toBe('done');
  }, 120_000);

  it('cancels mid-turn, and the next turn still works', async () => {
    const started = Date.now();
    const outs = await run(
      runTurn(
        session,
        'Run the Bash command `sleep 60`, then reply with the word FINISHED.',
        { when: hasToolCall('Bash'), during: session.cancel },
      ),
    );
    save('cancel', outs);
    expect(Date.now() - started).toBeLessThan(45_000);
    const messages = projectAll(outs);
    expect(texts(messages)).not.toContain('FINISHED');
    const end = lastTurnEnd(messages);
    if (end !== undefined) expect(end.status).toBe('cancelled');

    const next = await run(
      runTurn(session, 'Reply with only the word OK. Do not use tools.'),
    );
    save('after-cancel', next);
    const after = projectAll(next);
    expect(texts(after)).toContain('OK');
    expect(lastTurnEnd(after)?.status).toBe('done');
  }, 180_000);

  it('resumes by nativeId in a fresh session', async () => {
    const nativeId = await run(session.nativeId);
    expect(nativeId).toBeTypeOf('string');
    const outs = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const resumed = yield* claude.open({
            cwd,
            model: MODEL,
            settings: { effort: 'low' },
            ...(nativeId === undefined ? {} : { nativeId }),
          });
          const outs = yield* runTurn(
            resumed,
            'Without using any tools: what was the secret word in note.txt?',
          );
          expect(yield* resumed.nativeId).toBeTypeOf('string');
          return outs;
        }),
      ),
    );
    save('resume', outs);
    const messages = projectAll(outs);
    expect(toolCalls(messages)).toEqual([]);
    expect(texts(messages)).toContain(SECRET);
  }, 120_000);
});
