import type { EntityType } from '@std-toolkit/core';
import { Effect, Option } from 'effect';
import type { CacheSingleItem } from '../cache-single-item.js';
import { CacheError } from '../error.js';

type StoredItem = {
  value: unknown;
  meta: EntityType<unknown>['meta'];
};

export class MemoryCacheSingleItem<T> implements CacheSingleItem<T> {
  #item: StoredItem | null = null;

  private constructor() {}

  static make<T>(options: {
    name: string;
  }): Effect.Effect<MemoryCacheSingleItem<T>, never> {
    return Effect.succeed(new MemoryCacheSingleItem());
  }

  put(item: EntityType<T>): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#item = { value: item.value, meta: item.meta };
      },
      catch: (cause) =>
        CacheError.putFailed('Failed to put single item', cause),
    });
  }

  get(): Effect.Effect<Option.Option<EntityType<T>>, CacheError> {
    return Effect.try({
      try: () => {
        if (!this.#item) return Option.none();
        return Option.some({
          value: this.#item.value as T,
          meta: this.#item.meta,
        });
      },
      catch: (cause) =>
        CacheError.getFailed('Failed to get single item', cause),
    });
  }

  delete(): Effect.Effect<void, CacheError> {
    return Effect.try({
      try: () => {
        this.#item = null;
      },
      catch: (cause) =>
        CacheError.deleteFailed('Failed to delete single item', cause),
    });
  }
}
