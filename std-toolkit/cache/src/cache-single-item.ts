import type { EntityType } from '@std-toolkit/core';
import type { Effect, Option } from 'effect';
import type { CacheError } from './error.js';

export interface CacheSingleItem<T> {
  put(item: EntityType<T>): Effect.Effect<void, CacheError>;
  get(): Effect.Effect<Option.Option<EntityType<T>>, CacheError>;
  delete(): Effect.Effect<void, CacheError>;
}
