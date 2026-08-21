import { Effect } from 'effect';
import { createCollection } from '@tanstack/react-db';
import { Memory } from '../db/memory/index.js';
import type { DecodedEntity, DecodedSingleEntity } from '../core/index.js';
import type { AnyEntityESchema, AnyUnkeyedESchema } from '../eschema/index.js';
import { buildRegistry, makeTracker } from './runtime/sync-registry/index.js';
import { buildPartitioned } from './composition/keyed-sync/index.js';
import { buildSingleItem } from './composition/single-item-sync/index.js';
import type {
  DeletePayload,
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
  makeSyncStore,
  syncStore,
  type SyncStoreLayer,
} from './persistence/sync-store/index.js';
import type { CadenceConfig } from './domain/cadence-policy/index.js';
import type { SyncReporter } from './domain/sync-event/index.js';
import type { FlowPlacement } from './runtime/sync-flow/index.js';
import {
  makeEffectRunner,
  type EffectRuntime,
} from './runtime/effect-runner/index.js';
import { oldToNew } from './workers/old-to-new/index.js';
import { newToOld } from './workers/new-to-old/index.js';
import { bidirectional } from './workers/bidirectional/index.js';
import {
  singleItemSourceStrategy,
  type SingleItemSourceConfig,
} from './workers/single-item-source/index.js';
import {
  normalizeSyncName,
  qualifyCollectionName,
} from './domain/sync-address/index.js';
import type { PeerChannelFactory } from './runtime/peer-sync/index.js';
import {
  makeLeadership,
  type LeadershipLayer,
} from './runtime/leadership/index.js';

export type { LeadershipLayer } from './runtime/leadership/index.js';

export type StdSyncPlatform = {
  readonly storeLayer?: SyncStoreLayer;
  readonly leadershipLayer?: LeadershipLayer;
  readonly peerSync?: { readonly channel: PeerChannelFactory };
};

export const syncStrategy = { oldToNew, newToOld, bidirectional };
export const paceStrategy = mutationPaceStrategy;

/**
 * Config for keyed total, partitioned, or hybrid sync. Total and partition
 * workers keep independent progress while converging through one Sync Replica.
 * Omit `sync` for a storage-only collection fed by `applyToSyncReplica` or broadcasts.
 */
type SyncShape<S extends AnyEntityESchema, R = never> =
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
  ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
  onDelete?: (
    payload: DeletePayload<S['Type']>,
  ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
};

/** Config for the `singleItemSync` method (collection-level lifecycle, no partitions). */
type SingleItemSyncBase<S extends AnyUnkeyedESchema, R = never> = {
  schema: S;
  options?: StdCollectionOptions<S['Type']>;
  onUpdate?: (payload: {
    updates: Partial<S['Type']>;
  }) => Effect.Effect<DecodedSingleEntity<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
};

export type SingleItemSyncConfig<
  S extends AnyUnkeyedESchema,
  R = never,
  TState = unknown,
> = SingleItemSyncBase<S, R> &
  (
    | {
        source: SingleItemSourceConfig<S['Type'], R>['source'];
        strategy?: never;
      }
    | {
        source?: never;
        strategy: SingleItemStrategy<S['Type'], TState, R>;
      }
  );

/**
 * Creates one Std Sync instance: a shared tracker behind `sync` (keyed,
 * partitioned), `singleItemSync` (singleton), and `registry` (the broadcast
 * router). Optional `defaults.options` are merged into every collection's options,
 * with per-collection options winning. Schema names are normalized and qualified
 * by the required Sync name; duplicate normalized collection names throw.
 */
export type StdSyncDefaults<R = never> = {
  name: string;
  options?: StdCollectionOptions<object>;
  platform?: StdSyncPlatform;
  cadence?: CadenceConfig;
  runtime?: EffectRuntime<R>;
  onEvent?: SyncReporter<R>;
  flow?: FlowPlacement;
};

