import type { IDBPDatabase } from "idb";
import type { AnyESchema } from "@std-toolkit/eschema";
import type { EntityType } from "@std-toolkit/core";
import { Effect, Option } from "effect";
import type { CacheEntity } from "../cache-entity.js";
import { CacheError } from "../error.js";

const STORE_NAME = "items";

type StoredItem = {
  entity: string;
  id: string;
  value: unknown;
  meta: EntityType<unknown>["meta"];
};

export class IDBCacheEntity<TSchema extends AnyESchema>
  implements CacheEntity<TSchema["Type"]>
{
  #db: IDBPDatabase;
  #eschema: TSchema;

  constructor(db: IDBPDatabase, eschema: TSchema) {
    this.#db = db;
    this.#eschema = eschema;
  }

  put(item: EntityType<TSchema["Type"]>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);
        const stored: StoredItem = {
          entity: this.#eschema.name,
          id,
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
        const item: StoredItem | undefined = await this.#db.get(STORE_NAME, [
          this.#eschema.name,
          id,
        ]);

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
          IDBKeyRange.bound(
            [this.#eschema.name],
            [this.#eschema.name, "\uffffff"],
          ),
        );

        return items.map((item) => ({
          value: item.value as TSchema["Type"],
          meta: item.meta,
        }));
      },
      catch: (cause) => CacheError.getFailed("Failed to get all items", cause),
    });
  }

  delete(id: string): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => this.#db.delete(STORE_NAME, [this.#eschema.name, id]),
      catch: (cause) => CacheError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readwrite");
        const range = IDBKeyRange.bound(
          [this.#eschema.name],
          [this.#eschema.name, "\uffffff"],
        );
        let cursor = await tx.store.openCursor(range);

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
