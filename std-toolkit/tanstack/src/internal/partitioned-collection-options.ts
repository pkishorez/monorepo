import {
  CollectionConfig,
  type LoadSubsetFn,
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect, Option, SubscriptionRef } from "effect";
import { EntityType } from "@std-toolkit/core";
import {
  CacheEntity,
  type PartitionKey,
  serializePartition,
} from "@std-toolkit/cache";
import { AnyEntityESchema, ESchemaIdField } from "@std-toolkit/eschema";
import { parseLoadSubsetOptions } from "../load-subset-parser.js";
import { CollectionItem, CollectionUtils } from "../types.js";
import {
  compareByMeta,
  makeApplyToCollection,
  makeMutationHandlers,
} from "./shared.js";

type OnLoadPartitionFn<TItem extends object> = (
  partition: PartitionKey,
  cursor: EntityType<TItem> | null,
) => Effect.Effect<EntityType<TItem>[]>;

interface StdPartitionedCollectionConfig<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> {
  id?: string;
  schema: TSchema;
  partitionField: string & keyof TItem;
  cache: (partition: PartitionKey) => Effect.Effect<CacheEntity<TItem>>;
  onLoadPartition: OnLoadPartitionFn<TItem>;
  onInsert?: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EntityType<TItem>>;
}

export const stdPartitionedCollectionOptions = <
  TSchema extends AnyEntityESchema,
>(
  options: StdPartitionedCollectionConfig<TSchema["Type"], TSchema>,
): Omit<
  CollectionConfig<
    CollectionItem<TSchema["Type"]>,
    string,
    never,
    CollectionUtils<TSchema>
  >,
  "schema"
