import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { EntityType } from "@std-toolkit/core";
import { Effect, Option } from "effect";
import type { CacheEntity, CacheSchemaType } from "../cache-entity.js";
import type { PartitionKey } from "./utils.js";
import { serializePartition } from "./utils.js";
import { CacheError } from "../error.js";

const DEFAULT_DB_NAME = "std-toolkit-cache";
const STORE_NAME = "items";
const UID_INDEX = "by-uid";
const DB_VERSION = 1;

type StoredItem = {
  key: [string, string, string];
  uidKey: [string, string, string];
  value: unknown;
  meta: EntityType<unknown>["meta"];
};

const ConnectionPool = {
  connections: new Map<string, IDBPDatabase>(),
  opened: new Set<string>(),

  async acquire(dbName: string): Promise<IDBPDatabase> {
    const cached = this.connections.get(dbName);
    if (cached) {
      return cached;
    }

    const db = await openDB(dbName, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex(UID_INDEX, "uidKey");
      },
    });

    this.connections.set(dbName, db);
    this.opened.add(dbName);
    return db;
  },

  get(dbName: string): IDBPDatabase | undefined {
    return this.connections.get(dbName);
  },

  async destroyAll(): Promise<void> {
    for (const name of this.opened) {
      const cached = this.connections.get(name);
      if (cached) {
        cached.close();
        this.connections.delete(name);
      }
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    this.opened.clear();
  },
};

export class IDBCacheEntity<TSchema extends CacheSchemaType>
  implements CacheEntity<TSchema["Type"]>
{
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
      [this.#entity, this.#partition, ""],
      [this.#entity, this.#partition, "\uffff"],
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
        CacheError.openFailed("Failed to open cache entity", cause),
    });
  }

  static destroyAllDatabases(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => ConnectionPool.destroyAll(),
      catch: (cause) =>
        CacheError.clearFailed("Failed to destroy all databases", cause),
    });
  }

  put(item: EntityType<TSchema["Type"]>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);
        const stored: StoredItem = {
          key: this.#makeKey(id),
          uidKey: [this.#entity, this.#partition, item.meta._uid],
          value: item.value,
          meta: item.meta,
        };
        return this.#db.put(STORE_NAME, stored);
      },
      catch: (cause) => CacheError.putFailed("Failed to put item", cause),
    }).pipe(Effect.asVoid);
  }

  get(
    id: string,
  ): Effect.Effect<Option.Option<EntityType<TSchema["Type"]>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const item: StoredItem | undefined = await this.#db.get(
          STORE_NAME,
          this.#makeKey(id),
        );

        if (!item) return Option.none();

        return Option.some({
          value: item.value as TSchema["Type"],
          meta: item.meta,
        });
      },
      catch: (cause) => CacheError.getFailed("Failed to get item", cause),
    });
  }

  getAll(): Effect.Effect<EntityType<TSchema["Type"]>[], CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const items: StoredItem[] = await this.#db.getAll(
          STORE_NAME,
          this.#getKeyRange(),
        );

        return items.map((item) => ({
          value: item.value as TSchema["Type"],
          meta: item.meta,
        }));
      },
      catch: (cause) => CacheError.getFailed("Failed to get all items", cause),
    });
  }

  getLatest(): Effect.Effect<Option.Option<EntityType<TSchema["Type"]>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readonly");
        const index = tx.store.index(UID_INDEX);
        const cursor = await index.openCursor(this.#getKeyRange(), "prev");

        if (!cursor) return Option.none();

        const item = cursor.value as StoredItem;
        return Option.some({
          value: item.value as TSchema["Type"],
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed("Failed to get latest item", cause),
    });
  }

  getOldest(): Effect.Effect<Option.Option<EntityType<TSchema["Type"]>>, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readonly");
        const index = tx.store.index(UID_INDEX);
        const cursor = await index.openCursor(this.#getKeyRange(), "next");

        if (!cursor) return Option.none();

        const item = cursor.value as StoredItem;
        return Option.some({
          value: item.value as TSchema["Type"],
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed("Failed to get oldest item", cause),
    });
  }

  delete(id: string): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => this.#db.delete(STORE_NAME, this.#makeKey(id)),
      catch: (cause) => CacheError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readwrite");
        let cursor = await tx.store.openCursor(this.#getKeyRange());

        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }

        await tx.done;
      },
      catch: (cause) =>
        CacheError.deleteFailed("Failed to delete all items", cause),
    });
  }
}
