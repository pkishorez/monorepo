import { Duration, Effect, Exit, Schedule, Scope } from 'effect';
import type {
  CollectionConfig,
  LoadSubsetOptions,
  Transaction,
} from '@tanstack/react-db';
import type { EntityType } from '@std-toolkit/core';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import { makeSourceOfTruth, WriteError } from '../source-of-truth/index.js';
import { makeCollectionProjector } from '../collection-projection/index.js';
import type { CollectionItem, UpdatePayload } from '../types.js';
import type { Tracker } from '../registry/tracker.js';
import { makeSyncStateStore } from './sync-state.js';
import { resolvePartitionKey } from './partition-router.js';
import {
  countNewToOldSlices,
  describeStrategyState,
} from './inspector-mapping.js';
import { GLOBAL_PARTITION_KEY } from './constants.js';
import type {
  InspectorPartition,
  WritableSyncInspector,
} from '../inspector/index.js';
import { buildMutationHandlers, makePendingTracker } from './mutations.js';
import type {
  PartitionedStrategy,
  StrategyContext,
} from './strategies/interface.js';
import type { PaceStrategyFactory } from '../paced/pace-strategy.js';
import {
  offlineStorageGroupName,
  type OfflineStorage,
} from '../offline-storage/index.js';

type Projector<TItem> = ReturnType<typeof makeCollectionProjector<TItem>>;

export type EngineUtils = {
  schema: () => AnyEntityESchema;
  writeUpsert: (
    entities: EntityType<unknown> | EntityType<unknown>[],
  ) => Effect.Effect<void, WriteError>;
  pacedUpdate: (key: string, changes: Record<string, unknown>) => Transaction;
  pendingCount: (key: string) => number;
  subscribePending: (listener: () => void) => () => void;
};

const toArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

