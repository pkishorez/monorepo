import { Effect, Exit, Scope } from 'effect';
import { createCollection } from '@tanstack/react-db';
import { Memory } from '../../db/memory/index.js';
import type { DecodedEntity, DecodedSingleEntity } from '../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../eschema/index.js';
import { nextUlid } from '../../core/index.js';
import { buildRegistry, makeTracker } from '../collection/registry/index.js';
import { buildKeyedCollection } from '../collection/keyed-collection/index.js';
import { buildSingleItemCollection } from '../collection/single-item-collection/index.js';
import {
  paceStrategy as mutationPaceStrategy,
  type PaceStrategyFactory,
} from '../collection/pacing/index.js';
import type {
  DeletePayload,
  StdCollectionOptions,
  UpdatePayload,
} from '../domain/collection-item/index.js';
import {
  collectionName as qualifyCollectionName,
  GLOBAL_PARTITION_KEY,
  normalizeName,
  stdSyncName,
  type CollectionName,
} from '../domain/identity/index.js';
import {
  storedOutboxEntryEntity,
  syncStore,
} from '../domain/stored-entity/index.js';
import type { SyncReporter } from '../domain/sync-event/index.js';
import {
  makeOutbox,
  type OfflineActionConfig,
  type OutboxRuntime,
} from '../outbox/outbox/index.js';
import type { StdSyncPlatform } from '../platform/contract/index.js';
import {
  makeEffectRunner,
  type EffectRuntime,
} from '../platform/effect-runner/index.js';
import {
  leadershipIdentity,
  makeLeadership,
} from '../platform/leadership/index.js';
import { makeSyncStore } from '../platform/sync-store/index.js';
import {
  bidirectional,
  newToOld,
  oldToNew,
  singleItemSourceStrategy,
  type CadenceConfig,
  type PartitionEntry,
  type PartitionMap,
  type SingleItemSourceConfig,
  type SingleItemStrategy,
} from '../strategy/strategy/index.js';
import { superviseStrategy } from '../flow/supervisor/index.js';
import {
  Activation,
  makeSyncFlow,
  type FlowPlacement,
} from '../flow/sync-flow/index.js';
import { makeReadyGate, type Preloadable } from './ready-gate.js';
import { makeReset } from './reset.js';

const OUTBOX_DRAIN_STRATEGY = 'outbox-drain';

export const syncStrategy = { oldToNew, newToOld, bidirectional };
export const paceStrategy = mutationPaceStrategy;

type SyncShape<S extends AnyEntityESchema, R = never> =
  | {
      total: PartitionEntry<S['Type'], R, any>;
      partitions?: PartitionMap<S, R>;
    }
  | {
      total?: PartitionEntry<S['Type'], R, any>;
      partitions: PartitionMap<S, R>;
    };

export type SyncConfig<S extends AnyEntityESchema, R = never> = {
  schema: S;
  sync?: SyncShape<S, R>;
  options?: StdCollectionOptions<S['Type']>;
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
  outbox?: boolean;
};

type SingleItemSyncBase<S extends AnyUnkeyedESchema, R = never> = {
  schema: S;
  options?: StdCollectionOptions<S['Type']>;
  onUpdate?: (payload: {
    updates: Partial<S['Type']>;
  }) => Effect.Effect<DecodedSingleEntity<S['Type']>, unknown, R>;
  pacing?: PaceStrategyFactory;
  outbox?: boolean;
};

export type SingleItemSyncConfig<
  S extends AnyUnkeyedESchema,
  R = never,
  TState = unknown,
> = SingleItemSyncBase<S, R> &
  (
    | {
        source: SingleItemSourceConfig<S['Type'], R>['source'];
        strategy?: never;
      }
    | {
        source?: never;
        strategy: SingleItemStrategy<S['Type'], TState, R>;
      }
  );

export type StdSyncDefaults<R = never> = {
  name: string;
  version?: string | number;
  options?: StdCollectionOptions<object>;
  platform?: StdSyncPlatform;
  cadence?: CadenceConfig;
  runtime?: EffectRuntime<R>;
  onEvent?: SyncReporter<R>;
  flow?: FlowPlacement;
  outbox?: boolean;
};

