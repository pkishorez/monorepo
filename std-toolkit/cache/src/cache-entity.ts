import type { EntityType } from "@std-toolkit/core";
import type { Effect, Option } from "effect";
import type { CacheError } from "./error.js";

export interface CacheEntity<T> {
  put(item: EntityType<T>): Effect.Effect<void, CacheError>;
  get(id: string): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  getAll(): Effect.Effect<EntityType<T>[], CacheError>;
  delete(id: string): Effect.Effect<void, CacheError>;
  deleteAll(): Effect.Effect<void, CacheError>;
}