export const buildPartitioned = <S extends AnyEntityESchema>(
  tracker: Tracker,
  inspector: WritableSyncInspector,
  config: {
    schema: S;
    strategy?: PartitionedStrategy<S['Type'], any>;
    partitions?: Record<
      string,
      (value: unknown) => PartitionedStrategy<S['Type'], any>
    >;
    onInsert?: (item: S['Type']) => Effect.Effect<EntityType<S['Type']>>;
    onUpdate?: (
      payload: UpdatePayload<S['Type'], S>,
    ) => Effect.Effect<EntityType<S['Type']>>;
    onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>>;
    updatePacing?: PaceStrategyFactory;
    offlineStorage: OfflineStorage;
  },
): CollectionConfig<CollectionItem<S['Type']>, string, never, EngineUtils> & {
  utils: EngineUtils;
} => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema } = config;
  const partitionFields = Object.keys(config.partitions ?? {});

  const sotGroup = config.offlineStorage.group(
    offlineStorageGroupName.sourceOfTruth(schema.name),
  );
  const sot = makeSourceOfTruth<TItem>({ schema, group: sotGroup });
  const syncStateGroup = config.offlineStorage.group(
    offlineStorageGroupName.syncState(schema.name),
  );
  const pending = makePendingTracker();
  let projector: Projector<TItem> | null = null;
  let collectionUpdate:
    | ((key: string, updater: (draft: TCollItem) => void) => Transaction)
    | null = null;
  const refcounts = new Map<string, number>();
  const scopes = new Map<string, Scope.Closeable>();
  const latestPartitionSnapshot = new Map<
    string,
    { strategyName: string; value: unknown }
  >();
  let liveCollection: {
    status: string;
    size: number;
    subscriberCount: number;
  } | null = null;

  inspector.attachStorage(schema.name, {
    readValues: () =>
      sot.getAll().pipe(Effect.map((entities) => entities.map((e) => e.value))),
    // A live subscriber's strategy would re-persist the state we delete, so
    // refuse unless subscribers are zero. Clearing entities also clears the
    // cursors that describe them, else the strategy resumes from slices for
    // data that no longer exists.
    clearEntries: () =>
      Effect.gen(function* () {
        if (
          (liveCollection?.subscriberCount ?? 0) > 0 ||
          [...refcounts.values()].some((count) => count > 0)
        ) {
          return yield* Effect.fail(
            new Error(
              `[tanstack-sync] refusing to clear entries for "${schema.name}" with active subscribers`,
            ),
          );
        }
        yield* sotGroup.clear();
        yield* syncStateGroup.clear();
        latestPartitionSnapshot.clear();
      }),
    clearSyncState: (partitionKey) =>
      Effect.gen(function* () {
        const subscribers =
          partitionKey === GLOBAL_PARTITION_KEY
            ? (liveCollection?.subscriberCount ?? 0)
            : (refcounts.get(partitionKey) ?? 0);
        if (subscribers > 0) {
          return yield* Effect.fail(
            new Error(
              `[tanstack-sync] refusing to clear sync state for "${partitionKey}" with active subscribers`,
            ),
          );
        }
        yield* syncStateGroup.delete(partitionKey);
        latestPartitionSnapshot.delete(partitionKey);
      }),
  });

  type PartitionDescriptor = {
    partitionField: string;
    partitionValue: string;
  };
  const partitionDescriptors = new Map<string, PartitionDescriptor>();

  const partitionIdOf = (partitionKey: string): string =>
    `${schema.name}:${partitionKey}`;

  const emptyPartitionDescriptor: PartitionDescriptor = {
    partitionField: '',
    partitionValue: '',
  };

  const descriptorOf = (partitionKey: string): PartitionDescriptor =>
    partitionDescriptors.get(partitionKey) ?? emptyPartitionDescriptor;

  const partitionActivityOf = (
    partitionKey: string,
  ): InspectorPartition['activity'] =>
    partitionKey === GLOBAL_PARTITION_KEY ||
    (refcounts.get(partitionKey) ?? 0) > 0
      ? 'active'
      : 'cached';

  const subscriberCountOf = (partitionKey: string): number =>
    partitionKey === GLOBAL_PARTITION_KEY
      ? (liveCollection?.subscriberCount ?? 0)
      : (refcounts.get(partitionKey) ?? 0);

  const describePartition = (
    partitionKey: string,
    itemCount: number,
    strategyName: string,
    strategyValue: unknown,
  ): InspectorPartition => {
    const descriptor = descriptorOf(partitionKey);
    return {
      id: partitionIdOf(partitionKey),
      collectionName: schema.name,
      partitionField: descriptor.partitionField,
      partitionValue: descriptor.partitionValue,
      partitionKey,
      partitionKind:
        partitionKey === GLOBAL_PARTITION_KEY ? 'global' : 'partition',
      activity: partitionActivityOf(partitionKey),
      itemCount,
      subscriberCount: subscriberCountOf(partitionKey),
      strategyState: describeStrategyState(strategyName, strategyValue),
    };
  };

  const refreshInspectorCounts = Effect.gen(function* () {
    const entities = yield* sot.getAll();
    for (const partitionKey of scopes.keys()) {
      const snapshot = latestPartitionSnapshot.get(partitionKey);
      if (!snapshot) continue;
      const descriptor = descriptorOf(partitionKey);
      const { value, itemCount } = countNewToOldSlices(
        snapshot.value,
        entities,
        descriptor.partitionField,
        descriptor.partitionValue,
      );
      latestPartitionSnapshot.set(partitionKey, {
        strategyName: snapshot.strategyName,
        value,
      });
      inspector.updatePartition(partitionIdOf(partitionKey), {
        itemCount,
        strategyState: describeStrategyState(snapshot.strategyName, value),
      });
    }
    if (liveCollection) {
      inspector.updateCollection(schema.name, {
        itemCount: liveCollection.size,
      });
    }
  });

  const writeServerTruth = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, import('../source-of-truth/index.js').WriteError> =>
    sot.write(entities).pipe(
      Effect.tap((accepted) => Effect.sync(() => projector?.project(accepted))),
      Effect.tap(() => refreshInspectorCounts),
      Effect.asVoid,
    );

  const projectOnly = (entities: EntityType<TItem>[]): Effect.Effect<void> =>
    Effect.sync(() => projector?.projectEntities(entities));

  const deleteKeyOf = (entity: EntityType<TItem>): string | null => {
    const value = entity.value as Record<string, unknown>;
    const id = value[schema.idField];
    return typeof id === 'string' ? id : null;
  };

  const buildCtx = <TState>(
    key: string,
    scope: Scope.Scope,
    strat: PartitionedStrategy<TItem, TState>,
  ): StrategyContext<TItem, TState> => {
    const stateStore = makeSyncStateStore({
      schemaName: schema.name,
      strategyName: strat.name,
      group: syncStateGroup,
      state: strat.state,
    });
    const setState = (s: TState): Effect.Effect<void, WriteError> =>
      Effect.gen(function* () {
        const entities = yield* sot.getAll();
        const descriptor = descriptorOf(key);
        const { value, itemCount } = countNewToOldSlices(
          s,
          entities,
          descriptor.partitionField,
          descriptor.partitionValue,
        );
        latestPartitionSnapshot.set(key, { strategyName: strat.name, value });
        yield* stateStore.set(key, value as TState, {
          collectionName: schema.name,
          partitionField: descriptor.partitionField,
          partitionValue: descriptor.partitionValue,
          partitionKey: key,
          itemCount,
        });
        yield* Effect.sync(() =>
          inspector.upsertPartition(
            describePartition(key, itemCount, strat.name, value),
          ),
        );
      });
    return {
      writeServerTruth,
      getState: stateStore.get(key),
      setState,
      scope,
    };
  };

  const activatePartition = <TState>(
    key: string,
    strat: PartitionedStrategy<TItem, TState>,
  ): void => {
    void Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        scopes.set(key, scope);
        const run = strat.run(buildCtx(key, scope, strat)).pipe(
          Scope.provide(scope),
          Effect.tapError((e) =>
            Effect.sync(() =>
              console.error('[tanstack-sync] strategy run failed', e),
            ),
          ),
          Effect.retry(Schedule.spaced(Duration.seconds(2))),
        );
        yield* Effect.forkIn(run, scope);
      }),
    );
  };

  const deactivatePartition = (key: string): void => {
    const scope = scopes.get(key);
    if (!scope) return;
    scopes.delete(key);
    latestPartitionSnapshot.delete(key);
    void Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));
  };

  const closeAllScopes = (): void => {
    const closes = Array.from(scopes.values()).map((scope) =>
      Scope.close(scope, Exit.succeed(undefined)),
    );
    scopes.clear();
    void Effect.runPromise(Effect.all(closes, { concurrency: 'unbounded' }));
  };

  const handlers = buildMutationHandlers<S>({
    ...config,
    writeServerTruth,
    pending,
  });

  const utils: EngineUtils = {
    schema: () => schema,
    writeUpsert: (entities) => {
      const batch = toArray(entities) as EntityType<TItem>[];
      return writeServerTruth(batch);
    },
    pacedUpdate: (key, changes) =>
      handlers.pacedUpdate(
        key,
        changes as Partial<TItem>,
        (key: string, changes: Partial<TItem>): void => {
          collectionUpdate?.(key, (draft) => {
            Object.assign(draft, changes);
          });
        },
      ),
    pendingCount: handlers.pendingCount,
    subscribePending: handlers.subscribePending,
  };

  tracker.register({
    schemaName: schema.name,
    writeServerTruth: writeServerTruth as (
      entities: EntityType<unknown>[],
    ) => Effect.Effect<void, WriteError>,
    projectOnly: projectOnly as (
      entities: EntityType<unknown>[],
    ) => Effect.Effect<void, WriteError>,
  });

  const collectionKind = partitionFields.length > 0 ? 'partitioned' : 'keyed';

  const writeInspectorCollection = (): void =>
    inspector.upsertCollection({
      id: schema.name,
      collectionName: schema.name,
      kind: collectionKind,
      status: liveCollection?.status ?? 'idle',
      itemCount: liveCollection?.size ?? 0,
      subscriberCount: liveCollection?.subscriberCount ?? 0,
      partitionFields,
    });

  const writeCleanedUpInspectorCollection = (): void =>
    inspector.updateCollection(schema.name, {
      status: 'cleaned-up',
      itemCount: 0,
      subscriberCount: 0,
    });

  writeInspectorCollection();

  return {
    getKey: (item) => String((item as Record<string, unknown>)[schema.idField]),
    rowUpdateMode: 'full',
    // Partitioned collections require on-demand mode so TanStack DB calls loadSubset
    // with the subscription's where expression — otherwise loadSubset is bypassed
    // and no partition is ever activated. Collections with only a global strategy
    // use the default eager mode (all data syncs automatically).
    ...(partitionFields.length > 0 && { syncMode: 'on-demand' as const }),
    sync: {
      sync: (callbacks) => {
        projector = makeCollectionProjector<TItem>(callbacks, { deleteKeyOf });
        collectionUpdate = (key, updater) =>
          callbacks.collection.update(key, updater);

        const native = callbacks.collection;
        liveCollection = native;
        writeInspectorCollection();
        const offStatusChange = native.on(
          'status:change',
          writeInspectorCollection,
        );
        const offSubscribersChange = native.on('subscribers:change', () => {
          writeInspectorCollection();
          if (config.strategy) {
            inspector.updatePartition(partitionIdOf(GLOBAL_PARTITION_KEY), {
              subscriberCount: native.subscriberCount,
            });
          }
        });

        void Effect.runPromise(
          Effect.gen(function* () {
            const all = yield* sot.getAll();
            projector?.projectAll(all);
            callbacks.markReady();
            if (config.strategy) {
              activatePartition(GLOBAL_PARTITION_KEY, config.strategy);
            }
          }).pipe(
            Effect.tapError((error) =>
              Effect.sync(() =>
                console.error(
                  '[tanstack-sync] failed to read offline storage before collection ready',
                  error,
                ),
              ),
            ),
            Effect.ignore,
          ),
        );

        const loadSubset = (opts: LoadSubsetOptions): true => {
          const r = resolvePartitionKey(opts, partitionFields);
          if (!r) {
            if (!config.strategy) {
              console.error(
                '[tanstack-sync] no partition matched and no global strategy serves this query',
              );
            }
            return true;
          }
          const next = (refcounts.get(r.partitionKey) ?? 0) + 1;
          refcounts.set(r.partitionKey, next);
          if (next === 1) {
            partitionDescriptors.set(r.partitionKey, {
              partitionField: r.field,
              partitionValue: String(r.partitionValue),
            });
            const strat = config.partitions![r.field]!(r.partitionValue);
            // Seed a placeholder row only for a never-seen partition; a cached
            // partition already carries its restored count and slices, and
            // overwriting it would blank the row to zero until resync.
            if (!inspector.partitions.has(partitionIdOf(r.partitionKey))) {
              inspector.upsertPartition(
                describePartition(
                  r.partitionKey,
                  0,
                  strat.name,
                  strat.state.empty,
                ),
              );
            }
            activatePartition(r.partitionKey, strat);
          }
          inspector.updatePartition(partitionIdOf(r.partitionKey), {
            activity: 'active',
            subscriberCount: next,
          });
          return true;
        };

        const unloadSubset = (opts: LoadSubsetOptions): void => {
          const r = resolvePartitionKey(opts, partitionFields);
          if (!r) return;
          const next = Math.max(0, (refcounts.get(r.partitionKey) ?? 0) - 1);
          refcounts.set(r.partitionKey, next);
          if (next === 0) deactivatePartition(r.partitionKey);
          inspector.updatePartition(partitionIdOf(r.partitionKey), {
            activity: next > 0 ? 'active' : 'cached',
            subscriberCount: next,
          });
        };

        const cleanup = (): void => {
          offStatusChange();
          offSubscribersChange();
          writeCleanedUpInspectorCollection();
          if (config.strategy) {
            inspector.updatePartition(partitionIdOf(GLOBAL_PARTITION_KEY), {
              activity: 'cached',
              subscriberCount: 0,
            });
          }
          closeAllScopes();
          projector = null;
          collectionUpdate = null;
          liveCollection = null;
        };

        return { cleanup, loadSubset, unloadSubset };
      },
    },
    onInsert: handlers.onInsert,
    onUpdate: handlers.onUpdate,
    onDelete: handlers.onDelete,
    utils,
  } as CollectionConfig<CollectionItem<TItem>, string, never, EngineUtils> & {
    utils: EngineUtils;
  };
};
