import { Duration, Effect, Exit, Schedule, Scope } from 'effect';
import type {
  CollectionConfig,
  LoadSubsetOptions,
  Transaction,
} from '@tanstack/react-db';
import type { EntityType } from '@std-toolkit/core';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import { makeSourceOfTruth, WriteError } from '../source-of-truth/index.js';
import { makeCollectionProjector } from '../collection-projection/index.js';
import type { CollectionItem, UpdatePayload } from '../types.js';
import type { Tracker } from '../registry/tracker.js';
import { makeSyncStateStore } from './sync-state.js';
import { resolvePartitionKey } from './partition-router.js';
import { buildMutationHandlers, makePendingTracker } from './mutations.js';
import type {
  PartitionedStrategy,
  StrategyContext,
} from './strategies/interface.js';
import type { PaceStrategyFactory } from '../paced/pace-strategy.js';

const GLOBAL_KEY = '__total__';

type Projector<TItem> = ReturnType<typeof makeCollectionProjector<TItem>>;

/**
 * The engine-owned, schema-generic utilities attached to a partitioned collection.
 * Carries no `sync` key — sync wiring is internal to `buildPartitioned`. Every member is
 * a flat function: TanStack's `CollectionImpl.utils` field is typed `Record<string, Fn>`,
 * so a nested-object util would collapse the collection's row type to `never`. `writeUpsert`
 * persists the given server entities through SoT convergence — the manual escape hatch for
 * injecting server truth already in hand. `pacedUpdate` exposes the per-key paced update path;
 * `pendingCount` reports the in-flight mutation count for a single key, and `subscribePending`
 * fires on every change to any key's count.
 */
export type EngineUtils = {
  schema: () => AnyEntityESchema;
  writeUpsert: (entities: EntityType<unknown> | EntityType<unknown>[]) => void;
  pacedUpdate: (key: string, changes: Record<string, unknown>) => Transaction;
  pendingCount: (key: string) => number;
  subscribePending: (listener: () => void) => () => void;
};

const toArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

/**
 * Assembles a partitioned sync collection over one shared Source of Truth: a global
 * `strategy` running under `__total__` plus a per-partition strategy map activated and
 * deactivated by TanStack `loadSubset`/`unloadSubset` refcounting. SoT, sync-state, and
 * refcounts live in the returned config's closure and survive unmount; only the projector
 * and running scopes are torn down on `cleanup`. Registers a `CollectionHandle` with the
 * tracker so the registry can route broadcast traffic to this collection.
 */
