import type {
  CollectionConfig,
  SingleResult,
  VirtualRowProps,
} from '@tanstack/react-db';
import type { Effect, Scope } from 'effect';
import type {
  EntityType,
  SingleEntityType,
  MetaSchema,
} from '@std-toolkit/core';
import type { CacheStore } from '@std-toolkit/cache';
import type {
  AnyEntityESchema,
  AnySingleEntityESchema,
  ESchemaIdField,
} from '@std-toolkit/eschema';

// Virtual props ($synced, $origin, ...) are added at runtime by @tanstack/db on
// every read, but the `useLiveQuery(() => collection)` overload types `data` as
// the bare row type and drops them. The collection here is created without a
// StandardSchema, so input and output share one row type — hence the props are
// declared optional, surfacing on reads without being required on writes.
export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
} & Partial<VirtualRowProps<string>>;

export type QueryContext<TItem extends object> = {
  getCursor: Effect.Effect<EntityType<TItem> | null>;
};

export type SubscribeContext<TItem extends object> = {
  getCursor: Effect.Effect<EntityType<TItem> | null>;
  push: (items: EntityType<TItem>[], options?: { persist?: boolean }) => void;
  onInitialSyncDone: () => void;
};

export type StdCollectionOptions = Omit<
  CollectionConfig<any, string>,
  | 'id'
  | 'getKey'
  | 'schema'
  | 'syncMode'
  | 'sync'
  | 'onInsert'
  | 'onUpdate'
  | 'onDelete'
  | 'utils'
>;

export type UpdatePayload<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = {
  [K in ESchemaIdField<TSchema>]: string;
} & {
  updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
};

export interface TotalSyncConfig<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> {
  schema: TSchema;
  cache?: CacheStore;
  options?: StdCollectionOptions;
  fetchOnMount?: boolean;
  query?: (ctx: QueryContext<TItem>) => Effect.Effect<EntityType<TItem>[]>;
  subscribe?: (
    ctx: SubscribeContext<TItem>,
  ) => Effect.Effect<void, never, Scope.Scope>;
  onInsert?: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: UpdatePayload<TItem, TSchema>,
  ) => Effect.Effect<EntityType<TItem>>;
  onDelete?: (id: string) => Effect.Effect<void>;
}

export type OnDemandQueries<TItem extends object> = {
  [K in keyof TItem]?: {
    query?: (
      value: TItem[K],
      ctx: QueryContext<TItem>,
    ) => Effect.Effect<EntityType<TItem>[]>;
    subscribe?: (
      value: TItem[K],
      ctx: SubscribeContext<TItem>,
    ) => Effect.Effect<void, never, Scope.Scope>;
  };
};

export interface OnDemandConfig<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> {
  schema: TSchema;
  cache?: CacheStore;
  options?: StdCollectionOptions;
  fetchOnMount?: boolean;
  queries: OnDemandQueries<TItem>;
  onInsert?: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: UpdatePayload<TItem, TSchema>,
  ) => Effect.Effect<EntityType<TItem>>;
  onDelete?: (id: string) => Effect.Effect<void>;
}

export interface SingleItemConfig<
  TItem extends object,
  TSchema extends AnySingleEntityESchema,
> {
  schema: TSchema;
  cache?: CacheStore;
  options?: StdCollectionOptions;
  get: () => Effect.Effect<SingleEntityType<TItem>>;
  onUpdate?: (payload: {
    updates: TItem;
  }) => Effect.Effect<SingleEntityType<TItem>>;
}

export type StdCollectionUtils<
  TItem extends object = Record<string, unknown>,
  TSchema extends AnyEntityESchema = AnyEntityESchema,
> = {
  upsert: (item: EntityType<TItem> | EntityType<TItem>[]) => void;
  remove: (keys: string | string[]) => void;
  schema: () => TSchema;
  fetchMore: () => Effect.Effect<number>;
};

export type StdPartitionedUtils<
  TItem extends object = Record<string, unknown>,
  TSchema extends AnyEntityESchema = AnyEntityESchema,
> = {
  upsert: (item: EntityType<TItem> | EntityType<TItem>[]) => void;
  remove: (keys: string | string[]) => void;
  schema: () => TSchema;
  fetchMore: (partition: Partial<TItem>) => Effect.Effect<number>;
};

export type StdSingleItemUtils<
  TItem extends object = Record<string, unknown>,
  TSchema extends AnySingleEntityESchema = AnySingleEntityESchema,
> = {
  upsert: (item: SingleEntityType<TItem>) => void;
  refresh: () => Effect.Effect<SingleEntityType<TItem>>;
  schema: () => TSchema;
};

export type TotalSyncResult<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = CollectionConfig<
  CollectionItem<TItem>,
  string,
  never,
  StdCollectionUtils<TItem, TSchema>
> & {
  utils: StdCollectionUtils<TItem, TSchema>;
};

export type OnDemandResult<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = CollectionConfig<
  CollectionItem<TItem>,
  string,
  never,
  StdPartitionedUtils<TItem, TSchema>
> & {
  utils: StdPartitionedUtils<TItem, TSchema>;
};

export type SingleItemResult<
  TItem extends object,
  TSchema extends AnySingleEntityESchema,
> = CollectionConfig<
  CollectionItem<TItem>,
  string,
  never,
  StdSingleItemUtils<TItem, TSchema>
> &
  SingleResult & {
    utils: StdSingleItemUtils<TItem, TSchema>;
  };

export interface StdSync {
  totalSync: <TSchema extends AnyEntityESchema>(
    config: TotalSyncConfig<TSchema['Type'], TSchema>,
  ) => TotalSyncResult<TSchema['Type'], TSchema>;
  onDemand: <TSchema extends AnyEntityESchema>(
    config: OnDemandConfig<TSchema['Type'], TSchema>,
  ) => OnDemandResult<TSchema['Type'], TSchema>;
  singleItem: <TSchema extends AnySingleEntityESchema>(
    config: SingleItemConfig<TSchema['Type'], TSchema>,
  ) => SingleItemResult<TSchema['Type'], TSchema>;
  registry: () => CollectionRegistry;
}

export type CollectionRef = {
  utils: {
    upsert: (item: EntityType<any> | EntityType<any>[]) => void;
    remove?: (keys: string | string[]) => void;
    schema: () => AnyEntityESchema | AnySingleEntityESchema;
  };
};

export interface CollectionRegistry {
  process: (message: unknown) => void;
}
