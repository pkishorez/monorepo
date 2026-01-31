import { Effect } from "effect";
import { SyncStrategy, SyncContext, CacheConfig } from "./types.js";

export const createCacheSync = <TItem extends object>(
  _config: CacheConfig,
  context: SyncContext<TItem>,
): SyncStrategy => {
  const { cache, applyToCollection, markReady } = context;

  return {
    initialize: () =>
      Effect.gen(function* () {
        const cachedItems = yield* cache.getAll();

        applyToCollection(cachedItems);
        markReady();
      }),

    fetch: () => Effect.succeed(0),
    fetchAll: () => Effect.succeed(0),
    isSyncing: () => false,
    cleanup: undefined,
  };
};
