import type { EntityType } from "@std-toolkit/core";
import { Effect, Option, Order, SortedMap } from "effect";
import type { CacheEntity, CacheSchemaType as CacheESchema } from "../cache-entity.js";
import { CacheError } from "../error.js";

type StoredItem = {
  value: unknown;
  meta: EntityType<unknown>["meta"];
};

const stringOrder = Order.string;

export class MemoryCacheEntity<
  TSchema extends CacheESchema,
> implements CacheEntity<TSchema["Type"]> {
  #store = new Map<string, StoredItem>();
  #eschema: TSchema;
  #uidIndex: SortedMap.SortedMap<string, string>;

  private constructor(eschema: TSchema) {
    this.#eschema = eschema;
    this.#uidIndex = SortedMap.empty<string, string>(stringOrder);
  }

  static make<TSchema extends CacheESchema>(options: {
    eschema: TSchema;
  }): Effect.Effect<MemoryCacheEntity<TSchema>, never> {
    return Effect.succeed(new MemoryCacheEntity(options.eschema));
  }

  put(item: EntityType<TSchema["Type"]>): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        const id = String(item.value[this.#eschema.idField]);

        const existingItem = this.#store.get(id);
        if (existingItem) {
          this.#uidIndex = SortedMap.remove(this.#uidIndex, existingItem.meta._uid);
        }

        this.#store.set(id, { value: item.value, meta: item.meta });
        this.#uidIndex = SortedMap.set(this.#uidIndex, item.meta._uid, id);
      },
      catch: (cause) => CacheError.putFailed("Failed to put item", cause),
    });
  }

  get(
    id: string,
  ): Effect.Effect<Option.Option<EntityType<TSchema["Type"]>>, CacheError> {
    return Effect.try({
      try: () => {
        const item = this.#store.get(id);

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
      try: () =>
        Array.from(this.#store.values(), (item) => ({
          value: item.value as TSchema["Type"],
          meta: item.meta,
        })),
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
        const item = this.#store.get(id);

        if (item) {
          this.#uidIndex = SortedMap.remove(this.#uidIndex, item.meta._uid);
        }
        this.#store.delete(id);
      },
      catch: (cause) => CacheError.deleteFailed("Failed to delete item", cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#store.clear();
        this.#uidIndex = SortedMap.empty<string, string>(stringOrder);
      },
      catch: (cause) =>
        CacheError.deleteFailed("Failed to delete all items", cause),
    });
  }
}
