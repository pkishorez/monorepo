import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import { Effect } from "effect";
import { CacheError } from "../error.js";
import { IDBCacheEntity } from "./idb-cache-entity.js";
import {
  CacheSchemaType,
  PartitionKey,
  serializePartition,
} from "../cache-entity.js";

const STORE_NAME = "items";
const UID_INDEX = "by-uid";
const DB_VERSION = 3;

const connectionCache = new Map<string, IDBPDatabase>();
const openedDatabases = new Set<string>();

async function getConnection(database: string): Promise<IDBPDatabase> {
  const cached = connectionCache.get(database);
  if (cached) return cached;

  const db = await openDB(database, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, _transaction) {
      if (oldVersion < 3) {
        if (database.objectStoreNames.contains(STORE_NAME)) {
          database.deleteObjectStore(STORE_NAME);
        }
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: ["entity", "partition", "id"],
        });
        store.createIndex(UID_INDEX, ["entity", "partition", "meta._uid"]);
      }
    },
  });

  connectionCache.set(database, db);
  openedDatabases.add(database);
  return db;
}

export class IDBCache {
  private static readonly PREFIX = "std-toolkit-cache";

  static open(name?: string): Effect.Effect<IDBCache, CacheError> {
    const fullName = `${IDBCache.PREFIX}${name ? `-${name}` : ""}`;
    return Effect.tryPromise({
      try: async () => {
        const db = await getConnection(fullName);
        return new IDBCache(fullName, db);
      },
      catch: (cause) =>
        CacheError.openFailed("Failed to open cache database", cause),
    });
  }

  static clearAll(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        for (const name of openedDatabases) {
          const cached = connectionCache.get(name);
          if (cached) {
            cached.close();
            connectionCache.delete(name);
          }
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
        openedDatabases.clear();
      },
      catch: (cause) =>
        CacheError.clearFailed("Failed to clear all caches", cause),
    });
  }

  dbName: string;
  #db: IDBPDatabase;

  private constructor(name: string, db: IDBPDatabase) {
    this.dbName = name;
    this.#db = db;
  }

  schema<TSchema extends CacheSchemaType>(
    eschema: TSchema,
    partition?: PartitionKey,
  ): IDBCacheEntity<TSchema> {
    return new IDBCacheEntity(this.#db, eschema, serializePartition(partition));
  }

  clear(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readwrite");
        await tx.store.clear();
        await tx.done;
      },
      catch: (cause) => CacheError.clearFailed("Failed to clear cache", cause),
    });
  }
}
