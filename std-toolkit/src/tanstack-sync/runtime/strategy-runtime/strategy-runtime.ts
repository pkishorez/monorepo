import type { Effect, Scope } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { StrategyStateSpec } from '../../domain/strategy-state/index.js';
import type { CadenceConfig } from '../../domain/cadence-policy/index.js';
import type { ForwardFetch } from '../collection-model/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import type { PartitionValue } from '../../domain/partition-identity/index.js';

/**
 * The engine-provided surface a strategy runs against. Carries neither a source
 * nor a partition value: sources belong to workers, and state operations are
 * already routed to the current lifecycle slot.
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
 * catch `writeServerTruth` failures — the engine owns reporting and restart.
 */
export type PartitionedStrategy<
  TItem extends object,
  TState = unknown,
  R = never,
> = {
  name: string;
  state: StrategyStateSpec<TState>;
  run: (
    ctx: StrategyContext<TItem, TState>,
  ) => Effect.Effect<void, unknown, Scope.Scope | R>;
};

/**
 * One sync entry — used both as a total collection's `sync` and as what each
 * partition factory returns. Strategies own their required sources. Repair is an
 * independent capability with its own fetch source; its cadence policy overrides
 * the instance default when present.
 */
export type RepairConfig<TItem extends object, R = never> = {
  fetchFrom: ForwardFetch<TItem, R, unknown>;
  cadence?: CadenceConfig;
};

export type PartitionEntry<
  TItem extends object,
  R = never,
  TState = unknown,
> = {
  strategy: PartitionedStrategy<TItem, TState, R>;
  repair?: RepairConfig<TItem, R>;
};

/**
 * A partition map is heterogeneous: each factory may choose a different state
 * type. The state is checked where its strategy is created, then existentially
 * erased only when the engine stores entries from different factories together.
 */
export type PartitionMap<S extends AnyEntityESchema, R = never> = {
  [F in keyof S['Type'] & string as S['Type'][F] extends PartitionValue
    ? F
    : never]?: (
    partitionValue: S['Type'][F],
  ) => PartitionEntry<S['Type'], R, any>;
};

export type SingleItemStrategy<
  TItem extends object,
  TState = unknown,
  R = never,
> = {
  name: string;
  state: StrategyStateSpec<TState>;
  run: (
    ctx: StrategyContext<TItem, TState>,
  ) => Effect.Effect<void, unknown, Scope.Scope | R>;
};
