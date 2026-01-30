import type { AnyESchema } from "@std-toolkit/eschema";
import type { EntityType } from "@std-toolkit/core";
import { Effect, Option } from "effect";
import type { CacheEntity } from "../cache-entity.js";
import { CacheError } from "../error.js";

type StoredItem = {
  entity: string;
  id: string;
  value: unknown;
  meta: EntityType<unknown>["meta"];
};

export class MemoryCacheEntity<TSchema extends AnyESchema>
  implements CacheEntity<TSchema["Type"]>
{
  #store: Map<string, StoredItem>;
  #eschema: TSchema;

  constructor(eschema: TSchema, store?: Map<string, StoredItem>) {
    this.#eschema = eschema;
    this.#store = store ?? new Map();
  }

  #makeKey(id: string): string {
    return `${this.#eschema.name}:${id}`;
  }

  put(item: EntityType<TSchema["Type"]>): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);
        const stored: StoredItem = {
          entity: this.#eschema.name,
          id,
          value: item.value,
          meta: item.meta,
        };
        this.#store.set(this.#makeKey(id), stored);
      },
      catch: (cause) => CacheError.putFailed("Failed to put item", cause),
    });
  }

  get(
    id: string,
  ): Effect.Effect<Option.Option<EntityType<TSchema["Type"]>>, CacheError> {
    return Effect.try({
      try: () => {
        const item = this.#store.get(this.#makeKey(id));

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
    return Effect.try({
      try: () => {
        const items: EntityType<TSchema["Type"]>[] = [];

        for (const item of this.#store.values()) {
          if (item.entity === this.#eschema.name) {
            items.push({
              value: item.value as TSchema["Type"],
              meta: item.meta,
            });
          }
        }

        return items;
      },
      catch: (cause) => CacheError.getFailed("Failed to get all items", cause),
    });
  }

  delete(id: string): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#store.delete(this.#makeKey(id));
      },
      catch: (cause) => CacheError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        for (const [key, item] of this.#store.entries()) {
          if (item.entity === this.#eschema.name) {
            this.#store.delete(key);
          }
        }
      },
      catch: (cause) =>
        CacheError.deleteFailed("Failed to delete all items", cause),
    });
  }
}
