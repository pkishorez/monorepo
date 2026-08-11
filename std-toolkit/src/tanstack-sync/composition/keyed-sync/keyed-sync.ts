import { Effect, Scope } from 'effect';
import type {
  CadenceConfig,
  SyncCollection,
} from '../../workers/cadence-repair/index.js';
import type {
  CollectionConfig,
  LoadSubsetOptions,
  Transaction,
} from '@tanstack/react-db';
import type { EntityType } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import { makeSourceOfTruth } from '../../persistence/source-of-truth/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import { makeCollectionProjector } from '../../runtime/collection-projection/index.js';
import type {
  CollectionItem,
  UpdateChanges,
  UpdatePayload,
} from '../../runtime/collection-model/index.js';
import type { Tracker } from '../../runtime/sync-registry/index.js';
import { makeSyncStateStore } from '../../persistence/sync-state/index.js';
import { makePartitionLifecycle } from '../../lifecycle/partition-sync/index.js';
import { GLOBAL_PARTITION_KEY } from '../../domain/partition-identity/index.js';
import { buildMutationHandlers } from './mutations.js';
import { makePendingTracker } from '../../runtime/pending-mutations/index.js';
import type {
  PartitionedStrategy,
  PartitionEntry,
  PartitionMap,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import type { PaceStrategyFactory } from '../../runtime/mutation-pacing/index.js';
import {
  offlineStorageGroupName,
  type OfflineStorage,
} from '../../persistence/offline-storage/index.js';
import {
  makeEffectRunner,
  type EffectRunner,
} from '../../runtime/effect-runner/index.js';
import { makeSyncExecution } from '../../lifecycle/sync-execution/index.js';

type Projector<TItem> = ReturnType<typeof makeCollectionProjector<TItem>>;

export type EngineUtils<S extends AnyEntityESchema> = {
  schema: () => S;
  writeUpsert: (
    entities: EntityType<S['Type']> | EntityType<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  pacedUpdate: (
    key: string,
    changes: UpdateChanges<S['Type'], S>,
  ) => Transaction<Partial<S['Type']>>;
  pendingCount: (key: string) => number;
  subscribePending: (listener: () => void) => () => void;
};

const toArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

export const buildPartitioned = <S extends AnyEntityESchema, R = never>(
  tracker: Tracker,
  config: {
    schema: S;
    total?: PartitionEntry<S['Type'], R, any>;
    partitions?: PartitionMap<S, R>;
    onInsert?: (
      item: S['Type'],
    ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
    onUpdate?: (
      payload: UpdatePayload<S['Type'], S>,
    ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
    onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
    updatePacing?: PaceStrategyFactory;
    offlineStorage: OfflineStorage;
    defaultCadence?: CadenceConfig;
    runner?: EffectRunner<R>;
    report: SyncReporter<R>;
  },
): CollectionConfig<
  CollectionItem<S['Type']>,
  string,
  never,
  EngineUtils<S>
> & {
  utils: EngineUtils<S>;
} => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema } = config;
  const runner = config.runner ?? makeEffectRunner<R>(undefined);
  const partitionFields = Object.keys(config.partitions ?? {});
  const resolvePartitionEntry = (
    field: string,
    value: unknown,
  ): PartitionEntry<TItem, R, any> => {
    const factory = (
      config.partitions as Record<string, unknown> | undefined
    )?.[field];
    if (typeof factory !== 'function') {
      throw new Error(
        `[tanstack-sync] no partition factory registered for "${field}"`,
      );
    }
    return (
      factory as (partitionValue: unknown) => PartitionEntry<TItem, R, any>
    )(value);
  };
  const partitionLifecycle = runner.runSync(
    makePartitionLifecycle(partitionFields),
  );

  const sotGroup = config.offlineStorage.group(
    offlineStorageGroupName.sourceOfTruth(schema.name),
  );
  const sot = makeSourceOfTruth<TItem>({ schema, group: sotGroup });
  const syncStateGroup = config.offlineStorage.group(
    offlineStorageGroupName.syncState(schema.name),
  );
  const pending = runner.runSync(makePendingTracker);
  let projector: Projector<TItem> | null = null;
  let collectionUpdate:
    | ((key: string, updater: (draft: TCollItem) => void) => Transaction)
    | null = null;
  // The native collection is needed by per-partition cadence loops.
  let nativeCollection: SyncCollection<TItem> | null = null;
  const writeServerTruth = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    sot.write(entities).pipe(
      Effect.tap((accepted) => Effect.sync(() => projector?.project(accepted))),
      Effect.asVoid,
      Effect.withSpan('tanstack-sync.write-server-truth', {
        attributes: {
          entity: schema.name,
          entityCount: entities.length,
        },
      }),
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
    strat: PartitionedStrategy<TItem, TState, R>,
  ): StrategyContext<TItem, TState> => {
    const stateStore = makeSyncStateStore({
      schemaName: schema.name,
      strategyName: strat.name,
      group: syncStateGroup,
      state: strat.state,
    });
    return {
      writeServerTruth,
      getState: stateStore.get(key),
      setState: (state) => stateStore.set(key, state),
      scope,
    };
  };

  const execution = runner.runSync(
    makeSyncExecution<TItem, R>({
      ...(config.defaultCadence
        ? { defaultCadence: config.defaultCadence }
        : {}),
      collection: () => nativeCollection,
      collectionName: schema.name,
      makeContext: buildCtx,
      writeServerTruth,
      report: config.report,
    }),
  );

  const handlers = buildMutationHandlers<S, R>({
    ...config,
    writeServerTruth,
    pending,
    runner,
  });

  const utils: EngineUtils<S> = {
    schema: () => schema,
    writeUpsert: (entities) => {
      const batch = toArray(entities);
      return writeServerTruth(batch);
    },
    pacedUpdate: (key, changes) =>
      handlers.pacedUpdate(
        key,
        changes,
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
        nativeCollection = {
          get subscriberCount() {
            return native.subscriberCount;
          },
          on: (event, listener) => native.on(event, listener),
          values: () => native.values(),
        };
        void runner.runPromise(
          Effect.gen(function* () {
            const all = yield* sot.getAll();
            projector?.projectAll(all);
            callbacks.markReady();
            if (config.total) {
              // Total sync is one implicit partition over the whole set.
              yield* execution.start(GLOBAL_PARTITION_KEY, config.total);
            }
          }).pipe(
            Effect.tapError((error) =>
              config.report({
                _tag: 'InitializationFailed',
                collection: schema.name,
                cause: error,
              }),
            ),
            Effect.ignore,
          ),
        );

        const loadSubset = (opts: LoadSubsetOptions): true => {
          const r = partitionLifecycle.load(opts);
          if (!r) {
            if (!config.total) {
              void runner.runPromise(
                config.report({
                  _tag: 'UnservedQuery',
                  collection: schema.name,
                }),
              );
            }
            return true;
          }
          if (r.activated) {
            const entry = resolvePartitionEntry(r.field, r.partitionValue);
            runner.runSync(
              execution.start(r.partitionKey, entry, {
                field: r.field,
                value: r.partitionValue,
              }),
            );
          }
          return true;
        };

        const unloadSubset = (opts: LoadSubsetOptions): void => {
          const r = partitionLifecycle.unload(opts);
          if (!r) return;
          if (r.deactivated) runner.runSync(execution.stop(r.partitionKey));
        };

        const cleanup = async (): Promise<void> => {
          await runner.runPromise(execution.stopAll);
          projector = null;
          collectionUpdate = null;
          nativeCollection = null;
        };

        return { cleanup, loadSubset, unloadSubset };
      },
    },
    onInsert: handlers.onInsert,
    onUpdate: handlers.onUpdate,
    onDelete: handlers.onDelete,
    utils,
  } as CollectionConfig<
    CollectionItem<TItem>,
    string,
    never,
    EngineUtils<S>
  > & {
    utils: EngineUtils<S>;
  };
};
