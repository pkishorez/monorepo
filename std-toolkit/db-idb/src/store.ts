import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import { Effect, Option } from "effect";
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
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBStore.make"));
  }

  getAll<V>(
    query?: IDBKeyRange | IDBValidKey,
    count?: number,
  ): Effect.Effect<TItem<V>[], IDBError> {
    return Effect.tryPromise({
      try: () => this.#db.getAll(STORE_NAME, query, count),
      catch: (cause) => IDBError.queryFailed("Failed to get all items", cause),
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBStore.getAll"));
  }

  put<V>(item: TItem<V>): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        await this.#db.put(STORE_NAME, item);
      },
      catch: (cause) => IDBError.putFailed("Failed to put item", cause),
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBStore.put"));
  }

  update<V>(
    item: Partial<TItem<V>> & { entity: string; id: string },
  ): Effect.Effect<TItem<V>, IDBError> {
    return Effect.gen(this, function* () {
      const existing = yield* this.getItem<V>({ entity: item.entity, id: item.id });
      const updated = { ...Option.getOrThrow(existing), ...item } as TItem<V>;
      yield* this.put(updated);
      return updated;
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBStore.update"));
  }

  getItem<V>({
    entity,
    id,
  }: {
    entity: string;
    id: string;
  }): Effect.Effect<Option.Option<TItem<V>>, IDBError> {
    return Effect.tryPromise({
      try: () => this.#db.get(STORE_NAME, [entity, id]),
      catch: (cause) => IDBError.getFailed("Failed to get item", cause),
    }).pipe(
      Effect.map(Option.fromNullable),
      Effect.withSpan("@std-toolkit/db-idb: IDBStore.getItem"),
    );
  }

  delete({ entity, id }: { entity: string; id: string }): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        await this.#db.delete(STORE_NAME, [entity, id]);
      },
      catch: (cause) => IDBError.deleteFailed("Failed to delete item", cause),
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBStore.delete"));
  }

  purge(): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        await this.#db.clear(STORE_NAME);
      },
      catch: (cause) => IDBError.deleteFailed("Failed to purge store", cause),
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBStore.purge"));
  }
}
