import type { EntityType } from "@std-toolkit/core";
import { Effect, Option, Order, SortedMap } from "effect";
import type {
  CacheEntity,
  CacheSchemaType as CacheESchema,
} from "../cache-entity.js";
import { CacheError } from "../error.js";

type StoredItem = {
  entity: string;
  partition: string;
  id: string;
  value: unknown;
  meta: EntityType<unknown>["meta"];
};

const uidOrder = Order.string;

export class MemoryCacheEntity<
  TSchema extends CacheESchema,
> implements CacheEntity<TSchema["Type"]> {
  #store: Map<string, StoredItem>;
  #eschema: TSchema;
  #partition: string;
  #uidIndex: SortedMap.SortedMap<string, string>;

  constructor(
    eschema: TSchema,
    store?: Map<string, StoredItem>,
    partition: string = "",
  ) {
    this.#eschema = eschema;
    this.#store = store ?? new Map();
    this.#partition = partition;
    this.#uidIndex = SortedMap.empty<string, string>(uidOrder);
  }

  #makeKey(id: string): string {
    return `${this.#eschema.name}:${this.#partition}:${id}`;
  }

  put(item: EntityType<TSchema["Type"]>): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);
        const key = this.#makeKey(id);
        const stored: StoredItem = {
          entity: this.#eschema.name,
          partition: this.#partition,
          id,
          value: item.value,
          meta: item.meta,
        };

        const existingItem = this.#store.get(key);
        if (existingItem) {
          this.#uidIndex = SortedMap.remove(
            this.#uidIndex,
            existingItem.meta._uid,
          );
        }

        this.#store.set(key, stored);
        this.#uidIndex = SortedMap.set(this.#uidIndex, item.meta._uid, key);
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
          if (
            item.entity === this.#eschema.name &&
            item.partition === this.#partition
          ) {
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

  getLatest(): Effect.Effect<
    Option.Option<EntityType<TSchema["Type"]>>,
    CacheError
  > {
    return Effect.try({
      try: () => {
        const last = SortedMap.lastOption(this.#uidIndex);
        if (Option.isNone(last)) return Option.none();

        const [, key] = last.value;
        const item = this.#store.get(key);
        if (!item) return Option.none();

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
    return Effect.try({
      try: () => {
        const first = SortedMap.headOption(this.#uidIndex);
        if (Option.isNone(first)) return Option.none();

        const [, key] = first.value;
        const item = this.#store.get(key);
        if (!item) return Option.none();

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
    return Effect.try({
      try: () => {
        const key = this.#makeKey(id);
        const item = this.#store.get(key);

        if (item) {
          this.#uidIndex = SortedMap.remove(this.#uidIndex, item.meta._uid);
        }
        this.#store.delete(key);
      },
      catch: (cause) => CacheError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        for (const [key, item] of this.#store.entries()) {
          if (
            item.entity === this.#eschema.name &&
            item.partition === this.#partition
          ) {
            this.#uidIndex = SortedMap.remove(this.#uidIndex, item.meta._uid);
            this.#store.delete(key);
          }
        }
      },
      catch: (cause) =>
        CacheError.deleteFailed("Failed to delete all items", cause),
    });
  }
}
