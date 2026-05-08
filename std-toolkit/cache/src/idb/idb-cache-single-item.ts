import type { IDBPDatabase } from 'idb';
import { Effect, Option } from 'effect';
import type { SingleEntityType } from '@std-toolkit/core';
import type { CacheSingleItem } from '../cache-single-item.js';
import { CacheError } from '../error.js';
import {
  DEFAULT_DB_NAME,
  STORE_NAME,
  ConnectionPool,
  type StoredItem,
} from './internals.js';

const SINGLETON_ID = '__singleton__';

export class IDBCacheSingleItem<T> implements CacheSingleItem<T> {
  #dbName: string;
  #name: string;

  private constructor(options: { dbName: string; name: string }) {
    this.#dbName = options.dbName;
    this.#name = options.name;
  }

  get #db(): IDBPDatabase {
    const db = ConnectionPool.get(this.#dbName);
    if (!db) {
      throw new Error(`No connection for database: ${this.#dbName}`);
    }
    return db;
  }

  get #key(): [string, string] {
    return [this.#name, SINGLETON_ID];
  }

  static make<T>(options: {
    dbName?: string;
    name: string;
  }): Effect.Effect<IDBCacheSingleItem<T>, CacheError> {
    const dbName = options.dbName ?? DEFAULT_DB_NAME;

    return Effect.tryPromise({
      try: async () => {
        await ConnectionPool.acquire(dbName);
        return new IDBCacheSingleItem<T>({
          dbName,
          name: options.name,
        });
      },
      catch: (cause) =>
        CacheError.openFailed('Failed to open cache single item', cause),
    });
  }

  put(item: SingleEntityType<T>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const stored: StoredItem = {
          key: this.#key,
          updatedKey: [this.#name, item.meta._u],
          value: item.value,
          meta: { ...item.meta, _d: false },
        };
        return this.#db.put(STORE_NAME, stored);
      },
      catch: (cause) =>
        CacheError.putFailed('Failed to put single item', cause),
    }).pipe(Effect.asVoid);
  }

  get(): Effect.Effect<Option.Option<SingleEntityType<T>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const item: StoredItem | undefined = await this.#db.get(
          STORE_NAME,
          this.#key,
        );

        if (!item) return Option.none();

        return Option.some({
          value: item.value as T,
          meta: { _v: item.meta._v, _e: item.meta._e, _u: item.meta._u },
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get single item', cause),
    });
  }

  delete(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => this.#db.delete(STORE_NAME, this.#key),
      catch: (cause) =>
        CacheError.deleteFailed('Failed to delete single item', cause),
    });
  }
}
