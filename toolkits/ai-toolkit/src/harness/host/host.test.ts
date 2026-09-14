import { EventType } from '@tanstack/ai';
import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { RunLog } from './host.js';

describe('RunLog.memory', () => {
  it('can attach before the run is claimed', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* RunLog;
        const watcher = yield* Stream.runCollect(log.watchRun('r1')).pipe(
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        yield* log.claim('r1', 't1', 'host');
        yield* log.append('r1', {
          type: EventType.RUN_STARTED,
          runId: 'r1',
          threadId: 't1',
        });
        yield* log.append('r1', {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          outcome: { type: 'success' },
        });
        return yield* Fiber.join(watcher);
      }).pipe(Effect.provide(RunLog.memory)),
    );

    expect([...values].map((item) => item.sequence)).toEqual([0, 1]);
  });

  it('replays after an exclusive per-run sequence and then ends', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* RunLog;
        yield* log.claim('r1', 't1', 'host');
        yield* log.append('r1', {
          type: EventType.RUN_STARTED,
          runId: 'r1',
          threadId: 't1',
        });
        yield* log.append('r1', {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          outcome: { type: 'success' },
        });
        yield* log.finish('r1');
        return yield* Stream.runCollect(log.watchRun('r1', 0));
      }).pipe(Effect.provide(RunLog.memory)),
    );

    expect([...values].map((item) => item.sequence)).toEqual([1]);
  });

  it('uses run plus sequence as the thread cursor', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* RunLog;
        yield* log.claim('r1', 't1', 'host');
        yield* log.append('r1', {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          outcome: { type: 'success' },
        });
        yield* log.finish('r1');
        yield* log.claim('r2', 't1', 'host');
        yield* log.append('r2', {
          type: EventType.RUN_STARTED,
          runId: 'r2',
          threadId: 't1',
        });
        return yield* Stream.runCollect(
          log
            .watchThread('t1', { runId: 'r1', sequence: 0 })
            .pipe(Stream.take(1)),
        );
      }).pipe(Effect.provide(RunLog.memory)),
    );

    expect([...values].map((item) => item.runId)).toEqual(['r2']);
  });
});
