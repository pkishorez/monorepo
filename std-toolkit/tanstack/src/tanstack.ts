import {
  CollectionConfig,
  type LoadSubsetFn,
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect, Option, SubscriptionRef } from "effect";
import { EntityType, MetaSchema } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyEntityESchema, ESchemaIdField } from "@std-toolkit/eschema";
import {
  parseLoadSubsetOptions,
  type ParsedLoadSubsetOptions,
} from "./load-subset-parser";

export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
};

type UpsertInput<TSchema extends AnyEntityESchema> =
  | EntityType<TSchema["Type"]>
  | EntityType<TSchema["Type"]>[];

export type CollectionUtils<TSchema extends AnyEntityESchema = AnyEntityESchema> = {
  upsert: (item: UpsertInput<TSchema>, persist?: boolean) => void;
  schema: () => TSchema;
  fetch: () => Effect.Effect<number>;
  fetchAll: () => Effect.Effect<number>;
  isSyncing: SubscriptionRef.SubscriptionRef<boolean>;
};

type GetMoreFn<TItem extends object> = (
  cursor: EntityType<TItem> | null,
) => Effect.Effect<EntityType<TItem>[]>;

type OnLoadSubsetFn<TItem extends object> = (
  options: ParsedLoadSubsetOptions<TItem>,
) => Effect.Effect<EntityType<TItem>[]>;

interface StdCollectionConfigBase<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> {
  schema: TSchema;
  cache?: Effect.Effect<CacheEntity<TItem>>;
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

interface EagerConfig<TItem extends object, TSchema extends AnyEntityESchema>
  extends StdCollectionConfigBase<TItem, TSchema> {
  syncMode?: "eager";
  getMore: GetMoreFn<TItem>;
  onLoadSubset?: never;
}

interface OnDemandConfig<TItem extends object, TSchema extends AnyEntityESchema>
  extends StdCollectionConfigBase<TItem, TSchema> {
  syncMode: "on-demand";
  getMore?: never;
  onLoadSubset: OnLoadSubsetFn<TItem>;
}

interface ProgressiveConfig<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> extends StdCollectionConfigBase<TItem, TSchema> {
  syncMode: "progressive";
  getMore: GetMoreFn<TItem>;
  onLoadSubset: OnLoadSubsetFn<TItem>;
}

type StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> =
  | EagerConfig<TItem, TSchema>
  | OnDemandConfig<TItem, TSchema>
  | ProgressiveConfig<TItem, TSchema>;

export const stdCollectionOptions = <TSchema extends AnyEntityESchema>(
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

  const { onInsert, cache: providedCache, onUpdate, schema } = options;
  const syncMode = options.syncMode ?? "eager";
  const getMore = "getMore" in options ? options.getMore : undefined;
  const onLoadSubset =
    "onLoadSubset" in options ? options.onLoadSubset : undefined;

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
      begin({ immediate: true });
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

  const cacheAndApply = (cache: CacheEntity<TItem>, items: EntityType<TItem>[]) =>
    Effect.gen(function* () {
      yield* Effect.forEach(items, (item) => cache.put(item), { discard: true });
      applyToCollection?.(items);
    });

  const fetchOnePage = (cache: CacheEntity<TItem>) =>
    Effect.gen(function* () {
      if (!getMore) return 0;
      const latest = yield* cache.getLatest();
      const items = yield* getMore(Option.getOrNull(latest));
      if (items.length === 0) return 0;
      yield* cacheAndApply(cache, items);
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
        const beforeUpdated =
          Option.getOrNull(yield* cache.getLatest())?.meta._u ?? null;
        const count = yield* fetchOnePage(cache);
        if (count === 0) break;

        const afterUpdated =
          Option.getOrNull(yield* cache.getLatest())?.meta._u ?? null;
        if (afterUpdated === beforeUpdated) {
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

        if (syncMode !== "on-demand") {
          const cachedItems = yield* cache.getAll();
          if (cachedItems.length > 0) {
            applyToCollection(cachedItems);
            markReady();
          }
        }

        if (syncMode === "eager" || syncMode === "progressive") {
          yield* withSyncGuard(fetchAllPages(cache));
        }
        markReady();
      });

      const cancel = Effect.runCallback(initEffect);

      const cleanup = () => {
        cancel();
        Effect.runSync(SubscriptionRef.set(syncing, false));
        resolvedCache = null;
        applyToCollection = null;
      };

      const loadSubset: LoadSubsetFn | undefined = onLoadSubset
        ? (loadOptions) => {
            const parsed = parseLoadSubsetOptions<TItem>(loadOptions);
            const effect = Effect.gen(function* () {
              const items = yield* onLoadSubset(parsed);
              if (items.length > 0 && resolvedCache) {
                yield* cacheAndApply(resolvedCache!, items);
              }
            });
            return Effect.runPromise(effect);
          }
        : undefined;

      return {
        cleanup,
        ...(loadSubset && { loadSubset }),
      } satisfies SyncConfigRes;
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
    ...(syncMode !== "eager" && {
      syncMode: "on-demand" as const,
    }),
    sync: tanstackSync,
    utils,
    compare: (x, y) => {
      const xUpdated = x?._meta?._u ?? "";
      const yUpdated = y?._meta?._u ?? "";
      if (xUpdated === yUpdated) return 0;
      return xUpdated < yUpdated ? -1 : 1;
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
