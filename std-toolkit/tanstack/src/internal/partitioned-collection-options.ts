import {
  CollectionConfig,
  type LoadSubsetFn,
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from '@tanstack/react-db';
import { Effect, Option, SubscriptionRef } from 'effect';
import { EntityType } from '@std-toolkit/core';
import {
  CacheEntity,
  type PartitionKey,
  serializePartition,
} from '@std-toolkit/cache';
import {
  AnyEntityESchema,
  ESchemaEncoded,
  ESchemaIdField,
  ESchemaType,
} from '@std-toolkit/eschema';
import { parseLoadSubsetOptions } from '../load-subset-parser.js';
import { CollectionItem, CollectionUtils } from '../types.js';
import {
  compareByMeta,
  makeApplyToCollection,
  makeMutationHandlers,
} from './shared.js';

type EncodedRow<TSchema extends AnyEntityESchema> = EntityType<
  ESchemaEncoded<TSchema>
>;

type OnLoadPartitionFn<TSchema extends AnyEntityESchema> = (
  partition: PartitionKey,
  cursor: EncodedRow<TSchema> | null,
) => Effect.Effect<EncodedRow<TSchema>[]>;

interface StdPartitionedCollectionConfig<TSchema extends AnyEntityESchema> {
  id?: string;
  schema: TSchema;
  partitionField: string & keyof ESchemaType<TSchema>;
  cache: (
    partition: PartitionKey,
  ) => Effect.Effect<CacheEntity<ESchemaEncoded<TSchema>>>;
  onLoadPartition: OnLoadPartitionFn<TSchema>;
  onInsert?: (item: ESchemaType<TSchema>) => Effect.Effect<EncodedRow<TSchema>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<ESchemaType<TSchema>, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EncodedRow<TSchema>>;
}

export const stdPartitionedCollectionOptions = <
  TSchema extends AnyEntityESchema,
>(
  options: StdPartitionedCollectionConfig<TSchema>,
): Omit<
  CollectionConfig<
    CollectionItem<ESchemaType<TSchema>>,
    string,
    never,
    CollectionUtils<TSchema>
  >,
  'schema'
> => {
  type TItem = ESchemaType<TSchema>;
  type TCollectionItem = CollectionItem<TItem>;
  type TEncoded = ESchemaEncoded<TSchema>;

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

  const partitionCaches = new Map<string, CacheEntity<TEncoded>>();
  const loadedPartitions = new Set<string>();
  const inflight = new Map<string, Promise<void>>();

  let applyToCollection: ((items: EncodedRow<TSchema>[]) => void) | null = null;

  const updateSyncing = () => {
    Effect.runSync(SubscriptionRef.set(syncing, inflight.size > 0));
  };

  const getOrCreateCache = (
    key: string,
    partition: PartitionKey,
  ): Effect.Effect<CacheEntity<TEncoded>> => {
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
    cache: CacheEntity<TEncoded>,
    items: EncodedRow<TSchema>[],
  ) =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        items,
        (item) =>
          Effect.gen(function* () {
            const id = item.value[schema.idField as keyof TEncoded] as string;
            const existing = yield* cache.get(id);
            const existingU = Option.map(existing, (e) => e.meta._u ?? '').pipe(
              Option.getOrElse(() => ''),
            );
            const incomingU = item.meta._u ?? '';
            if (!existingU || !incomingU || incomingU > existingU) {
              yield* cache.put(item);
            }
          }),
        { discard: true },
      );
      applyToCollection?.(items);
    });

  const fetchOnePageForPartition = (
    cache: CacheEntity<TEncoded>,
    partition: PartitionKey,
  ) =>
    Effect.gen(function* () {
      const latest = yield* cache.getLatest();
      const items = yield* onLoadPartition(partition, Option.getOrNull(latest));
      if (items.length === 0) return 0;
      yield* cacheAndApply(cache, items);
      return items.length;
    });

  const fetchAllPagesForPartition = (
    cache: CacheEntity<TEncoded>,
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
            '[std-toolkit/tanstack] Infinite loop detected: cursor did not advance for partition',
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
        console.error(
          '[std-toolkit/tanstack] Failed to load partition',
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

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { markReady } = params;

      applyToCollection = makeApplyToCollection<TSchema>(schema, params);

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

  const upsert = (
    input: EncodedRow<TSchema> | EncodedRow<TSchema>[],
    _persist?: boolean,
  ) => {
    const items = Array.isArray(input) ? input : [input];
    applyToCollection?.(items);
  };

  return {
    ...(id !== undefined && { id }),
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    syncMode: 'on-demand' as const,
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
    ...makeMutationHandlers<TItem, TSchema>(schema, upsert, onInsert, onUpdate),
  };
};
