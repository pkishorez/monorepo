import {
  CollectionConfig,
  type LoadSubsetFn,
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect, Fiber, Option, Scope, SubscriptionRef } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyEntityESchema, ESchemaIdField } from "@std-toolkit/eschema";
import {
  parseLoadSubsetOptions,
  type ParsedLoadSubsetOptions,
} from "../load-subset-parser.js";
import { CollectionItem, CollectionUtils } from "../types.js";
import {
  compareByMeta,
  makeApplyToCollection,
  makeWithSyncGuard,
} from "./shared.js";

type GetMoreFn<TItem extends object> = (
  cursor: EntityType<TItem> | null,
) => Effect.Effect<EntityType<TItem>[]>;

type OnLoadSubsetFn<TItem extends object> = (
  options: ParsedLoadSubsetOptions<TItem>,
) => Effect.Effect<EntityType<TItem>[]>;

type SyncFn<TItem extends object> = (
  emit: (items: EntityType<TItem> | EntityType<TItem>[]) => void,
) => Effect.Effect<void, never, Scope.Scope>;

interface StdCollectionConfigBase<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> {
  id?: string;
  schema: TSchema;
  cache?: Effect.Effect<CacheEntity<TItem>>;
  onInsert?: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EntityType<TItem>>;
}

type StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = StdCollectionConfigBase<TItem, TSchema> &
  (
    | { syncMode: "eager"; getMore: GetMoreFn<TItem>; sync?: SyncFn<TItem> }
    | { syncMode: "on-demand"; onLoadSubset: OnLoadSubsetFn<TItem> }
    | {
        syncMode: "progressive";
        getMore: GetMoreFn<TItem>;
        onLoadSubset: OnLoadSubsetFn<TItem>;
        sync?: SyncFn<TItem>;
      }
  );

export const stdCollectionOptions = <TSchema extends AnyEntityESchema>(
  options: StdCollectionConfig<TSchema["Type"], TSchema>,
): Omit<
  CollectionConfig<
    CollectionItem<TSchema["Type"]>,
    string,
    never,
    CollectionUtils<TSchema>
  >,
  "schema"
> & { schema: TSchema } => {
  type TItem = TSchema["Type"];
  type TCollectionItem = CollectionItem<TItem>;

  const { id, onInsert, cache: providedCache, onUpdate, schema } = options;
  const syncMode = options.syncMode;
  const getMore = "getMore" in options ? options.getMore : undefined;
  const onLoadSubset =
    "onLoadSubset" in options ? options.onLoadSubset : undefined;
  const syncFn = "sync" in options ? options.sync : undefined;

  const syncing = Effect.runSync(SubscriptionRef.make(false));
  const semaphore = Effect.runSync(Effect.makeSemaphore(1));
  const withSyncGuard = makeWithSyncGuard(syncing, semaphore);

  let resolvedCache: CacheEntity<TItem> | null = null;
  let applyToCollection:
    | ((items: EntityType<TItem>[], persist?: boolean) => void)
    | null = null;

  const cacheAndApply = (
    cache: CacheEntity<TItem>,
    items: EntityType<TItem>[],
  ) =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        items,
        (item) =>
          Effect.gen(function* () {
            const id = item.value[schema.idField as keyof TItem] as string;
            const existing = yield* cache.get(id);
            const existingU = Option.map(existing, (e) => e.meta._u ?? "").pipe(
              Option.getOrElse(() => ""),
            );
            const incomingU = item.meta._u ?? "";
            if (!existingU || !incomingU || incomingU > existingU) {
              yield* cache.put(item);
            }
          }),
        { discard: true },
      );
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
        applyToCollection = makeApplyToCollection(params, cache, false);

        if (syncMode !== "on-demand") {
          const cachedItems = yield* cache.getAll();
          if (cachedItems.length > 0) {
            applyToCollection(cachedItems);
            markReady();
          }
        }

        if (syncFn) {
          const emit = (input: EntityType<TItem> | EntityType<TItem>[]) => {
            const items = Array.isArray(input) ? input : [input];
            applyToCollection?.(items, false);
          };
          const syncFiber = yield* Effect.fork(Effect.scoped(syncFn(emit)));
          yield* withSyncGuard(fetchAllPages(cache));
          markReady();
          yield* Fiber.join(syncFiber);
        } else if (syncMode === "eager" || syncMode === "progressive") {
          yield* withSyncGuard(fetchAllPages(cache));
          markReady();
        } else {
          markReady();
        }
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
              const cache = resolvedCache;
              if (items.length > 0 && cache) {
                yield* cacheAndApply(cache, items);
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

  const upsert = (
    input: EntityType<TItem> | EntityType<TItem>[],
    persist?: boolean,
  ) => {
    const items = Array.isArray(input) ? input : [input];
    applyToCollection?.(items, persist);
  };

  const guardedFetch = (
    fn: (cache: CacheEntity<TItem>) => Effect.Effect<number, unknown>,
  ): Effect.Effect<number> => {
    if (!resolvedCache) return Effect.succeed(0);
    return withSyncGuard(fn(resolvedCache)).pipe(Effect.orDie);
  };

  return {
    ...(id !== undefined && { id }),
    schema,
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    ...(syncMode !== "eager" && {
      syncMode: "on-demand" as const,
    }),
    sync: tanstackSync,
    startSync: syncMode === "eager",
    utils: {
      upsert,
      schema: () => schema,
      fetch: () => guardedFetch(fetchOnePage),
      fetchAll: () => guardedFetch(fetchAllPages),
      isSyncing: () => syncing,
    },
    compare: compareByMeta,
    onInsert: async ({ transaction }) => {
      if (!onInsert) return;
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
