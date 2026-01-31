import { Effect, Option } from "effect";
import { SyncStrategy, SyncContext, SubscriptionSyncConfig } from "./types.js";

export const createSubscriptionSync = <TItem extends object>(
  config: SubscriptionSyncConfig<TItem>,
  context: SyncContext<TItem>,
): SyncStrategy<TItem> => {
  const { cache, applyToCollection, markReady } = context;

  return {
    initialize: () =>
      Effect.gen(function* () {
        const allItems = yield* cache.getAll();
        const latest = Option.getOrNull(yield* cache.getLatest());

        applyToCollection(allItems);
        if (allItems.length > 0) {
          markReady();
        }

        yield* config.effect(latest);
      }),

    syncLatest: () =>
      Effect.gen(function* () {
        return Option.getOrNull(yield* cache.getLatest());
      }),

    loadOlder: () => Effect.succeed([]),

    cleanup: config.onCleanup,
  };
};
