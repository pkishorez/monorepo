import { Effect, Option } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity, CacheError } from "@std-toolkit/cache";
import {
  SyncStrategy,
  SyncContext,
  QuerySyncConfig,
  FetchDirection,
} from "./types.js";

const getCursorBySortField = <TItem extends object>(
  cache: CacheEntity<TItem>,
  direction: "newer" | "older",
  orderBy: keyof TItem | "_uid",
): Effect.Effect<Option.Option<EntityType<TItem>>, CacheError> =>
  Effect.gen(function* () {
    // Fast path: use existing cache methods for _uid
    if (orderBy === "_uid") {
      return direction === "newer"
        ? yield* cache.getLatest()
        : yield* cache.getOldest();
    }

    // Slow path: scan all items to find max/min by orderBy
    const items = yield* cache.getAll();
    if (items.length === 0) return Option.none<EntityType<TItem>>();

    const comparator = (a: EntityType<TItem>, b: EntityType<TItem>) => {
      const aVal = a.value[orderBy as keyof TItem];
      const bVal = b.value[orderBy as keyof TItem];
      return String(aVal ?? "").localeCompare(String(bVal ?? ""));
    };

    const sorted = [...items].sort(comparator);
    const result =
      direction === "newer" ? sorted[sorted.length - 1]! : sorted[0]!;

    return Option.some(result);
  });

export const createQuerySync = <TItem extends object>(
  config: QuerySyncConfig<TItem>,
  context: SyncContext<TItem>,
): SyncStrategy => {
  const { cache, applyToCollection, markReady } = context;

  let syncing = false;
  const orderBy = config.orderBy ?? "_uid";

  const persistItems = (items: EntityType<TItem>[]) =>
    Effect.forEach(items, (item) => cache.put(item), { discard: true });

  const fetchInternal = (direction: "newer" | "older") =>
    Effect.gen(function* () {
      const cursor = yield* getCursorBySortField(cache, direction, orderBy);

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
      const fetchedUids = new Set<string>();

      do {
        const cursor = yield* getCursorBySortField(cache, direction, orderBy);

        const operator = direction === "newer" ? ">" : "<";
        const cursorValue = Option.getOrNull(cursor);
        const items = yield* config.getMore(operator, cursorValue);

        if (items.length === 0) {
          count = 0;
          break;
        }

        const duplicateItem = items.find((item) =>
          fetchedUids.has(item.meta._uid),
        );
        if (duplicateItem) {
          const cursorSortValue =
            orderBy === "_uid"
              ? cursorValue?.meta._uid
              : cursorValue?.value[orderBy as keyof TItem];
          console.error(
            "[query-sync] Infinite loop detected: duplicate item returned",
            {
              condition: `${operator} ${cursorSortValue ?? "null"} (by ${String(orderBy)})`,
              duplicateItem,
              latest: Option.getOrNull(
                yield* getCursorBySortField(cache, "newer", orderBy),
              ),
              oldest: Option.getOrNull(
                yield* getCursorBySortField(cache, "older", orderBy),
              ),
              issue: `Item ${duplicateItem.meta._uid} was already fetched in this session but returned again`,
            },
          );
          break;
        }

        for (const item of items) {
          fetchedUids.add(item.meta._uid);
        }

        yield* persistItems(items);
        applyToCollection(items, true);

        count = items.length;
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
