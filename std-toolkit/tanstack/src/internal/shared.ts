import { SyncConfig as TanstackSyncConfig } from "@tanstack/react-db";
import { Effect, SubscriptionRef } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { CollectionItem } from "../types";

type SyncParams<T extends object> = Parameters<
  TanstackSyncConfig<CollectionItem<T>, string>["sync"]
>[0];

export const compareByMeta = (
  x: CollectionItem<any>,
  y: CollectionItem<any>,
) => {
  const xUpdated = x?._meta?._u ?? "";
  const yUpdated = y?._meta?._u ?? "";
  if (xUpdated === yUpdated) return 0;
  return xUpdated < yUpdated ? -1 : 1;
};

export const makeWithSyncGuard =
  (
    syncing: SubscriptionRef.SubscriptionRef<boolean>,
    semaphore: Effect.Semaphore,
  ) =>
  <A, E>(effect: Effect.Effect<A, E>) =>
    semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* SubscriptionRef.set(syncing, true);
        return yield* effect;
      }).pipe(Effect.ensuring(SubscriptionRef.set(syncing, false))),
    );

export const makeApplyToCollection = <TItem extends object>(
  params: SyncParams<TItem>,
  cache: CacheEntity<TItem>,
  alwaysPersist: boolean,
) => {
  const { begin, collection, commit, write } = params;

  return (items: EntityType<TItem>[], persist = false) => {
    begin({ immediate: true });
    for (const item of items) {
      const key = collection.getKeyFromItem(item.value as CollectionItem<TItem>);

      if (alwaysPersist || persist) {
        Effect.runPromise(cache.put(item)).catch(() => {});
      }

      if (collection.has(key)) {
        if (item.meta._d) {
          write({ type: "delete", key });
        } else {
          const itemValue = { ...item.value, _meta: item.meta } as CollectionItem<TItem>;
          write({ type: "update", value: itemValue });
        }
      } else if (!item.meta._d) {
        const itemValue = { ...item.value, _meta: item.meta } as CollectionItem<TItem>;
        write({ type: "insert", value: itemValue });
      }
    }
    commit();
  };
};
