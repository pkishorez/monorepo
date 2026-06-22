import { Effect, Stream, SynchronizedRef } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { PartitionedStrategy, StrategyContext } from '../interface.js';
import {
  bottomSlice,
  makeSlice,
  newestOf,
  oldestOf,
  reconcile,
  topSlice,
  type Cursor,
  type Slice,
} from '../slices/index.js';
import { BidirectionalStateSchema, type BidirectionalState } from './state.js';

type CursorCtx<TItem> = { cursor: Cursor<TItem> | null };

type BidirectionalConfig<TItem> = {
  fetchOlder: (ctx: CursorCtx<TItem>) => Effect.Effect<EntityType<TItem>[]>;
  fetchNewer: (ctx: CursorCtx<TItem>) => Effect.Effect<EntityType<TItem>[]>;
  subscribeNewer: (
    ctx: CursorCtx<TItem>,
  ) => Effect.Effect<Stream.Stream<EntityType<TItem>[]>>;
};

/**
 * Newest-first delivery that fills the backlog from both ends. `fetchOlder`
 * descends and `fetchNewer` ascends (each `{ cursor: null }` ⇒ newest/oldest
 * page; empty ⇒ end), both stopping when the slices collapse to one; the
 * `subscribeNewer` live tail stays open.
 */
export const bidirectional = <TItem extends object>(
  config: BidirectionalConfig<TItem>,
): PartitionedStrategy<TItem, BidirectionalState> => ({
  name: 'bidirectional',
  state: {
    schema: BidirectionalStateSchema,
    empty: { slices: [] },
  },
  run: (ctx: StrategyContext<TItem, BidirectionalState>) =>
    Effect.gen(function* () {
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

      const [latest, oldest] = yield* Effect.all(
        [
          config.fetchOlder({ cursor: null }),
          config.fetchNewer({ cursor: null }),
        ],
        { concurrency: 'unbounded' },
      );

      let freshTop: Cursor<TItem> | null = null;
      if (latest.length > 0) {
        yield* ctx.writeServerTruth(latest);
        freshTop = newestOf(latest);
        yield* commit(addRange(oldestOf(latest), freshTop));
      }
      if (oldest.length > 0) {
        yield* ctx.writeServerTruth(oldest);
        yield* commit(addRange(oldestOf(oldest), newestOf(oldest)));
      }

      const collapsed = (s: BidirectionalState): boolean =>
        s.slices.length <= 1;

      const downward = Effect.gen(function* () {
        while (true) {
          const s = yield* SynchronizedRef.get(stateRef);
          if (collapsed(s)) return;
          const top = topSlice(s.slices as readonly Slice<TItem>[]);
          if (top === null) return;
          const batch = yield* config.fetchOlder({ cursor: top.low });
          if (batch.length === 0) return;
          yield* ctx.writeServerTruth(batch);
          yield* commit(addRange(oldestOf(batch), top.low));
        }
      });

      const upward = Effect.gen(function* () {
        while (true) {
          const s = yield* SynchronizedRef.get(stateRef);
          if (collapsed(s)) return;
          const bottom = bottomSlice(s.slices as readonly Slice<TItem>[]);
          if (bottom === null) return;
          const batch = yield* config.fetchNewer({ cursor: bottom.high });
          if (batch.length === 0) return;
          yield* ctx.writeServerTruth(batch);
          yield* commit(addRange(bottom.high, newestOf(batch)));
        }
      });

      const liveTail = Effect.gen(function* () {
        const stream = yield* config.subscribeNewer({ cursor: freshTop });
        // Anchor every streamed range to the previous batch's newest cursor so
        // successive tail batches stay contiguous and `reconcile` collapses them
        // into one slice. Without advancing the anchor, an empty initial fetch
        // (`freshTop === null`) makes each batch a disjoint range that never
        // merges — e.g. generating 10k items yields one slice per batch.
        let tailAnchor: Cursor<TItem> | null = freshTop;
        yield* Stream.runForEach(stream, (batch) =>
          Effect.gen(function* () {
            if (batch.length === 0) return;
            yield* ctx.writeServerTruth(batch);
            const high = newestOf(batch);
            yield* commit(addRange(tailAnchor ?? oldestOf(batch), high));
            tailAnchor = high;
          }),
        );
      });

      yield* Effect.all([downward, upward, liveTail], {
        concurrency: 'unbounded',
      });
    }),
});
