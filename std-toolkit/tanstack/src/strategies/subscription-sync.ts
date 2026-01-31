import { Effect, Option } from "effect";
import {
  SyncStrategy,
  SyncContext,
  SubscriptionSyncConfig,
  FetchDirection,
} from "./types.js";

export const createSubscriptionSync = <TItem extends object>(
  config: SubscriptionSyncConfig<TItem>,
  context: SyncContext<TItem>,
): SyncStrategy => {
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

    fetch: () => Effect.succeed(0),

    fetchAll: (_direction: FetchDirection) => Effect.succeed(0),

    isSyncing: () => false,

    cleanup: config.onCleanup,
  };
};
