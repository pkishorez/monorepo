import type { Effect, Scope } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { WriteError } from '../../source-of-truth/write-error.js';
import type { StrategyStateSpec } from '../strategy-state.js';

/**
 * The engine-provided surface a partitioned strategy runs against. Carries no
 * partition value — `getState`/`setState` are already routed to this partition's
 * slot. `writeServerTruth` exposes the engine's SoT-write-then-project composition.
 */
export type StrategyContext<TItem, TState = unknown> = {
  writeServerTruth: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<void, WriteError>;
  getState: Effect.Effect<TState, WriteError>;
  setState: (state: TState) => Effect.Effect<void, WriteError>;
  scope: Scope.Scope;
};

/**
 * A partitioned sync strategy. `run` may complete early (a finished drain) or stay
 * alive (a subscription). Its error channel is `WriteError`: the strategy does NOT
 * catch `writeServerTruth` failures — the engine owns the log-and-restart policy.
 */
export type PartitionedStrategy<TItem extends object, TState = unknown> = {
  name: string;
  state: StrategyStateSpec<TState>;
  run: (
    ctx: StrategyContext<TItem, TState>,
  ) => Effect.Effect<void, WriteError, Scope.Scope>;
};
