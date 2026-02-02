import type { IDBPDatabase } from "idb";
import type { EntityType } from "@std-toolkit/core";
import { Effect, Option } from "effect";
import type { CacheEntity, CacheSchemaType } from "../cache-entity.js";
import { CacheError } from "../error.js";

const STORE_NAME = "items";
const UID_INDEX = "by-uid";

type StoredItem = {
  entity: string;
  partition: string;
  id: string;
  value: unknown;
  meta: EntityType<unknown>["meta"];
};

export class IDBCacheEntity<
  TSchema extends CacheSchemaType,
> implements CacheEntity<TSchema["Type"]> {
  #db: IDBPDatabase;
  #eschema: TSchema;
  #partition: string;

  constructor(db: IDBPDatabase, eschema: TSchema, partition: string = "") {
    this.#db = db;
    this.#eschema = eschema;
    this.#partition = partition;
  }

  put(item: EntityType<TSchema["Type"]>): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);
        const stored: StoredItem = {
          entity: this.#eschema.name,
          partition: this.#partition,
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
          this.#partition,
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
            [this.#eschema.name, this.#partition],
            [this.#eschema.name, this.#partition, "\uffffff"],
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

  getLatest(): Effect.Effect<
    Option.Option<EntityType<TSchema["Type"]>>,
    CacheError
  > {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readonly");
        const index = tx.store.index(UID_INDEX);
        const range = IDBKeyRange.bound(
          [this.#eschema.name, this.#partition],
          [this.#eschema.name, this.#partition, "\uffffff"],
        );
        const cursor = await index.openCursor(range, "prev");

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

  getOldest(): Effect.Effect<
    Option.Option<EntityType<TSchema["Type"]>>,
    CacheError
  > {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readonly");
        const index = tx.store.index(UID_INDEX);
        const range = IDBKeyRange.bound(
          [this.#eschema.name, this.#partition],
          [this.#eschema.name, this.#partition, "\uffffff"],
        );
        const cursor = await index.openCursor(range, "next");

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
      try: () =>
        this.#db.delete(STORE_NAME, [
          this.#eschema.name,
          this.#partition,
          id,
        ]),
      catch: (cause) => CacheError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: async () => {
        const tx = this.#db.transaction(STORE_NAME, "readwrite");
        const range = IDBKeyRange.bound(
          [this.#eschema.name, this.#partition],
          [this.#eschema.name, this.#partition, "\uffffff"],
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
