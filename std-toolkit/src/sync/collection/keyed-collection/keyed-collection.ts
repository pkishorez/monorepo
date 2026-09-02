import { Effect, Exit, Latch, Scope, TxSemaphore } from 'effect';
import type {
  CadenceConfig,
  SyncCollection,
} from '../../strategy/cadence-repair/index.js';
import {
  GLOBAL_PARTITION_KEY,
  type CollectionName,
  type PartitionKey,
  type PartitionValue,
} from '../../domain/identity/index.js';
import type {
  CollectionConfig,
  LoadSubsetOptions,
  Transaction,
} from '@tanstack/react-db';
import type { DecodedEntity } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import { makeSyncReplica } from '../replica/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import { makeCollectionProjector } from '../projection/index.js';
import type {
  CollectionItem,
  CollectionItemSchema,
  DeletePayload,
  UpdateChanges,
  UpdatePayload,
} from '../../domain/collection-item/index.js';
import { makeCollectionItemSchema } from '../../domain/collection-item/index.js';
import type { Tracker } from '../registry/index.js';
import { makeSyncStateStore } from '../../strategy/state/index.js';
import { buildKeyedMutations } from '../mutation/index.js';
import { makeOutboxReplay } from '../outbox-replay/index.js';
import type { OutboxRuntime } from '../../outbox/outbox/index.js';
import { makeHybridSync } from './hybrid-sync/hybrid-sync.js';
import type {
  PartitionedStrategy,
  PartitionEntry,
  PartitionMap,
  StrategyContext,
} from '../../strategy/strategy/index.js';
import type { PaceStrategyFactory } from '../pacing/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';
import {
  makeEffectRunner,
  type EffectRunner,
} from '../../platform/effect-runner/index.js';
import { makeStrategySessions } from '../strategy-session/index.js';
import {
  Activation,
  narrateHydration,
  narrateReplicaWrite,
  partitionParticipantName,
  type ActivationRef,
  type CollectionFlow,
  type StrategyFlow,
} from '../../worker/sync-flow/index.js';
import {
  makePeerSync,
  type PeerChannelFactory,
} from '../../platform/peer-sync/index.js';
import type { Leadership } from '../../platform/leadership/index.js';

type Projector<TItem> = ReturnType<typeof makeCollectionProjector<TItem>>;

export type KeyedCollectionUtils<S extends AnyEntityESchema> = {
  schema: () => S;
  flowId: () => string;
  applyToSyncReplica: (
    entities: DecodedEntity<S['Type']> | DecodedEntity<S['Type']>[],
  ) => Effect.Effect<DecodedEntity<S['Type']>[], WriteError>;
  pacedUpdate: (
    key: string,
    changes: UpdateChanges<S['Type'], S>,
  ) => Transaction<Partial<S['Type']>>;
};

const toArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

