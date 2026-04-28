import type { EntityType } from '@std-toolkit/core';
import type { Effect, Option } from 'effect';
import type { CacheError } from './error.js';
import type { AnySingleEntityESchema } from '@std-toolkit/eschema';

/**
 * Subset of an `AnySingleEntityESchema` that the single-item cache cares
 * about. Includes `Encoded` so cache rows are typed as the encoded shape.
 */
export type CacheSingleItemSchemaType = Pick<
  AnySingleEntityESchema,
  'name' | 'Type' | 'Encoded'
>;

/**
 * Single-item cache contract — `T` is the **encoded** shape of the entity
 * (`ESchemaEncoded<S>`). Decoding happens at the collection boundary.
 */
export interface CacheSingleItem<T> {
  put(item: EntityType<T>): Effect.Effect<void, CacheError>;
  get(): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  delete(): Effect.Effect<void, CacheError>;
}
