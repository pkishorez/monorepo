import type { IDBPDatabase } from 'idb';
import type { ESchema, ESchemaType } from './eschema.js';
import type { DistributiveOmit, Prettify } from './types.js';
import { Console, Data, Effect } from 'effect';
import { deleteDB, openDB } from 'idb';

interface StoreSchema<
  T = any,
  Key extends keyof T = any,
  IndexKey extends string = string,
> {
  schema: ESchema<T>;
  key: Key;
  indexMap: IndexSchema<IndexKey, T>;
}

type IndexSchema<Str extends string, T> = {
  [key in Str]: { key: Exclude<keyof T, '__v'>; options?: IDBIndexParameters };
};

export function storeSchema<T, K extends keyof T, IndexKey extends string>({
  schema,
  key,
  indexMap = {} as IndexSchema<IndexKey, T>,
}: {
  schema: ESchema<T>;
  key: K;
  indexMap?: IndexSchema<IndexKey, T>;
}): StoreSchema<T, typeof key, IndexKey> {
  return { schema, key, indexMap };
}

type Database<DBSchema extends { [key: string]: StoreSchema }> = {
  [K in keyof DBSchema]: StoreOperations<
    ESchemaType<DBSchema[K]['schema']>,
    DBSchema[K]['key'],
    DBSchema[K]['indexMap']
  >;
};

interface ItemOperations<Item, Key extends string | number | symbol> {
  get: Effect.Effect<Item | undefined, DatabaseError>;
  update: <Cond extends Partial<Item>>(
    obj: Partial<Omit<Extract<Item, Cond>, Key>>,
  ) => Effect.Effect<void, DatabaseError>;
  delete: Effect.Effect<void, DatabaseError>;
}

interface StoreOperations<
  T,
  Key extends keyof T,
  IndexMap extends IndexSchema<string, T>,
  Item = Prettify<DistributiveOmit<T, '__v'>>,
> {
  key: (value: T[Key]) => ItemOperations<Item, Key>;
  getItem: (key: T[Key]) => Effect.Effect<Item | undefined, DatabaseError>;
  addItem: (
    item: Item,
  ) => Effect.Effect<
    ItemOperations<Item, Key> & { value: Item },
    DatabaseError
  >;
  upsertItem: (
    item: Item,
    options?: { silent: boolean },
  ) => Effect.Effect<Item, DatabaseError>;
  updateItem: <Obj extends Partial<Item>>(
    key: T[Key],
    item: Partial<Omit<Extract<Item, Obj>, Key>>,
  ) => Effect.Effect<void, DatabaseError>;
  deleteItem: (key: T[Key]) => Effect.Effect<void, DatabaseError>;
  getAll: Effect.Effect<Item[], DatabaseError>;
  getAllKeys: Effect.Effect<T[Key][], DatabaseError>;
  subscribeItem: (key: T[Key], fn: (item: Item) => void) => () => void;
  subscribeKeys: (fn: (keys: T[Key][]) => void) => () => void;
  subscribeAll: (fn: (items: Item[]) => void) => () => void;
  indexes: {
    [IndexName in keyof IndexMap]: {
      getItems: (
        key: T[IndexMap[IndexName]['key']],
      ) => Effect.Effect<Item[], DatabaseError>;
    };
  };
}

class DatabaseError extends Data.TaggedError('DatabaseError')<{
  message: string;
  cause?: unknown;
}> {}

export function deleteDatabase(dbName: string) {
  return Effect.tryPromise({
    try: () =>
      deleteDB(dbName, {
        blocked(cv, ev) {
          console.warn(
            `Database ${dbName} with version: ${cv} is blocked:`,
            ev,
          );
        },
      }),
    catch: (error) =>
      new DatabaseError({
        message: `Failed to delete database ${dbName}`,
        cause: error,
      }),
  }).pipe(
    Effect.tap(() => Console.log(`Database ${dbName} deleted successfully.`)),
  );
}

export async function createDatabase<
  DBSchema extends { [key: string]: StoreSchema },