export const buildKeyedCollection = <S extends AnyEntityESchema, R = never>(
  tracker: Tracker,
  config: {
    schema: S;
    total?: PartitionEntry<S['Type'], R, any>;
    partitions?: PartitionMap<S, R>;
    onInsert?: (
      items: ReadonlyArray<S['Type']>,
    ) => Effect.Effect<ReadonlyArray<DecodedEntity<S['Type']>>, unknown, R>;
    onUpdate?: (
      payload: UpdatePayload<S['Type'], S>,
    ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
    onDelete?: (
      payload: DeletePayload<S['Type']>,
    ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
    pacing?: PaceStrategyFactory;
    outbox?: OutboxRuntime | null;
    store: SyncStore;
    leadership: Leadership;
    collectionName: CollectionName;
    assertActive: () => void;
    trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
    defaultCadence?: CadenceConfig;
    runner?: EffectRunner<R>;
    report: SyncReporter<R>;
    peerChannel?: PeerChannelFactory | null;
    flow: CollectionFlow;
  },
): CollectionConfig<
  CollectionItem<S['Type']>,
  string,
  CollectionItemSchema<S>,
  KeyedCollectionUtils<S>
> & {
  schema: CollectionItemSchema<S>;
  utils: KeyedCollectionUtils<S>;
} => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema } = config;
  const { collectionName } = config;
  const runner = config.runner ?? makeEffectRunner<R>(undefined);
  const { flow } = config;
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
  const hybridSync = runner.runSync(makeHybridSync(partitionFields));

  const replica = makeSyncReplica({
    schema,
    store: config.store,
    collectionName,
  });
  const outbox = config.outbox ?? null;
  if (outbox && config.pacing) {
    runner.runSync(
      Effect.logWarning(
        `[sync] collection "${collectionName}" sets pacing, but the Outbox is the pacer; pacing is ignored`,
      ),
    );
  }
  const advancePermit = runner.runSync(TxSemaphore.make(1));
  const replayLatch = runner.runSync(Latch.make(true));
  const writePermit = runner.runSync(TxSemaphore.make(1));
  let projector: Projector<TItem> | null = null;
  let collectionUpdate:
    | ((key: string, updater: (draft: TCollItem) => void) => Transaction)
    | null = null;
  let collectionTruncate: (() => void) | null = null;
  const activePartitions = new Map<
    PartitionKey,
    {
      entry: PartitionEntry<TItem, R, any>;
      partition: { field: string; value: PartitionValue };
    }
  >();
  let nativeCollection: SyncCollection<TItem> | null = null;
  let collectionActivation: ActivationRef | null = null;
  let position: string | null = null;
  let peerSync: ReturnType<typeof makePeerSync<TItem, R>> | null = null;

  // Projects the replica page by page so a large hydration never blocks on reading
  // every row first; the Collection is marked ready only once all of it is projected.
  const advance = (
    options: {
      readonly seeding: boolean;
      readonly narrator?: StrategyFlow | undefined;
    } = { seeding: false },
  ): Effect.Effect<number, WriteError> =>
    TxSemaphore.withPermit(
      advancePermit,
      Effect.gen(function* () {
        if (projector === null) return 0;
        const story = narrateHydration(options.narrator, collectionName);
        let projected = 0;
        const read = yield* story.load(
          position,
          replica.eachPage(position, (page) =>
            Effect.gen(function* () {
              const entities = options.seeding
                ? page.entities.filter((entity) => !entity.meta._d)
                : page.entities;
              projector?.projectEntities(entities);
              position = page.position;
              projected += entities.length;
              yield* Effect.yieldNow;
            }),
          ),
        );
        position = read.position;
        return projected;
      }),
    );

  const applyToSyncReplica = (
    entities: DecodedEntity<TItem>[],
    syncFlow?: StrategyFlow,
    options: { readonly propagate: boolean } = { propagate: true },
  ): Effect.Effect<DecodedEntity<TItem>[], WriteError> => {
    config.assertActive();
    const story = narrateReplicaWrite(syncFlow, collectionName);
    return story
      .write(
        entities.length,
        TxSemaphore.withPermit(
          writePermit,
          replica.applyToSyncReplica(entities),
        ),
      )
      .pipe(
        Effect.tap(() => advance({ seeding: false, narrator: syncFlow })),
        Effect.tap((accepted) =>
          options.propagate && accepted.length > 0 && peerSync !== null
            ? story.broadcast(
                accepted.length,
                Effect.promise(() =>
                  peerSync!.broadcast(
                    accepted as [
                      DecodedEntity<TItem>,
                      ...DecodedEntity<TItem>[],
                    ],
                  ),
                ),
              )
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
    key: PartitionKey,
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

  const sessions = runner.runSync(
    makeStrategySessions<TItem, R>({
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

  const handlers = buildKeyedMutations<S, R>({
    ...config,
    applyToSyncReplica: (entities) =>
      applyToSyncReplica(entities).pipe(Effect.asVoid),
    outbox,
    replayed: replayLatch.await,
    runner,
    flow: () => flow,
  });
  const replay = outbox
    ? makeOutboxReplay<TItem>({
        outbox,
        collectionName,
        idField: schema.idField,
        decode: handlers.decode,
        pick: handlers.pick,
        report: (entryId, cause) =>
          config.report({
            _tag: 'OutboxFailed',
            phase: 'replay',
            entryIds: [entryId],
            cause,
          }),
        flow: flow.outbox,
      })
    : null;

  const utils: KeyedCollectionUtils<S> = {
    schema: () => schema,
    flowId: () => flow.id,
    applyToSyncReplica: (entities) => {
      const batch = toArray(entities);
      return applyToSyncReplica(batch);
    },
    pacedUpdate: (key, changes) => {
      config.assertActive();
      if (outbox) {
        if (!collectionUpdate) {
          throw new Error(
            `Cannot update "${key}" before the collection starts`,
          );
        }
        return collectionUpdate(key, (draft) => {
          Object.assign(draft, changes);
        }) as Transaction<Partial<TItem>>;
      }
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
  };

  const restart = (): Effect.Effect<void, WriteError, R> =>
    Effect.gen(function* () {
      if (projector === null) return;
      collectionTruncate?.();
      position = null;
      yield* advance({ seeding: true, narrator: flow.collection });
      if (config.total) {
        yield* sessions.start(GLOBAL_PARTITION_KEY, config.total, flow);
      }
      for (const [partitionKey, active] of activePartitions) {
        yield* sessions.start(
          partitionKey,
          active.entry,
          flow,
          active.partition,
        );
      }
    });

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
    stop: sessions.stopAll,
    restart: Effect.promise(() => runner.runPromise(restart())),
  });

  const peer = makePeerSync<TItem, R>({
    collectionName,
    schema,
    runner,
    report: config.report,
    apply: (entities, options) =>
      applyToSyncReplica(entities, undefined, options).pipe(
        Effect.tap(() => Effect.sync(() => outbox?.recheck())),
        Effect.asVoid,
      ),
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
        collectionTruncate = () => {
          callbacks.begin();
          callbacks.truncate();
          callbacks.commit();
        };

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
        // The Drainer must not send this Collection's Entries while they are
        // being replayed; the latch reopens however the init fiber ends.
        if (replay) runner.runSync(replayLatch.close);
        runner.runSync(
          Effect.forkIn(
            Effect.gen(function* () {
              const projected = yield* advance({
                seeding: true,
                narrator: flow.collection,
              });
              // Replay before ready: preload() must resolve with every
              // persisted optimistic write already visible.
              if (replay) yield* replay(callbacks.collection);
              yield* replayLatch.open;
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
                yield* sessions
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
              Effect.ensuring(replayLatch.open),
            ),
            initializationScope,
          ),
        );

        const partitionParticipants = new Map<PartitionKey, string>();

        const loadSubset = (opts: LoadSubsetOptions): true => {
          const r = hybridSync.load(opts);
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
            activePartitions.set(r.partitionKey, {
              entry,
              partition: { field: r.field, value: r.partitionValue },
            });
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
              sessions.start(r.partitionKey, entry, flow, {
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
          const r = hybridSync.unload(opts);
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
          if (r.deactivated) {
            activePartitions.delete(r.partitionKey);
            void runner.runPromise(sessions.stop(r.partitionKey));
          }
        };

        const cleanup = async (): Promise<void> => {
          active = false;
          await runner.runPromise(Scope.close(initializationScope, Exit.void));
          await runner.runPromise(sessions.stopAll);
          projector = null;
          collectionUpdate = null;
          collectionTruncate = null;
          nativeCollection = null;
          activePartitions.clear();
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
    KeyedCollectionUtils<S>
  > & {
    schema: CollectionItemSchema<S>;
    utils: KeyedCollectionUtils<S>;
  };
};
