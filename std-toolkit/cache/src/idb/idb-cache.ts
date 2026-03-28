import { Effect } from "effect";
import type { CacheSchemaType } from "../cache-entity.js";
import type { CacheSingleItemSchemaType } from "../cache-single-item.js";
import type { PartitionKey } from "./utils.js";
import { IDBCacheEntity } from "./idb-cache-entity.js";
import { IDBCacheSingleItem } from "./idb-cache-single-item.js";
import { CacheError } from "../error.js";
import { ConnectionPool } from "./internals.js";

export class IDBCache {
  readonly name: string;
  readonly version: number;
  #readyPromise: Promise<void> | null = null;

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  entity<TSchema extends CacheSchemaType>(options: {
    eschema: TSchema;
    partition?: PartitionKey;
  }): Effect.Effect<IDBCacheEntity<TSchema>, CacheError> {
    return this.#ensureReady().pipe(
      Effect.flatMap(() =>
        IDBCacheEntity.make({
          name: this.name,
          eschema: options.eschema,
          ...(options.partition && { partition: options.partition }),
        }),
      ),
    );
  }

  singleItem<TSchema extends CacheSingleItemSchemaType>(options: {
    eschema: TSchema;
    partition?: PartitionKey;
  }): Effect.Effect<IDBCacheSingleItem<TSchema>, CacheError> {
    return this.#ensureReady().pipe(
      Effect.flatMap(() =>
        IDBCacheSingleItem.make({
          name: this.name,
          eschema: options.eschema,
          ...(options.partition && { partition: options.partition }),
        }),
      ),
    );
  }

  destroy(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => ConnectionPool.destroy(this.name),
      catch: (cause) =>
        CacheError.clearFailed("Failed to destroy cache", cause),
    });
  }

  #ensureReady(): Effect.Effect<void, CacheError> {
    return Effect.tryPromise({
      try: () => {
        if (!this.#readyPromise) {
          this.#readyPromise = ConnectionPool.acquire(
            this.name,
            this.version,
          ).then(() => {});
        }
        return this.#readyPromise;
      },
      catch: (cause) =>
        CacheError.openFailed("Failed to initialize IDBCache", cause),
    });
  }
}
