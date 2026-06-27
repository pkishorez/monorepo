import { Deferred, Effect, Stream, SynchronizedRef } from 'effect';
import type { EntityType } from '../../../../core/index.js';
import type { PartitionedStrategy, StrategyContext } from '../interface.js';
import {
  makeSlice,
  newestOf,
  oldestOf,
  reconcile,
  topSlice,
  type Cursor,
  type Slice,
} from '../slices/index.js';
import { NewToOldStateSchema, type NewToOldState } from './state.js';

type CursorCtx<TItem> = { cursor: Cursor<TItem> | null };

/**
 * Newest-first source split across two streams. `subscribeOlder` is finite,
 * descends toward the oldest record, and completes when the floor is reached.
 * A non-null older cursor resumes from and including that cursor. `subscribeNewer`
 * is live, starts strictly after the supplied cursor, catches up missed records,
 * and then stays open.
 */
type NewToOldConfig<TItem> = {
  subscribeOlder: (
    ctx: CursorCtx<TItem>,
  ) => Effect.Effect<Stream.Stream<EntityType<TItem>[]>>;
  subscribeNewer: (
    ctx: CursorCtx<TItem>,
  ) => Effect.Effect<Stream.Stream<EntityType<TItem>[]>>;
};

const topReachesFloor = (state: NewToOldState): boolean =>
  state.slices.length === 1;

export const newToOld = <TItem extends object>(
  config: NewToOldConfig<TItem>,
): PartitionedStrategy<TItem, NewToOldState> => ({
  name: 'new-to-old',
  state: {
    schema: NewToOldStateSchema,
    empty: { slices: [], reachedOldest: false },
  },
  run: (ctx: StrategyContext<TItem, NewToOldState>) =>
    Effect.gen(function* () {
      const initial = yield* ctx.getState;
      const stateRef = yield* SynchronizedRef.make(initial);

      const commit = (f: (s: NewToOldState) => NewToOldState) =>
        SynchronizedRef.modifyEffect(stateRef, (s) => {
          const next = f(s);
          return Effect.as(ctx.setState(next), [next, next] as const);
        });

      const addRange =
        (low: Cursor<TItem>, high: Cursor<TItem>) =>
        (s: NewToOldState): NewToOldState => ({
          ...s,
          reachedOldest: s.slices.length === 0 ? false : s.reachedOldest,
          slices: reconcile(
            s.slices as readonly Slice<TItem>[],
            makeSlice(low, high),
          ),
        });

      const markReachedOldest = (s: NewToOldState): NewToOldState => ({
        ...s,
        reachedOldest: true,
      });

      const topAtStart = topSlice(initial.slices as readonly Slice<TItem>[]);
      const rangeAlreadyComplete =
        initial.reachedOldest && topReachesFloor(initial);
      const topReady = yield* Deferred.make<Cursor<TItem> | null>();

      if (topAtStart !== null) {
        yield* Deferred.succeed(topReady, topAtStart.high);
      }

      const runBackfill = Effect.gen(function* () {
        if (rangeAlreadyComplete) return;

        const olderStream = yield* config.subscribeOlder({
          cursor: topAtStart?.low ?? null,
        });
        let sawRecord = topAtStart !== null;
        let sharedTop = topAtStart !== null;
        let previousFloor = topAtStart?.low;

        yield* Stream.runForEach(olderStream, (batch) =>
          Effect.gen(function* () {
            if (batch.length === 0) return;
            sawRecord = true;
            yield* ctx.writeServerTruth(batch);
            const batchTop = newestOf(batch);
            const batchFloor = oldestOf(batch);
            yield* commit(addRange(batchFloor, previousFloor ?? batchTop));
            previousFloor = batchFloor;
            if (!sharedTop) {
              sharedTop = true;
              yield* Deferred.succeed(topReady, batchTop);
            }
          }),
        );

        if (sawRecord) yield* commit(markReachedOldest);
        yield* Deferred.succeed(topReady, null);
      });

      const runLiveTail = Effect.gen(function* () {
        const top = yield* Deferred.await(topReady);
        const newerStream = yield* config.subscribeNewer({ cursor: top });
        // Advance the anchor to each batch's newest cursor so successive tail
        // batches stay contiguous and `reconcile` collapses them into one slice.
        // Without this, an empty backfill (`top === null`) makes every batch a
        // disjoint range — generating 10k items would yield one slice per batch.
        let tailAnchor: Cursor<TItem> | null = top;
        yield* Stream.runForEach(newerStream, (batch) =>
          Effect.gen(function* () {
            if (batch.length === 0) return;
            yield* ctx.writeServerTruth(batch);
            const high = newestOf(batch);
            yield* commit(addRange(tailAnchor ?? oldestOf(batch), high));
            tailAnchor = high;
          }),
        );
      });

      yield* Effect.all([runBackfill, runLiveTail], {
        concurrency: 'unbounded',
      });
    }),
});
