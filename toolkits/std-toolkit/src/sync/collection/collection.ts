import type {
  CollectionConfig as TanStackCollectionConfig,
  LoadSubsetOptions,
} from '@tanstack/react-db';
import { Duration, Effect, Exit, Scope, Semaphore, Stream } from 'effect';
import { findOutdatedVersion } from '../../eschema/index.js';
import type { Entity } from '../../core/index.js';
import type { KeyPathValue, TotalKeyPath } from '../../db/index.js';
import type { AnyEntityESchema } from '../../eschema/index.js';
import {
  makeCollectionItemSchema,
  type CollectionItem,
  type CollectionItemSchema,
  type StdCollectionOptions,
} from '../domain/collection-item/index.js';
import {
  GLOBAL_PARTITION_KEY,
  type CollectionName,
  type PartitionKey,
  type PartitionValue,
} from '../domain/identity/index.js';
import type { WriteError } from '../domain/sync-error/index.js';
import type { SyncReporter } from '../domain/sync-event/index.js';
import type { StdSyncPlatform } from '../platform/contract/index.js';
import type { EffectRunner } from '../platform/effect-runner/index.js';
import type { SyncStore } from '../platform/sync-store/index.js';
import { runSession } from '../session/index.js';
import type { SyncStrategy } from '../strategy/index.js';
import { makeMutations, type MutationCallbacks } from './mutations.js';
import { makePartitions } from './partitions.js';
import { makeCollectionProjector } from './projection.js';
import { makeSyncReplica, type ExtraOp } from './replica.js';
import { makeSyncStateStore } from './sync-state.js';

/**
 * One Sync Strategy per Partition key path: each path reads a string, number,
 * or boolean in every value, and its factory receives the Partition's value.
 */
export type PartitionMap<S extends AnyEntityESchema, R = never> = {
  [P in TotalKeyPath<S['Type'], PartitionValue>]?: (
    value: KeyPathValue<S['Type'], P, PartitionValue>,
  ) => SyncStrategy<S['Type'], any, R>;
};

export type CollectionConfig<
  S extends AnyEntityESchema,
  R = never,
> = MutationCallbacks<S, R> & {
  sync?: {
    /** Runs while the Collection is mounted. */
    global?: SyncStrategy<S['Type'], any, R>;
    /** Each runs while a query filters on its key path. */
    partitions?: PartitionMap<S, R>;
  };
  /** How long the Backend may take to make a write readable. Default: off. */
  settleWindow?: Duration.Input;
  options?: StdCollectionOptions<S['Type']>;
};

export type BuiltCollection<S extends AnyEntityESchema> =
  TanStackCollectionConfig<
    CollectionItem<S['Type']>,
    string,
    CollectionItemSchema<S>
  > & { schema: CollectionItemSchema<S> };

