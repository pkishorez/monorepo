import { SyncConfig as TanstackSyncConfig } from "@tanstack/react-db";
import { Effect, Option, SubscriptionRef } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { CollectionItem } from "../types.js";

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
      const existing = collection.get(key);
      const existingU = existing?._meta?._u ?? "";
      const incomingU = item.meta._u ?? "";

      if (existing && incomingU && existingU && incomingU <= existingU) {
        continue;
      }

      if (alwaysPersist || persist) {
        Effect.runPromise(
          Effect.gen(function* () {
            const cached = yield* cache.get(key);
            const cachedU = Option.map(cached, (c) => c.meta._u ?? "").pipe(
              Option.getOrElse(() => ""),
            );
            if (!cachedU || !incomingU || incomingU > cachedU) {
              yield* cache.put(item);
            }
          }),
        ).catch(() => {});
      }

      if (item.meta._d) {
        if (collection.has(key)) write({ type: "delete", key });
      } else {
        const itemValue = { ...item.value, _meta: item.meta } as CollectionItem<TItem>;
        if (collection.has(key)) {
          write({ type: "update", value: itemValue });
        } else {
          write({ type: "insert", value: itemValue });
        }
      }
    }
    commit();
  };
};
