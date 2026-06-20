import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';
import type {
  InsertMutationFnParams,
  UpdateMutationFnParams,
  DeleteMutationFnParams,
  LoadSubsetOptions,
  CollectionConfig,
} from '@tanstack/react-db';
import { Effect, Fiber, Option, Scope, Semaphore } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { CacheEntity, CacheStore, PartitionKey } from '@std-toolkit/cache';
import { serializePartition } from '@std-toolkit/cache';
import { MemoryCacheEntity } from '@std-toolkit/cache/memory';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type {
  CollectionItem,
  QueryContext,
  StdCollectionOptions,
  SubscribeContext,
  UpdatePayload,
} from '../types.js';
import {
  buildUpdatePayload,
  cacheEntities,
  CollectionTracker,
  getItemId,
  resolveCache,
  stripMeta,
  stripMetaPartial,
  writeEntitiesToCollection,
  deleteKeysFromCollection,
  type SyncCallbacks,
} from './shared.js';

type PartitionHandler<TItem extends object> = {
  query?: (
    value: unknown,
    ctx: QueryContext<TItem>,
  ) => Effect.Effect<EntityType<TItem>[]>;
  subscribe?: (
    value: unknown,
    ctx: SubscribeContext<TItem>,
  ) => Effect.Effect<void, never, Scope.Scope>;
};

type SingletonHandler<TItem extends object> = {
  query?: (ctx: QueryContext<TItem>) => Effect.Effect<EntityType<TItem>[]>;
  subscribe?: (
    ctx: SubscribeContext<TItem>,
  ) => Effect.Effect<void, never, Scope.Scope>;
};

export type PartitionedOptions<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = {
  schema: TSchema;
  cache?: CacheStore;
  options?: StdCollectionOptions;
  fetchOnMount: boolean;
  partitions: Record<string, PartitionHandler<TItem>>;
  defaultPartitionKey: string;
  singletonQuery?: SingletonHandler<TItem>;
  onInsert?: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: UpdatePayload<TItem, TSchema>,
  ) => Effect.Effect<EntityType<TItem>>;
  onDelete?: (id: string) => Effect.Effect<void>;
};

type PartitionedUtils<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = {
  upsert: (item: EntityType<TItem> | EntityType<TItem>[]) => void;
  remove: (keys: string | string[]) => void;
  schema: () => TSchema;
  fetchMore: (partition: Partial<TItem>) => Effect.Effect<number>;
  pendingCount: (key: string) => number;
  subscribePending: (listener: () => void) => () => void;
};

export const buildPartitioned = <TSchema extends AnyEntityESchema>(
  tracker: CollectionTracker,
  options: PartitionedOptions<TSchema['Type'], TSchema>,
): CollectionConfig<
  CollectionItem<TSchema['Type']>,
  string,
  never,
  PartitionedUtils<TSchema['Type'], TSchema>