export const buildPartitioned = <S extends AnyEntityESchema>(
  tracker: Tracker,
  config: {
    schema: S;
    strategy?: PartitionedStrategy<S['Type']>;
    partitions?: Record<
      string,
      (value: unknown) => PartitionedStrategy<S['Type']>
    >;
    onInsert?: (item: S['Type']) => Effect.Effect<EntityType<S['Type']>>;
    onUpdate?: (
      payload: UpdatePayload<S['Type'], S>,
    ) => Effect.Effect<EntityType<S['Type']>>;
    onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>>;
    updatePacing?: PaceStrategyFactory;
  },
): CollectionConfig<CollectionItem<S['Type']>, string, never, EngineUtils> & {
  utils: EngineUtils;
} => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema } = config;
  const partitionFields = Object.keys(config.partitions ?? {});

  const sot = makeSourceOfTruth<TItem>(schema);
  const stateStore = makeSyncStateStore();
  const pending = makePendingTracker();
  let projector: Projector<TItem> | null = null;
  let collectionUpdate:
    | ((key: string, updater: (draft: TCollItem) => void) => Transaction)
    | null = null;
  const refcounts = new Map<string, number>();
  const scopes = new Map<string, Scope.Closeable>();

  const writeServerTruth = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, import('../source-of-truth/index.js').WriteError> =>
    sot.write(entities).pipe(
      Effect.tap((accepted) => Effect.sync(() => projector?.project(accepted))),
      Effect.asVoid,
    );

  const projectOnly = (entities: EntityType<TItem>[]): Effect.Effect<void> =>
    Effect.sync(() => projector?.projectEntities(entities));

  const deleteKeyOf = (entity: EntityType<TItem>): string | null => {
    const value = entity.value as Record<string, unknown>;
    const id = value[schema.idField];
    return typeof id === 'string' ? id : null;
  };

  const buildCtx = (
    key: string,
    scope: Scope.Scope,
  ): StrategyContext<TItem> => ({
    writeServerTruth,
    getState: stateStore.get(key),
    setState: (s) => stateStore.set(key, s),
    scope,
  });

  const activatePartition = (
    key: string,
    strat: PartitionedStrategy<TItem>,
  ): void => {
    void Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        scopes.set(key, scope);
        const run = strat.run(buildCtx(key, scope)).pipe(
          Scope.provide(scope),
          Effect.tapError((e) =>
            Effect.sync(() =>
              console.error('[tanstack-sync] strategy run failed', e),
            ),
          ),
          Effect.retry(Schedule.spaced(Duration.seconds(2))),
        );
        yield* Effect.forkIn(run, scope);
      }),
    );
  };

  const deactivatePartition = (key: string): void => {
    const scope = scopes.get(key);
    if (!scope) return;
    scopes.delete(key);
    void Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));
  };

  const closeAllScopes = (): void => {
    const closes = Array.from(scopes.values()).map((scope) =>
      Scope.close(scope, Exit.succeed(undefined)),
    );
    scopes.clear();
    void Effect.runPromise(Effect.all(closes, { concurrency: 'unbounded' }));
  };

  const handlers = buildMutationHandlers<S>({
    ...config,
    writeServerTruth,
    pending,
  });

  const utils: EngineUtils = {
    schema: () => schema,
    writeUpsert: (entities) => {
      const batch = toArray(entities) as EntityType<TItem>[];
      void Effect.runPromise(writeServerTruth(batch));
    },
    pacedUpdate: (key, changes) =>
      handlers.pacedUpdate(
        key,
        changes as Partial<TItem>,
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

        void Effect.runPromise(
          Effect.gen(function* () {
            const all = yield* sot.getAll();
            projector?.projectAll(all);
          }),
        );

        if (config.strategy) {
          activatePartition(GLOBAL_KEY, config.strategy);
        }

        callbacks.markReady();

        const loadSubset = (opts: LoadSubsetOptions): true => {
          const r = resolvePartitionKey(opts, partitionFields);
          if (!r) {
            if (!config.strategy) {
              console.error(
                '[tanstack-sync] no partition matched and no global strategy serves this query',
              );
            }
            return true;
          }
          const next = (refcounts.get(r.partitionKey) ?? 0) + 1;
          refcounts.set(r.partitionKey, next);
          if (next === 1) {
            activatePartition(
              r.partitionKey,
              config.partitions![r.field]!(r.partitionValue),
            );
          }
          return true;
        };

        const unloadSubset = (opts: LoadSubsetOptions): void => {
          const r = resolvePartitionKey(opts, partitionFields);
          if (!r) return;
          const next = (refcounts.get(r.partitionKey) ?? 0) - 1;
          refcounts.set(r.partitionKey, Math.max(0, next));
          if (next === 0) {
            deactivatePartition(r.partitionKey);
          }
        };

        const cleanup = (): void => {
          closeAllScopes();
          projector = null;
          collectionUpdate = null;
        };

        return { cleanup, loadSubset, unloadSubset };
      },
    },
    onInsert: handlers.onInsert,
    onUpdate: handlers.onUpdate,
    onDelete: handlers.onDelete,
    utils,
  } as CollectionConfig<CollectionItem<TItem>, string, never, EngineUtils> & {
    utils: EngineUtils;
  };
};
