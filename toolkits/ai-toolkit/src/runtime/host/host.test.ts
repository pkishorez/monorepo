import { Effect, Layer, Schedule } from 'effect';
import { defaultBroadcaster } from 'std-toolkit/core';
import { Memory } from 'std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import type { CommonProtocol } from '../protocol/index.js';
import { aiTable, messages, runs, threads } from '../table/index.js';
import { HarnessHost } from './host.js';

type HarnessContext = CommonProtocol['HarnessContext'];
type RunOutcome = CommonProtocol['RunOutcome'];

const say =
  (text: string, facts: RunOutcome['facts'] = null) =>
  async (_input: unknown, context: HarnessContext): Promise<RunOutcome> => {
    await context.session('native-session');
    context.transcript.text(text);
    return { type: 'completed', facts };
  };

const storage = Layer.merge(Memory.make(aiTable).layer, defaultBroadcaster);

const hostWith = (runner: ReturnType<typeof say>) =>
  HarnessHost.layer({ hostId: 'test' }, { claude: runner, codex: runner }).pipe(
    Layer.provideMerge(storage),
  );

const untilRunEnds = (threadId: string, runId: string) =>
  runs.get({ threadId, id: runId }).pipe(
    Effect.flatMap((record) =>
      record !== null && record.value.finishedAt !== null
        ? Effect.succeed(record.value)
        : Effect.fail(new Error('not finished yet')),
    ),
    Effect.retry(Schedule.spaced('10 millis')),
    Effect.timeout('3 seconds'),
  );

const newThread = (id: string) =>
  threads.insert({
    id,
    harness: 'claude',
    cwd: '/tmp',
    status: 'idle',
    activeRunId: null,
    data: { type: 'claude', sessionId: null },
  });

describe('HarnessHost', () => {
  it('runs a turn, persists Messages through the Transcript, and settles Thread and Run', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const host = yield* HarnessHost;
        yield* newThread('t1');
        yield* host.start({
          harness: 'claude',
          threadId: 't1',
          runId: 'r1',
          message: { id: 'u1', content: 'hi' },
          model: 'claude-sonnet-4-6',
          options: {},
        });
        const run = yield* untilRunEnds('t1', 'r1');
        const thread = yield* threads.get({ id: 't1' });
        const stored = yield* messages.query(
          'byThreadUpdate',
          { pk: { threadId: 't1' }, '>=': null },
          { limit: 10 },
        );
        return { run, thread: thread?.value, stored: stored.items };
      }).pipe(
        Effect.provide(
          hostWith(
            say('hello', {
              type: 'claude',
              totalCostUsd: 0.01,
              durationMs: 100,
              apiDurationMs: 80,
              turns: 1,
              models: {},
              context: null,
            }),
          ),
        ),
        Effect.scoped,
      ),
    );

    expect(result.run.status).toBe('completed');
    expect(result.run.hostId).toBe('test');
    expect(result.run.data.facts).toMatchObject({
      type: 'claude',
      totalCostUsd: 0.01,
    });
    expect(result.thread).toMatchObject({
      status: 'idle',
      activeRunId: null,
      data: { type: 'claude', sessionId: 'native-session' },
    });
    expect(result.stored.map((item) => item.value.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(result.stored[1]?.value.data.parts).toEqual([
      { type: 'text', content: 'hello' },
    ]);
  });

  it('cancels orphaned Runs and Threads when it boots', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* newThread('t2').pipe(
          Effect.andThen(
            threads.getAndUpdate(
              { id: 't2' },
              { status: 'running', activeRunId: 'orphan' },
            ),
          ),
        );
        yield* runs.insert({
          id: 'orphan',
          threadId: 't2',
          harness: 'claude',
          status: 'waiting',
          hostId: 'dead-host',
          startedAt: 1,
          finishedAt: null,
          data: {
            type: 'claude',
            model: 'claude-sonnet-4-6',
            thinking: null,
            permissionMode: 'default',
            allowDangerouslySkipPermissions: false,
            maxTurns: null,
            permissionTimeoutMs: null,
            inputHash: '{}',
            facts: null,
          },
        });
        yield* Effect.scoped(
          Effect.provide(
            Effect.andThen(HarnessHost, Effect.void),
            HarnessHost.layer(
              { hostId: 'test' },
              {
                claude: say(''),
                codex: say(''),
              },
            ),
          ),
        );
        const run = yield* runs.get({ threadId: 't2', id: 'orphan' });
        const thread = yield* threads.get({ id: 't2' });
        return { run: run?.value, thread: thread?.value };
      }).pipe(Effect.provide(storage)),
    );

    expect(result.run?.status).toBe('cancelled');
    expect(result.run?.finishedAt).not.toBeNull();
    expect(result.thread).toMatchObject({
      status: 'cancelled',
      activeRunId: null,
    });
  });
});
