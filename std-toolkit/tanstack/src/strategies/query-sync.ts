import { Effect, Option } from "effect";
import { EntityType } from "@std-toolkit/core";
import {
  SyncStrategy,
  SyncContext,
  QuerySyncConfig,
  FetchDirection,
} from "./types.js";

export const createQuerySync = <TItem extends object>(
  config: QuerySyncConfig<TItem>,
  context: SyncContext<TItem>,
): SyncStrategy => {
  const { cache, applyToCollection, markReady } = context;

  let syncing = false;

  const persistItems = (items: EntityType<TItem>[]) =>
    Effect.forEach(items, (item) => cache.put(item), { discard: true });

  const fetchInternal = (direction: "newer" | "older") =>
    Effect.gen(function* () {
      const cursor =
        direction === "newer"
          ? yield* cache.getLatest()
          : yield* cache.getOldest();

      const operator = direction === "newer" ? ">" : "<";
      const items = yield* config.getMore(operator, Option.getOrNull(cursor));

      if (items.length === 0) {
        return 0;
      }

      yield* persistItems(items);
      applyToCollection(items, true);

      return items.length;
    });

  const fetch = (direction: "newer" | "older") =>
    Effect.gen(function* () {
      if (syncing) {
        return 0;
      }

      syncing = true;

      return yield* fetchInternal(direction).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            syncing = false;
          }),
        ),
      );
    });

  const fetchAllInDirection = (direction: "newer" | "older") =>
    Effect.gen(function* () {
      let total = 0;
      let count: number;

      do {
        count = yield* fetchInternal(direction);
        total += count;
      } while (count > 0);

      return total;
    });

  const fetchAll = (direction: FetchDirection) =>
    Effect.gen(function* () {
      if (syncing) {
        return 0;
      }

      syncing = true;

      const result = yield* Effect.gen(function* () {
        if (direction === "both") {
          const [newer, older] = yield* Effect.all(
            [fetchAllInDirection("newer"), fetchAllInDirection("older")],
            { concurrency: 2 },
          );
          return newer + older;
        }

        return yield* fetchAllInDirection(direction);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            syncing = false;
          }),
        ),
      );

      return result;
    });

  return {
    initialize: () =>
      Effect.gen(function* () {
        const cachedItems = yield* cache.getAll();

        applyToCollection(cachedItems);

        if (cachedItems.length > 0) {
          markReady();
        }

        yield* fetchAll("both");

        markReady();
      }),

    fetch,
    fetchAll,
    isSyncing: () => syncing,
    cleanup: undefined,
  };
};
