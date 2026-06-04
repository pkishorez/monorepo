import type { EntityType } from '@std-toolkit/core';
import { Effect, Option, Order } from 'effect';
import type { CacheEntity } from '../cache-entity.js';
import { CacheError } from '../error.js';

type StoredItem = {
  value: unknown;
  meta: EntityType<unknown>['meta'];
};

const byUpdated = Order.mapInput(
  Order.String,
  (item: StoredItem) => item.meta._u,
);

export class MemoryCacheEntity<T> implements CacheEntity<T> {
  #store = new Map<string, StoredItem>();
  #idField: string;

  private constructor(idField: string) {
    this.#idField = idField;
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
        this.#store.set(id, { value: item.value, meta: item.meta });
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
      try: () => this.#extremum('max'),
      catch: (cause) =>
        CacheError.getFailed('Failed to get latest item', cause),
    });
  }

  getOldest(): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.try({
      try: () => this.#extremum('min'),
      catch: (cause) =>
        CacheError.getFailed('Failed to get oldest item', cause),
    });
  }

  delete(id: string): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#store.delete(id);
      },
      catch: (cause) => CacheError.deleteFailed('Failed to delete item', cause),
    });
  }

  deleteAll(): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#store.clear();
      },
      catch: (cause) =>
        CacheError.deleteFailed('Failed to delete all items', cause),
    });
  }

  #extremum(kind: 'min' | 'max'): Option.Option<EntityType<T>> {
    let result: StoredItem | undefined;
    for (const item of this.#store.values()) {
      if (!result) {
        result = item;
        continue;
      }
      const order = byUpdated(item, result);
      if ((kind === 'max' && order > 0) || (kind === 'min' && order < 0)) {
        result = item;
      }
    }

    if (!result) return Option.none();

    return Option.some({
      value: result.value as T,
      meta: result.meta,
    });
  }
}
