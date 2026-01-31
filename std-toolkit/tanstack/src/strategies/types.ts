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
  onCleanup?: () => void;
};

export type SyncConfig<TItem extends object> =
  | SubscriptionSyncConfig<TItem>
  | QuerySyncConfig<TItem>;

export type SyncMode = "query" | "subscription";

export type ExtractSyncMode<T> = T extends { mode: infer M extends SyncMode }
  ? M
  : never;

export interface SyncStrategy<TItem extends object> {
  initialize(): Effect.Effect<void, CacheError>;
  syncLatest(): Effect.Effect<EntityType<TItem> | null, CacheError>;
  loadOlder(): Effect.Effect<EntityType<TItem>[], CacheError>;
  cleanup?: (() => void) | undefined;
}

export interface SyncContext<TItem extends object> {
  cache: CacheEntity<TItem>;
  applyToCollection: (items: EntityType<TItem>[], persist?: boolean) => void;
  markReady: () => void;
}
