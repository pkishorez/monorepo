import type {
  CollectionConfig,
  SingleResult,
  SyncConfig,
  Transaction,
} from '@tanstack/react-db';
import { Duration, Effect, Exit, Fiber, Schedule, Scope } from 'effect';
import type { EntityType, SingleEntityType } from '../../core/index.js';
import type { AnySingleEntityESchema } from '../../eschema/index.js';
import { makeCollectionProjector } from '../collection-projection/index.js';
import { converge } from '../source-of-truth/index.js';
import type { Accepted } from '../source-of-truth/index.js';
import { storageError } from '../source-of-truth/write-error.js';
import type { WriteError } from '../source-of-truth/write-error.js';
import type { CollectionHandle, Tracker } from '../registry/tracker.js';
import type { WritableSyncInspector } from '../inspector/index.js';
import type { StrategyContext } from '../partitioned/strategies/interface.js';
import { makeSyncStateStore } from '../partitioned/sync-state.js';
import type { CollectionItem, StdCollectionOptions } from '../types.js';
import { buildMutationHandlers } from './mutations.js';
import type { SingleItemStrategy } from './strategies/interface.js';
import type { PaceStrategyFactory } from '../paced/pace-strategy.js';
import {
  offlineStorageGroupName,
  type OfflineStorage,
  type OfflineStorageGroup,
} from '../offline-storage/index.js';

const SINGLETON_KEY = '__singleton__';
const SINGLE_STATE_KEY = '__single__';

export type SingleItemResult<
  TItem extends object,
  S extends AnySingleEntityESchema,
> = CollectionConfig<CollectionItem<TItem>, string> &
  SingleResult & {
    utils: {
      schema: () => S;
      writeServerTruth: (
        entities: EntityType<TItem>[],
      ) => Effect.Effect<void, WriteError>;
      onUpdate?: NonNullable<
        ReturnType<typeof buildMutationHandlers<TItem>>['onUpdate']
      >;
      pacedUpdate: (changes: Record<string, unknown>) => Transaction;
      pendingCount: () => number;
      subscribePending: (listener: () => void) => () => void;
    };
  };

const makeSingletonCell = <TItem>(group: OfflineStorageGroup) => {
  return {
    write: (
      entity: EntityType<TItem>,
    ): Effect.Effect<Accepted<TItem>, WriteError> =>
      Effect.gen(function* () {
        const current = yield* group
          .get<EntityType<TItem>>(SINGLETON_KEY)
          .pipe(
            Effect.mapError((cause) =>
              storageError('failed to read Source of Truth entity', cause),
            ),
          );
        if (converge(current, entity) === 'skip') {
          return { upserts: [], tombstoned: [] };
        }
        yield* group
          .put(SINGLETON_KEY, entity)
          .pipe(
            Effect.mapError((cause) =>
              storageError('failed to write Source of Truth entity', cause),
            ),
          );
        return { upserts: [entity], tombstoned: [] };
      }),
    current: (): Effect.Effect<EntityType<TItem>[], WriteError> =>
      group.get<EntityType<TItem>>(SINGLETON_KEY).pipe(
        Effect.map((entity) => (entity == null ? [] : [entity])),
        Effect.mapError((cause) =>
          storageError('failed to read Source of Truth entity', cause),
        ),
      ),
  };
};