> & { utils: PartitionedUtils<TSchema['Type'], TSchema> } => {
  type TItem = TSchema['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema, partitions, singletonQuery, onInsert, onUpdate, onDelete } =
    options;
  const store = resolveCache(options.cache);

  const partitionCacheMap = new Map<string, Promise<CacheEntity<TItem>>>();
  const partitionSemaphoreMap = new Map<string, Semaphore.Semaphore>();
  const updateSemaphoreMap = new Map<string, Semaphore.Semaphore>();
  const subscribeFiberMap = new Map<string, Fiber.Fiber<void, unknown>>();
  const pendingCountMap = new Map<string, number>();
  const pendingListenerSet = new Set<() => void>();

  let callbacks: SyncCallbacks<TCollItem> | null = null;

  const notifyPending = (): void => {
    for (const listener of pendingListenerSet) listener();
  };

  const incrementPending = (key: string): void => {
    pendingCountMap.set(key, (pendingCountMap.get(key) ?? 0) + 1);
    notifyPending();
  };

  const decrementPending = (key: string): void => {
    const next = (pendingCountMap.get(key) ?? 0) - 1;
    if (next <= 0) pendingCountMap.delete(key);
    else pendingCountMap.set(key, next);
    notifyPending();
  };

  const getOrCreateCache = (key: string): Promise<CacheEntity<TItem>> => {
    const existing = partitionCacheMap.get(key);
    if (existing) return existing;
    const promise = Effect.runPromise(
      store
        .entity<TItem>({
          name: `${schema.name}:${key}`,
          idField: schema.idField,
        })
        .pipe(
          Effect.catch(() =>
            MemoryCacheEntity.make<TItem>({
              name: `${schema.name}:${key}`,
              idField: schema.idField,
            }),
          ),
        ),
    );
    partitionCacheMap.set(key, promise);
    return promise;
  };

  const getOrCreateSemaphore = (key: string): Semaphore.Semaphore => {
    const existing = partitionSemaphoreMap.get(key);
    if (existing) return existing;
    const semaphore = Semaphore.makeUnsafe(1);
    partitionSemaphoreMap.set(key, semaphore);
    return semaphore;
  };

  const getOrCreateUpdateSemaphore = (key: string): Semaphore.Semaphore => {
    const existing = updateSemaphoreMap.get(key);
    if (existing) return existing;
    const semaphore = Semaphore.makeUnsafe(1);
    updateSemaphoreMap.set(key, semaphore);
    return semaphore;
  };

  const makeCursor = (
    cacheP: Promise<CacheEntity<TItem>>,
  ): QueryContext<TItem>['getCursor'] =>
    Effect.promise(() => cacheP).pipe(
      Effect.flatMap((c) => c.getLatest()),
      Effect.map(Option.getOrNull),
      Effect.orDie,
    );

  const writeToCollectionOnMount = (items: EntityType<TItem>[]) =>
    writeEntitiesToCollection(callbacks, items);

  const writeToCollection = (items: EntityType<TItem>[]) =>
    writeEntitiesToCollection(callbacks, items);

  const removeFromCollection = (keys: string[]) =>
    deleteKeysFromCollection(callbacks, keys);

  const forkSubscribeFiber = async (
    key: string,
    subscribeEffect: Effect.Effect<void, never, Scope.Scope>,
  ): Promise<void> => {
    if (subscribeFiberMap.has(key)) return;
    const fiber = await Effect.runPromise(
      Effect.forkDetach(Effect.scoped(subscribeEffect)),
    );
    subscribeFiberMap.set(key, fiber);
  };

  const activatePartition = async (
    key: string,
    partitionValue: unknown,
    handler: PartitionHandler<TItem> | SingletonHandler<TItem>,
    isSingleton: boolean,
    isOnMount: boolean,
  ): Promise<void> => {
    const cacheP = getOrCreateCache(key);
    const cache = await cacheP;

    const cached = await Effect.runPromise(cache.getAll());
    if (isOnMount) {
      writeToCollectionOnMount(cached);
    } else {
      writeToCollection(cached);
    }

    const getCursor = makeCursor(cacheP);

    const push = (
      items: EntityType<TItem>[],
      { persist = true }: { persist?: boolean } = {},
    ) => {
      writeToCollection(items);
      if (persist) {
        Effect.runFork(
          Effect.promise(() => cacheP).pipe(
            Effect.flatMap((c) => cacheEntities(c, schema, items)),
          ),
        );
      }
    };

    if (handler.subscribe && !subscribeFiberMap.has(key)) {
      let resolveInitialSync!: () => void;
      const initialSyncDone = new Promise<void>((r) => {
        resolveInitialSync = r;
      });

      const onInitialSyncDone = () => resolveInitialSync();

      const subscribeEffect = isSingleton
        ? (handler as SingletonHandler<TItem>).subscribe!({
            getCursor,
            push,
            onInitialSyncDone,
          })
        : (handler as PartitionHandler<TItem>).subscribe!(partitionValue, {
            getCursor,
            push,
            onInitialSyncDone,
          });
      await forkSubscribeFiber(key, subscribeEffect);
      await initialSyncDone;
      return;
    }

    if (!handler.subscribe && options.fetchOnMount && handler.query) {
      const queryEffect = isSingleton
        ? (handler as SingletonHandler<TItem>).query!({ getCursor })
        : (handler as PartitionHandler<TItem>).query!(partitionValue, {
            getCursor,
          });

      const newItems = await Effect.runPromise(queryEffect);
      if (newItems.length > 0) {
        await Effect.runPromise(cacheEntities(cache, schema, newItems));
        writeToCollection(newItems);
      }
    }
  };

  const isSingleton =
    Object.keys(partitions).length === 0 && singletonQuery != null;

  const fetchMore = (partition: Partial<TItem>): Effect.Effect<number> =>
    Effect.suspend(() => {
      if (isSingleton) {
        if (!singletonQuery!.query) return Effect.succeed(0);
        const queryFn = singletonQuery!.query;
        const key = options.defaultPartitionKey;
        const semaphore = getOrCreateSemaphore(key);

        return semaphore.withPermits(1)(
          Effect.gen(function* () {
            const cacheP = getOrCreateCache(key);
            const cache = yield* Effect.promise(() => cacheP);
            const getCursor = makeCursor(cacheP);
            const items = yield* queryFn({ getCursor });
            if (items.length === 0) return 0;
            yield* cacheEntities(cache, schema, items);
            writeToCollection(items);
            return items.length;
          }),
        );
      }

      const entries = Object.entries(partition);
      if (entries.length === 0) return Effect.succeed(0);
      const [field, value] = entries[0]!;
      const handler = partitions[field];
      if (!handler || !handler.query) return Effect.succeed(0);
      const queryFn = handler.query;

      const partitionKey: PartitionKey = { [field]: String(value) };
      const key = serializePartition(partitionKey);
      const semaphore = getOrCreateSemaphore(key);

      return semaphore.withPermits(1)(
        Effect.gen(function* () {
          const cacheP = getOrCreateCache(key);
          const cache = yield* Effect.promise(() => cacheP);
          const getCursor = makeCursor(cacheP);
          const items = yield* queryFn(value, { getCursor });
          if (items.length === 0) return 0;
          yield* cacheEntities(cache, schema, items);
          writeToCollection(items);
          return items.length;
        }),
      );
    }).pipe(Effect.orDie);

  const upsert = (input: EntityType<TItem> | EntityType<TItem>[]) => {
    const items = Array.isArray(input) ? input : [input];
    writeToCollection(items);
  };

  const remove = (keys: string | string[]) => {
    removeFromCollection(Array.isArray(keys) ? keys : [keys]);
  };

  const pendingCount = (key: string): number => pendingCountMap.get(key) ?? 0;

  const subscribePending = (listener: () => void): (() => void) => {
    pendingListenerSet.add(listener);
    return () => {
      pendingListenerSet.delete(listener);
    };
  };

  const utils: PartitionedUtils<TItem, TSchema> = {
    upsert,
    remove,
    schema: () => schema,
    fetchMore,
    pendingCount,
    subscribePending,
  };

  tracker.register({ utils: { upsert, remove, schema: () => schema } });

  const config: CollectionConfig<
    TCollItem,
    string,
    never,
    PartitionedUtils<TItem, TSchema>
  > & {
    utils: PartitionedUtils<TItem, TSchema>;
  } = {
    ...options.options,
    id: schema.name,
    getKey: (item: TCollItem) => getItemId(item, schema.idField),
    ...(isSingleton ? {} : { syncMode: 'on-demand' as const }),
    sync: {
      rowUpdateMode: 'full',
      sync: (params) => {
        callbacks = params as SyncCallbacks<TCollItem>;

        void (async () => {
          if (isSingleton) {
            const key = options.defaultPartitionKey;
            await activatePartition(key, null, singletonQuery!, true, true);
          } else {
            for (const [, cacheP] of partitionCacheMap) {
              const cache = await cacheP;
              const allCached = await Effect.runPromise(cache.getAll());
              if (allCached.length > 0) {
                writeToCollectionOnMount(allCached);
              }
            }
          }
        })()
          .catch((error) => {
            console.error(
              '[std-toolkit/tanstack-sync] partitioned sync failed',
              error,
            );
          })
          .finally(() => {
            (callbacks as SyncCallbacks<TCollItem> | null)?.markReady();
          });

        return {
          cleanup: () => {
            for (const fiber of subscribeFiberMap.values()) {
              Effect.runFork(Fiber.interrupt(fiber));
            }
            subscribeFiberMap.clear();
            callbacks = null;
          },
          ...(isSingleton
            ? {}
            : {
                loadSubset: async (opts: LoadSubsetOptions) => {
                  const parsed = parseLoadSubsetOptions(opts);
                  const match = parsed.filters.find(
                    (f) =>
                      f.operator === 'eq' &&
                      f.field.length > 0 &&
                      partitions[String(f.field[f.field.length - 1]!)] != null,
                  );
                  if (!match) return;

                  const filterField = String(
                    match.field[match.field.length - 1]!,
                  );
                  const filterValue = match.value;
                  if (filterValue === undefined) return;

                  const handler = partitions[filterField]!;
                  const partitionKey: PartitionKey = {
                    [filterField]: String(filterValue),
                  };
                  const key = serializePartition(partitionKey);
                  const semaphore = getOrCreateSemaphore(key);

                  await Effect.runPromise(
                    semaphore.withPermits(1)(
                      Effect.promise(() =>
                        activatePartition(
                          key,
                          filterValue,
                          handler,
                          false,
                          false,
                        ),
                      ),
                    ),
                  );
                },
              }),
        };
      },
    },
    ...(onInsert && {
      onInsert: async ({
        transaction,
      }: InsertMutationFnParams<TCollItem, string>) => {
        const mutation = transaction.mutations[0];
        const value = stripMeta<TItem>(mutation.modified);
        const result = await Effect.runPromise(onInsert(value));
        if (isSingleton && options.defaultPartitionKey) {
          const cache = await getOrCreateCache(options.defaultPartitionKey);
          await Effect.runPromise(cacheEntities(cache, schema, [result]));
        }
        writeToCollection([result]);
      },
    }),
    ...(onUpdate && {
      onUpdate: async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>) => {
        const mutation = transaction.mutations[0];
        const key = String(mutation.key);
        const updates = stripMetaPartial<TItem>(mutation.changes);
        const payload = buildUpdatePayload<TItem, TSchema>(
          schema,
          key,
          updates,
        );
        // Count this update as pending the moment it is queued, and clear it
        // once the transaction settles (resolve or reject) — not when the API
        // returns — so the count tracks "queued or in flight, not yet synced".
        incrementPending(key);
        transaction.isPersisted.promise
          .finally(() => decrementPending(key))
          .catch(() => {});
        // Serialize updates per item key: never run two server calls in
        // flight for the same row. Send-order is not arrival-order, so an
        // in-flight update must finish before the next one starts. The
        // semaphore is FIFO, so queued updates run in submission order.
        const semaphore = getOrCreateUpdateSemaphore(key);
        const result = await Effect.runPromise(
          onUpdate(payload) // br
            .pipe(semaphore.withPermits(1)),
        );
        writeToCollection([result]);
      },
    }),
    ...(onDelete && {
      onDelete: async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>) => {
        const key = String(transaction.mutations[0].key);
        await Effect.runPromise(onDelete(key));
        const caches = await Promise.all(partitionCacheMap.values());
        await Effect.runPromise(
          Effect.forEach(
            caches,
            (cache) => Effect.catch(cache.delete(key), () => Effect.void),
            { discard: true },
          ),
        );
        removeFromCollection([key]);
      },
    }),
    utils,
  };

  return config;
};