const makeStdSync = <R>(defaults: StdSyncDefaults<R>) => {
  const name = stdSyncName(defaults.name);
  const platform = defaults.platform ?? {};
  const collectionNames = new Set<CollectionName>();
  const runner = makeEffectRunner(defaults.runtime);
  const report: SyncReporter<R> =
    defaults.onEvent ?? ((event) => Effect.logError(event));
  const tracker = makeTracker();
  const configuredStore =
    typeof platform.storeLayer === 'function'
      ? platform.storeLayer(name)
      : platform.storeLayer;
  const store = makeSyncStore(
    configuredStore ?? Memory.make(syncStore).layer,
    defaults.version === undefined
      ? undefined
      : { name, version: String(defaults.version) },
  );
  const leadership = makeLeadership(platform.leadershipLayer);
  const flow = makeSyncFlow(
    defaults.flow ?? {
      id: `${name}::${runner.runSync(nextUlid)}`,
      participantPrefix: name,
    },
  );
  const syncActivation = runner.runSync(
    flow.sync.activation.start('Std Sync lifecycle'),
  );
  const outbox = defaults.outbox
    ? makeOutbox({
        syncName: name,
        store,
        runner,
        channel: platform.peerSync ? platform.peerSync.channel : null,
        ...(platform.connectivity
          ? { connectivity: platform.connectivity }
          : {}),
        flow,
        report,
      })
    : null;
  const outboxFor = (config: { outbox?: boolean }): OutboxRuntime | null =>
    config.outbox === false ? null : (outbox?.runtime ?? null);
  const actions = outbox ? outbox.actions : null;

  const gate = makeReadyGate({
    runner,
    flow,
    replayActions: actions ? actions.replayAll : null,
  });

  const drainFailed = (cause: unknown) =>
    report({ _tag: 'OutboxFailed', phase: 'drain', entryIds: [], cause });
  let drainScope: Scope.Closeable | null = null;
  const startDrain = (): void => {
    if (!outbox) return;
    drainScope = runner.runSync(Scope.make());
    runner.runSync(
      Effect.forkIn(
        superviseStrategy({
          leadership,
          identity: leadershipIdentity({
            scope: [name],
            role: { _tag: 'OutboxDrain' },
          }),
          flow: flow.drainer,
          run: () =>
            Effect.promise(() => gate.opened).pipe(
              Effect.andThen(
                outbox.drain((entries, cause) =>
                  report({
                    _tag: 'OutboxFailed',
                    phase: 'request',
                    entryIds: entries.map((entry) => entry.id),
                    cause,
                  }),
                ),
              ),
            ),
          onError: drainFailed,
          onDefect: drainFailed,
          onLeadership: (state) =>
            report({
              _tag: 'LeadershipChanged',
              collection: name,
              partitionKey: GLOBAL_PARTITION_KEY,
              strategy: OUTBOX_DRAIN_STRATEGY,
              state,
            }),
        }),
        drainScope,
      ),
    );
  };
  const stopDrain = (): Promise<void> => {
    const scope = drainScope;
    drainScope = null;
    return scope
      ? runner.runPromise(Scope.close(scope, Exit.void))
      : Promise.resolve();
  };
  startDrain();

  const reset = makeReset({
    runner,
    flow,
    tracker,
    store,
    outbox: outbox?.runtime ?? null,
    stopDrain,
    startDrain,
  });
  const cleanups = new Set<() => Promise<void>>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  const assertActive = (): void => {
    if (disposed) throw new Error('[sync] instance is disposed');
  };

  const trackCleanup = (
    cleanup: () => Promise<void>,
  ): (() => Promise<void>) => {
    let running: Promise<void> | null = null;
    const tracked = (): Promise<void> => {
      running ??= cleanup().finally(() => cleanups.delete(tracked));
      return running;
    };
    cleanups.add(tracked);
    return tracked;
  };

  const defaultGcTime = 10_000;

  const mergeOptions = <TItem extends object>(
    options?: StdCollectionOptions<TItem>,
  ): StdCollectionOptions<TItem> =>
    ({
      gcTime: defaultGcTime,
      ...defaults.options,
      ...options,
    }) as StdCollectionOptions<TItem>;

  // A collection built by the caller from this config still joins the Ready
  // Gate: it is tracked the moment TanStack mounts it.
  type Mountable = { sync: { sync: (params: never) => unknown } };
  const trackOnMount = <C extends Mountable>(built: C): C => {
    const mount = built.sync.sync as (params: {
      collection: Preloadable;
    }) => unknown;
    return {
      ...built,
      sync: {
        ...built.sync,
        sync: (params: { collection: Preloadable }) => {
          gate.track(params.collection);
          return mount(params);
        },
      },
    } as C;
  };

  const sync = <S extends AnyEntityESchema>(config: SyncConfig<S, R>) => {
    assertActive();
    const collectionName = qualifyCollectionName(name, config.schema.name);
    if (collectionNames.has(collectionName)) {
      throw new Error(
        `[sync] collection name "${collectionName}" is already registered`,
      );
    }
    collectionNames.add(collectionName);
    const { sync: syncField, options, outbox: _outbox, ...rest } = config;
    const built = buildKeyedCollection(tracker, {
      ...rest,
      outbox: outboxFor(config),
      ...(syncField?.total ? { total: syncField.total } : {}),
      ...(syncField?.partitions ? { partitions: syncField.partitions } : {}),
      store,
      leadership,
      collectionName,
      assertActive,
      trackCleanup,
      ...(defaults.cadence ? { defaultCadence: defaults.cadence } : {}),
      runner,
      report,
      peerChannel: platform.peerSync ? platform.peerSync.channel : null,
      flow: flow.collection(normalizeName(config.schema.name)),
    });
    return trackOnMount({ ...mergeOptions(options), ...built });
  };

  const singleItemSync = <S extends AnyUnkeyedESchema, TState>(
    config: SingleItemSyncConfig<S, R, TState>,
  ) => {
    assertActive();
    const collectionName = qualifyCollectionName(name, config.schema.name);
    if (collectionNames.has(collectionName)) {
      throw new Error(
        `[sync] collection name "${collectionName}" is already registered`,
      );
    }
    collectionNames.add(collectionName);
    const { options } = config;
    const strategy: SingleItemStrategy<S['Type'], any, R> = config.source
      ? singleItemSourceStrategy({ source: config.source })
      : config.strategy;
    if (!strategy) {
      throw new Error(
        `[sync] collection "${collectionName}" needs either a source or a strategy`,
      );
    }
    return trackOnMount(
      buildSingleItemCollection(tracker, {
        schema: config.schema,
        strategy,
        ...(config.onUpdate ? { onUpdate: config.onUpdate } : {}),
        ...(config.pacing ? { pacing: config.pacing } : {}),
        outbox: outboxFor(config),
        store,
        leadership,
        collectionName,
        assertActive,
        trackCleanup,
        options: mergeOptions(options),
        runner,
        report,
        peerChannel: platform.peerSync ? platform.peerSync.channel : null,
        flow: flow.collection(normalizeName(config.schema.name)),
      }),
    );
  };

  const dispose = (): Promise<void> => {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      gate.cancel();
      await stopDrain();
      const results = await Promise.allSettled(
        [...cleanups].map((cleanup) => cleanup()),
      );
      const disposals = await Promise.allSettled([
        outbox ? outbox.runtime.close() : Promise.resolve(),
        leadership.dispose(),
        store.dispose(),
      ]);
      const failures = [...results, ...disposals].flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      await runner.runPromise(
        syncActivation.end(
          failures.length > 0
            ? Activation.failed('cleanup failed')
            : Activation.completed(),
        ),
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          '[sync] failed to clean up active collections',
        );
      }
    })();
    return disposePromise;
  };

  return {
    flow: { id: flow.id, participant: flow.participant },
    sync,
    singleItemSync,
    collection: <S extends AnyEntityESchema>(config: SyncConfig<S, R>) => {
      const collection = createCollection(sync(config));
      gate.track(collection);
      return collection;
    },
    singleItemCollection: <S extends AnyUnkeyedESchema, TState>(
      config: SingleItemSyncConfig<S, R, TState>,
    ) => {
      const collection = createCollection(singleItemSync(config));
      gate.track(collection);
      return collection;
    },
    createOfflineAction: <P>(action: OfflineActionConfig<P, R>) => {
      assertActive();
      if (!actions) {
        throw new Error('[sync] createOfflineAction requires outbox: true');
      }
      return actions.create(action);
    },
    reset: () => {
      assertActive();
      return reset();
    },
    outbox: {
      entity: storedOutboxEntryEntity,
      transaction: (id: string) => outbox?.runtime.transaction(id) ?? null,
      discard: (id: string): Promise<void> => {
        assertActive();
        if (!outbox) throw new Error('[sync] this Std Sync has no Outbox');
        return runner.runPromise(outbox.runtime.discard(id));
      },
    },
    registry: () => {
      assertActive();
      const registry = buildRegistry(tracker, runner, report);
      return {
        process: (message: unknown): void => {
          assertActive();
          registry.process(message);
        },
      };
    },
    dispose,
  };
};