export const buildSingleItem = <S extends AnySingleEntityESchema>(
  tracker: Tracker,
  inspector: WritableSyncInspector,
  config: {
    schema: S;
    strategy: SingleItemStrategy<S['Type'], any>;
    options?: StdCollectionOptions;
    onUpdate?: (payload: {
      updates: Partial<S['Type']>;
    }) => Effect.Effect<SingleEntityType<S['Type']>>;
    updatePacing?: PaceStrategyFactory;
    offlineStorage: OfflineStorage;
  },
): SingleItemResult<S['Type'], S> => {
  type TItem = S['Type'];

  const { schema, strategy, options, onUpdate, updatePacing } = config;
  const sotGroup = config.offlineStorage.group(
    offlineStorageGroupName.sourceOfTruth(schema.name),
  );
  const cell = makeSingletonCell<TItem>(sotGroup);
  const syncStateGroup = config.offlineStorage.group(
    offlineStorageGroupName.syncState(schema.name),
  );
  const stateStore = makeSyncStateStore({
    schemaName: schema.name,
    strategyName: strategy.name,
    group: syncStateGroup,
    state: strategy.state,
  });

  inspector.attachStorage(schema.name, {
    readValues: () =>
      cell
        .current()
        .pipe(Effect.map((entities) => entities.map((e) => e.value))),
    clearEntries: () => sotGroup.clear(),
    clearSyncState: (partitionKey) => syncStateGroup.delete(partitionKey),
  });

  type Projector = ReturnType<typeof makeCollectionProjector<TItem>>;
  let projector: Projector | null = null;
  let collectionUpdate:
    | ((updater: (draft: CollectionItem<TItem>) => void) => Transaction)
    | null = null;

  const project = (accepted: Accepted<TItem>): void => {
    if (projector) projector.project(accepted);
  };

  const writeServerTruth = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    Effect.gen(function* () {
      for (const entity of entities) {
        const accepted = yield* cell.write(entity);
        project(accepted);
      }
    }).pipe(
      Effect.withSpan('tanstack-sync.write-server-truth', {
        attributes: {
          entity: schema.name,
          entityCount: entities.length,
        },
      }),
    );

  const projectOnly = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    Effect.sync(() => project({ upserts: entities, tombstoned: [] }));

  const handle: CollectionHandle = {
    schemaName: schema.name,
    writeServerTruth: writeServerTruth as CollectionHandle['writeServerTruth'],
    projectOnly: projectOnly as CollectionHandle['projectOnly'],
  };
  tracker.register(handle);

  inspector.upsertCollection({
    id: schema.name,
    collectionName: schema.name,
    kind: 'single-item',
    status: 'idle',
    itemCount: 0,
    subscriberCount: 0,
    partitionFields: [],
  });

  const handlers = buildMutationHandlers<TItem>({
    writeServerTruth,
    onUpdate,
    updatePacing,
  });

  const sync: SyncConfig<CollectionItem<TItem>, string>['sync'] = (
    callbacks,
  ) => {
    const local = makeCollectionProjector<TItem>(callbacks);
    projector = local;
    collectionUpdate = (updater) =>
      callbacks.collection.update(schema.name, updater);

    const native = callbacks.collection;
    const writeInspectorCollection = (): void =>
      inspector.upsertCollection({
        id: schema.name,
        collectionName: schema.name,
        kind: 'single-item',
        status: native.status,
        itemCount: native.size,
        subscriberCount: native.subscriberCount,
        partitionFields: [],
      });
    const writeCleanedUpInspectorCollection = (): void =>
      inspector.updateCollection(schema.name, {
        status: 'cleaned-up',
        itemCount: 0,
        subscriberCount: 0,
      });
    writeInspectorCollection();
    const offStatusChange = native.on(
      'status:change',
      writeInspectorCollection,
    );
    const offSubscribersChange = native.on(
      'subscribers:change',
      writeInspectorCollection,
    );

    const run = Effect.runPromise(
      Effect.catch(
        Effect.gen(function* () {
          const entities = yield* cell.current();
          local.projectAll(entities);
          callbacks.markReady();

          const scope = yield* Scope.make();

          const ctx: StrategyContext<TItem, typeof strategy.state.empty> = {
            // Single-item collections have no forward fetch; strategies that
            // need a forward fetch are partitioned, not single-item.
            forwardFetch: () => Effect.succeed([]),
            writeServerTruth,
            getState: stateStore.get(SINGLE_STATE_KEY),
            setState: (state) => stateStore.set(SINGLE_STATE_KEY, state),
            scope,
          };

          const guarded = strategy.run(ctx).pipe(
            Effect.tapError((error) =>
              Effect.sync(() =>
                console.error(
                  `[std-sync] single-item strategy "${schema.name}" failed; restarting`,
                  error,
                ),
              ),
            ),
            Effect.retry(Schedule.spaced(Duration.seconds(2))),
            Scope.provide(scope),
          );

          const fiber = yield* Effect.forkIn(guarded, scope);
          return { scope, fiber };
        }).pipe(
          Effect.tapError((error) =>
            Effect.sync(() =>
              console.error(
                '[tanstack-sync] failed to read offline storage before collection ready',
                error,
              ),
            ),
          ),
        ),
        () => Effect.succeed(null),
      ),
    );

    return {
      cleanup: async () => {
        offStatusChange();
        offSubscribersChange();
        writeCleanedUpInspectorCollection();
        const mounted = await run;
        if (!mounted) return;
        const { scope, fiber } = mounted;
        await Effect.runPromise(Fiber.interrupt(fiber));
        await Effect.runPromise(Scope.close(scope, Exit.void));
        projector = null;
        collectionUpdate = null;
      },
    };
  };

  return {
    ...(options as object),
    rowUpdateMode: 'full',
    singleResult: true,
    getKey: () => schema.name,
    sync: { sync },
    onUpdate: handlers.onUpdate,
    utils: {
      schema: () => schema,
      writeServerTruth,
      onUpdate: handlers.onUpdate,
      pacedUpdate: (changes: Record<string, unknown>) =>
        handlers.pacedUpdate(changes as Partial<TItem>, (next) => {
          collectionUpdate?.((draft) => {
            Object.assign(draft, next);
          });
        }),
      pendingCount: handlers.pendingCount,
      subscribePending: handlers.subscribePending,
    },
  } as SingleItemResult<TItem, S>;
};
