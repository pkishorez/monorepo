import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { AnyESchema } from "@std-toolkit/eschema";
import { Effect } from "effect";
import { CacheError } from "../error.js";
import { IDBCacheSchema } from "./idb-cache-schema.js";

const STORE_NAME = "items";

const connectionCache = new Map<string, IDBPDatabase>();
const openedDatabases = new Set<string>();

async function getConnection(database: string): Promise<IDBPDatabase> {
  const cached = connectionCache.get(database);
  if (cached) return cached;

  const db = await openDB(database, 1, {
    upgrade(database) {
      database.createObjectStore(STORE_NAME, {
        keyPath: ["entity", "id"],
      });
    },
  });

  connectionCache.set(database, db);
  openedDatabases.add(database);
  return db;
}

export class IDBCache {
  static readonly PREFIX = "std-toolkit-cache";

  static open(name: string): Effect.Effect<IDBCache, CacheError> {
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

  #name: string;
  #db: IDBPDatabase;

  private constructor(name: string, db: IDBPDatabase) {
    this.#name = name;
    this.#db = db;
  }

  schema<TSchema extends AnyESchema>(
    eschema: TSchema,
  ): IDBCacheSchema<TSchema> {
    return new IDBCacheSchema(this.#db, eschema);
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