export const buildCollection = <S extends AnyEntityESchema, R>(args: {
  schema: S;
  config: CollectionConfig<S, R>;
  name: CollectionName;
  store: SyncStore;
  platform: StdSyncPlatform;
  runner: EffectRunner<R>;
  report: SyncReporter<R>;
  assertActive: () => void;
  trackCleanup: (cleanup: () => Promise<void>) => () => Promise<void>;
  trackWrite: (write: Promise<void>) => Promise<void>;
}): BuiltCollection<S> => {
  type TItem = S['Type'];
  const { schema, config, name, store, platform, runner } = args;
  const report = (event: Parameters<SyncReporter<R>>[0]) =>
    runner.provide(args.report(event));
  const settleWindow = Duration.fromInputUnsafe(config.settleWindow ?? 0);
  const partitionFactories = (config.sync?.partitions ?? {}) as Record<
    string,
    (value: PartitionValue) => SyncStrategy<TItem, any, R>
  >;
  const partitions = makePartitions(Object.keys(partitionFactories));
  const replica = makeSyncReplica({ store, schema, collection: name });

  // Once any path meets an Entity newer than this code knows, the Collection
  // is outdated for this tab until reload: reported once, never retried.
  let outdatedReported = false;
  const isOutdated = (cause: unknown): Effect.Effect<boolean> => {
    const outdated = findOutdatedVersion(cause);
    if (outdated === undefined) return Effect.succeed(false);
    if (outdatedReported) return Effect.succeed(true);
    outdatedReported = true;
    return report({
      _tag: 'OutdatedApplication',
      collection: name,
      version: outdated.version,
      latestVersion: outdated.latestVersion,
    }).pipe(Effect.as(true));
  };

  let projector: ReturnType<typeof makeCollectionProjector<TItem>> | null =
    null;
  let position: string | null = null;
  const reading = Semaphore.makeUnsafe(1);
  const writing = Semaphore.makeUnsafe(1);

  // Projects everything stored after the Projection Position, page by page.
  const advance = (seeding = false): Effect.Effect<void, WriteError> =>
    reading.withPermit(
      Effect.gen(function* () {
        if (projector === null) return;
        position = yield* replica.eachPage(position, (page) =>
          Effect.sync(() => {
            projector?.projectEntities(
              seeding
                ? page.entities.filter((entity) => !entity.meta._d)
                : page.entities,
            );
            position = page.position;
          }).pipe(Effect.andThen(Effect.yieldNow)),
        );
      }),
    );

  // Every write lands in the Sync Replica, shows locally, then rings the
  // Doorbell so other participants re-read.
  const write = (
    entities: ReadonlyArray<Entity<TItem>>,
    extra?: ExtraOp,
  ): Effect.Effect<void, WriteError> => {
    args.assertActive();
    return writing.withPermit(replica.apply(entities, extra)).pipe(
      Effect.tap(() => advance()),
      Effect.tap((accepted) =>
        accepted.length > 0 ? platform.doorbell.ring(name) : Effect.void,
      ),
      Effect.asVoid,
    );
  };

  const deleteKeyOf = (entity: Entity<TItem>): string | null => {
    const id = (entity.value as Record<string, unknown>)[schema.idField];
    return typeof id === 'string' ? id : null;
  };

  let mountScope: Scope.Closeable | null = null;
  const sessions = new Map<PartitionKey, Scope.Closeable>();

  const startSession = (
    key: PartitionKey,
    strategy: SyncStrategy<TItem, any, R>,
  ) => {
    if (mountScope === null || outdatedReported || sessions.has(key)) return;
    const scope = runner.runSync(Scope.fork(mountScope));
    sessions.set(key, scope);
    const state = makeSyncStateStore({
      store,
      schema,
      collection: name,
      strategy,
    });
    runner.runSync(
      Effect.forkIn(
        runSession({
          key: `${name}/${key}`,
          leadership: platform.leadership,
          strategy,
          settleWindow,
          load: state.load(key),
          commit: ({ entities, state: next }) =>
            write(entities, state.save(key, next)),
          isFinal: isOutdated,
          onFailure: (cause) =>
            report({
              _tag: 'SessionFailed',
              collection: name,
              partitionKey: key,
              strategy: strategy.name,
              cause,
            }),
        }).pipe(runner.provide),
        scope,
      ),
    );
  };

  const stopSession = (key: PartitionKey) => {
    const scope = sessions.get(key);
    if (scope === undefined) return;
    sessions.delete(key);
    void runner.runPromise(Scope.close(scope, Exit.void));
  };

  const mutations = makeMutations<S, R>({
    schema,
    ...(config.onInsert ? { onInsert: config.onInsert } : {}),
    ...(config.onUpdate ? { onUpdate: config.onUpdate } : {}),
    ...(config.onDelete ? { onDelete: config.onDelete } : {}),
    confirm: (entities) =>
      write(entities).pipe(
        Effect.catch((error) =>
          Effect.flatMap(isOutdated(error), (outdated) =>
            outdated ? Effect.void : Effect.fail(error),
          ),
        ),
      ),
    runner,
    trackWrite: args.trackWrite,
  });

  const global = config.sync?.global;

  return {
    id: name,
    schema: makeCollectionItemSchema(schema),
    getKey: (item) => String((item as Record<string, unknown>)[schema.idField]),
    rowUpdateMode: 'full',
    ...(Object.keys(partitionFactories).length > 0 && {
      syncMode: 'on-demand' as const,
    }),
    sync: {
      sync: (callbacks) => {
        args.assertActive();
        projector = makeCollectionProjector<TItem>(callbacks, { deleteKeyOf });
        position = null;
        const scope = runner.runSync(Scope.make());
        mountScope = scope;

        runner.runSync(
          Effect.forkIn(
            Effect.gen(function* () {
              const changes = yield* Stream.toPull(
                platform.doorbell.listen(name),
              ).pipe(Scope.provide(scope));
              // Callback streams install their listeners in a child fiber.
              // Let it start before hydration; its queue buffers any rings.
              yield* Effect.yieldNow;
              const read = (seeding = false) =>
                advance(seeding).pipe(
                  Effect.catch((error) =>
                    Effect.flatMap(isOutdated(error), (outdated) =>
                      outdated
                        ? Effect.void
                        : Effect.logError(
                            `[sync] could not read the local copy of "${name}"`,
                            error,
                          ),
                    ),
                  ),
                );
              yield* read(true);
              callbacks.markReady();
              if (global) startSession(GLOBAL_PARTITION_KEY, global);
              yield* Stream.fromPull(Effect.succeed(changes)).pipe(
                Stream.runForEach(() =>
                  outdatedReported ? Effect.void : read(),
                ),
              );
            }),
            scope,
          ),
        );

        const loadSubset = (options: LoadSubsetOptions): true => {
          const loaded = partitions.load(options);
          if (loaded?.activated) {
            const { path, value, key } = loaded.partition;
            startSession(key, partitionFactories[path]!(value));
          }
          return true;
        };

        const unloadSubset = (options: LoadSubsetOptions): void => {
          const unloaded = partitions.unload(options);
          if (unloaded?.deactivated) stopSession(unloaded.partition.key);
        };

        const cleanup = async (): Promise<void> => {
          mountScope = null;
          sessions.clear();
          partitions.clear();
          projector = null;
          await runner.runPromise(Scope.close(scope, Exit.void));
        };

        return {
          cleanup: args.trackCleanup(cleanup),
          loadSubset,
          unloadSubset,
        };
      },
    },
    ...mutations,
  } as BuiltCollection<S>;
};
