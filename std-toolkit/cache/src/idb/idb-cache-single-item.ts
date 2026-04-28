import type { IDBPDatabase } from 'idb';
import { Effect, Option } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type {
  CacheSingleItem,
  CacheSingleItemSchemaType,
} from '../cache-single-item.js';
import type { PartitionKey } from './utils.js';
import { serializePartition } from './utils.js';
import { CacheError } from '../error.js';
import {
  DEFAULT_DB_NAME,
  STORE_NAME,
  ConnectionPool,
  type StoredItem,
} from './internals.js';

const SINGLETON_ID = '__singleton__';

export class IDBCacheSingleItem<
  TSchema extends CacheSingleItemSchemaType,
> implements CacheSingleItem<TSchema['Encoded']> {
  #dbName: string;
  #entity: string;
  #partition: string;

  private constructor(options: {
    dbName: string;
    entity: string;
    partition: string;
  }) {
    this.#dbName = options.dbName;
    this.#entity = options.entity;
    this.#partition = options.partition;
  }

  get #db(): IDBPDatabase {
    const db = ConnectionPool.get(this.#dbName);
    if (!db) {
      throw new Error(`No connection for database: ${this.#dbName}`);
    }
    return db;
  }

  get #key(): [string, string, string] {
    return [this.#entity, this.#partition, SINGLETON_ID];
  }

  static make<TSchema extends CacheSingleItemSchemaType>(options: {
    name?: string;
    eschema: TSchema;
    partition?: PartitionKey;
  }): Effect.Effect<IDBCacheSingleItem<TSchema>, CacheError> {
    const dbName = options.name ?? DEFAULT_DB_NAME;
    const partition = serializePartition(options.partition);

    return Effect.tryPromise({
      try: async () => {
        await ConnectionPool.acquire(dbName);
        return new IDBCacheSingleItem({
          dbName,
          entity: options.eschema.name,
          partition,
        });
      },
      catch: (cause) =>
        CacheError.openFailed('Failed to open cache single item', cause),
    });
  }

  put(item: EntityType<TSchema['Encoded']>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const stored: StoredItem = {
          key: this.#key,
          updatedKey: [this.#entity, this.#partition, item.meta._u],
          value: item.value,
          meta: item.meta,
        };
        return this.#db.put(STORE_NAME, stored);
      },
      catch: (cause) =>
        CacheError.putFailed('Failed to put single item', cause),
    }).pipe(Effect.asVoid);
  }

  get(): Effect.Effect<
    Option.Option<EntityType<TSchema['Encoded']>>,
    CacheError
  > {
    return Effect.tryPromise({
      try: async () => {
        const item: StoredItem | undefined = await this.#db.get(
          STORE_NAME,
          this.#key,
        );

        if (!item) return Option.none();

        return Option.some({
          value: item.value as TSchema['Encoded'],
          meta: item.meta,
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
