import type { EntityType } from "@std-toolkit/core";
import type { Effect, Option } from "effect";
import type { CacheError } from "./error.js";
import { AnyESchema } from "@std-toolkit/eschema";

export type CacheSchemaType = Pick<AnyESchema, "name" | "idField" | "Type">;

export interface CacheEntity<T> {
  put(item: EntityType<T>): Effect.Effect<void, CacheError>;
  get(id: string): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  getAll(): Effect.Effect<EntityType<T>[], CacheError>;
  getLatest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  getOldest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  delete(id: string): Effect.Effect<void, CacheError>;
  deleteAll(): Effect.Effect<void, CacheError>;
}