>(
  dbName: string,
  dbSchema: DBSchema,
  version = 1,
): Promise<{ result: Database<DBSchema>; idbInstance: IDBPDatabase<any> }> {
  const idbInstance = await openDB(dbName, version, {
    upgrade(db, _old, _new, trx) {
      const existingStoreNames = Array.from(db.objectStoreNames);
      const requiredStoreNames = Object.keys(dbSchema);

      for (const existing of existingStoreNames) {
        if (!requiredStoreNames.includes(existing)) {
          db.deleteObjectStore(existing);
        }
      }

      for (const required of requiredStoreNames) {
        if (!existingStoreNames.includes(required)) {
          db.createObjectStore(required, {
            keyPath: dbSchema[required].key,
          });
        }

        // Delete indexes that are not in the schema.
        const store = trx.objectStore(required);
        const existingIndexes = Array.from(store.indexNames);
        const requiredIndexes = Object.keys(dbSchema[required].indexMap || {});

        for (const existingIndex of existingIndexes) {
          if (!requiredIndexes.includes(existingIndex)) {
            store.deleteIndex(existingIndex);
          }
        }

        for (const [indexName, { key, options }] of Object.entries(
          dbSchema[required].indexMap || {},
        )) {
          if (!store.indexNames.contains(indexName)) {
            store.createIndex(indexName, key as string, options);
          }
        }
      }
    },
  });

  const result = Object.fromEntries(
    Object.entries(dbSchema).map(([storeName, store]) => {
      const itemSubscriptions: Record<string, Set<(item: any) => void>> = {};
      const keysSubscriptions: Set<(keys: any[]) => void> = new Set();
      const storeSubscriptions: Set<(items: any[]) => void> = new Set();

      const broadcastItemsListChanges = async () => {
        if (keysSubscriptions.size > 0) {
          const keys = await idbInstance.getAllKeys(storeName);
          keysSubscriptions.forEach((fn) => fn(keys));
        }
      };

      const broadcastAllChanges = async () => {
        if (storeSubscriptions.size > 0) {
          const items = await idbInstance.getAll(storeName);
          storeSubscriptions.forEach((fn) =>
            fn(items.map((item) => store.schema.getValue(item))),
          );
        }
      };
      const get = (key: any) =>
        Effect.tryPromise({
          try: () => idbInstance.get(storeName, key),
          catch: (error) =>
            new DatabaseError({
              message: `Failed to get item with key ${key} in ${storeName}`,
              cause: error,
            }),
        });
      const del = (key: any) =>
        Effect.tryPromise({
          try: () => idbInstance.delete(storeName, key),
          catch: (error) =>
            new DatabaseError({
              message: `Failed to delete item with key ${key} in ${storeName}`,
              cause: error,
            }),
        }).pipe(
          Effect.tap(() =>
            Effect.promise(async () => {
              await broadcastItemsListChanges();
              await broadcastAllChanges();
            }),
          ),
        );

      const put = (key: any, value: any) =>
        Effect.tryPromise({
          try: async () => {
            const item = await idbInstance.get(storeName, key);
            await idbInstance.put(
              storeName,
              store.schema.validateLatest(value),
            );

            if (!item) {
              await broadcastItemsListChanges();
            }
            return value;
          },
          catch: (error) =>
            new DatabaseError({
              message: `Failed to put item with key ${key} in ${storeName}`,
              cause: error,
            }),
        }).pipe(
          Effect.onError(Console.error),
          Effect.tap((v) =>
            Effect.promise(async () => {
              // Subscription update logic can go here if needed
              itemSubscriptions[v[store.key]]?.forEach((fn) => fn(v));
              broadcastAllChanges();
            }),
          ),
        );

      const add = (value: any) =>
        Effect.tryPromise({
          try: async () => {
            await idbInstance.add(
              storeName,
              store.schema.validateLatest(value),
            );
            return value;
          },
          catch: (error) =>
            new DatabaseError({
              message: `Failed to add item in ${storeName}`,
              cause: error,
            }),
        }).pipe(
          Effect.tap((v) =>
            Effect.promise(async () => {
              // Subscription update logic can go here if needed
              itemSubscriptions[v[store.key]]?.forEach((fn) => fn(v));
              await broadcastItemsListChanges();
              await broadcastAllChanges();
            }),
          ),
        );

      const getItem = Effect.fn(function* (key: any) {
        const item = yield* get(key);

        if (!item) {
          return undefined;
        }
        return store.schema.getValue(item);
      });

      const keyOperations: (key: any) => ItemOperations<any, any> = (
        key: any,
      ) => ({
        get: getItem(key),
        update: (obj) =>
          getItem(key).pipe(
            Effect.flatMap((item) =>
              put(key, store.schema.validateLatest({ ...item, ...obj })),
            ),
          ),
        delete: Effect.gen(function* () {
          return del(key);
        }),
      });

      const operations: StoreOperations<any, any, any> = {
        key: keyOperations,

        getItem,
        subscribeItem: (key, fn) => {
          itemSubscriptions[key] ??= new Set();
          itemSubscriptions[key].add(fn);

          return () => {
            itemSubscriptions[key]?.delete(fn);
          };
        },
        subscribeKeys: (fn) => {
          keysSubscriptions.add(fn);

          return () => {
            keysSubscriptions?.delete(fn);
          };
        },
        subscribeAll: (fn) => {
          storeSubscriptions.add(fn);

          return () => {
            storeSubscriptions?.delete(fn);
          };
        },
        updateItem: Effect.fn(function* (keyValue, update) {
          const item = yield* getItem(keyValue);
          return yield* put(keyValue, {
            ...item,
            ...update,
            [store.key]: keyValue,
          });
        }),
        addItem: Effect.fn(function* (value) {
          yield* add(value);
          // Update subscriptions.

          return { ...keyOperations(value[store.key]), value };
        }),
        upsertItem: Effect.fn(function* (value, { silent = false } = {}) {
          const currentItem = yield* getItem(value[store.key]);
          const newValue = store.schema.validateLatest(value);
          (yield* put(value[store.key], newValue)) as any as Promise<void>;

          if (!currentItem) {
            // Update subscriptions if needed
            yield* Effect.promise(() => broadcastItemsListChanges());
          } else if (!silent) {
            itemSubscriptions[newValue[store.key]]?.forEach((fn) =>
              fn(newValue),
            );
          }

          return newValue;
        }),
        deleteItem: Effect.fn(function* (key) {
          const result = yield* del(key);

          // Update subscriptions.
          return result;
        }),
        getAll: Effect.tryPromise({
          try: () =>
            idbInstance
              .getAll(storeName)
              .then((result) => result.map((v) => store.schema.getValue(v))),
          catch: (cause) =>
            new DatabaseError({
              message: `Failed to get all items in ${storeName}`,
              cause,
            }),
        }),
        getAllKeys: Effect.tryPromise({
          try: () => idbInstance.getAllKeys(storeName),
          catch: (cause) =>
            new DatabaseError({
              message: `Failed to get all keys in ${storeName}`,
              cause,
            }),
        }),
        indexes: Object.fromEntries(
          Object.entries(store.indexMap).map(([indexName]) => [
            indexName,
            {
              getItems: (key: any) =>
                Effect.tryPromise({
                  try: () =>
                    idbInstance
                      .getAllFromIndex(storeName, indexName, key)
                      .then((result) =>
                        result.map((v) => store.schema.getValue(v)),
                      ),
                  catch: (cause) =>
                    new DatabaseError({
                      message: `Failed to get items from index ${indexName} in ${storeName}`,
                      cause,
                    }),
                }),
            },
          ]),
        ) as any,
      };

      return [storeName, operations];
    }),
  ) as any;

  return { result: result as Database<DBSchema>, idbInstance };
}

// ALL THE TYPE RELATED UTILITES GO HERE>>>

type StoreKey<DB extends Database<any>> =
  DB extends Database<infer DBSchema> ? keyof DBSchema : never;

export type StoreType<DB extends Database<any>, key extends StoreKey<DB>> =
  DB extends Database<infer DBSchema>
    ? DBSchema[key] extends StoreSchema<infer T>
      ? DistributiveOmit<T, '__v'>
      : never
    : never;