const makeStdSync = <R>(defaults: StdSyncDefaults<R>) => {
  const name = normalizeSyncName(defaults.name);
  const platform = defaults.platform ?? {};
  const collectionNames = new Set<string>();
  const runner = makeEffectRunner(defaults.runtime);
  const report: SyncReporter<R> =
    defaults.onEvent ?? ((event) => Effect.logError(event));
  const tracker = makeTracker();
  const store = makeSyncStore(
    platform.storeLayer ?? Memory.make(syncStore).layer,
  );
  const leadership = makeLeadership(platform.leadershipLayer);
  const cleanups = new Set<() => Promise<void>>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  const assertActive = (): void => {
    if (disposed) throw new Error('[sync] instance is disposed');
  };

  const trackCleanup = (
    cleanup: () => Promise<void>,
  ): (() => Promise<void>) => {
    let running: Promise<void> | null = null;
    const tracked = (): Promise<void> => {
      running ??= cleanup().finally(() => cleanups.delete(tracked));
      return running;
    };
    cleanups.add(tracked);
    return tracked;
  };

  // TanStack DB defaults to a five-minute GC, and it arms one shared ref'd timer
  // for the longest gcTime in play — long enough to hold a Node process open.
  const defaultGcTime = 10_000;

  const mergeOptions = <TItem extends object>(
    options?: StdCollectionOptions<TItem>,
  ): StdCollectionOptions<TItem> =>
    ({
      gcTime: defaultGcTime,
      ...defaults.options,
      ...options,
    }) as StdCollectionOptions<TItem>;

  const sync = <S extends AnyEntityESchema>(config: SyncConfig<S, R>) => {
    assertActive();
    const collectionName = qualifyCollectionName(name, config.schema.name);
    if (collectionNames.has(collectionName)) {
      throw new Error(
        `[sync] collection name "${collectionName}" is already registered`,
      );
    }
    collectionNames.add(collectionName);
    const { sync: syncField, options, ...rest } = config;
    const built = buildPartitioned(tracker, {
      ...rest,
      ...(syncField?.total ? { total: syncField.total } : {}),
      ...(syncField?.partitions ? { partitions: syncField.partitions } : {}),
      store,
      leadership,
      collectionName,
      assertActive,
      trackCleanup,
      ...(defaults.cadence ? { defaultCadence: defaults.cadence } : {}),
      runner,
      report,
      peerChannel: platform.peerSync ? platform.peerSync.channel : null,
      ...(defaults.flow ? { flowPlacement: defaults.flow } : {}),
    });
    return { ...mergeOptions(options), ...built };
  };

  const singleItemSync = <S extends AnyUnkeyedESchema, TState>(
    config: SingleItemSyncConfig<S, R, TState>,
  ) => {
    assertActive();
    const collectionName = qualifyCollectionName(name, config.schema.name);
    if (collectionNames.has(collectionName)) {
      throw new Error(
        `[sync] collection name "${collectionName}" is already registered`,
      );
    }
    collectionNames.add(collectionName);
    const { options } = config;
    const strategy: SingleItemStrategy<S['Type'], any, R> = config.source
      ? singleItemSourceStrategy({ source: config.source })
      : config.strategy;
    if (!strategy) {
      throw new Error(
        `[sync] collection "${collectionName}" needs either a source or a strategy`,
      );
    }
    return buildSingleItem(tracker, {
      schema: config.schema,
      strategy,
      ...(config.onUpdate ? { onUpdate: config.onUpdate } : {}),
      ...(config.updatePacing ? { updatePacing: config.updatePacing } : {}),
      store,
      leadership,
      collectionName,
      assertActive,
      trackCleanup,
      options: mergeOptions(options),
      runner,
      report,
      peerChannel: platform.peerSync ? platform.peerSync.channel : null,
      ...(defaults.flow ? { flowPlacement: defaults.flow } : {}),
    });
  };

  const dispose = (): Promise<void> => {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      const results = await Promise.allSettled(
        [...cleanups].map((cleanup) => cleanup()),
      );
      const disposals = await Promise.allSettled([
        leadership.dispose(),
        store.dispose(),
      ]);
      const failures = [...results, ...disposals].flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          '[sync] failed to clean up active collections',
        );
      }
    })();
    return disposePromise;
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
    registry: () => {
      assertActive();
      const registry = buildRegistry(tracker, runner, report);
      return {
        process: (message: unknown): void => {
          assertActive();
          registry.process(message);
        },
      };
    },
    dispose,
  };
};

type CreateStdSync = {
  <R>(
    defaults: StdSyncDefaults<R> & { runtime: EffectRuntime<R> },
  ): ReturnType<typeof makeStdSync<R>>;
  (
    defaults: StdSyncDefaults<never> & { runtime?: never },
  ): ReturnType<typeof makeStdSync<never>>;
};

export const createStdSync = makeStdSync as CreateStdSync;

export type { EffectRuntime } from './runtime/effect-runner/index.js';
export type { FlowPlacement } from './runtime/sync-flow/index.js';
export type {
  PeerChannel,
  PeerChannelFactory,
} from './runtime/peer-sync/index.js';
export type { SyncEvent } from './domain/sync-event/index.js';
export type { SyncReporter } from './domain/sync-event/index.js';
export type {
  PartitionedStrategy,
  SingleItemStrategy,
  StrategyContext,
} from './runtime/strategy-runtime/index.js';
export { syncStore } from './persistence/sync-store/index.js';
export type { SyncStoreLayer } from './persistence/sync-store/index.js';
