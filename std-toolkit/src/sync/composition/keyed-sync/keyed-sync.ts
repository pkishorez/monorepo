import { Effect, Exit, Scope, TxSemaphore } from 'effect';
import type {
  CadenceConfig,
  SyncCollection,
} from '../../workers/cadence-repair/index.js';
import type {
  CollectionConfig,
  LoadSubsetOptions,
  Transaction,
} from '@tanstack/react-db';
import type { DecodedEntity } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import { makeSyncReplica } from '../../persistence/sync-replica/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import { makeCollectionProjector } from '../../runtime/collection-projection/index.js';
import type {
  CollectionItem,
  CollectionItemSchema,
  DeletePayload,
  UpdateChanges,
  UpdatePayload,
} from '../../runtime/collection-model/index.js';
import { makeCollectionItemSchema } from '../../runtime/collection-model/index.js';
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
import type { SyncStore } from '../../persistence/sync-store/index.js';
import {
  makeEffectRunner,
  type EffectRunner,
} from '../../runtime/effect-runner/index.js';
import { makeSyncExecution } from '../../lifecycle/sync-execution/index.js';
import { nextUlid } from '../../../core/index.js';
import {
  Activation,
  makeCollectionFlow,
  narrateHydration,
  partitionParticipantName,
  type ActivationRef,
  type FlowParticipant,
  type FlowPlacement,
  type StrategyFlow,
} from '../../runtime/sync-flow/index.js';
import {
  makePeerSync,
  type PeerChannelFactory,
} from '../../runtime/peer-sync/index.js';
import type { Leadership } from '../../runtime/leadership/index.js';

type Projector<TItem> = ReturnType<typeof makeCollectionProjector<TItem>>;

