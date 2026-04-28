import {
  CollectionConfig,
  type LoadSubsetFn,
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from '@tanstack/react-db';
import { Effect, Fiber, Option, Scope, SubscriptionRef } from 'effect';
import { EntityType } from '@std-toolkit/core';
import { CacheEntity } from '@std-toolkit/cache';
import { MemoryCacheEntity } from '@std-toolkit/cache/memory';
import {
  AnyEntityESchema,
  ESchemaEncoded,
  ESchemaIdField,
  ESchemaType,
} from '@std-toolkit/eschema';
import {
  parseLoadSubsetOptions,
  type ParsedLoadSubsetOptions,
} from '../load-subset-parser.js';
import { CollectionItem, CollectionUtils } from '../types.js';
import {
  compareByMeta,
  makeApplyToCollection,
  makeMutationHandlers,
  makeWithSyncGuard,
} from './shared.js';

type EncodedRow<TSchema extends AnyEntityESchema> = EntityType<
  ESchemaEncoded<TSchema>
>;

type GetMoreFn<TSchema extends AnyEntityESchema> = (
  cursor: EncodedRow<TSchema> | null,
) => Effect.Effect<EncodedRow<TSchema>[]>;

type OnLoadSubsetFn<TSchema extends AnyEntityESchema> = (
  options: ParsedLoadSubsetOptions<ESchemaType<TSchema>>,
) => Effect.Effect<EncodedRow<TSchema>[]>;

type SyncFn<TSchema extends AnyEntityESchema> = (
  emit: (items: EncodedRow<TSchema> | EncodedRow<TSchema>[]) => void,
) => Effect.Effect<void, never, Scope.Scope>;

interface StdCollectionConfigBase<TSchema extends AnyEntityESchema> {
  id?: string;
  schema: TSchema;
  cache?: Effect.Effect<CacheEntity<ESchemaEncoded<TSchema>>>;
  onInsert?: (item: ESchemaType<TSchema>) => Effect.Effect<EncodedRow<TSchema>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<ESchemaType<TSchema>, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EncodedRow<TSchema>>;
}

type StdCollectionConfig<TSchema extends AnyEntityESchema> =
  StdCollectionConfigBase<TSchema> &
    (
      | {
          syncMode: 'eager';
          getMore: GetMoreFn<TSchema>;
          sync?: SyncFn<TSchema>;
        }
      | { syncMode: 'on-demand'; onLoadSubset: OnLoadSubsetFn<TSchema> }
      | {
          syncMode: 'progressive';
          getMore: GetMoreFn<TSchema>;
          onLoadSubset: OnLoadSubsetFn<TSchema>;
          sync?: SyncFn<TSchema>;
        }
    );

export const stdCollectionOptions = <TSchema extends AnyEntityESchema>(
  options: StdCollectionConfig<TSchema>,
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

  const { id, onInsert, cache: providedCache, onUpdate, schema } = options;
  const syncMode = options.syncMode;
  const getMore = 'getMore' in options ? options.getMore : undefined;
  const onLoadSubset =
    'onLoadSubset' in options ? options.onLoadSubset : undefined;
  const syncFn = 'sync' in options ? options.sync : undefined;

  const syncing = Effect.runSync(SubscriptionRef.make(false));
  const semaphore = Effect.runSync(Effect.makeSemaphore(1));
  const withSyncGuard = makeWithSyncGuard(syncing, semaphore);

  let resolvedCache: CacheEntity<TEncoded> | null = null;
  let applyToCollection:
    | ((items: EncodedRow<TSchema>[], persist?: boolean) => void)
    | null = null;

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

  const fetchOnePage = (cache: CacheEntity<TEncoded>) =>
    Effect.gen(function* () {
      if (!getMore) return 0;
      const latest = yield* cache.getLatest();
      const items = yield* getMore(Option.getOrNull(latest));
      if (items.length === 0) return 0;
      yield* cacheAndApply(cache, items);
      return items.length;
    });

  const fetchAllPages = (cache: CacheEntity<TEncoded>) =>
    Effect.gen(function* () {
      let total = 0;

      while (true) {
        const beforeUpdated =
          Option.getOrNull(yield* cache.getLatest())?.meta._u ?? null;
        const count = yield* fetchOnePage(cache);
        if (count === 0) break;

        const afterUpdated =
          Option.getOrNull(yield* cache.getLatest())?.meta._u ?? null;
        if (afterUpdated === beforeUpdated) {
          console.error(
            '[std-toolkit/tanstack] Infinite loop detected: cursor did not advance',
          );
          break;
        }

        total += count;
      }

      return total;
    });

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { markReady } = params;

      const initEffect = Effect.gen(function* () {
        const cache: CacheEntity<TEncoded> = yield* (
          providedCache ??
            (MemoryCacheEntity.make({
              eschema: schema,
            }) as unknown as Effect.Effect<CacheEntity<TEncoded>>)
        );

        resolvedCache = cache;
        applyToCollection = makeApplyToCollection<TSchema>(
          schema,
          params,
          cache,
          false,
        );

        if (syncMode !== 'on-demand') {
          const cachedItems = yield* cache.getAll();
          if (cachedItems.length > 0) {
            applyToCollection(cachedItems);
            markReady();
          }
        }

        if (syncFn) {
          const emit = (input: EncodedRow<TSchema> | EncodedRow<TSchema>[]) => {
            const items = Array.isArray(input) ? input : [input];
            applyToCollection?.(items, false);
          };
          const syncFiber = yield* Effect.fork(Effect.scoped(syncFn(emit)));
          yield* withSyncGuard(fetchAllPages(cache));
          markReady();
          yield* Fiber.join(syncFiber);
        } else if (syncMode === 'eager' || syncMode === 'progressive') {
          yield* withSyncGuard(fetchAllPages(cache));
          markReady();
        } else {
          markReady();
        }
      });

      const cancel = Effect.runCallback(initEffect);

      const cleanup = () => {
        cancel();
        Effect.runSync(SubscriptionRef.set(syncing, false));
        resolvedCache = null;
        applyToCollection = null;
      };

      const loadSubset: LoadSubsetFn | undefined = onLoadSubset
        ? (loadOptions) => {
            const parsed = parseLoadSubsetOptions<TItem>(loadOptions);
            const effect = Effect.gen(function* () {
              const items = yield* onLoadSubset(parsed);
              const cache = resolvedCache;
              if (items.length > 0 && cache) {
                yield* cacheAndApply(cache, items);
              }
            });
            return Effect.runPromise(effect);
          }
        : undefined;

      return {
        cleanup,
        ...(loadSubset && { loadSubset }),
      } satisfies SyncConfigRes;
    },
  };

  const upsert = (
    input: EncodedRow<TSchema> | EncodedRow<TSchema>[],
    persist?: boolean,
  ) => {
    const items = Array.isArray(input) ? input : [input];
    applyToCollection?.(items, persist);
  };

  const guardedFetch = (
    fn: (cache: CacheEntity<TEncoded>) => Effect.Effect<number, unknown>,
  ): Effect.Effect<number> =>
    Effect.suspend(() => {
      if (!resolvedCache) return Effect.succeed(0);
      return withSyncGuard(fn(resolvedCache)).pipe(Effect.orDie);
    });

  return {
    ...(id !== undefined && { id }),
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    ...(syncMode !== 'eager' && {
      syncMode: 'on-demand' as const,
    }),
    sync: tanstackSync,
    startSync: syncMode === 'eager',
    utils: {
      upsert,
      schema: () => schema,
      fetch: (_partition?) => guardedFetch(fetchOnePage),
      fetchAll: (_partition?) => guardedFetch(fetchAllPages),
      isSyncing: () => syncing,
    },
    compare: compareByMeta,
    ...makeMutationHandlers<TItem, TSchema>(schema, upsert, onInsert, onUpdate),
  };
};