> => {
  type TItem = TSchema["Type"];
  type TCollectionItem = CollectionItem<TItem>;

  const {
    id,
    schema,
    partitionField,
    cache: cacheFactory,
    onLoadPartition,
    onInsert,
    onUpdate,
  } = options;

  const syncing = Effect.runSync(SubscriptionRef.make(false));

  const partitionCaches = new Map<string, CacheEntity<TItem>>();
  const loadedPartitions = new Set<string>();
  const inflight = new Map<string, Promise<void>>();

  let applyToCollection:
    | ((items: EntityType<TItem>[]) => void)
    | null = null;

  const updateSyncing = () => {
    Effect.runSync(
      SubscriptionRef.set(syncing, inflight.size > 0),
    );
  };

  const getOrCreateCache = (
    key: string,
    partition: PartitionKey,
  ): Effect.Effect<CacheEntity<TItem>> => {
    const existing = partitionCaches.get(key);
    if (existing) return Effect.succeed(existing);
    return cacheFactory(partition).pipe(
      Effect.tap((cache) =>
        Effect.sync(() => {
          partitionCaches.set(key, cache);
        }),
      ),
    );
  };

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

  const fetchOnePageForPartition = (
    cache: CacheEntity<TItem>,
    partition: PartitionKey,
  ) =>
    Effect.gen(function* () {
      const latest = yield* cache.getLatest();
      const items = yield* onLoadPartition(
        partition,
        Option.getOrNull(latest),
      );
      if (items.length === 0) return 0;
      yield* cacheAndApply(cache, items);
      return items.length;
    });

  const fetchAllPagesForPartition = (
    cache: CacheEntity<TItem>,
    partition: PartitionKey,
  ) =>
    Effect.gen(function* () {
      let total = 0;

      while (true) {
        const beforeUpdated =
          Option.getOrNull(yield* cache.getLatest())?.meta._u ?? null;
        const count = yield* fetchOnePageForPartition(cache, partition);
        if (count === 0) break;

        const afterUpdated =
          Option.getOrNull(yield* cache.getLatest())?.meta._u ?? null;
        if (afterUpdated === beforeUpdated) {
          console.error(
            "[std-toolkit/tanstack] Infinite loop detected: cursor did not advance for partition",
            partition,
          );
          break;
        }

        total += count;
      }

      return total;
    });

  const loadPartition = (partition: PartitionKey): Promise<void> => {
    const key = serializePartition(partition);

    if (loadedPartitions.has(key)) return Promise.resolve();

    const existing = inflight.get(key);
    if (existing) return existing;

    const effect = Effect.gen(function* () {
      const cache = yield* getOrCreateCache(key, partition);

      const cachedItems = yield* cache.getAll();
      if (cachedItems.length > 0) {
        applyToCollection?.(cachedItems);
      }

      yield* fetchAllPagesForPartition(cache, partition);

      loadedPartitions.add(key);
    });

    const promise = Effect.runPromise(effect)
      .catch((err) => {
        // Swallow so TanStack gets a resolved promise; partition stays
        // out of loadedPartitions so next query triggers a retry.
        console.error(
          "[std-toolkit/tanstack] Failed to load partition",
          partition,
          err,
        );
      })
      .finally(() => {
        inflight.delete(key);
        updateSyncing();
      });

    inflight.set(key, promise);
    updateSyncing();
    return promise;
  };

  // --- TanStack sync ---

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { markReady } = params;

      // Broadcast upserts don't persist — partition cache is populated during loadPartition
      applyToCollection = makeApplyToCollection(params);

      // Partitions load on demand via loadSubset
      markReady();

      const loadSubset: LoadSubsetFn = (loadOptions) => {
        const parsed = parseLoadSubsetOptions<TItem>(loadOptions);
        const partitionValue = parsed.filters[partitionField];

        if (!partitionValue?.eq) {
          console.warn(
            `[std-toolkit/tanstack] loadSubset called without eq filter on partition field "${String(partitionField)}"`,
          );
          return Promise.resolve();
        }

        const partition: PartitionKey = {
          [partitionField]: String(partitionValue.eq),
        };

        return loadPartition(partition);
      };

      const cleanup = () => {
        applyToCollection = null;
        partitionCaches.clear();
        loadedPartitions.clear();
        inflight.clear();
        updateSyncing();
      };

      return {
        cleanup,
        loadSubset,
      } satisfies SyncConfigRes;
    },
  };

  // --- Utils ---

  // Broadcast upserts apply to TanStack only — no partition cache persist,
  // since the data came from server and will be re-fetched on next partition load.
  const upsert = (
    input: EntityType<TItem> | EntityType<TItem>[],
    _persist?: boolean,
  ) => {
    const items = Array.isArray(input) ? input : [input];
    applyToCollection?.(items);
  };

  return {
    ...(id !== undefined && { id }),
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    syncMode: "on-demand" as const,
    sync: tanstackSync,
    utils: {
      upsert,
      schema: () => schema,
      fetch: (partition?: PartitionKey) => {
        if (!partition) return Effect.succeed(0);
        const key = serializePartition(partition);
        return Effect.gen(function* () {
          yield* SubscriptionRef.set(syncing, true);
          const cache = yield* getOrCreateCache(key, partition);
          return yield* fetchOnePageForPartition(cache, partition);
        }).pipe(
          Effect.ensuring(SubscriptionRef.set(syncing, false)),
          Effect.orDie,
        );
      },
      fetchAll: (partition?: PartitionKey) => {
        if (!partition) return Effect.succeed(0);
        const key = serializePartition(partition);
        return Effect.gen(function* () {
          yield* SubscriptionRef.set(syncing, true);
          const cache = yield* getOrCreateCache(key, partition);
          return yield* fetchAllPagesForPartition(cache, partition);
        }).pipe(
          Effect.ensuring(SubscriptionRef.set(syncing, false)),
          Effect.orDie,
        );
      },
      isSyncing: () => syncing,
    },
    compare: compareByMeta,
    ...makeMutationHandlers(schema, upsert, onInsert, onUpdate),
  };
};
