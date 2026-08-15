import { Effect } from 'effect';
import { createCollection } from '@tanstack/react-db';
import { Memory } from '../db/memory/index.js';
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
  makeSyncPersistence,
  syncPersistenceTable,
  type SyncPersistenceLayer,
} from './persistence/sync-persistence-table/index.js';
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
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
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
  persistenceLayer?: SyncPersistenceLayer;
  cadence?: CadenceConfig;
  runtime?: EffectRuntime<R>;
  onEvent?: SyncReporter<R>;
};

const makeStdSync = <R>(defaults?: StdSyncDefaults<R>) => {
  const runner = makeEffectRunner(defaults?.runtime);
  const report: SyncReporter<R> =
    defaults?.onEvent ?? ((event) => Effect.logError(event));
  const tracker = makeTracker();
  const persistence = makeSyncPersistence(
    defaults?.persistenceLayer ?? Memory.make(syncPersistenceTable).layer,
  );
  const cleanups = new Set<() => Promise<void>>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  const assertActive = (): void => {
    if (disposed) throw new Error('[tanstack-sync] instance is disposed');
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

  const mergeOptions = <TItem extends object>(
    options?: StdCollectionOptions<TItem>,
  ): StdCollectionOptions<TItem> =>
    ({ ...defaults?.options, ...options }) as StdCollectionOptions<TItem>;

  const sync = <S extends AnyEntityESchema>(config: SyncConfig<S, R>) => {
    assertActive();
    const { sync: syncField, options, ...rest } = config;
    const built = buildPartitioned(tracker, {
      ...rest,
      ...(syncField?.total ? { total: syncField.total } : {}),
      ...(syncField?.partitions ? { partitions: syncField.partitions } : {}),
      persistence,
      assertActive,
      trackCleanup,
      ...(defaults?.cadence ? { defaultCadence: defaults.cadence } : {}),
      runner,
      report,
    });
    return { ...mergeOptions(options), ...built };
  };

  const singleItemSync = <S extends AnyUnkeyedESchema, TState>(
    config: SingleItemSyncConfig<S, R, TState>,
  ) => {
    assertActive();
    const { options, ...rest } = config;
    return buildSingleItem(tracker, {
      ...rest,
      persistence,
      assertActive,
      trackCleanup,
      options: mergeOptions(options),
      runner,
      report,
    });
  };

  const dispose = (): Promise<void> => {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      const results = await Promise.allSettled(
        [...cleanups].map((cleanup) => cleanup()),
      );
      await persistence.dispose();
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          '[tanstack-sync] failed to clean up active collections',
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
    defaults?: StdSyncDefaults<never> & { runtime?: never },
  ): ReturnType<typeof makeStdSync<never>>;
};

export const createStdSync = makeStdSync as CreateStdSync;

export type { SyncEvent } from './domain/sync-event/index.js';
export type { SyncReporter } from './domain/sync-event/index.js';
export type {
  PartitionedStrategy,
  SingleItemStrategy,
  StrategyContext,
} from './runtime/strategy-runtime/index.js';
export { syncPersistenceTable } from './persistence/sync-persistence-table/index.js';
