import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import { Effect } from "effect";
import { IDBError } from "./error.js";
import type { TItem } from "./types.js";

const STORE_NAME = "single-store";

export class IDBStore {
  #db: IDBPDatabase;

  private constructor(db: IDBPDatabase) {
    this.#db = db;
  }

  get db(): IDBPDatabase {
    return this.#db;
  }

  static get isAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
  }

  static make(database: string): Effect.Effect<IDBStore, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        const db = await openDB(database, 1, {
          upgrade(database) {
            database.createObjectStore(STORE_NAME, {
              keyPath: ["entity", "id"],
            });
          },
        });
        return new IDBStore(db);
      },
      catch: (cause) => IDBError.openFailed("Failed to open IndexedDB database", cause),
    });
  }

  getAll<V>(
    query?: IDBKeyRange | IDBValidKey,
    count?: number,
  ): Effect.Effect<TItem<V>[], IDBError> {
    return Effect.tryPromise({
      try: () => this.#db.getAll(STORE_NAME, query, count),
      catch: (cause) => IDBError.queryFailed("Failed to get all items", cause),
    });
  }

  put<V>(item: TItem<V>): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        await this.#db.put(STORE_NAME, item);
      },
      catch: (cause) => IDBError.putFailed("Failed to put item", cause),
    });
  }

  update<V>(
    item: Partial<TItem<V>> & { entity: string; id: string },
  ): Effect.Effect<TItem<V>, IDBError> {
    return Effect.gen(this, function* () {
      const existing = yield* this.getItem<V>({ entity: item.entity, id: item.id });
      const updated = { ...existing, ...item } as TItem<V>;
      yield* this.put(updated);
      return updated;
    });
  }

  getItem<V>({
    entity,
    id,
  }: {
    entity: string;
    id: string;
  }): Effect.Effect<TItem<V> | undefined, IDBError> {
    return Effect.tryPromise({
      try: () => this.#db.get(STORE_NAME, [entity, id]),
      catch: (cause) => IDBError.getFailed("Failed to get item", cause),
    });
  }

  delete({ entity, id }: { entity: string; id: string }): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        await this.#db.delete(STORE_NAME, [entity, id]);
      },
      catch: (cause) => IDBError.deleteFailed("Failed to delete item", cause),
    });
  }

  purge(): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        await this.#db.clear(STORE_NAME);
      },
      catch: (cause) => IDBError.deleteFailed("Failed to purge store", cause),
    });
  }
}
