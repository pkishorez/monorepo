import type { EntityType } from '@std-toolkit/core';
import type { Effect, Option } from 'effect';
import type { CacheError } from './error.js';
import { AnyEntityESchema } from '@std-toolkit/eschema';

/**
 * Subset of an `EntityESchema` that the cache implementations rely on:
 * `name` and `idField` for partitioning and key derivation, plus the
 * `Encoded` shape (cache stores the JSON-safe encoded form).
 */
export type CacheSchemaType = Pick<
  AnyEntityESchema,
  'name' | 'idField' | 'Type' | 'Encoded'
>;

/**
 * Cache contract — `T` is the **encoded** shape of the entity
 * (`ESchemaEncoded<S>`). Cache rows are JSON-safe so they can persist
 * across reloads (IDB structured clone, memory) without losing transform
 * fidelity. Decoding happens at the collection boundary, not here.
 */
export interface CacheEntity<T> {
  put(item: EntityType<T>): Effect.Effect<void, CacheError>;
  get(id: string): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  getAll(): Effect.Effect<EntityType<T>[], CacheError>;
  getLatest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  getOldest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  delete(id: string): Effect.Effect<void, CacheError>;
  deleteAll(): Effect.Effect<void, CacheError>;
}
