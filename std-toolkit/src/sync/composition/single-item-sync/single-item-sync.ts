import type {
  CollectionConfig,
  SingleResult,
  SyncConfig,
  Transaction,
} from '@tanstack/react-db';
import { Effect, Exit, Scope, TxSemaphore } from 'effect';
import type {
  DecodedEntity,
  DecodedSingleEntity,
} from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import { makeCollectionProjector } from '../../runtime/collection-projection/index.js';
import { makeSyncReplica } from '../../persistence/sync-replica/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type {
  CollectionHandle,
  Tracker,
} from '../../runtime/sync-registry/index.js';
import type { SingleItemStrategy } from '../../runtime/strategy-runtime/index.js';
import { makeSyncStateStore } from '../../persistence/sync-state/index.js';
import type {
  CollectionItem,
  CollectionItemSchema,
  StdCollectionOptions,
} from '../../runtime/collection-model/index.js';
import { makeCollectionItemSchema } from '../../runtime/collection-model/index.js';
import { buildMutationHandlers } from './mutations.js';
import type { PaceStrategyFactory } from '../../runtime/mutation-pacing/index.js';
import type { SyncStore } from '../../persistence/sync-store/index.js';
import type { EffectRunner } from '../../runtime/effect-runner/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import { startSingleItemLifecycle } from '../../lifecycle/single-item-lifecycle/index.js';
import { nextUlid } from '../../../core/index.js';
import {
  Activation,
  makeCollectionFlow,
  singleItemParticipantName,
  type ActivationRef,
  type FlowPlacement,
  type StrategyFlow,
} from '../../runtime/sync-flow/index.js';
import {
  makePeerSync,
  type PeerChannelFactory,
} from '../../runtime/peer-sync/index.js';
import {
  leadershipIdentity,
  type Leadership,
} from '../../runtime/leadership/index.js';