type CreateStdSync = {
  <R>(
    defaults: StdSyncDefaults<R> & { runtime: EffectRuntime<R> },
  ): ReturnType<typeof makeStdSync<R>>;
  (
    defaults: StdSyncDefaults<never> & { runtime?: never },
  ): ReturnType<typeof makeStdSync<never>>;
};

export const createStdSync = makeStdSync as CreateStdSync;

export type { EffectRuntime } from '../platform/effect-runner/index.js';
export type { FlowLane, FlowPlacement } from '../flow/sync-flow/index.js';
export type {
  PeerChannel,
  PeerChannelFactory,
} from '../domain/peer-channel/index.js';
export type { LeadershipState, SyncEvent } from '../domain/sync-event/index.js';
export type { SyncReporter } from '../domain/sync-event/index.js';
export type { Connectivity } from '../domain/connectivity/index.js';
export { OutboxUnreachable } from '../outbox/outbox/index.js';
export type {
  PartitionedStrategy,
  SingleItemStrategy,
  StrategyContext,
} from '../strategy/strategy/index.js';
export { syncStore } from '../domain/stored-entity/index.js';
export type { SyncStoreLayer } from '../platform/sync-store/index.js';
export type { LeadershipLayer } from '../platform/leadership/index.js';
export type { StdSyncPlatform } from '../platform/contract/index.js';
