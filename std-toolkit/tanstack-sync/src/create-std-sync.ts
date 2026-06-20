import type { Effect } from 'effect';
import type { EntityType, SingleEntityType } from '@std-toolkit/core';
import type {
  AnyEntityESchema,
  AnySingleEntityESchema,
} from '@std-toolkit/eschema';
import { makeTracker } from './registry/tracker.js';
import { buildRegistry } from './registry/index.js';
import { buildPartitioned } from './partitioned/index.js';
import { buildSingleItem } from './single-item/index.js';
import type { StdCollectionOptions, UpdatePayload } from './types.js';
import type { PartitionedStrategy } from './partitioned/strategies/index.js';
import type { SingleItemStrategy } from './single-item/strategies/index.js';
import type { PaceStrategyFactory } from './paced/pace-strategy.js';

/**
 * Config for the keyed `sync` method. One collection may carry a global `strategy`
 * (mirrors the whole set, serving partition-less queries) and a `partitions` map
 * (keyed by partition field, each a factory of that field's typed value)
 * simultaneously; both are optional and share one engine, SoT, and projector.
 */
type SyncConfig<S extends AnyEntityESchema> = {
  schema: S;
  strategy?: PartitionedStrategy<S['Type']>;
  partitions?: {
    [F in keyof S['Type'] & string]?: (
      partitionValue: S['Type'][F],
    ) => PartitionedStrategy<S['Type']>;
  };
  options?: StdCollectionOptions;
  onInsert?: (item: S['Type']) => Effect.Effect<EntityType<S['Type']>>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<EntityType<S['Type']>>;
  onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>>;
  updatePacing?: PaceStrategyFactory;
};

/** Config for the `singleItemSync` method (collection-level lifecycle, no partitions). */
type SingleItemSyncConfig<S extends AnySingleEntityESchema> = {
  schema: S;
  strategy: SingleItemStrategy<S['Type']>;
  options?: StdCollectionOptions;
  onUpdate?: (payload: {
    updates: Partial<S['Type']>;
  }) => Effect.Effect<SingleEntityType<S['Type']>>;
  updatePacing?: PaceStrategyFactory;
};

/**
 * Creates one std-sync instance: a shared tracker behind `sync` (keyed,
 * partitioned), `singleItemSync` (singleton), and `registry` (the broadcast
 * router). Optional `defaults.options` are merged into every collection's options,
 * with per-collection options winning. Duplicate `schema.name` registration throws
 * via the tracker, enforcing disjoint per-collection ownership.
 */
export const createStdSync = (defaults?: {
  options?: StdCollectionOptions;
}) => {
  const tracker = makeTracker();

  const mergeOptions = (options?: StdCollectionOptions): StdCollectionOptions =>
    ({ ...defaults?.options, ...options }) as StdCollectionOptions;

  return {
    sync: <S extends AnyEntityESchema>(config: SyncConfig<S>) => {
      const { options, ...rest } = config;
      const built = buildPartitioned(
        tracker,
        rest as Parameters<typeof buildPartitioned<S>>[1],
      );
      return { ...mergeOptions(options), ...built };
    },
    singleItemSync: <S extends AnySingleEntityESchema>(
      config: SingleItemSyncConfig<S>,
    ) =>
      buildSingleItem(tracker, {
        ...config,
        options: mergeOptions(config.options),
      }),
    registry: () => buildRegistry(tracker),
  };
};
