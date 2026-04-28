import {
  CollectionConfig,
  type SingleResult,
  type SyncConfigRes,
  SyncConfig as TanstackSyncConfig,
} from '@tanstack/react-db';
import { Effect, Option, SubscriptionRef } from 'effect';
import { EntityType } from '@std-toolkit/core';
import {
  AnySingleEntityESchema,
  ESchemaEncoded,
  ESchemaType,
} from '@std-toolkit/eschema';
import type { CacheSingleItem } from '@std-toolkit/cache';
import { CollectionItem, SingleItemUtils } from '../types.js';
import { makeWithSyncGuard } from './shared.js';
import { decodeRow } from './codec.js';

type EncodedItem<TSchema extends AnySingleEntityESchema> = EntityType<
  ESchemaEncoded<TSchema>
>;

interface StdSingleItemConfig<TSchema extends AnySingleEntityESchema> {
  id?: string;
  schema: TSchema;
  get: () => Effect.Effect<EncodedItem<TSchema>>;
  onUpdate?: (payload: {
    updates: ESchemaType<TSchema>;
  }) => Effect.Effect<EncodedItem<TSchema>>;
  cache?: Effect.Effect<CacheSingleItem<ESchemaEncoded<TSchema>>>;
}

export const stdSingleItemOptions = <TSchema extends AnySingleEntityESchema>(
  options: StdSingleItemConfig<TSchema>,
): Omit<
  CollectionConfig<
    CollectionItem<ESchemaType<TSchema>>,
    string,
    never,
    SingleItemUtils<TSchema>
  >,
  'schema'
> &
  SingleResult => {
  type TItem = ESchemaType<TSchema>;
  type TCollectionItem = CollectionItem<TItem>;
  type TEncoded = ESchemaEncoded<TSchema>;

  const { id, get, onUpdate, schema, cache: cacheEffect } = options;
  const singletonKey = schema.name;

  const syncing = Effect.runSync(SubscriptionRef.make(false));
  const semaphore = Effect.runSync(Effect.makeSemaphore(1));
  const withSyncGuard = makeWithSyncGuard(syncing, semaphore);

  let applyToCollection: ((item: EncodedItem<TSchema>) => void) | null = null;
  let resolvedCache: CacheSingleItem<TEncoded> | null = null;

  const upsert = (item: EncodedItem<TSchema>, persist?: boolean) => {
    applyToCollection?.(item);
    if (persist && resolvedCache) {
      Effect.runPromise(
        Effect.catchAll(resolvedCache.put(item), () => Effect.void),
      ).catch(() => {});
    }
  };

  const createApplyToCollection = (
    params: Parameters<TanstackSyncConfig<TCollectionItem, string>['sync']>[0],
  ) => {
    const { begin, collection, commit, write } = params;

    return (item: EncodedItem<TSchema>) => {
      const itemValue = decodeRow(schema, item) as TCollectionItem;
      begin({ immediate: true });
      if (collection.has(singletonKey)) {
        write({ type: 'update', value: itemValue });
      } else {
        write({ type: 'insert', value: itemValue });
      }
      commit();
    };
  };

  const fetchItem = Effect.gen(function* () {
    const item = yield* get();
    if (resolvedCache) {
      yield* Effect.catchAll(resolvedCache.put(item), () => Effect.void);
    }
    applyToCollection?.(item);
  });

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { markReady } = params;

      const initEffect = Effect.gen(function* () {
        applyToCollection = createApplyToCollection(params);

        if (cacheEffect) {
          resolvedCache = yield* Effect.catchAll(cacheEffect, () =>
            Effect.succeed(null as CacheSingleItem<TEncoded> | null),
          );
          const cached = resolvedCache
            ? yield* Effect.catchAll(resolvedCache.get(), () =>
                Effect.succeed(Option.none<EncodedItem<TSchema>>()),
              )
            : Option.none<EncodedItem<TSchema>>();
          if (Option.isSome(cached)) {
            applyToCollection(cached.value);
            markReady();
          }
        }

        markReady();
        yield* withSyncGuard(fetchItem);
        markReady();
      });

      const cancel = Effect.runCallback(initEffect);

      const cleanup = () => {
        cancel();
        Effect.runSync(SubscriptionRef.set(syncing, false));
        applyToCollection = null;
        resolvedCache = null;
      };

      return { cleanup } satisfies SyncConfigRes;
    },
  };

  return {
    ...(id !== undefined && { id }),
    singleResult: true as const,
    getKey: () => singletonKey,
    sync: tanstackSync,
    utils: {
      upsert,
      schema: () => schema,
      refetch: () => withSyncGuard(fetchItem).pipe(Effect.orDie),
      isSyncing: () => syncing,
    } satisfies SingleItemUtils<TSchema>,
    onUpdate: async ({ transaction }) => {
      if (transaction.error) {
        console.error(transaction);
      }
      if (!onUpdate) return;
      const { modified } = transaction.mutations[0]!;
      const result = await Effect.runPromise(
        onUpdate({ updates: modified as TItem }),
      );
      if (resolvedCache) {
        await Effect.runPromise(
          Effect.catchAll(resolvedCache.put(result), () => Effect.void),
        );
      }
      applyToCollection?.(result);
    },
  };
};
