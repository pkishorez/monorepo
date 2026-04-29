import { Effect } from 'effect';
import { IDBCacheEntity } from './idb-cache-entity.js';
import { IDBCacheSingleItem } from './idb-cache-single-item.js';
import { CacheError } from '../error.js';
import { ConnectionPool } from './internals.js';

export class IDBCache {
  readonly name: string;
  readonly version: number;
  #readyPromise: Promise<void> | null = null;

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  entity<T>(options: {
    name: string;
    idField: string;
  }): Effect.Effect<IDBCacheEntity<T>, CacheError> {
    return this.#ensureReady().pipe(
      Effect.flatMap(() =>
        IDBCacheEntity.make<T>({
          dbName: this.name,
          name: options.name,
          idField: options.idField,
        }),
      ),
    );
  }

  singleItem<T>(options: {
    name: string;
  }): Effect.Effect<IDBCacheSingleItem<T>, CacheError> {
    return this.#ensureReady().pipe(
      Effect.flatMap(() =>
        IDBCacheSingleItem.make<T>({
          dbName: this.name,
          name: options.name,
        }),
      ),
    );
  }

  destroy(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => ConnectionPool.destroy(this.name),
      catch: (cause) =>
        CacheError.clearFailed('Failed to destroy cache', cause),
    });
  }

  #ensureReady(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        if (!this.#readyPromise) {
          this.#readyPromise = ConnectionPool.acquire(
            this.name,
            this.version,
          ).then(() => {});
        }
        return this.#readyPromise;
      },
      catch: (cause) =>
        CacheError.openFailed('Failed to initialize IDBCache', cause),
    });
  }
}
