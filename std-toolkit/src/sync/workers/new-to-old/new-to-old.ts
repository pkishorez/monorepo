import { Deferred, Effect, Stream, SynchronizedRef } from 'effect';
import type {
  PartitionedStrategy,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import {
  openPartitionedSource,
  partitionedSources,
  type LiveSourceBuilder,
  type PaginatedSourceBuilder,
} from '../../runtime/sync-source/index.js';
import {
  makeSlice,
  newestOf,
  oldestOf,
  reconcile,
  topSlice,
  type Cursor,
  type Slice,
} from '../../domain/slice-coverage/index.js';
import { NewToOldStateSchema, type NewToOldState } from './state.js';

export type NewToOldConfig<TItem, R = never> = {
  backfill: PaginatedSourceBuilder<TItem, R>;
  tail: LiveSourceBuilder<TItem, R>;
};

const topReachesFloor = (state: NewToOldState): boolean =>
  state.slices.length === 1;

export const newToOld = <TItem extends object, R = never>(
  config: NewToOldConfig<TItem, R>,
): PartitionedStrategy<TItem, NewToOldState, R> => ({
  name: 'new-to-old',
  state: {
    schema: NewToOldStateSchema,
    empty: { slices: [], reachedOldest: false },
  },
  run: (ctx: StrategyContext<TItem, NewToOldState>) => {
    const backfill = config.backfill({
      paginated: partitionedSources.paginated,
    });
    const tail = config.tail({ live: partitionedSources.live });
    return Effect.gen(function* () {
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

        const olderStream = openPartitionedSource(backfill, {
          cursor: topAtStart?.low ?? null,
          nextCursor: (batch) => oldestOf([...batch]),
        });
        let sawRecord = topAtStart !== null;
        let sharedTop = topAtStart !== null;
        let previousFloor = topAtStart?.low;

        let batches = 0;
        yield* Stream.runForEach(olderStream, (batch) => {
          batches += 1;
          return Effect.gen(function* () {
            sawRecord = true;
            yield* ctx.applyToSyncReplica([...batch]);
            const batchTop = newestOf([...batch]);
            const batchFloor = oldestOf([...batch]);
            yield* commit(addRange(batchFloor, previousFloor ?? batchTop));
            previousFloor = batchFloor;
            if (!sharedTop) {
              sharedTop = true;
              yield* Deferred.succeed(topReady, batchTop);
            }
          }).pipe(
            ctx.flow.withSpan('Backfill batch', {
              attributes: { batch: batches, rows: batch.length },
            }),
          );
        });

        if (sawRecord) yield* commit(markReachedOldest);
        yield* Deferred.succeed(topReady, null);
      });

      const runLiveTail = Effect.gen(function* () {
        const top = yield* Deferred.await(topReady);
        const newerStream = openPartitionedSource(tail, {
          cursor: top,
          nextCursor: (batch) => newestOf([...batch]),
        });
        // Advance the anchor to each batch's newest cursor so successive tail
        // batches stay contiguous and `reconcile` collapses them into one slice.
        // Without this, an empty backfill (`top === null`) makes every batch a
        // disjoint range — generating 10k items would yield one slice per batch.
        let tailAnchor: Cursor<TItem> | null = top;
        let batches = 0;
        yield* Stream.runForEach(newerStream, (batch) => {
          batches += 1;
          return Effect.gen(function* () {
            yield* ctx.applyToSyncReplica([...batch]);
            const high = newestOf([...batch]);
            yield* commit(addRange(tailAnchor ?? oldestOf([...batch]), high));
            tailAnchor = high;
          }).pipe(
            ctx.flow.withSpan('Tail batch', {
              attributes: { batch: batches, rows: batch.length },
            }),
          );
        });
      });

      yield* Effect.all([runBackfill, runLiveTail], {
        concurrency: 'unbounded',
      });
    });
  },
});
