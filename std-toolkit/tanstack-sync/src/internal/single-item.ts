import type { UpdateMutationFnParams } from '@tanstack/react-db';
import { Effect } from 'effect';
import type { SingleEntityType, EntityType } from '@std-toolkit/core';
import type { CacheSingleItem } from '@std-toolkit/cache';
import { MemoryCacheSingleItem } from '@std-toolkit/cache/memory';
import type { AnySingleEntityESchema } from '@std-toolkit/eschema';
import type {
  CollectionItem,
  SingleItemConfig,
  SingleItemResult,
  StdSingleItemUtils,
} from '../types.js';
import {
  CollectionTracker,
  resolveCache,
  stripMeta,
  type SyncCallbacks,
} from './shared.js';

const toCollectionItem = <TItem extends object>(
  item: SingleEntityType<TItem>,
): CollectionItem<TItem> =>
  ({ ...item.value, _meta: item.meta }) as CollectionItem<TItem>;

const writeItems = <TItem extends object>(
  callbacks: SyncCallbacks<CollectionItem<TItem>> | null,
  items: SingleEntityType<TItem>[],
  options?: { immediate?: boolean },
): void => {
  if (!callbacks || items.length === 0) return;

  callbacks.begin(options);
  for (const item of items) {
    const value = toCollectionItem(item);
    const key = String(callbacks.collection.getKeyFromItem(value));
    callbacks.write({
      type: callbacks.collection.has(key) ? 'update' : 'insert',
      value,
    });
  }
  callbacks.commit();
};

export const buildSingleItem = <TSchema extends AnySingleEntityESchema>(
  tracker: CollectionTracker,
  options: SingleItemConfig<TSchema['Type'], TSchema>,
): SingleItemResult<TSchema['Type'], TSchema> => {
  type TItem = TSchema['Type'];
  type TCollItem = CollectionItem<TItem>;

  const { schema, get, onUpdate } = options;
  const store = resolveCache(options.cache);
  const singletonKey = schema.name;
  const refreshSemaphore = Effect.runSync(Effect.makeSemaphore(1));

  let cachePromise: Promise<CacheSingleItem<TItem>> | null = null;
  let callbacks: SyncCallbacks<TCollItem> | null = null;

  const initCache = (): Promise<CacheSingleItem<TItem>> => {
    if (!cachePromise) {
      cachePromise = Effect.runPromise(
        store
          .singleItem<TItem>({ name: schema.name })
          .pipe(
            Effect.catchAll(() =>
              MemoryCacheSingleItem.make<TItem>({ name: schema.name }),
            ),
          ),
      );
    }
    return cachePromise;
  };

  const writeToCollectionOnMount = (items: SingleEntityType<TItem>[]) =>
    writeItems(callbacks, items);

  const writeToCollection = (items: SingleEntityType<TItem>[]) =>
    writeItems(callbacks, items, { immediate: true });

  const upsert = (item: SingleEntityType<TItem>) => {
    writeToCollection([item]);
  };

  const refresh = (): Effect.Effect<SingleEntityType<TItem>> =>
    refreshSemaphore
      .withPermits(1)(
        Effect.gen(function* () {
          const item = yield* get();
          const cache = yield* Effect.promise(initCache);
          yield* Effect.catchAll(cache.put(item), () => Effect.void);
          writeToCollection([item]);
          return item;
        }),
      )
      .pipe(Effect.orDie);

  const utils: StdSingleItemUtils<TItem, TSchema> = {
    upsert,
    refresh,
    schema: () => schema,
  };

  tracker.register({
    utils: {
      upsert: (item: EntityType<TItem> | EntityType<TItem>[]) => {
        const single = Array.isArray(item) ? item[0] : item;
        if (single) upsert(single);
      },
      schema: () => schema,
    },
  });

  const config: SingleItemResult<TItem, TSchema> = {
    ...options.options,
    id: schema.name,
    getKey: () => singletonKey,
    singleResult: true as const,
    sync: {
      rowUpdateMode: 'full',
      sync: (params) => {
        callbacks = params;

        void (async () => {
          const cache = await initCache();
          const cached = await Effect.runPromise(cache.get());
          if (cached._tag === 'Some') {
            writeToCollectionOnMount([cached.value]);
          }

          const item = await Effect.runPromise(
            refreshSemaphore.withPermits(1)(get()),
          );
          await Effect.runPromise(
            Effect.catchAll(cache.put(item), () => Effect.void),
          );
          writeToCollection([item]);
        })()
          .catch((error) => {
            console.error(
              '[std-toolkit/tanstack-sync] single-item sync failed',
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
    ...(onUpdate && {
      onUpdate: async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>) => {
        const mutation = transaction.mutations[0];
        const value = stripMeta<TItem>(mutation.modified);
        const result = await Effect.runPromise(onUpdate({ updates: value }));
        const cache = await initCache();
        await Effect.runPromise(
          Effect.catchAll(cache.put(result), () => Effect.void),
        );
        writeToCollection([result]);
      },
    }),
    utils,
  };

  return config;
};
