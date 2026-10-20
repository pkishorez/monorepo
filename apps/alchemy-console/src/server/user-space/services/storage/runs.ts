import { type Context, Effect, Semaphore, Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  run as runEntity,
  runEvent,
  runLane,
  runLog,
  type StoredLane,
  type StoredRun,
  type StoredRunEvent,
  type StoredRunLog,
} from './table.ts';

/*
 * The runs part of the User Space's records: each Run, its events and log
 * batches, and the lanes runs take turns in. Events and logs are keyed by
 * their `seq` within the run, so a range read returns them in order.
 */

/** The sort key of a `seq`: zero-padded, so keys sort as numbers do. */
const keyOf = (seq: number) => String(seq).padStart(12, '0');

type Run = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A>;

/** Every page of a query, oldest first. */
const everyPage = <T>(
  page: (after: Entity<T> | undefined) => Effect.Effect<{
    readonly items: ReadonlyArray<Entity<T>>;
    readonly hasMore: boolean;
  }>,
) =>
  Effect.gen(function* () {
    const found: Array<T> = [];
    let after: Entity<T> | undefined;
    while (true) {
      const next = yield* page(after);
      found.push(...next.items.map(({ value }) => value));
      after = next.items.at(-1);
      if (!next.hasMore || after === undefined) return found;
    }
  });

const paged = <T>(after: Entity<T> | undefined) => ({
  excludeDeleted: true,
  ...(after ? { after } : {}),
});

export const makeRuns = (run: Run, table: Context.Context<never>) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1);

    const get = (runId: string) =>
      run(runEntity.get({ runId }, { excludeDeleted: true })).pipe(
        Effect.map((found) => found?.value ?? null),
      );

    return {
      /** Runs `effect` with no other `exclusively` effect in between, so a
       * run's status, its lane and its numbering change together. */
      exclusively: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Semaphore.withPermit(lock, effect),
      get,
      /** Keeps `record`, over any run of the same ID. */
      put: (record: StoredRun) =>
        Effect.gen(function* () {
          const { runId, ...fields } = record;
          const found = yield* run(runEntity.get({ runId }));
          const saved =
            found === null
              ? yield* run(runEntity.insert(record))
              : yield* run(runEntity.getAndUpdate({ runId }, fields));
          return saved.value;
        }),
      /** Each time anything of `runId` is written: the run, an event, or a log batch. */
      touched: (runId: string): Stream.Stream<void> =>
        Stream.merge(
          Stream.merge(
            runEntity.subscribe({ runId }),
            runEvent.subscribe({ runId }),
          ),
          runLog.subscribe({ runId }),
        ).pipe(Stream.as(undefined), Stream.provideContext(table)),
      events: {
        /** `runId`'s events after `seq`, in order. */
        after: (runId: string, seq: number) =>
          everyPage<StoredRunEvent>((last) =>
            run(
              runEvent.query(
                'primary',
                { pk: { runId }, '>': { key: keyOf(seq) } },
                paged(last),
              ),
            ),
          ),
        insert: ({ key: _key, ...record }: StoredRunEvent) =>
          Effect.asVoid(
            run(runEvent.insert({ key: keyOf(record.seq), ...record })),
          ),
      },
      logs: {
        /** `runId`'s log batches after `seq`, in order. */
        after: (runId: string, seq: number) =>
          everyPage<StoredRunLog>((last) =>
            run(
              runLog.query(
                'primary',
                { pk: { runId }, '>': { key: keyOf(seq) } },
                paged(last),
              ),
            ),
          ),
        insert: ({ key: _key, ...record }: StoredRunLog) =>
          Effect.asVoid(
            run(runLog.insert({ key: keyOf(record.seq), ...record })),
          ),
      },
      lanes: {
        /** Every lane with a run in it. */
        all: everyPage<StoredLane>((last) =>
          run(runLane.query('primary', { pk: {}, '>=': null }, paged(last))),
        ),
        get: (lane: string) =>
          run(runLane.get({ lane }, { excludeDeleted: true })).pipe(
            Effect.map((found) => found?.value ?? null),
          ),
        /** Keeps `record`; a lane with no run in it is erased. */
        put: (record: StoredLane) =>
          Effect.gen(function* () {
            const { lane, ...fields } = record;
            const found = yield* run(runLane.get({ lane }));
            if (fields.current === null && fields.waiting === null) {
              if (found !== null)
                yield* run(
                  runLane.hardDelete({ lane }, 'I KNOW WHAT I AM DOING'),
                );
              return;
            }
            if (found === null) yield* run(runLane.insert(record));
            else yield* run(runLane.getAndUpdate({ lane }, fields));
          }),
      },
    };
  });

export type Runs = Effect.Success<ReturnType<typeof makeRuns>>;
