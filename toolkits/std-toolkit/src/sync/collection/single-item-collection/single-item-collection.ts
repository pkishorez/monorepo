import type {
  CollectionConfig,
  SingleResult,
  SyncConfig,
  Transaction,
} from '@tanstack/react-db';
import { Effect, Exit, Latch, Scope, TxSemaphore } from 'effect';
import type {
  DecodedEntity,
  DecodedSingleEntity,
} from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import { makeCollectionProjector } from '../projection/index.js';
import { makeSyncReplica } from '../replica/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { CollectionHandle, Tracker } from '../registry/index.js';
import type { SingleItemStrategy } from '../../strategy/strategy/index.js';
import { makeSyncStateStore } from '../../strategy/state/index.js';
import type {
  CollectionItem,
  CollectionItemSchema,
  StdCollectionOptions,
} from '../../domain/collection-item/index.js';
import { makeCollectionItemSchema } from '../../domain/collection-item/index.js';
import { buildSingleItemMutations } from '../mutation/index.js';
import {
  GLOBAL_PARTITION_KEY,
  type CollectionName,
} from '../../domain/identity/index.js';
import { makeOutboxReplay } from '../outbox-replay/index.js';
import type { OutboxRuntime } from '../../outbox/outbox/index.js';
import type { PaceStrategyFactory } from '../pacing/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import { makeStrategySessions } from '../strategy-session/index.js';
import {
  Activation,
  narrateHydration,
  narrateReplicaWrite,
  type ActivationRef,
  type CollectionFlow,
  type StrategyFlow,
} from '../../flow/sync-flow/index.js';
import {
  makePeerSync,
  type PeerChannelFactory,
} from '../../platform/peer-sync/index.js';
import type { Leadership } from '../../platform/leadership/index.js';

const SINGLETON_KEY = '__singleton__';

export type SingleItemResult<
  TItem extends object,
  S extends AnyUnkeyedESchema,
> = CollectionConfig<CollectionItem<TItem>, string, CollectionItemSchema<S>> &
  SingleResult & {
    schema: CollectionItemSchema<S>;
    utils: {
      schema: () => S;
      flowId: () => string;
      applyToSyncReplica: (
        entities: DecodedEntity<TItem>[],
      ) => Effect.Effect<DecodedEntity<TItem>[], WriteError>;
      onUpdate?: NonNullable<
        ReturnType<typeof buildSingleItemMutations<S>>['onUpdate']
      >;
      pacedUpdate: (changes: Partial<TItem>) => Transaction<Partial<TItem>>;
    };
  };

export const buildSingleItemCollection = <
  S extends AnyUnkeyedESchema,
  TState,
  R = never,
