import type {
  CollectionConfig,
  SingleResult,
  SyncConfig,
  Transaction,
} from '@tanstack/react-db';
import { Effect, Exit, Scope, TxSemaphore } from 'effect';
import type { EntityType, SingleEntityType } from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import { makeCollectionProjector } from '../../runtime/collection-projection/index.js';
import {
  makeChangeNotice,
  type ChannelFactory,
} from '../../runtime/change-notice/index.js';
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
import type { SyncPersistence } from '../../persistence/sync-persistence-table/index.js';
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

const SINGLETON_KEY = '__singleton__';
const SINGLE_STATE_KEY = '__single__';

export type SingleItemResult<
  TItem extends object,
  S extends AnyUnkeyedESchema,
> = CollectionConfig<CollectionItem<TItem>, string> &
  SingleResult & {
    utils: {
      schema: () => S;
      flowId: () => string;
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
    persistence: SyncPersistence;
    assertActive: () => void;
    trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
    runner: EffectRunner<R>;
    report: SyncReporter<R>;
    flowPlacement?: FlowPlacement;
    noticeScope: string;
    noticeChannel?: ChannelFactory;
  },
): SingleItemResult<S['Type'], S> => {
  type TItem = S['Type'];

  const { schema, strategy, options, onUpdate, updatePacing } = config;
  const flow = makeCollectionFlow(
    schema.name,
    config.runner.runSync(nextUlid),
    config.flowPlacement,
  );
  const sot = makeSourceOfTruth<TItem>({
    schema,
    persistence: config.persistence,
    keyOf: () => SINGLETON_KEY,
  });
  const stateStore = makeSyncStateStore({
    schemaName: schema.name,
    strategyName: strategy.name,
    persistence: config.persistence,
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

  const project = (accepted: Accepted<TItem>): void => {
    if (projector) projector.project(accepted);
  };

  const advance = (): Effect.Effect<number, WriteError> =>
    TxSemaphore.withPermit(
      advancePermit,
      Effect.gen(function* () {
        if (projector === null) return 0;
        const delta = yield* sot.since(position);
        position = delta.position;
        yield* Effect.sync(() => projector?.projectEntities(delta.entities));
        return delta.entities.length;
      }),
    );

  const notice = makeChangeNotice({
    scope: config.noticeScope,
    collection: schema.name,
    onNotice: () => config.runner.runPromise(advance().pipe(Effect.ignore)),
    channel: config.noticeChannel,
  });
  config.trackCleanup(() => notice.close());

  const writeServerTruth = (
    entities: EntityType<TItem>[],
    syncFlow?: StrategyFlow,
  ): Effect.Effect<void, WriteError> => {
    config.assertActive();
    return Effect.gen(function* () {
      if (entities.some((entity) => entity.meta._d)) {
        return yield* Effect.fail<WriteError>({
          _tag: 'Invalid',
          reason: `single-item collection '${schema.name}' cannot be deleted`,
        });
      }
      const accepted = yield* sot.write(entities);
      yield* advance();
      notice.notify();
      if (syncFlow && entities.length > 0) {
        yield* syncFlow.log('Source of Truth write', {
          attributes: {
            receivedCount: entities.length,
            storedCount: accepted.upserts.length + accepted.tombstoned.length,
          },
        });
      }
    }).pipe(
      Effect.withSpan('tanstack-sync.write-server-truth', {
        attributes: {
          entity: schema.name,
          entityCount: entities.length,
        },
      }),
    );
  };

  const projectOnly = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    Effect.sync(() => project({ upserts: entities, tombstoned: [] }));

  const handle: CollectionHandle = {
    schemaName: schema.name,
    writeServerTruth: writeServerTruth as CollectionHandle['writeServerTruth'],
    projectOnly: projectOnly as CollectionHandle['projectOnly'],
    flow: () => flow,
  };
  tracker.register(handle);

  const handlers = buildMutationHandlers<TItem, R>({
    writeServerTruth,
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
        attributes: { collection: schema.name },
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
              flow.collection.withSpan('Source of Truth hydration', {
                attributes: { collection: schema.name },
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
                collection: schema.name,
                entityCount: projected,
              },
            });
            yield* flow.collection.state({ projectedRows: projected });
            yield* flow.collection.send(
              strategyFlow.name,
              'Single-item sync start',
            );

            yield* startSingleItemLifecycle({
              strategy,
              flow: strategyFlow,
              makeContext: (scope, workerFlow) => ({
                flow: workerFlow,
                writeServerTruth: (entities) =>
                  writeServerTruth(entities, workerFlow),
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
              onDefect: (cause) =>
                config.report({
                  _tag: 'StrategyDefect',
                  collection: schema.name,
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
            attributes: { collection: schema.name },
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
    ...(options as object),
    rowUpdateMode: 'full',
    singleResult: true,
    getKey: () => schema.name,
    sync: { sync },
    onUpdate: handlers.onUpdate,
    utils: {
      schema: () => schema,
      flowId: () => flow.id,
      writeServerTruth,
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
