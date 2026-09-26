import { Effect, Queue, Schema, Stream, SynchronizedRef } from 'effect';
import type { Entity } from '../../core/index.js';
import {
  make,
  newestOf,
  oldestOf,
  type StrategyYield,
  type SyncStrategy,
} from './definition.js';
import { cover, sliceSchema, type Slice } from './coverage.js';
import { readForward, type ForwardOptions } from './forward.js';

export type NewToOldState<TItem> = {
  readonly slices: ReadonlyArray<Slice<TItem>>;
  readonly reachedOldest: boolean;
};

export type FetchOlder<TItem, R> = (input: {
  readonly before: Entity<TItem> | null;
}) => Effect.Effect<ReadonlyArray<Entity<TItem>>, unknown, R>;

export type NewToOldOptions<TItem, R> = ForwardOptions<TItem, R> & {
  /** The page just older than `before`, newest first; `before: null` is the newest page. */
  readonly fetchOlder: FetchOlder<TItem, R>;
};

type State<TItem> = NewToOldState<TItem>;

/**
 * Shows the newest Entities first, then fills in older ones in the background
 * while reading forward keeps the top fresh. After a reload it also fills the
 * gap between the last saved top and now. Its state is the stretches read so
 * far; they merge into one as the gaps close.
 */
export const newToOld = <TItem, R = never>(
  options: NewToOldOptions<TItem, R>,
): SyncStrategy<TItem, State<TItem>, R> =>
  make<TItem, State<TItem>, R>({
    name: 'new-to-old',
    state: (entity) =>
      Schema.Struct({
        slices: Schema.Array(sliceSchema(entity)),
        reachedOldest: Schema.Boolean,
      }) as unknown as Schema.Codec<State<TItem>, unknown>,
    initial: { slices: [], reachedOldest: false },
    run: ({ state, settledCursor }) =>
      Stream.callback<StrategyYield<TItem, State<TItem>>, unknown, R>((queue) =>
        Effect.gen(function* () {
          const ref = yield* SynchronizedRef.make(state);
          // Every change of state and its yield happen in one step, so the
          // yields reach the engine in the order the state changed.
          const commit = (
            entities: ReadonlyArray<Entity<TItem>>,
            change: (current: State<TItem>) => State<TItem>,
          ) =>
            SynchronizedRef.modifyEffect(ref, (current) => {
              const next = change(current);
              return Queue.offer(queue, { entities, state: next }).pipe(
                Effect.as([next, next] as const),
              );
            });
          const top = (current: State<TItem>) => current.slices.at(-1);

          if (state.slices.length === 0 && !state.reachedOldest) {
            const page = yield* options.fetchOlder({ before: null });
            yield* page.length === 0
              ? commit([], (s) => ({ ...s, reachedOldest: true }))
              : commit(page, (s) => ({
                  ...s,
                  slices: cover(s.slices, {
                    low: oldestOf(page),
                    high: newestOf(page),
                  }),
                }));
          }

          // Walks down from the top slice until it meets the one below,
          // then from the bottom until the Backend has nothing older.
          const backward = Effect.gen(function* () {
            while (true) {
              const current = yield* SynchronizedRef.get(ref);
              const slices = current.slices;
              const upper = slices.at(-1);
              const lower = slices.at(-2);
              if (upper === undefined) return;
              if (lower === undefined && current.reachedOldest) return;
              const page = yield* options.fetchOlder({ before: upper.low });
              if (page.length === 0) {
                yield* commit([], (s) =>
                  lower === undefined
                    ? { ...s, reachedOldest: true }
                    : {
                        ...s,
                        slices: cover(s.slices, {
                          low: lower.high,
                          high: upper.low,
                        }),
                      },
                );
                continue;
              }
              const floor = oldestOf(page);
              if (floor.meta._u >= upper.low.meta._u) return;
              yield* commit(page, (s) => ({
                ...s,
                slices: cover(s.slices, { low: floor, high: upper.low }),
              }));
            }
          });

          const forward = readForward(
            options,
            () => top(SynchronizedRef.getUnsafe(ref))?.high ?? null,
          ).pipe(
            Stream.runForEach((batch) =>
              commit(batch, (s) => {
                const settled = settledCursor(batch);
                const upper = top(s);
                if (settled === null) return s;
                if (upper === undefined)
                  return {
                    ...s,
                    slices: [{ low: oldestOf(batch), high: settled }],
                  };
                if (settled.meta._u <= upper.high.meta._u) return s;
                return {
                  ...s,
                  slices: cover(s.slices, { low: upper.high, high: settled }),
                };
              }),
            ),
          );

          yield* Effect.all([backward, forward], {
            concurrency: 'unbounded',
            discard: true,
          });
        }).pipe(
          Effect.matchCauseEffect({
            onFailure: (cause) => Queue.failCause(queue, cause),
            onSuccess: () => Queue.end(queue),
          }),
        ),
      ),
  });
