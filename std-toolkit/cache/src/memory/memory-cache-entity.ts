import type { EntityType } from '@std-toolkit/core';
import { Effect, Option, Order, SortedMap } from 'effect';
import type { CacheEntity } from '../cache-entity.js';
import { CacheError } from '../error.js';

type StoredItem = {
  value: unknown;
  meta: EntityType<unknown>['meta'];
};

const stringOrder = Order.string;

export class MemoryCacheEntity<T> implements CacheEntity<T> {
  #store = new Map<string, StoredItem>();
  #idField: string;
  #updatedIndex: SortedMap.SortedMap<string, string>;

  private constructor(idField: string) {
    this.#idField = idField;
    this.#updatedIndex = SortedMap.empty<string, string>(stringOrder);
  }

  static make<T>(options: {
    name: string;
    idField: string;
  }): Effect.Effect<MemoryCacheEntity<T>, never> {
    return Effect.succeed(new MemoryCacheEntity(options.idField));
  }

  put(item: EntityType<T>): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        const id = String(
          (item.value as Record<string, unknown>)[this.#idField],
        );

        const existingItem = this.#store.get(id);
        if (existingItem) {
          this.#updatedIndex = SortedMap.remove(
            this.#updatedIndex,
            existingItem.meta._u,
          );
        }

        this.#store.set(id, { value: item.value, meta: item.meta });
        this.#updatedIndex = SortedMap.set(
          this.#updatedIndex,
          item.meta._u,
          id,
        );
      },
      catch: (cause) => CacheError.putFailed('Failed to put item', cause),
    });
  }

  get(id: string): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.try({
      try: () => {
        const item = this.#store.get(id);

        if (!item) return Option.none();

        return Option.some({
          value: item.value as T,
          meta: item.meta,
        });
      },
      catch: (cause) => CacheError.getFailed('Failed to get item', cause),
    });
  }

  getAll(): Effect.Effect<EntityType<T>[], CacheError> {
    return Effect.try({
      try: () =>
        Array.from(this.#store.values(), (item) => ({
          value: item.value as T,
          meta: item.meta,
        })),
      catch: (cause) => CacheError.getFailed('Failed to get all items', cause),
    });
  }

  getLatest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.try({
      try: () => {
        const last = SortedMap.lastOption(this.#updatedIndex);
        if (Option.isNone(last)) return Option.none();

        const [, key] = last.value;
        const item = this.#store.get(key);
        if (!item) return Option.none();

        return Option.some({
          value: item.value as T,
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get latest item', cause),
    });
  }

  getOldest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.try({
      try: () => {
        const first = SortedMap.headOption(this.#updatedIndex);
        if (Option.isNone(first)) return Option.none();

        const [, key] = first.value;
        const item = this.#store.get(key);
        if (!item) return Option.none();

        return Option.some({
          value: item.value as T,
          meta: item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get oldest item', cause),
    });
  }

  delete(id: string): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        const item = this.#store.get(id);

        if (item) {
          this.#updatedIndex = SortedMap.remove(
            this.#updatedIndex,
            item.meta._u,
          );
        }
        this.#store.delete(id);
      },
      catch: (cause) => CacheError.deleteFailed('Failed to delete item', cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#store.clear();
        this.#updatedIndex = SortedMap.empty<string, string>(stringOrder);
      },
      catch: (cause) =>
        CacheError.deleteFailed('Failed to delete all items', cause),
    });
  }
}
