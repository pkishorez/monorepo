import { Effect, Stream, SynchronizedRef } from 'effect';
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
  bottomSlice,
  makeSlice,
  newestOf,
  oldestOf,
  reconcile,
  topSlice,
  uOf,
  type Cursor,
  type Slice,
} from '../../domain/slice-coverage/index.js';
import { BidirectionalStateSchema, type BidirectionalState } from './state.js';

export type BidirectionalConfig<TItem, R = never> = {
  older: PaginatedSourceBuilder<TItem, R>;
  newer: PaginatedSourceBuilder<TItem, R>;
  tail: LiveSourceBuilder<TItem, R>;
};

/**
 * Newest-first delivery that fills the backlog from both ends. The paginated
 * `older` and `newer` sources descend and ascend until coverage collapses; the
 * live `tail` catches up and remains open.
 */
export const bidirectional = <TItem extends object, R = never>(
  config: BidirectionalConfig<TItem, R>,
): PartitionedStrategy<TItem, BidirectionalState, R> => ({
  name: 'bidirectional',
  state: {
    schema: BidirectionalStateSchema,
    empty: { slices: [] },
  },
  run: (ctx: StrategyContext<TItem, BidirectionalState>) => {
    const older = config.older({ paginated: partitionedSources.paginated });
    const newer = config.newer({ paginated: partitionedSources.paginated });
    const tail = config.tail({ live: partitionedSources.live });
    return Effect.gen(function* () {
      const initial = yield* ctx.getState;
      const stateRef = yield* SynchronizedRef.make(initial);

      const commit = (f: (s: BidirectionalState) => BidirectionalState) =>
        SynchronizedRef.modifyEffect(stateRef, (s) => {
          const next = f(s);
          return Effect.as(ctx.setState(next), [next, next] as const);
        });

      const addRange =
        (low: Cursor<TItem>, high: Cursor<TItem>) =>
        (s: BidirectionalState): BidirectionalState => ({
          slices: reconcile(
            s.slices as readonly Slice<TItem>[],
            makeSlice(low, high),
          ),
        });

      let freshTop: Cursor<TItem> | null = null;

      const resumeTop = topSlice(initial.slices as readonly Slice<TItem>[]);
      if (resumeTop) {
        // Resume from persisted slices: the live tail catches up newer items and
        // the gap-fill loops cover the rest. Re-anchoring would re-fetch ranges
        // already in offline storage.
        freshTop = resumeTop.high;
      } else {
        const [latestOption, oldestOption] = yield* Effect.all(
          [
            Stream.runHead(
              openPartitionedSource(older, {
                cursor: null,
                nextCursor: (batch) => oldestOf([...batch]),
              }),
            ),
            Stream.runHead(
              openPartitionedSource(newer, {
                cursor: null,
                nextCursor: (batch) => newestOf([...batch]),
              }),
            ),
          ],
          { concurrency: 'unbounded' },
        );
        const latest = latestOption._tag === 'Some' ? latestOption.value : [];
        const oldest = oldestOption._tag === 'Some' ? oldestOption.value : [];

        if (latest.length > 0) {
          yield* ctx.applyToSyncReplica([...latest]);
          freshTop = newestOf([...latest]);
          yield* commit(addRange(oldestOf([...latest]), freshTop));
        }
        if (oldest.length > 0) {
          yield* ctx.applyToSyncReplica([...oldest]);
          yield* commit(addRange(oldestOf([...oldest]), newestOf([...oldest])));
        }
      }

      const collapsed = (s: BidirectionalState): boolean =>
        s.slices.length <= 1;

      // Re-reads the top slice every page: a concurrent commit can merge the
      // working slice with the one below it, and the next fetch must resume
      // from the merged floor rather than descend through covered history.
      const downward = Effect.gen(function* () {
        while (true) {
          const state = yield* SynchronizedRef.get(stateRef);
          if (collapsed(state)) return;
          const top = topSlice(state.slices as readonly Slice<TItem>[]);
          if (top === null) return;
          const page = yield* Stream.runHead(
            openPartitionedSource(older, {
              cursor: top.low,
              nextCursor: (batch) => oldestOf([...batch]),
            }),
          );
          if (page._tag === 'None') return;
          const batch = [...page.value];
          const floor = oldestOf(batch);
          yield* ctx.applyToSyncReplica(batch);
          yield* commit(addRange(floor, top.low));
          if (uOf(floor) >= uOf(top.low)) return;
        }
      });

      const upward = Effect.gen(function* () {
        while (true) {
          const state = yield* SynchronizedRef.get(stateRef);
          if (collapsed(state)) return;
          const bottom = bottomSlice(state.slices as readonly Slice<TItem>[]);
          if (bottom === null) return;
          const page = yield* Stream.runHead(
            openPartitionedSource(newer, {
              cursor: bottom.high,
              nextCursor: (batch) => newestOf([...batch]),
            }),
          );
          if (page._tag === 'None') return;
          const batch = [...page.value];
          const ceiling = newestOf(batch);
          yield* ctx.applyToSyncReplica(batch);
          yield* commit(addRange(bottom.high, ceiling));
          if (uOf(ceiling) <= uOf(bottom.high)) return;
        }
      });

      const liveTail = Effect.gen(function* () {
        const stream = openPartitionedSource(tail, {
          cursor: freshTop,
          nextCursor: (batch) => newestOf([...batch]),
        });
        // Anchor every streamed range to the previous batch's newest cursor so
        // successive tail batches stay contiguous and `reconcile` collapses them
        // into one slice. Without advancing the anchor, an empty initial fetch
        // (`freshTop === null`) makes each batch a disjoint range that never
        // merges — e.g. generating 10k items yields one slice per batch.
        let tailAnchor: Cursor<TItem> | null = freshTop;
        yield* Stream.runForEach(stream, (batch) =>
          Effect.gen(function* () {
            yield* ctx.applyToSyncReplica([...batch]);
            const high = newestOf([...batch]);
            yield* commit(addRange(tailAnchor ?? oldestOf([...batch]), high));
            tailAnchor = high;
          }),
        );
      });

      yield* Effect.all([downward, upward, liveTail], {
        concurrency: 'unbounded',
      });
    });
  },
});
