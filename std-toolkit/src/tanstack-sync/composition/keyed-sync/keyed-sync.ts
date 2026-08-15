import { Effect, Exit, Scope } from 'effect';
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
import type { SyncPersistence } from '../../persistence/sync-persistence-table/index.js';
import {
  makeEffectRunner,
  type EffectRunner,
} from '../../runtime/effect-runner/index.js';
import { makeSyncExecution } from '../../lifecycle/sync-execution/index.js';
import { nextUlid } from '../../../core/index.js';
import {
  makeCollectionFlow,
  partitionParticipantName,
  type StrategyFlow,
} from '../../runtime/sync-flow/index.js';

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
    persistence: SyncPersistence;
    assertActive: () => void;
    trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
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
  const flow = makeCollectionFlow(schema.name, runner.runSync(nextUlid));
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

  const sot = makeSourceOfTruth<TItem>({
    schema,
    persistence: config.persistence,
  });
  const pending = runner.runSync(makePendingTracker);
  let projector: Projector<TItem> | null = null;
  let collectionUpdate:
    | ((key: string, updater: (draft: TCollItem) => void) => Transaction)
    | null = null;
  // The native collection is needed by per-partition cadence loops.
  let nativeCollection: SyncCollection<TItem> | null = null;
  const writeServerTruth = (
    entities: EntityType<TItem>[],
    syncFlow?: StrategyFlow,
  ): Effect.Effect<void, WriteError> => {
    config.assertActive();
    return sot.write(entities).pipe(
      Effect.tap((accepted) => Effect.sync(() => projector?.project(accepted))),
      Effect.tap((accepted) =>
        syncFlow && entities.length > 0
          ? syncFlow.log('Source of Truth write', {
              attributes: {
                receivedCount: entities.length,
                storedCount:
                  accepted.upserts.length + accepted.tombstoned.length,
              },
            })
          : Effect.void,
      ),
      Effect.asVoid,
      Effect.withSpan('tanstack-sync.write-server-truth', {
        attributes: {
          entity: schema.name,
          entityCount: entities.length,
        },
      }),
    );
  };

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
    flow: StrategyFlow,
  ): StrategyContext<TItem, TState> => {
    const stateStore = makeSyncStateStore({
      schemaName: schema.name,
      strategyName: strat.name,
      persistence: config.persistence,
      state: strat.state,
    });
    return {
      flow,
      writeServerTruth: (entities) => writeServerTruth(entities, flow),
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
    flow: () => flow,
  });

  const utils: EngineUtils<S> = {
    schema: () => schema,
    writeUpsert: (entities) => {
      const batch = toArray(entities);
      return writeServerTruth(batch);
    },
    pacedUpdate: (key, changes) => {
      config.assertActive();
      return handlers.pacedUpdate(
        key,
        changes,
        (key: string, changes: Partial<TItem>): void => {
          collectionUpdate?.(key, (draft) => {
            Object.assign(draft, changes);
          });
        },
      );
    },
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
    flow: () => flow,
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
        config.assertActive();
        runner.runSync(
          flow.collection.log('Collection start', {
            attributes: { collection: schema.name },
          }),
        );
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
        let active = true;
        const initializationScope = runner.runSync(Scope.make());
        runner.runSync(
          Effect.forkIn(
            Effect.gen(function* () {
              const all = yield* sot.getAll().pipe(
                flow.collection.withSpan('Source of Truth hydration', {
                  attributes: { collection: schema.name },
                }),
              );
              const ready = yield* Effect.sync(() => {
                if (!active) return false;
                projector?.projectAll(all);
                callbacks.markReady();
                return true;
              });
              if (!ready) return;
              yield* flow.collection.log('Collection ready', {
                attributes: {
                  collection: schema.name,
                  entityCount: all.length,
                },
              });
              if (config.total) {
                yield* execution
                  .start(GLOBAL_PARTITION_KEY, config.total, flow)
                  .pipe(Effect.uninterruptible);
              }
            }).pipe(
              Effect.tapError((error) =>
                config
                  .report({
                    _tag: 'InitializationFailed',
                    collection: schema.name,
                    cause: error,
                  })
                  .pipe(
                    Effect.andThen(
                      flow.collection.log('Collection init failure', {
                        attributes: { cause: String(error) },
                        level: 'error',
                      }),
                    ),
                  ),
              ),
              Effect.ignore,
            ),
            initializationScope,
          ),
        );

        const partitionParticipants = new Map<string, string>();

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
            const participantName = partitionParticipantName(
              { field: r.field, value: r.partitionValue },
              entry.strategy.name,
            );
            partitionParticipants.set(r.partitionKey, participantName);
            runner.runSync(
              flow.collection.send(participantName, 'Partition subscribe', {
                attributes: {
                  partitionKey: r.partitionKey,
                  subscriberCount: r.subscriberCount,
                },
              }),
            );
            runner.runSync(
              execution.start(r.partitionKey, entry, flow, {
                field: r.field,
                value: r.partitionValue,
              }),
            );
          } else {
            const participantName = partitionParticipants.get(r.partitionKey);
            if (participantName) {
              runner.runSync(
                flow.collection.send(participantName, 'Partition subscribe', {
                  attributes: {
                    partitionKey: r.partitionKey,
                    subscriberCount: r.subscriberCount,
                  },
                }),
              );
            }
          }
          return true;
        };

        const unloadSubset = (opts: LoadSubsetOptions): void => {
          const r = partitionLifecycle.unload(opts);
          if (!r) return;
          const participantName = partitionParticipants.get(r.partitionKey);
          if (participantName) {
            runner.runSync(
              flow.collection.send(participantName, 'Partition unsubscribe', {
                attributes: {
                  partitionKey: r.partitionKey,
                  subscriberCount: r.subscriberCount,
                },
              }),
            );
          }
          if (r.deactivated) runner.runSync(execution.stop(r.partitionKey));
        };

        const cleanup = async (): Promise<void> => {
          active = false;
          await runner.runPromise(Scope.close(initializationScope, Exit.void));
          await runner.runPromise(execution.stopAll);
          projector = null;
          collectionUpdate = null;
          nativeCollection = null;
          await runner.runPromise(
            flow.collection.log('Collection cleanup', {
              attributes: { collection: schema.name },
            }),
          );
        };

        return {
          cleanup: config.trackCleanup(cleanup),
          loadSubset,
          unloadSubset,
        };
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
