import {
  Collection,
  CollectionConfig,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyESchema, ESchemaIdField } from "@std-toolkit/eschema";
import {
  SyncConfig,
  SyncStrategy,
  SyncMode,
  ExtractSyncMode,
  createSubscriptionSync,
  createQuerySync,
} from "./strategies/index.js";

type BaseCollectionUtils<TSchema extends AnyESchema> = {
  upsert: (item: EntityType<TSchema["Type"]>, persist?: boolean) => void;
  schema: () => TSchema;
};

type QueryCollectionUtils<TSchema extends AnyESchema> =
  BaseCollectionUtils<TSchema> & {
    syncLatest: () => Effect.Effect<EntityType<TSchema["Type"]> | null>;
    loadOlder: () => Effect.Effect<EntityType<TSchema["Type"]>[]>;
  };

type SubscriptionCollectionUtils<TSchema extends AnyESchema> =
  BaseCollectionUtils<TSchema>;

export type CollectionUtils<
  TSchema extends AnyESchema = AnyESchema,
  TMode extends SyncMode = SyncMode,
> = TMode extends "query"
  ? QueryCollectionUtils<TSchema>
  : SubscriptionCollectionUtils<TSchema>;

interface StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyESchema,
  TConfig extends SyncConfig<TItem>,
> {
  schema: TSchema;
  cache?: CacheEntity<TItem>;
  sync: (value: {
    collection: Collection<
      TItem,
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
  TSchema["Type"],
  string,
  TSchema,
  CollectionUtils<TSchema, ExtractSyncMode<TConfig>>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];

  const {
    onInsert,
    cache = new MemoryCacheEntity(options.schema),
    onUpdate,
    sync,
    schema,
  } = options;

  let strategy: SyncStrategy<TItem> | null = null;
  let applyToCollection: ((items: EntityType<TItem>[], persist?: boolean) => void) | null = null;

  const createApplyToCollection = (
    params: Parameters<TanstackSyncConfig<TItem, string>["sync"]>[0],
  ) => {
    const { begin, collection, commit, write } = params;

    return (items: EntityType<TItem>[], persist = false) => {
      begin();
      for (const item of items) {
        const key = collection.getKeyFromItem(item.value as TItem);
        const itemValue = { ...item.value, _uid: item.meta._uid } as TItem;

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

  const tanstackSync: TanstackSyncConfig<TItem, string> = {
    sync: (params) => {
      const { collection, markReady } = params;
      applyToCollection = createApplyToCollection(params);

      const syncConfig = sync({
        collection,
        onReady: markReady,
      });

      strategy =
        syncConfig.mode === "subscription"
          ? createSubscriptionSync(syncConfig, {
              cache,
              applyToCollection,
              markReady,
            })
          : createQuerySync(syncConfig, { cache, applyToCollection, markReady });

      Effect.runPromise(strategy.initialize());

      return strategy.cleanup;
    },
  };

  type TMode = ExtractSyncMode<TConfig>;
  type Utils = CollectionUtils<TSchema, TMode>;

  const baseUtils: BaseCollectionUtils<TSchema> = {
    upsert: (item, persist) => {
      applyToCollection?.([item], persist);
    },
    schema: () => schema,
  };

  const queryUtils: QueryCollectionUtils<TSchema> = {
    ...baseUtils,
    syncLatest: () => {
      if (!strategy) {
        return Effect.succeed(null);
      }
      return strategy.syncLatest().pipe(Effect.orDie);
    },
    loadOlder: () => {
      if (!strategy) {
        return Effect.succeed([]);
      }
      return strategy.loadOlder().pipe(Effect.orDie);
    },
  };

  const utils = queryUtils as Utils;

  return {
    schema,
    getKey: (item: TItem) => item[schema.idField as keyof TItem] as string,
    sync: tanstackSync,
    utils,
    compare: (x, y) =>
      (x as TItem & { _uid: string })._uid <
      (y as TItem & { _uid: string })._uid
        ? -1
        : 1,
    onInsert: async ({ transaction }) => {
      const { changes } = transaction.mutations[0]!;
      const result = await Effect.runPromise(onInsert(changes as TItem));
      utils.upsert(result);
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
      utils.upsert(result);
    },
  };
};
