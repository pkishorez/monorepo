import type { Effect } from 'effect';
import type { CacheEntity } from './cache-entity.js';
import type { CacheSingleItem } from './cache-single-item.js';
import type { CacheError } from './error.js';

export interface CacheStore {
  entity<T>(opts: {
    name: string;
    idField: string;
  }): Effect.Effect<CacheEntity<T>, CacheError>;
  singleItem<T>(opts: {
    name: string;
  }): Effect.Effect<CacheSingleItem<T>, CacheError>;
}
