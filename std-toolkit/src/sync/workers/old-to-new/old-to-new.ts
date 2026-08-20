import { Effect, Stream } from 'effect';
import type { DecodedEntity } from '../../../core/index.js';
import type {
  PartitionedStrategy,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import {
  openPartitionedSource,
  partitionedSources,
  type ForwardSourceBuilder,
} from '../../runtime/sync-source/index.js';
import { newestOf } from '../../domain/slice-coverage/index.js';
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
      const stream = openPartitionedSource(source, {
        cursor,
        nextCursor: (batch) => newestOf([...batch]),
      });

      yield* Stream.runForEach(stream, (batch) =>
        Effect.gen(function* () {
          yield* ctx.applyToSyncReplica([...batch]);
          yield* ctx.setState({
            cursor: newestOf([...batch]),
          } satisfies OldToNewState);
        }),
      );
    });
  },
});
