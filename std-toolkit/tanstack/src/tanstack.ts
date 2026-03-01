import {
  CollectionConfig,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect, Option, SubscriptionRef } from "effect";
import { EntityType, MetaSchema } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyESchema, ESchemaIdField } from "@std-toolkit/eschema";

export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
};

type UpsertInput<TSchema extends AnyESchema> =
  | EntityType<TSchema["Type"]>
  | EntityType<TSchema["Type"]>[];

export type CollectionUtils<TSchema extends AnyESchema = AnyESchema> = {
  upsert: (item: UpsertInput<TSchema>, persist?: boolean) => void;
  schema: () => TSchema;
  fetch: () => Effect.Effect<number>;
  fetchAll: () => Effect.Effect<number>;
  isSyncing: SubscriptionRef.SubscriptionRef<boolean>;
};

interface StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyESchema,
> {
  schema: TSchema;
  cache?: Effect.Effect<CacheEntity<TItem>>;
  getMore: (
    cursor: EntityType<TItem> | null,
  ) => Effect.Effect<EntityType<TItem>[]>;
  onInsert: (
    item: Omit<TItem, ESchemaIdField<TSchema>>,
  ) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EntityType<TItem>>;
}

export const stdCollectionOptions = <TSchema extends AnyESchema>(
  options: StdCollectionConfig<TSchema["Type"], TSchema>,
): CollectionConfig<
  CollectionItem<TSchema["Type"]>,
  string,
  TSchema,
  CollectionUtils<TSchema>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  type TCollectionItem = CollectionItem<TItem>;

  const { onInsert, cache: providedCache, onUpdate, getMore, schema } = options;

  const syncing = Effect.runSync(SubscriptionRef.make(false));
  const semaphore = Effect.runSync(Effect.makeSemaphore(1));

  let resolvedCache: CacheEntity<TItem> | null = null;
  let applyToCollection:
    | ((items: EntityType<TItem>[], persist?: boolean) => void)
    | null = null;

  const createApplyToCollection = (
    params: Parameters<TanstackSyncConfig<TCollectionItem, string>["sync"]>[0],
    cache: CacheEntity<TItem>,
  ) => {
    const { begin, collection, commit, write } = params;

    return (items: EntityType<TItem>[], persist = false) => {
      begin();
      for (const item of items) {
        const key = collection.getKeyFromItem(item.value as TCollectionItem);
        const itemValue = {
          ...item.value,
          _meta: item.meta,
        } as TCollectionItem;

        if (persist) {
          Effect.runPromise(cache.put(item)).catch(() => {});
        }

        if (collection.has(key)) {
          if (item.meta._d) {
            write({ type: "delete", key });
          } else {
            write({ type: "update", value: itemValue });
          }
        } else if (!item.meta._d) {
          write({ type: "insert", value: itemValue });
        }
      }
      commit();
    };
  };

  const fetchOnePage = (cache: CacheEntity<TItem>) =>
    Effect.gen(function* () {
      const latest = yield* cache.getLatest();
      const items = yield* getMore(Option.getOrNull(latest));
      if (items.length === 0) return 0;
      yield* Effect.forEach(items, (item) => cache.put(item), {
        discard: true,
      });
      applyToCollection?.(items, true);
      return items.length;
    });

  const withSyncGuard = <A, E>(effect: Effect.Effect<A, E>) =>
    semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* SubscriptionRef.set(syncing, true);
        return yield* effect;
      }).pipe(Effect.ensuring(SubscriptionRef.set(syncing, false))),
    );

  const fetchAllPages = (cache: CacheEntity<TItem>) =>
    Effect.gen(function* () {
      let total = 0;

      while (true) {
        const beforeUid =
          Option.getOrNull(yield* cache.getLatest())?.meta._uid ?? null;
        const count = yield* fetchOnePage(cache);
        if (count === 0) break;

        const afterUid =
          Option.getOrNull(yield* cache.getLatest())?.meta._uid ?? null;
        if (afterUid === beforeUid) {
          console.error(
            "[std-toolkit/tanstack] Infinite loop detected: cursor did not advance",
          );
          break;
        }

        total += count;
      }

      return total;
    });

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { markReady } = params;

      const initEffect = Effect.gen(function* () {
        const cache: CacheEntity<TItem> = yield* providedCache ??
          MemoryCacheEntity.make({ eschema: schema });

        resolvedCache = cache;
        applyToCollection = createApplyToCollection(params, cache);

        const cachedItems = yield* cache.getAll();
        if (cachedItems.length > 0) {
          applyToCollection(cachedItems);
          markReady();
        }

        yield* withSyncGuard(fetchAllPages(cache));
        markReady();
      });

      const cancel = Effect.runCallback(initEffect);

      return () => {
        cancel();
        Effect.runSync(SubscriptionRef.set(syncing, false));
        resolvedCache = null;
        applyToCollection = null;
      };
    },
  };

  const upsert = (input: UpsertInput<TSchema>, persist?: boolean) => {
    const items = Array.isArray(input) ? input : [input];
    applyToCollection?.(items, persist);
  };

  const guardedFetch = (
    fn: (cache: CacheEntity<TItem>) => Effect.Effect<number, unknown>,
  ): Effect.Effect<number> => {
    if (!resolvedCache) return Effect.succeed(0);
    return withSyncGuard(fn(resolvedCache)).pipe(Effect.orDie);
  };

  const utils: CollectionUtils<TSchema> = {
    upsert,
    schema: () => schema,
    fetch: () => guardedFetch(fetchOnePage),
    fetchAll: () => guardedFetch(fetchAllPages),
    isSyncing: syncing,
  };

  return {
    schema: schema["~standard"] ? schema : (undefined as any),
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    sync: tanstackSync,
    utils,
    compare: (x, y) => {
      const xUid = x?._meta?._uid ?? "";
      const yUid = y?._meta?._uid ?? "";
      return xUid < yUid ? -1 : 1;
    },
    onInsert: async ({ transaction }) => {
      const { changes } = transaction.mutations[0]!;
      const result = await Effect.runPromise(onInsert(changes as TItem));
      upsert(result);
    },
    onUpdate: async ({ transaction }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0]!;
      const payload = {
        [schema.idField]: key,
        updates: changes,
      } as {
        [K in ESchemaIdField<TSchema>]: string;
      } & {
        updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
      };
      const result = await Effect.runPromise(onUpdate(payload));
      upsert(result);
    },
  };
};
