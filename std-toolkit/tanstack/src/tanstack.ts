import {
  Collection,
  CollectionConfig,
  SyncConfig as TanstackSyncConfig,
} from "@tanstack/react-db";
import { Effect } from "effect";
import { EntityType, MetaSchema } from "@std-toolkit/core";
import { CacheEntity, serializePartition } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyESchema, ESchemaIdField } from "@std-toolkit/eschema";
import {
  SyncConfig,
  SyncStrategy,
  SyncMode,
  ExtractSyncMode,
  FetchDirection,
  SyncTypeFactory,
  SyncHandle,
  ExtractSyncParams,
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

type SyncMethodUtils<
  TItem extends object,
  TSyncs extends Record<string, SyncTypeFactory<TItem>>,
> = [keyof TSyncs] extends [never]
  ? {}
  : {
      sync: <K extends keyof TSyncs & string>(
        name: K,
        params: ExtractSyncParams<TSyncs[K]>,
      ) => SyncHandle;
    };

export type CollectionUtils<
  TSchema extends AnyESchema = AnyESchema,
  TMode extends SyncMode = SyncMode,
  TSyncs extends Record<string, SyncTypeFactory<TSchema["Type"]>> = {},
> = (TMode extends "query"
  ? QueryCollectionUtils<TSchema>
  : TMode extends "subscription"
    ? SubscriptionCollectionUtils<TSchema>
    : CacheCollectionUtils<TSchema>) &
  SyncMethodUtils<TSchema["Type"], TSyncs>;

interface StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyESchema,
  TConfig extends SyncConfig<TItem>,
  TSyncs extends Record<string, SyncTypeFactory<TItem>> = {},
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
  syncs?: TSyncs;
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
  TSyncs extends Record<string, SyncTypeFactory<TSchema["Type"]>> = {},
>(
  options: StdCollectionConfig<TSchema["Type"], TSchema, TConfig, TSyncs>,
): CollectionConfig<
  CollectionItem<TSchema["Type"]>,
  string,
  TSchema,
  CollectionUtils<TSchema, ExtractSyncMode<TConfig>, TSyncs>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  type TCollectionItem = CollectionItem<TItem>;

  const {
    onInsert,
    cache: providedCache,
    onUpdate,
    sync,
    syncs: syncFactories,
    schema,
  } = options;

  const cache = providedCache ?? Effect.runSync(MemoryCacheEntity.make({ eschema: schema }));

  let strategy: SyncStrategy | null = null;
  let applyToCollection:
    | ((items: EntityType<TItem>[], persist?: boolean) => void)
    | null = null;

  const syncInstances = new Map<
    string,
    { strategy: SyncStrategy; handle: SyncHandle }
  >();

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

      return () => {
        strategy?.cleanup?.();
        for (const { strategy: s } of syncInstances.values()) {
          s.cleanup?.();
        }
        syncInstances.clear();
      };
    },
  };

  type TMode = ExtractSyncMode<TConfig>;
  type Utils = CollectionUtils<TSchema, TMode, TSyncs>;

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

  const syncMethod = syncFactories
    ? <K extends keyof TSyncs & string>(
        name: K,
        params: ExtractSyncParams<TSyncs[K]>,
      ): SyncHandle => {
        const key = `${name}#${serializePartition(params as Record<string, string>)}`;

        const existing = syncInstances.get(key);
        if (existing) return existing.handle;

        const factory = syncFactories[name]!;
        const config = factory(params);
        const scopedCache = config.cache ?? Effect.runSync(MemoryCacheEntity.make({ eschema: schema }));

        const scopedApply = (items: EntityType<TItem>[]) => {
          applyToCollection?.(items, false);
        };

        const scopedStrategy = createQuerySync(
          { mode: "query", getMore: config.getMore },
          {
            cache: scopedCache,
            applyToCollection: scopedApply,
            markReady: () => {},
          },
        );

        const handle: SyncHandle = {
          fetch: (direction) =>
            scopedStrategy.fetch(direction).pipe(Effect.orDie),
          fetchAll: (direction) =>
            scopedStrategy.fetchAll(direction).pipe(Effect.orDie),
          isSyncing: () => scopedStrategy.isSyncing(),
          dispose: () => {
            scopedStrategy.cleanup?.();
            syncInstances.delete(key);
          },
        };

        syncInstances.set(key, { strategy: scopedStrategy, handle });
        return handle;
      }
    : undefined;

  const utils = {
    ...queryUtils,
    ...(syncMethod ? { sync: syncMethod } : {}),
  } as unknown as Utils;

  return {
    schema: schema["~standard"] ? schema : (undefined as any),
    getKey: (item: TCollectionItem) =>
      item[schema.idField as keyof TCollectionItem] as string,
    sync: tanstackSync,
    utils,
    compare: (x, y) => {
      const xUid = x?._meta?._uid ?? "";
      const yUid = y?._meta?._uid ?? "";
      return xUid < yUid ? -1 : 1;
    },
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