const SINGLETON_KEY = '__singleton__';
const SINGLE_STATE_KEY = '__single__';

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
    }) => Effect.Effect<DecodedSingleEntity<S['Type']>, unknown, R>;
    updatePacing?: PaceStrategyFactory;
    store: SyncStore;
    leadership: Leadership;
    collectionName: string;
    assertActive: () => void;
    trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
    runner: EffectRunner<R>;
    report: SyncReporter<R>;
    peerChannel?: PeerChannelFactory | null;
    flowPlacement?: FlowPlacement;
  },
): SingleItemResult<S['Type'], S> => {
  type TItem = S['Type'];

  const { schema, strategy, options, onUpdate, updatePacing } = config;
  const { collectionName } = config;
  const flow = makeCollectionFlow(
    collectionName,
    config.runner.runSync(nextUlid),
    config.flowPlacement,
  );
  const replica = makeSyncReplica({
    schema,
    store: config.store,
    collectionName,
    keyOf: () => SINGLETON_KEY,
  });
  const stateStore = makeSyncStateStore({
    schemaName: collectionName,
    strategyName: strategy.name,
    store: config.store,
    state: strategy.state,
  });
  const advancePermit = config.runner.runSync(TxSemaphore.make(1));

  type Projector = ReturnType<typeof makeCollectionProjector<TItem>>;
  let projector: Projector | null = null;
  let collectionActivation: ActivationRef | null = null;
  let collectionUpdate:
    | ((updater: (draft: CollectionItem<TItem>) => void) => Transaction)
    | null = null;

  let position: string | null = null;
  let peerSync: ReturnType<typeof makePeerSync<TItem, R>> | null = null;

  const advance = (): Effect.Effect<number, WriteError> =>
    TxSemaphore.withPermit(
      advancePermit,
      Effect.gen(function* () {
        if (projector === null) return 0;
        const delta = yield* replica.since(position);
        position = delta.position;
        yield* Effect.sync(() => projector?.projectEntities(delta.entities));
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
      const accepted = yield* replica.applyToSyncReplica(entities);
      yield* advance();
      if (options.propagate && accepted.length > 0 && peerSync !== null) {
        yield* Effect.promise(() =>
          peerSync!.broadcast(
            accepted as [DecodedEntity<TItem>, ...DecodedEntity<TItem>[]],
          ),
        );
      }
      if (syncFlow && entities.length > 0) {
        yield* syncFlow.log('Sync Replica write', {
          attributes: {
            receivedCount: entities.length,
            storedCount: accepted.length,
          },
        });
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
  };
  tracker.register(handle);

  const peer = makePeerSync<TItem, R>({
    collectionName,
    schema,
    runner: config.runner,
    report: config.report,
    apply: (entities, options) =>
      applyToSyncReplica(entities, undefined, options).pipe(Effect.asVoid),
    ...(config.peerChannel === undefined
      ? {}
      : { channel: config.peerChannel }),
  });
  peerSync = peer;
  config.trackCleanup(() => peer.close());

  const handlers = buildMutationHandlers<TItem, R>({
    collectionName,
    applyToSyncReplica: (entities) =>
      applyToSyncReplica(entities).pipe(Effect.asVoid),
    onUpdate,
    updatePacing,
    runner: config.runner,
    flow: () => flow,
  });

  const sync: SyncConfig<CollectionItem<TItem>, string>['sync'] = (
    callbacks,
  ) => {
    config.assertActive();
    const strategyFlow = flow.participant(
      singleItemParticipantName(strategy.name),
    );
    collectionActivation = config.runner.runSync(
      flow.collection.activation.start('Collection lifecycle'),
    );
    config.runner.runSync(
      flow.collection.log('Collection start', {
        attributes: { collection: collectionName },
      }),
    );
    const local = makeCollectionProjector<TItem>(callbacks);
    projector = local;
    position = null;
    collectionUpdate = (updater) =>
      callbacks.collection.update(schema.name, updater);

    let active = true;
    let mounted: { close: Effect.Effect<void> } | null = null;
    const initializationScope = config.runner.runSync(Scope.make());
    config.runner.runSync(
      Effect.forkIn(
        Effect.catch(
          Effect.gen(function* () {
            const projected = yield* advance().pipe(
              flow.collection.withSpan('Sync Replica hydration', {
                attributes: { collection: collectionName },
              }),
            );
            const ready = yield* Effect.sync(() => {
              if (!active) return false;
              callbacks.markReady();
              return true;
            });
            if (!ready) return;
            yield* flow.collection.log('Collection ready', {
              attributes: {
                collection: collectionName,
                entityCount: projected,
              },
            });
            yield* flow.collection.state({ projectedRows: projected });
            yield* flow.collection.send(
              strategyFlow.name,
              'Single-item sync start',
            );

            yield* startSingleItemLifecycle({
              leadership: config.leadership,
              identity: leadershipIdentity({
                collectionName,
                partitionKey: SINGLE_STATE_KEY,
                role: { _tag: 'Strategy', name: strategy.name },
              }),
              strategy,
              flow: strategyFlow,
              makeContext: (scope, workerFlow) => ({
                flow: workerFlow,
                applyToSyncReplica: (entities) =>
                  applyToSyncReplica(entities, workerFlow).pipe(Effect.asVoid),
                getState: stateStore.get(SINGLE_STATE_KEY),
                setState: (state) => stateStore.set(SINGLE_STATE_KEY, state),
                scope,
              }),
              onError: (error) =>
                config.report({
                  _tag: 'StrategyFailed',
                  collection: collectionName,
                  partitionKey: SINGLE_STATE_KEY,
                  strategy: strategy.name,
                  cause: error,
                }),
              onDefect: (cause) =>
                config.report({
                  _tag: 'StrategyDefect',
                  collection: collectionName,
                  partitionKey: SINGLE_STATE_KEY,
                  strategy: strategy.name,
                  cause,
                }),
            }).pipe(
              Effect.flatMap((lifecycle) =>
                Effect.sync(() => {
                  mounted = lifecycle;
                }),
              ),
              Effect.uninterruptible,
            );
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
                ),
            ),
          ),
          () => Effect.void,
        ),
        initializationScope,
      ),
    );

    return {
      cleanup: config.trackCleanup(async () => {
        active = false;
        await config.runner.runPromise(
          Scope.close(initializationScope, Exit.void),
        );
        if (mounted) {
          await config.runner.runPromise(
            flow.collection.send(strategyFlow.name, 'Single-item sync stop'),
          );
          await config.runner.runPromise(mounted.close);
        }
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
        return handlers.pacedUpdate(changes, (next) => {
          collectionUpdate?.((draft) => {
            Object.assign(draft, next);
          });
        });
      },
      pendingCount: handlers.pendingCount,
      subscribePending: handlers.subscribePending,
    },
  } as SingleItemResult<TItem, S>;
};
