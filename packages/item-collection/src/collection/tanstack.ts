import { IDBEntity, IDBStore } from '@monorepo/effect-idb';
import type { EmptyESchema } from '@monorepo/eschema';
import type { ItemCollection } from './collection.js';
import { createCollection, type SyncConfig } from '@tanstack/db';
import { Effect, Schema } from 'effect';

export const tanstackCollection = <
  Collection extends ItemCollection<string, EmptyESchema, any>,
>({
  itemCollection,
  sync,
}: {
  itemCollection: Collection;
  sync?: {
    query: Effect.Effect<Collection['Type'][], never, never>;
    queryAfter?: (
      value: Collection['Type'],
    ) => Effect.Effect<Collection['Type'][], never, never>;
    queryBefore?: (
      value: Collection['Type'],
    ) => Effect.Effect<Collection['Type'][], never, never>;
    onInsert: (
      value: Collection['Type'],
    ) => Effect.Effect<void | Collection['Type']>;
    onUpdate: (
      value: Collection['broadcastSchema']['Type'],
    ) => Effect.Effect<void | Collection['broadcastSchema']['Type']>;
  };
}) => {
  type UpdateItemType = Collection['broadcastSchema']['Type'];
  let syncParams: Parameters<SyncConfig['sync']>[0] | null = null;

  const idbEntity = (async () => {
    if (!IDBStore.isAvailable) {
      return null;
    }
    const tanstackIDB = await IDBStore.make('tanstack-db');
    return IDBEntity.make(itemCollection.name)
      .eschema(itemCollection.eschema)
      .id(itemCollection.key)
      .build(tanstackIDB);
  })();

  const bulkUpsert = (items: UpdateItemType[]) => {
    if (!syncParams) {
      return;
    }

    const { begin, write, commit, collection } = syncParams;
    begin();

    items.forEach(async (item) => {
      const existing = collection.get(item[itemCollection.key]);
      if (existing) {
        write({
          type: 'update',
          value: item,
        });
        void (await idbEntity)?.put({ ...existing, ...item });
      } else {
        write({
          type: 'insert',
          value: Schema.decodeUnknownSync(itemCollection.schema)(item),
        });
        void (await idbEntity)?.put(item);
      }
    });

    commit();
  };

  const collection = createCollection({
    getKey: (v: Collection['Type']) => v[itemCollection.key],
    startSync: true,
    sync: {
      sync: (params) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const { markReady } = params;
            console.log('TESTING: SYNC: ');
            syncParams = params;

            const data = yield* Effect.promise(async () =>
              (await idbEntity)?.query(),
            );
            bulkUpsert(data ?? []);
            if (sync) {
              const data = yield* sync.query;
              bulkUpsert(data);
            }
            markReady();
            console.log('MARKED READY!');

            return () => {
              console.log('OUT OF SYNC!!');
            };
          }),
        ),
    },
    onInsert: ({ transaction }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const input = transaction.mutations.map((mutation) =>
            Schema.decodeUnknownSync(itemCollection.schema)(mutation.changes),
          );
          if (sync) {
            const result = yield* Effect.all(
              input.map((v) =>
                sync
                  .onInsert(v)
                  .pipe(Effect.map((result) => ({ result, value: v }))),
              ),
              { concurrency: 'unbounded' },
            );
            bulkUpsert(result.map((v) => (v.result ? v.result : v.value)));
          } else {
            bulkUpsert(input);
          }
        }),
      ),
    onUpdate: ({ transaction }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const input = transaction.mutations.map((mutation) => ({
            [itemCollection.key]: mutation.key,
            ...mutation.changes,
          }));
          if (sync) {
            const values = yield* Effect.all(
              input.map((v) =>
                sync
                  .onUpdate(v)
                  .pipe(Effect.map((result) => ({ result, value: v }))),
              ),
            );
            bulkUpsert(values.map((v) => (v.result ? v.result : v.value)));
          } else {
            bulkUpsert(input);
          }
        }),
      ),
  });

  return {
    collection,
    update: collection.update.bind(collection),
    insert: collection.insert.bind(collection),
    upsert: (value: UpdateItemType) => {
      const existing = collection.get(value[itemCollection.key]);

      if (existing) {
        collection.update(value[itemCollection.key], (draft) =>
          Object.assign(draft, value),
        );

        return { ...existing, ...value };
      } else {
        collection.insert(
          Schema.decodeUnknownSync(itemCollection.schema)(value),
        );
        return value;
      }
    },
    unsafeUpsert(v: UpdateItemType) {
      if (!syncParams) {
        return;
      }
      bulkUpsert([v]);
    },
    unsafeBulkUpsert: bulkUpsert,
  };
};
