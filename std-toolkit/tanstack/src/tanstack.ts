import {
  Collection,
  CollectionConfig,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect } from "effect";
import { EntityType, MetaSchema } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyESchema, ESchemaIdField } from "@std-toolkit/eschema";
import {
  SyncConfig,
  SyncStrategy,
  SyncMode,
  ExtractSyncMode,
  FetchDirection,
  createSubscriptionSync,
  createQuerySync,
  createCacheSync,
} from "./strategies/index.js";

export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
};

type UpsertInput<TSchema extends AnyESchema> =
  | EntityType<TSchema["Type"]>
  | EntityType<TSchema["Type"]>[];

type BaseCollectionUtils<TSchema extends AnyESchema> = {
  upsert: (item: UpsertInput<TSchema>, persist?: boolean) => void;
  schema: () => TSchema;
};

type QueryCollectionUtils<TSchema extends AnyESchema> =
  BaseCollectionUtils<TSchema> & {
    fetch: (direction: "newer" | "older") => Effect.Effect<number>;
    fetchAll: (direction: FetchDirection) => Effect.Effect<number>;
    isSyncing: () => boolean;
  };

type SubscriptionCollectionUtils<TSchema extends AnyESchema> =
  BaseCollectionUtils<TSchema>;

type CacheCollectionUtils<TSchema extends AnyESchema> =
  BaseCollectionUtils<TSchema>;

export type CollectionUtils<
  TSchema extends AnyESchema = AnyESchema,
  TMode extends SyncMode = SyncMode,
> = TMode extends "query"
  ? QueryCollectionUtils<TSchema>
  : TMode extends "subscription"
    ? SubscriptionCollectionUtils<TSchema>
    : CacheCollectionUtils<TSchema>;

interface StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyESchema,
  TConfig extends SyncConfig<TItem>,
> {
  schema: TSchema;
  cache?: CacheEntity<TItem>;
  sync: (value: {
    collection: Collection<
      CollectionItem<TItem>,
      string,
      CollectionUtils<TSchema, ExtractSyncMode<TConfig>>,
      TSchema,
      object
    >;
    onReady: () => void;
  }) => TConfig;
  onInsert: (
    item: Omit<TItem, ESchemaIdField<TSchema>>,
  ) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EntityType<TItem>>;
}

export const stdCollectionOptions = <
  TSchema extends AnyESchema,
  TConfig extends SyncConfig<TSchema["Type"]>,
>(
  options: StdCollectionConfig<TSchema["Type"], TSchema, TConfig>,
): CollectionConfig<
  CollectionItem<TSchema["Type"]>,
  string,
  TSchema,
  CollectionUtils<TSchema, ExtractSyncMode<TConfig>>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  type TCollectionItem = CollectionItem<TItem>;

  const {
    onInsert,
    cache = new MemoryCacheEntity(options.schema),
    onUpdate,
    sync,
    schema,
  } = options;

  let strategy: SyncStrategy | null = null;
  let applyToCollection:
    | ((items: EntityType<TItem>[], persist?: boolean) => void)
    | null = null;

  const createApplyToCollection = (
    params: Parameters<TanstackSyncConfig<TCollectionItem, string>["sync"]>[0],
  ) => {
    const { begin, collection, commit, write } = params;

    return (items: EntityType<TItem>[], persist = false) => {
      begin();
      for (const item of items) {
        const key = collection.getKeyFromItem(item.value as TCollectionItem);
        const itemValue = {
          ...item.value,
          _meta: item.meta,
        } as TCollectionItem;

        if (persist) {
          Effect.runPromise(cache.put(item));
        }

        if (collection.has(key)) {
          if (item.meta._d) {
            write({ type: "delete", key });
          } else {
            write({ type: "update", value: itemValue });
          }
        } else if (!item.meta._d) {
          write({ type: "insert", value: itemValue });
        }
      }
      commit();
    };
  };

  const createStrategy = (
    syncConfig: SyncConfig<TItem>,
    context: Parameters<typeof createQuerySync<TItem>>[1],
  ): SyncStrategy => {
    switch (syncConfig.mode) {
      case "subscription":
        return createSubscriptionSync(syncConfig, context);
      case "query":
        return createQuerySync(syncConfig, context);
      case "cache":
        return createCacheSync(syncConfig, context);
    }
  };

  const tanstackSync: TanstackSyncConfig<TCollectionItem, string> = {
    sync: (params) => {
      const { collection, markReady } = params;
      applyToCollection = createApplyToCollection(params);

      const syncConfig = sync({
        collection,
        onReady: markReady,
      });

      strategy = createStrategy(syncConfig, {
        cache,
        applyToCollection,
        markReady,
      });

      Effect.runPromise(strategy.initialize());

      return strategy.cleanup;
    },
  };

  type TMode = ExtractSyncMode<TConfig>;
  type Utils = CollectionUtils<TSchema, TMode>;

  const upsert = (input: UpsertInput<TSchema>, persist?: boolean) => {
    const items = Array.isArray(input) ? input : [input];
    applyToCollection?.(items, persist);
  };

  const baseUtils: BaseCollectionUtils<TSchema> = {
    upsert,
    schema: () => schema,
  };

  const queryUtils: QueryCollectionUtils<TSchema> = {
    ...baseUtils,
    fetch: (direction) => {
      if (!strategy) {
        return Effect.succeed(0);
      }
      return strategy.fetch(direction).pipe(Effect.orDie);
    },
    fetchAll: (direction) => {
      if (!strategy) {
        return Effect.succeed(0);
      }
      return strategy.fetchAll(direction).pipe(Effect.orDie);
    },
    isSyncing: () => {
      if (!strategy) {
        return false;
      }
      return strategy.isSyncing();
    },
  };

  const utils = queryUtils as Utils;

  return {
    schema: schema["~standard"] ? schema : (undefined as any),
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    sync: tanstackSync,
    utils,
    compare: (x, y) => (x._meta!._uid < y._meta!._uid ? -1 : 1),
    onInsert: async ({ transaction }) => {
      const { changes } = transaction.mutations[0]!;
      const result = await Effect.runPromise(onInsert(changes as TItem));
      upsert(result);
    },
    onUpdate: async ({ transaction }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0]!;
      const payload = {
        [schema.idField]: key,
        updates: changes,
      } as {
        [K in ESchemaIdField<TSchema>]: string;
      } & {
        updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
      };
      const result = await Effect.runPromise(onUpdate(payload));
      upsert(result);
    },
  };
};
