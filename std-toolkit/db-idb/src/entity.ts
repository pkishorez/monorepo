import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Option } from "effect";
import { IDBError } from "./error.js";
import type { TItem } from "./types.js";

const STORE_NAME = "single-store";

// Connection cache - multiple entities sharing the same database reuse the connection
const connectionCache = new Map<string, IDBPDatabase>();

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
  return db;
}

export class IDBEntity<TName extends string, TSchema extends AnyESchema> {
  static make<TName extends string>(name: TName) {
    return {
      eschema: <TSchema extends AnyESchema>(eschema: TSchema) => ({
        key: (keyFn: (value: TSchema["Type"]) => string) => ({
          open: (database: string) =>
            Effect.tryPromise({
              try: async () => {
                const db = await getConnection(database);
                return new IDBEntity<TName, TSchema>(name, eschema, keyFn, db);
              },
              catch: (cause) =>
                IDBError.openFailed("Failed to open IndexedDB database", cause),
            }),
        }),
      }),
    };
  }

  static get isAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
  }

  #db: IDBPDatabase;
  #name: TName;
  #eschema: TSchema;
  #key: (value: TSchema["Type"]) => string;

  private constructor(
    name: TName,
    eschema: TSchema,
    key: (value: TSchema["Type"]) => string,
    db: IDBPDatabase,
  ) {
    this.#name = name;
    this.#eschema = eschema;
    this.#key = key;
    this.#db = db;
  }

  query(): Effect.Effect<ESchemaType<TSchema>[], IDBError> {
    return Effect.gen(this, function* () {
      const items: TItem[] = yield* Effect.tryPromise({
        try: () =>
          this.#db.getAll(
            STORE_NAME,
            IDBKeyRange.bound([this.#name], [this.#name, "\uffffff"]),
          ),
        catch: (cause) => IDBError.queryFailed("Failed to query items", cause),
      });

      const results: ESchemaType<TSchema>[] = [];
      for (const item of items) {
        const decoded = yield* this.#eschema
          .decode(item.value)
          .pipe(
            Effect.mapError((cause) =>
              IDBError.queryFailed("Failed to decode item", cause),
            ),
          );
        results.push(decoded as ESchemaType<TSchema>);
        yield* Effect.yieldNow();
      }

      return results;
    });
  }

  get(
    id: string,
  ): Effect.Effect<Option.Option<ESchemaType<TSchema>>, IDBError> {
    return Effect.gen(this, function* () {
      const item: TItem | undefined = yield* Effect.tryPromise({
        try: () => this.#db.get(STORE_NAME, [this.#name, id]),
        catch: (cause) => IDBError.getFailed("Failed to get item", cause),
      });

      if (!item) return Option.none();

      const decoded = yield* this.#eschema
        .decode(item.value)
        .pipe(
          Effect.mapError((cause) =>
            IDBError.getFailed("Failed to decode item", cause),
          ),
        );

      return Option.some(decoded as ESchemaType<TSchema>);
    });
  }

  put(item: Omit<ESchemaType<TSchema>, "_v">): Effect.Effect<void, IDBError> {
    return Effect.gen(this, function* () {
      const encoded = yield* this.#eschema
        .encode(item as ESchemaType<TSchema>["Type"])
        .pipe(
          Effect.mapError((cause) =>
            IDBError.putFailed("Failed to encode item", cause),
          ),
        );

      const id = String(this.#key(item as TSchema["Type"]));

      yield* Effect.tryPromise({
        try: () =>
          this.#db.put(STORE_NAME, {
            entity: this.#name,
            id,
            value: encoded,
          }),
        catch: (cause) => IDBError.putFailed("Failed to put item", cause),
      });
    });
  }

  putMany(
    items: Omit<ESchemaType<TSchema>, "_v">[],
  ): Effect.Effect<void, IDBError> {
    return Effect.gen(this, function* () {
      const encoded: Array<{ id: string; value: unknown }> = [];

      for (const item of items) {
        const value = yield* this.#eschema
          .encode(item as ESchemaType<TSchema>["Type"])
          .pipe(
            Effect.mapError((cause) =>
              IDBError.putFailed("Failed to encode item", cause),
            ),
          );
        const id = String(this.#key(item as TSchema["Type"]));
        encoded.push({ id, value });
      }

      yield* Effect.tryPromise({
        try: async () => {
          const tx = this.#db.transaction(STORE_NAME, "readwrite");
          await Promise.all([
            ...encoded.map(({ id, value }) =>
              tx.store.put({ entity: this.#name, id, value }),
            ),
            tx.done,
          ]);
        },
        catch: (cause) => IDBError.putFailed("Failed to put items", cause),
      });
    });
  }

  delete(id: string): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: () => this.#db.delete(STORE_NAME, [this.#name, id]),
      catch: (cause) => IDBError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, IDBError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readwrite");
        const range = IDBKeyRange.bound([this.#name], [this.#name, "\uffffff"]);
        let cursor = await tx.store.openCursor(range);

        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }

        await tx.done;
      },
      catch: (cause) =>
        IDBError.deleteFailed("Failed to delete all items", cause),
    });
  }

  replaceAll(
    items: Omit<ESchemaType<TSchema>, "_v">[],
  ): Effect.Effect<void, IDBError> {
    return Effect.gen(this, function* () {
      yield* this.deleteAll();
      yield* this.putMany(items);
    });
  }
}
