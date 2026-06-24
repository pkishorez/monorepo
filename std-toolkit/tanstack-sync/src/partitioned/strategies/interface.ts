import type { Effect, Scope } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { WriteError } from '../../source-of-truth/write-error.js';
import type { StrategyStateSpec } from '../strategy-state.js';
import type { ForwardFetch } from '../../types.js';
import type { CadenceConfig } from '../../cadence-sync/index.js';

/**
 * The engine-provided surface a partitioned strategy runs against. Carries no
 * partition value — `getState`/`setState` are already routed to this partition's
 * slot. `writeServerTruth` exposes the engine's SoT-write-then-project composition.
 */
export type StrategyContext<TItem, TState = unknown> = {
  forwardFetch: ForwardFetch<TItem>;
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

/**
 * One sync entry — used both as a total collection's `sync` and as what each
 * partition factory returns: the sync strategy, its mandatory forward fetch, and
 * an optional cadence repair policy. `cadence`: an object overrides, `false`
 * force-disables (overriding any inherited default), and omitting it inherits the
 * `createStdSync` default (or stays off).
 */
export type PartitionEntry<TItem extends object, TState = any> = {
  strategy: PartitionedStrategy<TItem, TState>;
  forwardFetch: ForwardFetch<TItem>;
  cadence?: CadenceConfig | false;
};
