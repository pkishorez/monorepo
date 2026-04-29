import type { IDBPDatabase } from 'idb';
import { Effect, Option } from 'effect';
import type { CacheEntity } from '../cache-entity.js';
import { CacheError } from '../error.js';
import type { EntityType } from '@std-toolkit/core';
import {
  DEFAULT_DB_NAME,
  STORE_NAME,
  UPDATED_INDEX,
  ConnectionPool,
  type StoredItem,
} from './internals.js';

export class IDBCacheEntity<T> implements CacheEntity<T> {
  #dbName: string;
  #name: string;
  #idField: string;

  private constructor(options: {
    dbName: string;
    name: string;
    idField: string;
  }) {
    this.#dbName = options.dbName;
    this.#name = options.name;
    this.#idField = options.idField;
  }

  get #db(): IDBPDatabase {
    const db = ConnectionPool.get(this.#dbName);
    if (!db) {
      throw new Error(`No connection for database: ${this.#dbName}`);
    }
    return db;
  }

  #makeKey(id: string): [string, string] {
    return [this.#name, id];
  }

  #getKeyRange(): IDBKeyRange {
    return IDBKeyRange.bound([this.#name, ''], [this.#name, '￿']);
  }

  static make<T>(options: {
    dbName?: string;
    name: string;
    idField: string;
  }): Effect.Effect<IDBCacheEntity<T>, CacheError> {
    const dbName = options.dbName ?? DEFAULT_DB_NAME;

    return Effect.tryPromise({
      try: async () => {
        await ConnectionPool.acquire(dbName);
        return new IDBCacheEntity<T>({
          dbName,
          name: options.name,
          idField: options.idField,
        });
      },
      catch: (cause) =>
        CacheError.openFailed('Failed to open cache entity', cause),
    });
  }

  static destroyAllDatabases(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => ConnectionPool.destroyAll(),
      catch: (cause) =>
        CacheError.clearFailed('Failed to destroy all databases', cause),
    });
  }

  put(item: EntityType<T>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const id = String(
          (item.value as Record<string, unknown>)[this.#idField],
        );
        const stored: StoredItem = {
          key: this.#makeKey(id),
          updatedKey: [this.#name, item.meta._u],
          value: item.value,
          meta: item.meta,
        };
        return this.#db.put(STORE_NAME, stored);
      },
      catch: (cause) => CacheError.putFailed('Failed to put item', cause),
    }).pipe(Effect.asVoid);
  }

  get(id: string): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const item: StoredItem | undefined = await this.#db.get(
          STORE_NAME,
          this.#makeKey(id),
        );

        if (!item) return Option.none();

        return Option.some({
          value: item.value as T,
          meta: item.meta,
        });
      },
      catch: (cause) => CacheError.getFailed('Failed to get item', cause),
    });
  }

  getAll(): Effect.Effect<EntityType<T>[], CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const items: StoredItem[] = await this.#db.getAll(
          STORE_NAME,
          this.#getKeyRange(),
        );

        return items.map((item) => ({
          value: item.value as T,
          meta: item.meta,
        }));
      },
      catch: (cause) => CacheError.getFailed('Failed to get all items', cause),
    });
  }

  getLatest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index(UPDATED_INDEX);
        const cursor = await index.openCursor(this.#getKeyRange(), 'prev');

        if (!cursor) return Option.none();

        const item = cursor.value as StoredItem;
        return Option.some({
          value: item.value as T,
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get latest item', cause),
    });
  }

  getOldest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index(UPDATED_INDEX);
        const cursor = await index.openCursor(this.#getKeyRange(), 'next');

        if (!cursor) return Option.none();

        const item = cursor.value as StoredItem;
        return Option.some({
          value: item.value as T,
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get oldest item', cause),
    });
  }

  delete(id: string): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => this.#db.delete(STORE_NAME, this.#makeKey(id)),
      catch: (cause) => CacheError.deleteFailed('Failed to delete item', cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, 'readwrite');
        let cursor = await tx.store.openCursor(this.#getKeyRange());

        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }

        await tx.done;
      },
      catch: (cause) =>
        CacheError.deleteFailed('Failed to delete all items', cause),
    });
  }
}