>(
  tracker: Tracker,
  config: {
    schema: S;
    strategy: SingleItemStrategy<S['Type'], TState, R>;
    options?: StdCollectionOptions<S['Type']>;
    onUpdate?: (payload: {
      updates: Partial<S['Type']>;
    }) => Effect.Effect<DecodedSingleEntity<S['Type']>, unknown, R>;
    pacing?: PaceStrategyFactory;
    outbox?: OutboxRuntime | null;
    store: SyncStore;
    leadership: Leadership;
    collectionName: CollectionName;
    assertActive: () => void;
    trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
    runner: EffectRunner<R>;
    report: SyncReporter<R>;
    peerChannel?: PeerChannelFactory | null;
    flow: CollectionFlow;
  },
): SingleItemResult<S['Type'], S> => {
  type TItem = S['Type'];

  const { schema, strategy, options, onUpdate, pacing } = config;
  const outbox = config.outbox ?? null;
  if (outbox && pacing) {
    config.runner.runSync(
      Effect.logWarning(
        `[sync] collection "${config.collectionName}" sets pacing, but the Outbox is the pacer; pacing is ignored`,
      ),
    );
  }
  const { collectionName } = config;
  const { flow } = config;
  const replica = makeSyncReplica({
    schema,
    store: config.store,
    collectionName,
    keyOf: () => SINGLETON_KEY,
  });
  const advancePermit = config.runner.runSync(TxSemaphore.make(1));
  const replayLatch = config.runner.runSync(Latch.make(true));
  const writePermit = config.runner.runSync(TxSemaphore.make(1));

  type Projector = ReturnType<typeof makeCollectionProjector<TItem>>;
  let projector: Projector | null = null;
  let collectionActivation: ActivationRef | null = null;
  let collectionUpdate:
    | ((updater: (draft: CollectionItem<TItem>) => void) => Transaction)
    | null = null;

  let position: string | null = null;
  let peerSync: ReturnType<typeof makePeerSync<TItem, R>> | null = null;

  const advance = (
    narrator?: StrategyFlow,
  ): Effect.Effect<number, WriteError> =>
    TxSemaphore.withPermit(
      advancePermit,
      Effect.gen(function* () {
        if (projector === null) return 0;
        const story = narrateHydration(narrator, collectionName);
        const delta = yield* story.load(
          position,
          replica
            .since(position)
            .pipe(
              Effect.map((read) => ({ ...read, rows: read.entities.length })),
            ),
        );
        position = delta.position;
        yield* story.project(
          delta.entities.length,
          Effect.sync(() => projector?.projectEntities(delta.entities)),
        );
        return delta.entities.length;
      }),
    );

  const applyToSyncReplica = (
    entities: DecodedEntity<TItem>[],
    syncFlow?: StrategyFlow,
    options: { readonly propagate: boolean } = { propagate: true },
  ): Effect.Effect<DecodedEntity<TItem>[], WriteError> => {
    config.assertActive();
    return Effect.gen(function* () {
      if (entities.some((entity) => entity.meta._d)) {
        return yield* Effect.fail<WriteError>({
          _tag: 'Invalid',
          reason: `single-item collection '${schema.name}' cannot be deleted`,
        });
      }
      const story = narrateReplicaWrite(syncFlow, collectionName);
      const accepted = yield* story.write(
        entities.length,
        TxSemaphore.withPermit(
          writePermit,
          replica.applyToSyncReplica(entities),
        ),
      );
      yield* advance(syncFlow);
      if (options.propagate && accepted.length > 0 && peerSync !== null) {
        yield* story.broadcast(
          accepted.length,
          Effect.promise(() =>
            peerSync!.broadcast(
              accepted as [DecodedEntity<TItem>, ...DecodedEntity<TItem>[]],
            ),
          ),
        );
      }
      return accepted;
    }).pipe(
      Effect.withSpan('sync.apply-to-sync-replica', {
        attributes: {
          entity: collectionName,
          entityCount: entities.length,
        },
      }),
    );
  };

  const projectOnly = (
    entities: DecodedEntity<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    Effect.sync(() => projector?.projectEntities(entities));

  const handle: CollectionHandle = {
    schemaName: schema.name,
    collectionName,
    applyToSyncReplica: (entities) =>
      applyToSyncReplica(entities as DecodedEntity<TItem>[]).pipe(
        Effect.asVoid,
      ),
    projectOnly: projectOnly as CollectionHandle['projectOnly'],
    flow: () => flow,
    stop: Effect.suspend(() => sessions.stopAll),
    restart: Effect.promise(() => config.runner.runPromise(restart())),
  };
  tracker.register(handle);

  const peer = makePeerSync<TItem, R>({
    collectionName,
    schema,
    runner: config.runner,
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

  const handlers = buildSingleItemMutations<S, R>({
    schema,
    collectionName,
    applyToSyncReplica: (entities) =>
      applyToSyncReplica(entities).pipe(Effect.asVoid),
    onUpdate,
    pacing,
    outbox,
    replayed: replayLatch.await,
    runner: config.runner,
    flow: () => flow,
  });
  const replay = outbox
    ? makeOutboxReplay<TItem>({
        outbox,
        collectionName,
        idField: null,
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

  const sessions = config.runner.runSync(
    makeStrategySessions<TItem, R>({
      collectionName,
      leadership: config.leadership,
      collection: () => null,
      makeContext: (key, scope, sessionStrategy, workerFlow) => {
        const stateStore = makeSyncStateStore({
          schemaName: collectionName,
          strategyName: sessionStrategy.name,
          store: config.store,
          state: sessionStrategy.state,
        });
        return {
          flow: workerFlow,
          applyToSyncReplica: (entities) =>
            applyToSyncReplica(entities, workerFlow).pipe(Effect.asVoid),
          getState: stateStore.get(key),
          setState: (state) => stateStore.set(key, state),
          scope,
        };
      },
      applyToSyncReplica: (entities, workerFlow) =>
        applyToSyncReplica(entities, workerFlow).pipe(Effect.asVoid),
      report: config.report,
    }),
  );
  let collectionTruncate: (() => void) | null = null;

  const startLifecycle = () =>
    sessions
      .start(GLOBAL_PARTITION_KEY, { strategy }, flow)
      .pipe(Effect.uninterruptible);

  const restart = (): Effect.Effect<void, WriteError, R> =>
    Effect.gen(function* () {
      if (projector === null) return;
      collectionTruncate?.();
      position = null;
      yield* advance(flow.collection);
      yield* startLifecycle();
    });

  const sync: SyncConfig<CollectionItem<TItem>, string>['sync'] = (
    callbacks,
  ) => {
    config.assertActive();
    collectionActivation = config.runner.runSync(
      flow.collection.activation.start('Collection lifecycle'),
    );
    config.runner.runSync(
      flow.collection.log('Collection start', {
        attributes: { collection: collectionName, strategy: strategy.name },
      }),
    );
    const local = makeCollectionProjector<TItem>(callbacks);
    projector = local;
    position = null;
    collectionUpdate = (updater) =>
      callbacks.collection.update(schema.name, updater);
    collectionTruncate = () => {
      callbacks.begin();
      callbacks.truncate();
      callbacks.commit();
    };

    let active = true;
    const initializationScope = config.runner.runSync(Scope.make());
    if (replay) config.runner.runSync(replayLatch.close);
    config.runner.runSync(
      Effect.forkIn(
        Effect.catch(
          Effect.gen(function* () {
            const projected = yield* advance(flow.collection);
            if (replay) yield* replay(callbacks.collection, schema.name);
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
            yield* startLifecycle();
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
          ),
          () => Effect.void,
        ).pipe(Effect.ensuring(replayLatch.open)),
        initializationScope,
      ),
    );

    return {
      cleanup: config.trackCleanup(async () => {
        active = false;
        await config.runner.runPromise(
          Scope.close(initializationScope, Exit.void),
        );
        await config.runner.runPromise(sessions.stopAll);
        projector = null;
        collectionUpdate = null;
        await config.runner.runPromise(
          flow.collection.log('Collection cleanup', {
            attributes: { collection: collectionName },
          }),
        );
        if (collectionActivation) {
          await config.runner.runPromise(
            collectionActivation.end(Activation.completed()),
          );
          collectionActivation = null;
        }
      }),
    };
  };

  return {
    id: collectionName,
    schema: makeCollectionItemSchema(schema),
    ...(options as object),
    rowUpdateMode: 'full',
    singleResult: true,
    getKey: () => schema.name,
    sync: { sync },
    onUpdate: handlers.onUpdate,
    utils: {
      schema: () => schema,
      flowId: () => flow.id,
      applyToSyncReplica,
      onUpdate: handlers.onUpdate,
      pacedUpdate: (changes: Partial<TItem>) => {
        config.assertActive();
        if (outbox) {
          if (!collectionUpdate) {
            throw new Error('Cannot update before the collection starts');
          }
          return collectionUpdate((draft) => {
            Object.assign(draft, changes);
          }) as Transaction<Partial<TItem>>;
        }
        return handlers.pacedUpdate(changes, (next) => {
          collectionUpdate?.((draft) => {
            Object.assign(draft, next);
          });
        });
      },
    },
  } as SingleItemResult<TItem, S>;
};
