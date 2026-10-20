import { DatabaseSync } from 'node:sqlite';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { RunnerHost } from '../../services/runner-host/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { type EnqueueInput, RunLifecycle } from './lifecycle.ts';

/*
 * The lifecycle on a User Space's own records (SQLite, as a Durable Object
 * keeps them), with containers that only say they started and stopped:
 * a stage's runs take turns, the newest waiting run replaces the one
 * waiting, and a run that runs too long is ended and its container stopped.
 */

/** A Durable Object's SQLite storage, on `node:sqlite`. */
const sqliteStorage = () => {
  const db = new DatabaseSync(':memory:');
  return {
    sql: {
      exec: (sql: string, ...parameters: ReadonlyArray<unknown>) => {
        const statement = db.prepare(sql);
        const rows = statement.columns().length
          ? statement.all(...(parameters as Array<never>))
          : (statement.run(...(parameters as Array<never>)), []);
        return { toArray: () => rows as never, rowsWritten: 0 };
      },
    },
    transactionSync: <A>(callback: () => A) => {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
};

const make = (options: { timeoutMs?: number } = {}) => {
  const containers = {
    started: [] as Array<string>,
    stopped: [] as Array<string>,
  };
  let alarm: number | null = null;
  const layer = RunLifecycle.layer({
    silenceLimitMs: 60_000,
    timeoutMs: options.timeoutMs ?? 60_000,
    alarm: {
      getAlarm: async () => alarm,
      setAlarm: async (at) => void (alarm = at),
    },
  }).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Storage.layer(sqliteStorage() as never),
        Layer.succeed(
          RunnerHost,
          RunnerHost.of({
            start: ({ runId }) =>
              Effect.sync(() => void containers.started.push(runId)),
            stop: (runId) =>
              Effect.sync(() => void containers.stopped.push(runId)),
          }),
        ),
      ),
    ),
  );
  const run = <A, E>(effect: Effect.Effect<A, E, RunLifecycle | Storage>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));
  return { run, containers, alarm: () => alarm };
};

const deploy = (commit: string): EnqueueInput => ({
  projectId: 'project-1',
  stage: 'prod',
  kind: 'deploy',
  commit,
  trigger: 'push',
  spec: {
    connectionId: 'connection-1',
    repo: 'ada/app',
    folder: '.',
    setupCommand: null,
  },
});

const statusOf = (runId: string) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    return (yield* storage.runs.get(runId))?.status;
  });

describe('RunLifecycle', () => {
  it('runs a stage’s runs one at a time, the newest waiting one replacing the one waiting', async () => {
    const { run, containers } = make();
    await run(
      Effect.gen(function* () {
        const lifecycle = yield* RunLifecycle;
        const finished: Array<string> = [];
        yield* lifecycle.onFinished((ended) =>
          Effect.sync(
            () => void finished.push(`${ended.commit}:${ended.status}`),
          ),
        );
        const first = yield* lifecycle.enqueue(deploy('a'));
        const second = yield* lifecycle.enqueue(deploy('b'));
        const third = yield* lifecycle.enqueue(deploy('c'));
        expect(containers.started).toEqual([first]);
        expect(yield* statusOf(second)).toBe('cancelled');
        expect(yield* statusOf(third)).toBe('queued');
        // Another stage, or an Inspect, does not wait.
        const preview = yield* lifecycle.enqueue({
          ...deploy('d'),
          stage: 'pr1',
        });
        expect(containers.started).toEqual([first, preview]);

        yield* lifecycle.finish(first, { _tag: 'Failed', message: 'No.' });
        expect(yield* statusOf(first)).toBe('failed');
        expect(containers.stopped).toEqual([first]);
        expect(containers.started).toEqual([first, preview, third]);
        expect(yield* statusOf(third)).toBe('inspecting');
        expect(finished).toEqual(['b:cancelled', 'a:failed']);
      }),
    );
  });

  it('cancels a waiting run at once, and asks a running one to stop', async () => {
    const { run } = make();
    await run(
      Effect.gen(function* () {
        const lifecycle = yield* RunLifecycle;
        const running = yield* lifecycle.enqueue(deploy('a'));
        const waiting = yield* lifecycle.enqueue(deploy('b'));
        yield* lifecycle.cancel(waiting);
        expect(yield* statusOf(waiting)).toBe('cancelled');
        yield* lifecycle.cancel(running);
        expect(yield* statusOf(running)).toBe('inspecting');
        const storage = yield* Storage;
        expect((yield* storage.runs.get(running))?.cancelRequested).toBe(true);
        const again = yield* lifecycle.cancel(waiting).pipe(Effect.flip);
        expect(again.reason).toBe('finished');
      }),
    );
  });

  it('ends a run that runs past its time, stops its container, and wakes for the next', async () => {
    const { run, containers, alarm } = make({ timeoutMs: 1 });
    await run(
      Effect.gen(function* () {
        const lifecycle = yield* RunLifecycle;
        const first = yield* lifecycle.enqueue(deploy('a'));
        expect(alarm()).not.toBeNull();
        yield* Effect.sleep('5 millis');
        yield* lifecycle.check(Date.now());
        expect(yield* statusOf(first)).toBe('failed');
        expect(containers.stopped).toEqual([first]);
        const report = yield* lifecycle
          .report(first, 1, () => Effect.void, 'event')
          .pipe(Effect.flip);
        expect(report.reason).toBe('finished');
      }),
    );
  });
});
