import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';
import type {
  InsertMutationFnParams,
  UpdateMutationFnParams,
  DeleteMutationFnParams,
  LoadSubsetOptions,
} from '@tanstack/react-db';
import { Effect, Option } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { CacheEntity, PartitionKey } from '@std-toolkit/cache';
import { serializePartition } from '@std-toolkit/cache';
import { MemoryCacheEntity } from '@std-toolkit/cache/memory';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type {
  CollectionItem,
  OnDemandConfig,
  OnDemandResult,
  StdPartitionedUtils,
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
  writeKeysToCollection,
  type SyncCallbacks,
} from './shared.js';

export const buildOnDemand = <TSchema extends AnyEntityESchema>(
  tracker: CollectionTracker,
  options: OnDemandConfig<TSchema['Type'], TSchema>,
): OnDemandResult<TSchema['Type'], TSchema> => {
  type TItem = TSchema['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema, queries, onInsert, onUpdate, onDelete } = options;
  const store = resolveCache(options.cache);

  const partitionCaches = new Map<string, Promise<CacheEntity<TItem>>>();
  const partitionSemaphores = new Map<string, Effect.Semaphore>();
  let callbacks: SyncCallbacks<TCollItem> | null = null;

  const getOrCreateCache = (key: string): Promise<CacheEntity<TItem>> => {
    const existing = partitionCaches.get(key);
    if (existing) return existing;
    const promise = Effect.runPromise(
      store
        .entity<TItem>({
          name: `${schema.name}:${key}`,
          idField: schema.idField,
        })
        .pipe(
          Effect.catchAll(() =>
            MemoryCacheEntity.make<TItem>({
              name: `${schema.name}:${key}`,
              idField: schema.idField,
            }),
          ),
        ),
    );
    partitionCaches.set(key, promise);
    return promise;
  };

  const getOrCreateSemaphore = (key: string): Effect.Semaphore => {
    const existing = partitionSemaphores.get(key);
    if (existing) return existing;
    const semaphore = Effect.runSync(Effect.makeSemaphore(1));
    partitionSemaphores.set(key, semaphore);
    return semaphore;
  };

  const findHandler = (field: string) =>
    (queries as Record<string, unknown>)[field] as
      | ((
          value: unknown,
          cursor: EntityType<TItem> | null,
        ) => Effect.Effect<EntityType<TItem>[]>)
      | undefined;

  const writeToCollectionOnMount = (items: EntityType<TItem>[]) =>
    writeEntitiesToCollection(callbacks, items);

  const writeToCollection = (items: EntityType<TItem>[]) =>
    writeEntitiesToCollection(callbacks, items, { immediate: true });

  const removeFromCollection = (keys: string[]) =>
    writeKeysToCollection(callbacks, keys, { immediate: true });

  const upsert = (input: EntityType<TItem> | EntityType<TItem>[]) => {
    const items = Array.isArray(input) ? input : [input];
    writeToCollection(items);
  };

  const fetchMore = (partition: Partial<TItem>): Effect.Effect<number> =>
    Effect.suspend(() => {
      const entries = Object.entries(partition);
      if (entries.length === 0) return Effect.succeed(0);
      const [field, value] = entries[0]!;
      const handler = findHandler(field);
      if (!handler) return Effect.succeed(0);

      const partitionKey: PartitionKey = { [field]: String(value) };
      const key = serializePartition(partitionKey);
      const semaphore = getOrCreateSemaphore(key);

      return semaphore.withPermits(1)(
        Effect.gen(function* () {
          const cache = yield* Effect.promise(() => getOrCreateCache(key));
          const cached = yield* cache.getAll();
          writeToCollection(cached);

          const latest = yield* cache.getLatest();
          const items = yield* handler(value, Option.getOrNull(latest));
          if (items.length === 0) return 0;
          yield* cacheEntities(cache, schema, items);
          writeToCollection(items);
          return items.length;
        }),
      );
    }).pipe(Effect.orDie);

  const remove = (keys: string | string[]) => {
    removeFromCollection(Array.isArray(keys) ? keys : [keys]);
  };

  const utils: StdPartitionedUtils<TItem, TSchema> = {
    upsert,
    remove,
    schema: () => schema,
    fetchMore,
  };

  tracker.register({ utils: { upsert, remove, schema: () => schema } });

  const config: OnDemandResult<TItem, TSchema> = {
    id: schema.name,
    getKey: (item: TCollItem) => getItemId(item, schema.idField),
    syncMode: 'on-demand',
    sync: {
      rowUpdateMode: 'full',
      sync: (params) => {
        callbacks = params;

        void (async () => {
          for (const [, cacheP] of partitionCaches) {
            const cache = await cacheP;
            const allCached = await Effect.runPromise(cache.getAll());
            if (allCached.length > 0) {
              writeToCollectionOnMount(allCached);
            }
          }
        })()
          .catch((error) => {
            console.error(
              '[std-toolkit/tanstack-sync] on-demand sync failed',
              error,
            );
          })
          .finally(() => {
            callbacks?.markReady();
          });

        return {
          cleanup: () => {
            callbacks = null;
          },
          loadSubset: async (opts: LoadSubsetOptions) => {
            const parsed = parseLoadSubsetOptions(opts);
            const match = parsed.filters.find(
              (f) =>
                f.operator === 'eq' &&
                f.field.length > 0 &&
                findHandler(String(f.field[f.field.length - 1]!)) != null,
            );
            if (!match) return;

            const filterField = String(match.field[match.field.length - 1]!);
            const filterValue = match.value;
            if (filterValue === undefined) return;

            const handler = findHandler(filterField)!;
            const partition: PartitionKey = {
              [filterField]: String(filterValue),
            };
            const key = serializePartition(partition);
            const semaphore = getOrCreateSemaphore(key);
            const cache = await getOrCreateCache(key);

            await Effect.runPromise(
              semaphore.withPermits(1)(
                Effect.gen(function* () {
                  const cached = yield* cache.getAll();
                  writeToCollection(cached);

                  const latest = yield* cache.getLatest();
                  const newItems = yield* handler(
                    filterValue,
                    Option.getOrNull(latest),
                  );
                  if (newItems.length > 0) {
                    yield* cacheEntities(cache, schema, newItems);
                    writeToCollection(newItems);
                  }
                }),
              ),
            );
          },
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
        writeToCollection([result]);
      },
    }),
    ...(onUpdate && {
      onUpdate: async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>) => {
        const mutation = transaction.mutations[0];
        const updates = stripMetaPartial<TItem>(mutation.changes);
        const payload = buildUpdatePayload<TItem, TSchema>(
          schema,
          String(mutation.key),
          updates,
        );
        const result = await Effect.runPromise(onUpdate(payload));
        writeToCollection([result]);
      },
    }),
    ...(onDelete && {
      onDelete: async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>) => {
        const key = String(transaction.mutations[0].key);
        await Effect.runPromise(onDelete(key));
        const caches = await Promise.all(partitionCaches.values());
        await Effect.runPromise(
          Effect.forEach(
            caches,
            (cache) => Effect.catchAll(cache.delete(key), () => Effect.void),
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
