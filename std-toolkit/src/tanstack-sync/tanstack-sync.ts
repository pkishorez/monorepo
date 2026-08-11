import { Effect } from 'effect';
import { createCollection } from '@tanstack/react-db';
import type { EntityType, SingleEntityType } from '../core/index.js';
import type { AnyEntityESchema, AnyUnkeyedESchema } from '../eschema/index.js';
import { buildRegistry, makeTracker } from './runtime/sync-registry/index.js';
import { buildPartitioned } from './composition/keyed-sync/index.js';
import { buildSingleItem } from './composition/single-item-sync/index.js';
import type {
  StdCollectionOptions,
  UpdatePayload,
} from './runtime/collection-model/index.js';
import type {
  PartitionMap,
  PartitionEntry,
  SingleItemStrategy,
} from './runtime/strategy-runtime/index.js';
import {
  paceStrategy as mutationPaceStrategy,
  type PaceStrategyFactory,
} from './runtime/mutation-pacing/index.js';
import {
  resolveCollectionOfflineStorage,
  resolveRootOfflineStorage,
  type OfflineStorage,
  type OfflineStorageSetting,
} from './persistence/offline-storage/index.js';
import type { CadenceConfig } from './domain/cadence-policy/index.js';
import type { SyncReporter } from './domain/sync-event/index.js';
import {
  makeEffectRunner,
  type EffectRuntime,
} from './runtime/effect-runner/index.js';
import { oldToNew } from './workers/old-to-new/index.js';
import { newToOld } from './workers/new-to-old/index.js';
import { bidirectional } from './workers/bidirectional/index.js';
import { getOnce } from './workers/get-once/index.js';

export const syncStrategy = { oldToNew, newToOld, bidirectional };
export const singleItemSyncStrategy = { getOnce };
export const paceStrategy = mutationPaceStrategy;

/**
 * Config for keyed total, partitioned, or hybrid sync. Total and partition
 * workers keep independent progress while converging through one Source of Truth.
 * Omit `sync` for a storage-only collection fed by `writeUpsert` or broadcasts.
 */
export type SyncShape<S extends AnyEntityESchema, R = never> =
  | {
      total: PartitionEntry<S['Type'], R, any>;
      partitions?: PartitionMap<S, R>;
    }
  | {
      total?: PartitionEntry<S['Type'], R, any>;
      partitions: PartitionMap<S, R>;
    };

export type SyncConfig<S extends AnyEntityESchema, R = never> = {
  schema: S;
  sync?: SyncShape<S, R>;
  options?: StdCollectionOptions<S['Type']>;
  onInsert?: (
    item: S['Type'],
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
  offlineStorage?: OfflineStorageSetting;
};

/** Config for the `singleItemSync` method (collection-level lifecycle, no partitions). */
export type SingleItemSyncConfig<
  S extends AnyUnkeyedESchema,
  R = never,
  TState = unknown,
> = {
  schema: S;
  strategy: SingleItemStrategy<S['Type'], TState, R>;
  options?: StdCollectionOptions<S['Type']>;
  onUpdate?: (payload: {
    updates: Partial<S['Type']>;
  }) => Effect.Effect<SingleEntityType<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
  offlineStorage?: OfflineStorageSetting;
};

/**
 * Creates one std-sync instance: a shared tracker behind `sync` (keyed,
 * partitioned), `singleItemSync` (singleton), and `registry` (the broadcast
 * router). Optional `defaults.options` are merged into every collection's options,
 * with per-collection options winning. Duplicate `schema.name` registration throws
 * via the tracker, enforcing disjoint per-collection ownership.
 */
export type StdSyncDefaults<R = never> = {
  options?: StdCollectionOptions<object>;
  offlineStorage?: OfflineStorage | false;
  cadence?: CadenceConfig;
  runtime?: EffectRuntime<R>;
  onEvent?: SyncReporter<R>;
};

const makeStdSync = <R>(defaults?: StdSyncDefaults<R>) => {
  const runner = makeEffectRunner(defaults?.runtime);
  const report: SyncReporter<R> =
    defaults?.onEvent ?? ((event) => Effect.logError(event));
  const tracker = makeTracker();
  const rootOfflineStorage = resolveRootOfflineStorage(
    defaults?.offlineStorage,
  );

  const mergeOptions = <TItem extends object>(
    options?: StdCollectionOptions<TItem>,
  ): StdCollectionOptions<TItem> =>
    ({ ...defaults?.options, ...options }) as StdCollectionOptions<TItem>;

  const resolveOfflineStorage = (override?: OfflineStorageSetting) =>
    resolveCollectionOfflineStorage({
      inherited: rootOfflineStorage,
      override,
    });

  const sync = <S extends AnyEntityESchema>(config: SyncConfig<S, R>) => {
    const { sync: syncField, options, offlineStorage, ...rest } = config;
    const collectionOfflineStorage = resolveOfflineStorage(offlineStorage);
    const built = buildPartitioned(tracker, {
      ...rest,
      ...(syncField?.total ? { total: syncField.total } : {}),
      ...(syncField?.partitions ? { partitions: syncField.partitions } : {}),
      offlineStorage: collectionOfflineStorage,
      ...(defaults?.cadence ? { defaultCadence: defaults.cadence } : {}),
      runner,
      report,
    });
    return { ...mergeOptions(options), ...built };
  };

  const singleItemSync = <S extends AnyUnkeyedESchema, TState>(
    config: SingleItemSyncConfig<S, R, TState>,
  ) => {
    const { options, offlineStorage, ...rest } = config;
    const collectionOfflineStorage = resolveOfflineStorage(offlineStorage);
    return buildSingleItem(tracker, {
      ...rest,
      offlineStorage: collectionOfflineStorage,
      options: mergeOptions(options),
      runner,
      report,
    });
  };

  return {
    sync,
    singleItemSync,
    collection: <S extends AnyEntityESchema>(config: SyncConfig<S, R>) => {
      return createCollection(sync(config));
    },
    singleItemCollection: <S extends AnyUnkeyedESchema, TState>(
      config: SingleItemSyncConfig<S, R, TState>,
    ) => {
      return createCollection(singleItemSync(config));
    },
    registry: () => buildRegistry(tracker, runner, report),
  };
};

type CreateStdSync = {
  <R>(
    defaults: StdSyncDefaults<R> & { runtime: EffectRuntime<R> },
  ): ReturnType<typeof makeStdSync<R>>;
  (
    defaults?: StdSyncDefaults<never> & { runtime?: never },
  ): ReturnType<typeof makeStdSync<never>>;
};

export const createStdSync = makeStdSync as CreateStdSync;

export type { ForwardFetch } from './runtime/collection-model/index.js';
export type { CadenceConfig } from './domain/cadence-policy/index.js';
export type { SyncEvent } from './domain/sync-event/index.js';
export type { SyncReporter } from './domain/sync-event/index.js';
export type { EffectRuntime } from './runtime/effect-runner/index.js';
export type { OldToNewConfig } from './workers/old-to-new/index.js';
export type { NewToOldConfig } from './workers/new-to-old/index.js';
export type { BidirectionalConfig } from './workers/bidirectional/index.js';
export type { GetOnceConfig } from './workers/get-once/index.js';
export type {
  PartitionEntry,
  PartitionMap,
  PartitionedStrategy,
  RepairConfig,
  SingleItemStrategy,
  StrategyContext,
} from './runtime/strategy-runtime/index.js';
export type { OfflineStorage } from './persistence/offline-storage/index.js';
