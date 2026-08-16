import { Effect } from 'effect';
import type { SingleEntityType } from '../../../core/index.js';
import type {
  SingleItemStrategy,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import { toEntity } from '../../runtime/collection-model/index.js';
import { noStrategyState } from '../../domain/strategy-state/index.js';

/**
 * One-shot fetch strategy for the single-item family. Fetches the record once via
 * `config.get`, writes it through the engine's `applyToSyncReplica`, then completes.
 * `WriteError` from `applyToSyncReplica` is not caught — it surfaces so the engine can
 * restart the run.
 */
export type GetOnceConfig<TItem, R = never> = {
  get: () => Effect.Effect<SingleEntityType<TItem>, unknown, R>;
};

export const getOnce = <TItem extends object, R = never>(
  config: GetOnceConfig<TItem, R>,
): SingleItemStrategy<TItem, null, R> => ({
  name: 'get-once',
  state: noStrategyState(),
  run: (ctx: StrategyContext<TItem, null>) =>
    Effect.gen(function* () {
      const entity = yield* config.get();
      yield* ctx.applyToSyncReplica([toEntity(entity)]);
    }),
});
