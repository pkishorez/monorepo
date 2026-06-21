import type { Effect, Scope } from 'effect';
import type { WriteError } from '../../source-of-truth/write-error.js';
import type { StrategyContext } from '../../partitioned/strategies/interface.js';
import type { StrategyStateSpec } from '../../partitioned/strategy-state.js';

export type { StrategyContext } from '../../partitioned/strategies/interface.js';

/**
 * A single-item sync strategy. Structurally identical to `PartitionedStrategy`,
 * kept as a distinct type so the keyed and single-item families never cross. `run`
 * may complete early (a finished `getOnce`) or stay alive (a future subscription).
 * Its error channel is `WriteError`: the strategy does NOT catch `writeServerTruth`
 * failures — the engine owns the log-and-restart-on-2s policy.
 */
export type SingleItemStrategy<TItem extends object, TState = unknown> = {
  name: string;
  state: StrategyStateSpec<TState>;
  run: (
    ctx: StrategyContext<TItem, TState>,
  ) => Effect.Effect<void, WriteError, Scope.Scope>;
};
