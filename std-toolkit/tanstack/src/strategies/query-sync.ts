import { Effect, Option } from "effect";
import { EntityType } from "@std-toolkit/core";
import { SyncStrategy, SyncContext, QuerySyncConfig } from "./types.js";

export const createQuerySync = <TItem extends object>(
  config: QuerySyncConfig<TItem>,
  context: SyncContext<TItem>,
): SyncStrategy<TItem> => {
  const { cache, applyToCollection, markReady } = context;

  const sortByUid = (items: EntityType<TItem>[]) =>
    [...items].sort((a, z) => a.meta._uid.localeCompare(z.meta._uid));

  const getLatestFromItems = (items: EntityType<TItem>[]) =>
    sortByUid(items).at(-1) ?? null;

  const persistItems = (items: EntityType<TItem>[]) =>
    Effect.forEach(items, (item) => cache.put(item), { discard: true });

  return {
    initialize: () =>
      Effect.gen(function* () {
        const cachedItems = yield* cache.getAll();

        applyToCollection(cachedItems);
        if (cachedItems.length > 0) {
          markReady();
        }
      }),

    syncLatest: () =>
      Effect.gen(function* () {
        const latest = Option.getOrNull(yield* cache.getLatest());
        const newItems = yield* config.getMore(">", latest);

        if (newItems.length === 0) {
          return latest;
        }

        yield* persistItems(newItems);
        applyToCollection(newItems, true);

        if (!latest) {
          markReady();
        }

        return getLatestFromItems(newItems);
      }),

    loadOlder: () =>
      Effect.gen(function* () {
        const oldest = Option.getOrNull(yield* cache.getOldest());
        const olderItems = yield* config.getMore("<", oldest);

        if (olderItems.length === 0) {
          return [];
        }

        yield* persistItems(olderItems);
        applyToCollection(olderItems, true);

        return olderItems;
      }),

    cleanup: config.onCleanup,
  };
};
