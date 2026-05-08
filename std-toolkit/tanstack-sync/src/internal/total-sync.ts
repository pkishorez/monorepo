import type {
  InsertMutationFnParams,
  UpdateMutationFnParams,
  DeleteMutationFnParams,
} from '@tanstack/react-db';
import { Effect, Option } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { CacheEntity } from '@std-toolkit/cache';
import { MemoryCacheEntity } from '@std-toolkit/cache/memory';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type {
  CollectionItem,
  StdCollectionUtils,
  TotalSyncConfig,
  TotalSyncResult,
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

export const buildTotalSync = <TSchema extends AnyEntityESchema>(
  tracker: CollectionTracker,
  options: TotalSyncConfig<TSchema['Type'], TSchema>,
): TotalSyncResult<TSchema['Type'], TSchema> => {
  type TItem = TSchema['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema, query, onInsert, onUpdate, onDelete } = options;
  const store = resolveCache(options.cache);
  const fetchSemaphore = Effect.runSync(Effect.makeSemaphore(1));

  let cachePromise: Promise<CacheEntity<TItem>> | null = null;
  let callbacks: SyncCallbacks<TCollItem> | null = null;

  const initCache = (): Promise<CacheEntity<TItem>> => {
    if (!cachePromise) {
      cachePromise = Effect.runPromise(
        store
          .entity<TItem>({ name: schema.name, idField: schema.idField })
          .pipe(
            Effect.catchAll(() =>
              MemoryCacheEntity.make<TItem>({
                name: schema.name,
                idField: schema.idField,
              }),
            ),
          ),
      );
    }
    return cachePromise;
  };

  const writeToCollectionOnMount = (items: EntityType<TItem>[]) =>
    writeEntitiesToCollection(callbacks, items);

  const writeToCollection = (items: EntityType<TItem>[]) =>
    writeEntitiesToCollection(callbacks, items, { immediate: true });

  const removeFromCollection = (keys: string[]) =>
    writeKeysToCollection(callbacks, keys, { immediate: true });

  const fetchMore = (): Effect.Effect<number> =>
    fetchSemaphore
      .withPermits(1)(
        Effect.gen(function* () {
          const cache = yield* Effect.promise(initCache);
          const latest = yield* cache.getLatest();
          const items = yield* query(Option.getOrNull(latest));
          if (items.length === 0) return 0;
          yield* cacheEntities(cache, schema, items);
          writeToCollection(items);
          return items.length;
        }),
      )
      .pipe(Effect.orDie);

  const upsert = (input: EntityType<TItem> | EntityType<TItem>[]) => {
    const items = Array.isArray(input) ? input : [input];
    writeToCollection(items);
  };

  const remove = (keys: string | string[]) => {
    removeFromCollection(Array.isArray(keys) ? keys : [keys]);
  };

  const utils: StdCollectionUtils<TItem, TSchema> = {
    upsert,
    remove,
    schema: () => schema,
    fetchMore: () => fetchMore(),
  };

  tracker.register({ utils: { upsert, remove, schema: () => schema } });

  const config: TotalSyncResult<TItem, TSchema> = {
    id: schema.name,
    getKey: (item: TCollItem) => getItemId(item, schema.idField),
    sync: {
      rowUpdateMode: 'full',
      sync: (params) => {
        callbacks = params;

        void (async () => {
          const cache = await initCache();
          const latest = await Effect.runPromise(cache.getLatest());
          const allCached = await Effect.runPromise(cache.getAll());
          writeToCollectionOnMount(allCached);

          const newItems = await Effect.runPromise(
            fetchSemaphore.withPermits(1)(query(Option.getOrNull(latest))),
          );
          if (newItems.length > 0) {
            await Effect.runPromise(cacheEntities(cache, schema, newItems));
            writeToCollection(newItems);
          }
        })()
          .catch((error) => {
            console.error(
              '[std-toolkit/tanstack-sync] total sync failed',
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
        const cache = await initCache();
        await Effect.runPromise(cacheEntities(cache, schema, [result]));
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
        const cache = await initCache();
        await Effect.runPromise(cacheEntities(cache, schema, [result]));
        writeToCollection([result]);
      },
    }),
    ...(onDelete && {
      onDelete: async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>) => {
        const key = String(transaction.mutations[0].key);
        await Effect.runPromise(onDelete(key));
        const cache = await initCache();
        await Effect.runPromise(
          Effect.catchAll(cache.delete(key), () => Effect.void),
        );
        removeFromCollection([key]);
      },
    }),
    utils,
  };

  return config;
};
