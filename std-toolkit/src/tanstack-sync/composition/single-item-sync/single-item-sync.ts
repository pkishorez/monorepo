import type {
  CollectionConfig,
  SingleResult,
  SyncConfig,
  Transaction,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType, SingleEntityType } from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import { makeCollectionProjector } from '../../runtime/collection-projection/index.js';
import {
  makeSourceOfTruth,
  type Accepted,
} from '../../persistence/source-of-truth/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type {
  CollectionHandle,
  Tracker,
} from '../../runtime/sync-registry/index.js';
import type { SingleItemStrategy } from '../../runtime/strategy-runtime/index.js';
import { makeSyncStateStore } from '../../persistence/sync-state/index.js';
import type {
  CollectionItem,
  StdCollectionOptions,
} from '../../runtime/collection-model/index.js';
import { buildMutationHandlers } from './mutations.js';
import type { PaceStrategyFactory } from '../../runtime/mutation-pacing/index.js';
import {
  offlineStorageGroupName,
  type OfflineStorage,
} from '../../persistence/offline-storage/index.js';
import type { EffectRunner } from '../../runtime/effect-runner/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import { startSingleItemLifecycle } from '../../lifecycle/single-item-lifecycle/index.js';

const SINGLETON_KEY = '__singleton__';
const SINGLE_STATE_KEY = '__single__';

export type SingleItemResult<
  TItem extends object,
  S extends AnyUnkeyedESchema,
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
      pacedUpdate: (changes: Partial<TItem>) => Transaction<Partial<TItem>>;
      pendingCount: () => number;
      subscribePending: (listener: () => void) => () => void;
    };
  };

export const buildSingleItem = <S extends AnyUnkeyedESchema, TState, R = never>(
  tracker: Tracker,
  config: {
    schema: S;
    strategy: SingleItemStrategy<S['Type'], TState, R>;
    options?: StdCollectionOptions<S['Type']>;
    onUpdate?: (payload: {
      updates: Partial<S['Type']>;
    }) => Effect.Effect<SingleEntityType<S['Type']>, unknown, R>;
    updatePacing?: PaceStrategyFactory;
    offlineStorage: OfflineStorage;
    runner: EffectRunner<R>;
    report: SyncReporter<R>;
  },
): SingleItemResult<S['Type'], S> => {
  type TItem = S['Type'];

  const { schema, strategy, options, onUpdate, updatePacing } = config;
  const sotGroup = config.offlineStorage.group(
    offlineStorageGroupName.sourceOfTruth(schema.name),
  );
  const sot = makeSourceOfTruth<TItem>({
    schema,
    group: sotGroup,
    keyOf: () => SINGLETON_KEY,
  });
  const readCurrent = sot
    .get(SINGLETON_KEY)
    .pipe(
      Effect.map((entity) =>
        entity == null || entity.meta._d ? [] : [entity],
      ),
    );
  const syncStateGroup = config.offlineStorage.group(
    offlineStorageGroupName.syncState(schema.name),
  );
  const stateStore = makeSyncStateStore({
    schemaName: schema.name,
    strategyName: strategy.name,
    group: syncStateGroup,
    state: strategy.state,
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
      const accepted = yield* sot.write(entities);
      project(accepted);
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

  const handlers = buildMutationHandlers<TItem, R>({
    writeServerTruth,
    onUpdate,
    updatePacing,
    runner: config.runner,
  });

  const sync: SyncConfig<CollectionItem<TItem>, string>['sync'] = (
    callbacks,
  ) => {
    const local = makeCollectionProjector<TItem>(callbacks);
    projector = local;
    collectionUpdate = (updater) =>
      callbacks.collection.update(schema.name, updater);

    const run = config.runner.runPromise(
      Effect.catch(
        Effect.gen(function* () {
          const entities = yield* readCurrent;
          local.projectAll(entities);
          callbacks.markReady();

          return yield* startSingleItemLifecycle({
            strategy,
            makeContext: (scope) => ({
              writeServerTruth,
              getState: stateStore.get(SINGLE_STATE_KEY),
              setState: (state) => stateStore.set(SINGLE_STATE_KEY, state),
              scope,
            }),
            onError: (error) =>
              config.report({
                _tag: 'StrategyFailed',
                collection: schema.name,
                partitionKey: SINGLE_STATE_KEY,
                strategy: strategy.name,
                cause: error,
              }),
          });
        }).pipe(
          Effect.tapError((error) =>
            config.report({
              _tag: 'InitializationFailed',
              collection: schema.name,
              cause: error,
            }),
          ),
        ),
        () => Effect.succeed(null),
      ),
    );

    return {
      cleanup: async () => {
        const mounted = await run;
        if (!mounted) return;
        await config.runner.runPromise(mounted.close);
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
      pacedUpdate: (changes: Partial<TItem>) =>
        handlers.pacedUpdate(changes, (next) => {
          collectionUpdate?.((draft) => {
            Object.assign(draft, next);
          });
        }),
      pendingCount: handlers.pendingCount,
      subscribePending: handlers.subscribePending,
    },
  } as SingleItemResult<TItem, S>;
};
