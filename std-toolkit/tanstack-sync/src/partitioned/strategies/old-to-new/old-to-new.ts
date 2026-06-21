import { Effect, Stream } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { PartitionedStrategy, StrategyContext } from '../interface.js';
import { OldToNewStateSchema, type OldToNewState } from './state.js';

type Cursor<TItem> = { cursor: EntityType<TItem> | null };

/**
 * Polling source: given the last cursor, resolves one batch oldest-first. An empty
 * batch signals the drain is complete.
 */
type FetchConfig<TItem> = {
  fetch: (ctx: Cursor<TItem>) => Effect.Effect<EntityType<TItem>[]>;
};

/**
 * Streaming source: given the last cursor, resolves an `Effect` that yields a
 * `Stream` of oldest-first batches. The strategy drains the stream, writing each
 * batch and advancing the cursor; a finite stream ends the run, an open one keeps
 * the strategy alive as a subscription.
 */
type StreamConfig<TItem> = {
  stream: (
    ctx: Cursor<TItem>,
  ) => Effect.Effect<Stream.Stream<EntityType<TItem>[]>>;
};

/**
 * Oldest-to-newest drain strategy. Reads the resume cursor from sync-state, then
 * either polls `config.fetch` batch-by-batch (stopping on an empty batch) or drains
 * `config.stream` (staying alive while the stream is open). Each non-empty batch is
 * written through the engine's `writeServerTruth` and the cursor advanced to its
 * newest entity. `WriteError` from `writeServerTruth` is not caught — it surfaces so
 * the engine can restart the run, resuming from the persisted cursor.
 */
export const oldToNew = <TItem extends object>(
  config: FetchConfig<TItem> | StreamConfig<TItem>,
): PartitionedStrategy<TItem, OldToNewState> => ({
  name: 'old-to-new',
  state: {
    schema: OldToNewStateSchema,
    empty: { cursor: null },
  },
  run: (ctx: StrategyContext<TItem, OldToNewState>) =>
    Effect.gen(function* () {
      const writeBatch = (batch: EntityType<TItem>[]) =>
        Effect.gen(function* () {
          if (batch.length === 0) return;
          yield* ctx.writeServerTruth(batch);
          const newest = batch[batch.length - 1]!;
          yield* ctx.setState({ cursor: newest } satisfies OldToNewState);
        });

      const readCursor = Effect.map(
        ctx.getState,
        (state) => state.cursor as EntityType<TItem> | null,
      );

      if ('stream' in config) {
        const cursor = yield* readCursor;
        const stream = yield* config.stream({ cursor });
        yield* Stream.runForEach(stream, writeBatch);
        return;
      }

      while (true) {
        const cursor = yield* readCursor;
        const batch = yield* config.fetch({ cursor });
        if (batch.length === 0) return;
        yield* writeBatch(batch);
      }
    }),
});
