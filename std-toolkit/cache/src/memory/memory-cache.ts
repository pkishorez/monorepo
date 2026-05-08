import type { Effect } from 'effect';
import type { CacheStore } from '../cache-store.js';
import type { CacheEntity } from '../cache-entity.js';
import type { CacheSingleItem } from '../cache-single-item.js';
import { MemoryCacheEntity } from './memory-cache-entity.js';
import { MemoryCacheSingleItem } from './memory-cache-single-item.js';

export class MemoryCache implements CacheStore {
  entity<T>(opts: {
    name: string;
    idField: string;
  }): Effect.Effect<CacheEntity<T>, never> {
    return MemoryCacheEntity.make<T>(opts);
  }

  singleItem<T>(opts: {
    name: string;
  }): Effect.Effect<CacheSingleItem<T>, never> {
    return MemoryCacheSingleItem.make<T>(opts);
  }
}