export type EngineUtils<S extends AnyEntityESchema> = {
  schema: () => S;
  flowId: () => string;
  applyToSyncReplica: (
    entities: DecodedEntity<S['Type']> | DecodedEntity<S['Type']>[],
  ) => Effect.Effect<DecodedEntity<S['Type']>[], WriteError>;
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
    ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
    onUpdate?: (
      payload: UpdatePayload<S['Type'], S>,
    ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
    onDelete?: (
      payload: DeletePayload<S['Type']>,
    ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
    updatePacing?: PaceStrategyFactory;
    store: SyncStore;
    leadership: Leadership;
    collectionName: string;
    assertActive: () => void;
    trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
    defaultCadence?: CadenceConfig;
    runner?: EffectRunner<R>;
    report: SyncReporter<R>;
    peerChannel?: PeerChannelFactory | null;
    flowPlacement?: FlowPlacement;
  },
): CollectionConfig<
  CollectionItem<S['Type']>,
  string,
  CollectionItemSchema<S>,
  EngineUtils<S>
> & {
  schema: CollectionItemSchema<S>;
  utils: EngineUtils<S>;
} => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema } = config;
  const { collectionName } = config;
  const runner = config.runner ?? makeEffectRunner<R>(undefined);
  const flow = makeCollectionFlow(
    collectionName,
    runner.runSync(nextUlid),
    config.flowPlacement,
  );
  const partitionFields = Object.keys(config.partitions ?? {});
  const resolvePartitionEntry = (
    field: string,
    value: unknown,
  ): PartitionEntry<TItem, R, any> => {
    const factory = (
      config.partitions as Record<string, unknown> | undefined
    )?.[field];
    if (typeof factory !== 'function') {
      throw new Error(`[sync] no partition factory registered for "${field}"`);
    }
    return (
      factory as (partitionValue: unknown) => PartitionEntry<TItem, R, any>
    )(value);
  };
  const partitionLifecycle = runner.runSync(
    makePartitionLifecycle(partitionFields),
  );

  const replica = makeSyncReplica({
    schema,
    store: config.store,
    collectionName,
  });
  const pending = runner.runSync(makePendingTracker);
  const advancePermit = runner.runSync(TxSemaphore.make(1));
  let projector: Projector<TItem> | null = null;
  let collectionUpdate:
    | ((key: string, updater: (draft: TCollItem) => void) => Transaction)
    | null = null;
  // The native collection is needed by per-partition cadence loops.
  let nativeCollection: SyncCollection<TItem> | null = null;
  let collectionActivation: ActivationRef | null = null;
  let position: string | null = null;
  let peerSync: ReturnType<typeof makePeerSync<TItem, R>> | null = null;

  const advance = (
    options: {
      readonly seeding: boolean;
      readonly narrator?: FlowParticipant;
    } = { seeding: false },
  ): Effect.Effect<number, WriteError> =>
    TxSemaphore.withPermit(
      advancePermit,
      Effect.gen(function* () {
        if (projector === null) return 0;
        const story = narrateHydration(options.narrator, collectionName);
        const delta = yield* story.load(position, replica.since(position));
        position = delta.position;
        const entities = options.seeding
          ? delta.entities.filter((entity) => !entity.meta._d)
          : delta.entities;
        yield* story.project(
          entities.length,
          Effect.sync(() => projector?.projectEntities(entities)),
        );
        return entities.length;
      }),
    );

  const applyToSyncReplica = (
    entities: DecodedEntity<TItem>[],
    syncFlow?: StrategyFlow,
    options: { readonly propagate: boolean } = { propagate: true },
  ): Effect.Effect<DecodedEntity<TItem>[], WriteError> => {
    config.assertActive();
    return replica.applyToSyncReplica(entities).pipe(
      Effect.tap(() => advance()),
      Effect.tap((accepted) =>
        options.propagate && accepted.length > 0 && peerSync !== null
          ? Effect.promise(() =>
              peerSync!.broadcast(
                accepted as [DecodedEntity<TItem>, ...DecodedEntity<TItem>[]],
              ),
            )
          : Effect.void,
      ),
      Effect.tap((accepted) =>
        syncFlow && entities.length > 0
          ? syncFlow.log('Sync Replica write', {
              attributes: {
                receivedCount: entities.length,
                storedCount: accepted.length,
              },
            })
          : Effect.void,
      ),
      Effect.withSpan('sync.apply-to-sync-replica', {
        attributes: {
          entity: collectionName,
          entityCount: entities.length,
        },
      }),
    );
  };

  const projectOnly = (entities: DecodedEntity<TItem>[]): Effect.Effect<void> =>
    Effect.sync(() => projector?.projectEntities(entities));

  const deleteKeyOf = (entity: DecodedEntity<TItem>): string | null => {
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
      schemaName: collectionName,
      strategyName: strat.name,
      store: config.store,
      state: strat.state,
    });
    return {
      flow,
      applyToSyncReplica: (entities) =>
        applyToSyncReplica(entities, flow).pipe(Effect.asVoid),
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
      collectionName,
      leadership: config.leadership,
      makeContext: buildCtx,
      applyToSyncReplica: (entities, strategyFlow) =>
        applyToSyncReplica(entities, strategyFlow).pipe(Effect.asVoid),
      report: config.report,
    }),
  );

  const handlers = buildMutationHandlers<S, R>({
    ...config,
    applyToSyncReplica: (entities) =>
      applyToSyncReplica(entities).pipe(Effect.asVoid),
    pending,
    runner,
    flow: () => flow,
  });

  const utils: EngineUtils<S> = {
    schema: () => schema,
    flowId: () => flow.id,
    applyToSyncReplica: (entities) => {
      const batch = toArray(entities);
      return applyToSyncReplica(batch);
    },
    pacedUpdate: (key, changes) => {
      config.assertActive();
      const currentRow = nativeCollection
        ? [...nativeCollection.values()].find(
            (item) => String(item[schema.idField]) === key,
          )
        : undefined;
      if (!currentRow) {
        throw new Error(`Cannot pace update for missing key "${key}"`);
      }
      return handlers.pacedUpdate(
        key,
        currentRow,
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
    collectionName,
    applyToSyncReplica: (entities) =>
      applyToSyncReplica(entities as DecodedEntity<TItem>[]).pipe(
        Effect.asVoid,
      ),
    projectOnly: projectOnly as (
      entities: DecodedEntity<unknown>[],
    ) => Effect.Effect<void, WriteError>,
    flow: () => flow,
  });

  const peer = makePeerSync<TItem, R>({
    collectionName,
    schema,
    runner,
    report: config.report,
    apply: (entities, options) =>
      applyToSyncReplica(entities, undefined, options).pipe(Effect.asVoid),
    ...(config.peerChannel === undefined
      ? {}
      : { channel: config.peerChannel }),
  });
  peerSync = peer;
  config.trackCleanup(() => peer.close());

  return {
    id: collectionName,
    schema: makeCollectionItemSchema(schema),
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
        collectionActivation = runner.runSync(
          flow.collection.activation.start('Collection lifecycle'),
        );
        runner.runSync(
          flow.collection.log('Collection start', {
            attributes: {
              collection: collectionName,
              ...(config.total ? { strategy: config.total.strategy.name } : {}),
              ...(partitionFields.length > 0
                ? { partitions: partitionFields.join(', ') }
                : {}),
            },
          }),
        );
        projector = makeCollectionProjector<TItem>(callbacks, { deleteKeyOf });
        position = null;
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
              const projected = yield* advance({
                seeding: true,
                narrator: flow.collection,
              });
              const ready = yield* Effect.sync(() => {
                if (!active) return false;
                callbacks.markReady();
                return true;
              });
              if (!ready) return;
              yield* flow.collection.log('Collection ready', {
                attributes: { collection: collectionName, rows: projected },
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
                    collection: collectionName,
                    cause: error,
                  })
                  .pipe(
                    Effect.andThen(
                      flow.collection.log('Collection init failure', {
                        attributes: { cause: String(error) },
                        level: 'error',
                      }),
                    ),
                    Effect.andThen(
                      collectionActivation === null
                        ? Effect.void
                        : collectionActivation.end(Activation.failed(error)),
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
                  collection: collectionName,
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
            const qualifiedParticipantName =
              flow.participant(participantName).name;
            partitionParticipants.set(r.partitionKey, qualifiedParticipantName);
            runner.runSync(
              flow.collection.send(
                qualifiedParticipantName,
                'Partition subscribe',
                {
                  attributes: {
                    partitionKey: r.partitionKey,
                    subscriberCount: r.subscriberCount,
                  },
                },
              ),
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
              attributes: { collection: collectionName },
            }),
          );
          if (collectionActivation) {
            await runner.runPromise(
              collectionActivation.end(Activation.completed()),
            );
            collectionActivation = null;
          }
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
    CollectionItemSchema<S>,
    EngineUtils<S>
  > & {
    schema: CollectionItemSchema<S>;
    utils: EngineUtils<S>;
  };
};
