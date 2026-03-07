import {
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect, Option, SubscriptionRef } from "effect";
import { EntityType } from "@std-toolkit/core";
import { AnySingleEntityESchema } from "@std-toolkit/eschema";
import type { CacheSingleItem } from "@std-toolkit/cache";
import { CollectionItem, SingleItemUtils } from "../types";
import { makeWithSyncGuard } from "./shared";

interface StdSingleItemConfig<
  TItem extends object,
  TSchema extends AnySingleEntityESchema,
> {
  schema: TSchema;
  get: () => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (payload: {
    updates: Partial<TItem>;
  }) => Effect.Effect<EntityType<TItem>>;
  cache?: Effect.Effect<CacheSingleItem<TItem>>;
}

export const stdSingleItemOptions = <TSchema extends AnySingleEntityESchema>(
  options: StdSingleItemConfig<TSchema["Type"], TSchema>,
) => {
  type TItem = TSchema["Type"];
  type TCollectionItem = CollectionItem<TItem>;

  const { get, onUpdate, schema, cache: cacheEffect } = options;
  const singletonKey = schema.name;

  const syncing = Effect.runSync(SubscriptionRef.make(false));
  const semaphore = Effect.runSync(Effect.makeSemaphore(1));
  const withSyncGuard = makeWithSyncGuard(syncing, semaphore);

  let applyToCollection: ((item: EntityType<TItem>) => void) | null = null;
  let resolvedCache: CacheSingleItem<TItem> | null = null;

  const createApplyToCollection = (
    params: Parameters<TanstackSyncConfig<TCollectionItem, string>["sync"]>[0],
  ) => {
    const { begin, collection, commit, write } = params;

    return (item: EntityType<TItem>) => {
      const itemValue = { ...item.value, _meta: item.meta } as TCollectionItem;
      begin({ immediate: true });
      if (collection.has(singletonKey)) {
        write({ type: "update", value: itemValue });
      } else {
        write({ type: "insert", value: itemValue });
      }
      commit();
    };
  };

  const fetchItem = Effect.gen(function* () {
    const item = yield* get();
    if (resolvedCache) {
      yield* Effect.catchAll(resolvedCache.put(item), () => Effect.void);
    }
    applyToCollection?.(item);
  });

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { markReady } = params;

      const initEffect = Effect.gen(function* () {
        applyToCollection = createApplyToCollection(params);

        if (cacheEffect) {
          resolvedCache = yield* Effect.catchAll(cacheEffect, () =>
            Effect.succeed(null),
          );
          const cached = resolvedCache
            ? yield* Effect.catchAll(resolvedCache.get(), () =>
                Effect.succeed(Option.none<EntityType<TItem>>()),
              )
            : Option.none<EntityType<TItem>>();
          if (Option.isSome(cached)) {
            applyToCollection(cached.value);
            markReady();
          }
        }

        markReady();
        yield* withSyncGuard(fetchItem);
        markReady();
      });

      const cancel = Effect.runCallback(initEffect);

      const cleanup = () => {
        cancel();
        Effect.runSync(SubscriptionRef.set(syncing, false));
        applyToCollection = null;
        resolvedCache = null;
      };

      return { cleanup } satisfies SyncConfigRes;
    },
  };

  return {
    schema: schema["~standard"] ? schema : (undefined as any),
    singleResult: true as const,
    getKey: () => singletonKey,
    sync: tanstackSync,
    utils: {
      schema: () => schema,
      refetch: () => withSyncGuard(fetchItem).pipe(Effect.orDie),
      isSyncing: syncing,
    } satisfies SingleItemUtils<TSchema>,
    onUpdate: async ({ transaction }: any) => {
      if (!onUpdate) return;
      const { changes } = transaction.mutations[0]!;
      const result = await Effect.runPromise(
        onUpdate({ updates: changes as Partial<TItem> }),
      );
      if (resolvedCache) {
        await Effect.runPromise(
          Effect.catchAll(resolvedCache.put(result), () => Effect.void),
        );
      }
      applyToCollection?.(result);
    },
  };
};
