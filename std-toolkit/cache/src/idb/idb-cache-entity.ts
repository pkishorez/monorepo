import type { IDBPDatabase } from 'idb';
import { Effect, Option } from 'effect';
import type { CacheEntity, CacheSchemaType } from '../cache-entity.js';
import type { PartitionKey } from './utils.js';
import { serializePartition } from './utils.js';
import { CacheError } from '../error.js';
import type { EntityType } from '@std-toolkit/core';
import {
  DEFAULT_DB_NAME,
  STORE_NAME,
  UPDATED_INDEX,
  ConnectionPool,
  type StoredItem,
} from './internals.js';

export class IDBCacheEntity<
  TSchema extends CacheSchemaType,
> implements CacheEntity<TSchema['Type']> {
  #dbName: string;
  #entity: string;
  #partition: string;
  #eschema: TSchema;

  private constructor(options: {
    dbName: string;
    entity: string;
    partition: string;
    eschema: TSchema;
  }) {
    this.#dbName = options.dbName;
    this.#entity = options.entity;
    this.#partition = options.partition;
    this.#eschema = options.eschema;
  }

  get #db(): IDBPDatabase {
    const db = ConnectionPool.get(this.#dbName);
    if (!db) {
      throw new Error(`No connection for database: ${this.#dbName}`);
    }
    return db;
  }

  #makeKey(id: string): [string, string, string] {
    return [this.#entity, this.#partition, id];
  }

  #getKeyRange(): IDBKeyRange {
    return IDBKeyRange.bound(
      [this.#entity, this.#partition, ''],
      [this.#entity, this.#partition, '\uffff'],
    );
  }

  static make<TSchema extends CacheSchemaType>(options: {
    name?: string;
    eschema: TSchema;
    partition?: PartitionKey;
  }): Effect.Effect<IDBCacheEntity<TSchema>, CacheError> {
    const dbName = options.name ?? DEFAULT_DB_NAME;
    const partition = serializePartition(options.partition);

    return Effect.tryPromise({
      try: async () => {
        await ConnectionPool.acquire(dbName);
        return new IDBCacheEntity({
          dbName,
          entity: options.eschema.name,
          partition,
          eschema: options.eschema,
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

  put(item: EntityType<TSchema['Type']>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);
        const stored: StoredItem = {
          key: this.#makeKey(id),
          updatedKey: [this.#entity, this.#partition, item.meta._u],
          value: item.value,
          meta: item.meta,
        };
        return this.#db.put(STORE_NAME, stored);
      },
      catch: (cause) => CacheError.putFailed('Failed to put item', cause),
    }).pipe(Effect.asVoid);
  }

  get(
    id: string,
  ): Effect.Effect<Option.Option<EntityType<TSchema['Type']>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const item: StoredItem | undefined = await this.#db.get(
          STORE_NAME,
          this.#makeKey(id),
        );

        if (!item) return Option.none();

        return Option.some({
          value: item.value as TSchema['Type'],
          meta: item.meta,
        });
      },
      catch: (cause) => CacheError.getFailed('Failed to get item', cause),
    });
  }

  getAll(): Effect.Effect<EntityType<TSchema['Type']>[], CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const items: StoredItem[] = await this.#db.getAll(
          STORE_NAME,
          this.#getKeyRange(),
        );

        return items.map((item) => ({
          value: item.value as TSchema['Type'],
          meta: item.meta,
        }));
      },
      catch: (cause) => CacheError.getFailed('Failed to get all items', cause),
    });
  }

  getLatest(): Effect.Effect<
    Option.Option<EntityType<TSchema['Type']>>,
    CacheError
  > {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index(UPDATED_INDEX);
        const cursor = await index.openCursor(this.#getKeyRange(), 'prev');

        if (!cursor) return Option.none();

        const item = cursor.value as StoredItem;
        return Option.some({
          value: item.value as TSchema['Type'],
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get latest item', cause),
    });
  }

  getOldest(): Effect.Effect<
    Option.Option<EntityType<TSchema['Type']>>,
    CacheError
  > {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index(UPDATED_INDEX);
        const cursor = await index.openCursor(this.#getKeyRange(), 'next');

        if (!cursor) return Option.none();

        const item = cursor.value as StoredItem;
        return Option.some({
          value: item.value as TSchema['Type'],
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
