import { Effect } from 'effect';
import { createCollection } from '@tanstack/react-db';
import type { EntityType, SingleEntityType } from '@std-toolkit/core';
import type {
  AnyEntityESchema,
  AnySingleEntityESchema,
} from '@std-toolkit/eschema';
import { makeTracker } from './registry/tracker.js';
import { buildRegistry } from './registry/index.js';
import {
  buildPartitioned,
  restoreCachedPartitions,
} from './partitioned/index.js';
import { buildSingleItem } from './single-item/index.js';
import { makeSyncInspector } from './inspector/index.js';
import type { SyncInspector } from './inspector/index.js';
import type { StdCollectionOptions, UpdatePayload } from './types.js';
import type { PartitionedStrategy } from './partitioned/strategies/index.js';
import type { SingleItemStrategy } from './single-item/strategies/index.js';
import type { PaceStrategyFactory } from './paced/pace-strategy.js';
import {
  resolveCollectionOfflineStorage,
  resolveRootOfflineStorage,
  type OfflineStorage,
  type OfflineStorageSetting,
} from './offline-storage/index.js';

/**
 * Config for the keyed `sync` method. One collection may carry a global `strategy`
 * (mirrors the whole set, serving partition-less queries) and a `partitions` map
 * (keyed by partition field, each a factory of that field's typed value)
 * simultaneously; both are optional and share one engine, SoT, and projector.
 */
type SyncConfig<S extends AnyEntityESchema> = {
  schema: S;
  strategy?: PartitionedStrategy<S['Type'], any>;
  partitions?: {
    [F in keyof S['Type'] & string]?: (
      partitionValue: S['Type'][F],
    ) => PartitionedStrategy<S['Type'], any>;
  };
  options?: StdCollectionOptions;
  onInsert?: (item: S['Type']) => Effect.Effect<EntityType<S['Type']>>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<EntityType<S['Type']>>;
  onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>>;
  updatePacing?: PaceStrategyFactory;
  offlineStorage?: OfflineStorageSetting;
};

/** Config for the `singleItemSync` method (collection-level lifecycle, no partitions). */
type SingleItemSyncConfig<S extends AnySingleEntityESchema> = {
  schema: S;
  strategy: SingleItemStrategy<S['Type'], any>;
  options?: StdCollectionOptions;
  onUpdate?: (payload: {
    updates: Partial<S['Type']>;
  }) => Effect.Effect<SingleEntityType<S['Type']>>;
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
export const createStdSync = (defaults?: {
  options?: StdCollectionOptions;
  offlineStorage?: OfflineStorage | false;
}) => {
  const tracker = makeTracker();
  const inspector = makeSyncInspector();
  const rootOfflineStorage = resolveRootOfflineStorage(
    defaults?.offlineStorage,
  );

  // Hydrate the inspector from offline storage, but only in the browser.
  // Offline storage is browser-only, so this is a no-op on the server — and
  // crucially, kicking off async I/O here would run during module evaluation
  // (collections construct their sync at module top level). Cloudflare Workers
  // forbid async I/O in global scope, so doing it unconditionally crashes the
  // worker's init (and thus SSR/prerender) before any request is served.
  if (typeof window !== 'undefined') {
    void Effect.runPromise(
      rootOfflineStorage.inspect().pipe(
        Effect.tap((groups) =>
          Effect.sync(() => restoreCachedPartitions(inspector, groups)),
        ),
        Effect.ignore,
      ),
    );
  }

  const mergeOptions = (options?: StdCollectionOptions): StdCollectionOptions =>
    ({ ...defaults?.options, ...options }) as StdCollectionOptions;

  const resolveOfflineStorage = (override?: OfflineStorageSetting) =>
    resolveCollectionOfflineStorage({
      inherited: rootOfflineStorage,
      override,
    });

  const sync = <S extends AnyEntityESchema>(config: SyncConfig<S>) => {
    const { options, offlineStorage, ...rest } = config;
    const collectionOfflineStorage = resolveOfflineStorage(offlineStorage);
    const built = buildPartitioned(tracker, inspector, {
      ...rest,
      offlineStorage: collectionOfflineStorage,
    } as Parameters<typeof buildPartitioned<S>>[2]);
    return { ...mergeOptions(options), ...built };
  };

  const singleItemSync = <S extends AnySingleEntityESchema>(
    config: SingleItemSyncConfig<S>,
  ) => {
    const { options, offlineStorage, ...rest } = config;
    const collectionOfflineStorage = resolveOfflineStorage(offlineStorage);
    return buildSingleItem(tracker, inspector, {
      ...rest,
      offlineStorage: collectionOfflineStorage,
      options: mergeOptions(options),
    });
  };

  return {
    sync,
    singleItemSync,
    collection: <S extends AnyEntityESchema>(config: SyncConfig<S>) => {
      const collection = createCollection(sync(config));
      inspector.attachCollection(config.schema.name, collection);
      return collection;
    },
    singleItemCollection: <S extends AnySingleEntityESchema>(
      config: SingleItemSyncConfig<S>,
    ) => {
      const collection = createCollection(singleItemSync(config));
      inspector.attachCollection(config.schema.name, collection);
      return collection;
    },
    registry: () => buildRegistry(tracker),
    inspector: inspector as SyncInspector,
  };
};
