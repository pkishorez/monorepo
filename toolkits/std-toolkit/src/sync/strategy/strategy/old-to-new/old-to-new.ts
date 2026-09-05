import { Effect, Stream } from 'effect';
import type { DecodedEntity } from '../../../../core/index.js';
import type { PartitionedStrategy, StrategyContext } from '../index.js';
import {
  openPartitionedSource,
  partitionedSources,
  type ForwardSourceBuilder,
} from '../source/index.js';
import { newestOf } from '../slice-coverage.js';
import { OldToNewStateSchema, type OldToNewState } from './state.js';

export type OldToNewConfig<TItem, R = never> = {
  source: ForwardSourceBuilder<TItem, R>;
};

/**
 * Oldest-to-newest drain strategy. Reads the resume cursor from sync-state, then
 * drains a contextual paginated, polling, or live source. Each non-empty batch
 * is written through the engine's `applyToSyncReplica` and the cursor advances
 * to its newest Entity.
 */
export const oldToNew = <TItem extends object, R = never>(
  config: OldToNewConfig<TItem, R>,
): PartitionedStrategy<TItem, OldToNewState, R> => ({
  name: 'old-to-new',
  state: {
    schema: OldToNewStateSchema,
    empty: { cursor: null },
  },
  run: (ctx: StrategyContext<TItem, OldToNewState>) => {
    const source = config.source(partitionedSources);
    return Effect.gen(function* () {
      const cursor = (yield* ctx.getState)
        .cursor as DecodedEntity<TItem> | null;
      yield* ctx.flow.log(
        cursor === null
          ? 'Opening the source from the beginning'
          : 'Opening the source after the last synced Entity',
        { attributes: { cursor: cursor?.meta._u ?? null } },
      );
      const stream = openPartitionedSource(source, {
        cursor,
        nextCursor: (batch) => newestOf([...batch]),
      });

      let batches = 0;
      yield* Stream.runForEach(stream, (batch) => {
        batches += 1;
        return Effect.gen(function* () {
          yield* ctx.applyToSyncReplica([...batch]);
          yield* ctx.setState({
            cursor: newestOf([...batch]),
          } satisfies OldToNewState);
        }).pipe(
          ctx.flow.withSpan('Receive batch', {
            attributes: { batch: batches, rows: batch.length },
          }),
        );
      });
    });
  },
});
