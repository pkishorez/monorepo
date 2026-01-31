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
