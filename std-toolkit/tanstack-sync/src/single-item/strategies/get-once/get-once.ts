import { Effect } from 'effect';
import type { SingleEntityType } from '@std-toolkit/core';
import type { SingleItemStrategy, StrategyContext } from '../interface.js';
import { toEntity } from '../../../util/to-entity.js';

/**
 * One-shot fetch strategy for the single-item family. Fetches the record once via
 * `config.get`, writes it through the engine's `writeServerTruth`, then completes.
 * `WriteError` from `writeServerTruth` is not caught — it surfaces so the engine can
 * restart the run.
 */
export const getOnce = <TItem extends object>(config: {
  get: () => Effect.Effect<SingleEntityType<TItem>>;
}): SingleItemStrategy<TItem> => ({
  run: (ctx: StrategyContext<TItem>) =>
    Effect.gen(function* () {
      const entity = yield* config.get();
      yield* ctx.writeServerTruth([toEntity(entity)]);
    }),
});
