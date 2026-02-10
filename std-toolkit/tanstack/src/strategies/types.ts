import { Effect } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity, CacheError } from "@std-toolkit/cache";

export type SubscriptionSyncConfig<TItem extends object> = {
  mode: "subscription";
  effect: (latest: EntityType<TItem> | null) => Effect.Effect<void>;
  onCleanup?: () => void;
};

export type QuerySyncConfig<TItem extends object> = {
  mode: "query";
  orderBy?: keyof TItem | "_uid";
  getMore: (
    operator: "<" | ">",
    cursor: EntityType<TItem> | null,
  ) => Effect.Effect<EntityType<TItem>[]>;
};

export type CacheConfig = {
  mode: "cache";
};

export type SyncConfig<TItem extends object> =
  | SubscriptionSyncConfig<TItem>
  | QuerySyncConfig<TItem>
  | CacheConfig;

export type SyncMode = "query" | "subscription" | "cache";

export type ExtractSyncMode<T> = T extends { mode: infer M extends SyncMode }
  ? M
  : never;

export type FetchDirection = "newer" | "older" | "both";

export interface SyncStrategy {
  initialize(): Effect.Effect<void, CacheError>;
  fetch(direction: "newer" | "older"): Effect.Effect<number, CacheError>;
  fetchAll(direction: FetchDirection): Effect.Effect<number, CacheError>;
  isSyncing(): boolean;
  cleanup?: (() => void) | undefined;
}

export interface SyncContext<TItem extends object> {
  cache: CacheEntity<TItem>;
  applyToCollection: (items: EntityType<TItem>[], persist?: boolean) => void;
  markReady: () => void;
}

export type SyncTypeFactory<TItem extends object, TParams = any> = (
  params: TParams,
) => {
  cache?: CacheEntity<TItem>;
  getMore: (
    operator: "<" | ">",
    cursor: EntityType<TItem> | null,
  ) => Effect.Effect<EntityType<TItem>[]>;
};

export interface SyncHandle {
  fetch: (direction: "newer" | "older") => Effect.Effect<number>;
  fetchAll: (direction: FetchDirection) => Effect.Effect<number>;
  isSyncing: () => boolean;
  dispose: () => void;
}

export type ExtractSyncParams<T> =
  T extends (params: infer P) => any ? P : never;
