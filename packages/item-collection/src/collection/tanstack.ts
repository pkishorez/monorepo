import { IDBEntity, IDBStore } from '@monorepo/effect-idb';
import type { EmptyESchema } from '@monorepo/eschema';
import type { ItemCollection } from './collection.js';
import { createCollection, type SyncConfig } from '@tanstack/db';
import { Effect, Schema } from 'effect';

const tanstackIDB = await IDBStore.make('tanstack-db');

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
  const idbEntity = IDBEntity.make(itemCollection.name)
    .eschema(itemCollection.eschema)
    .id(itemCollection.key)
    .build(tanstackIDB);

  const bulkUpsert = (items: UpdateItemType[]) => {
    if (!syncParams) {
      return;
    }

    const { begin, write, commit, collection } = syncParams;
    begin();

    items.forEach((item) => {
      const existing = collection.get(item[itemCollection.key]);
      if (existing) {
        write({
          type: 'update',
          value: Schema.decodeUnknownSync(itemCollection.broadcastSchema)(item),
        });
        void idbEntity.put({ ...existing, ...item });
      } else {
        write({
          type: 'insert',
          value: Schema.decodeUnknownSync(itemCollection.schema)(item),
        });
        void idbEntity.put(item);
      }
    });

    commit();
  };

  const collection = createCollection({
    getKey: (v: Collection['Type']) => v[itemCollection.key],
    sync: {
      sync: (params) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const { markReady } = params;
            syncParams = params;

            const data = yield* Effect.promise(() => idbEntity.query());
            bulkUpsert(data);
            if (sync) {
              const data = yield* sync.query;
              bulkUpsert(data);
            }
            markReady();

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
          const input = transaction.mutations.map((mutation) =>
            Schema.decodeUnknownSync(itemCollection.broadcastSchema)({
              [itemCollection.key]: mutation.key,
              ...mutation.changes,
            }),
          );
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
          Object.assign(
            draft,
            Schema.decodeUnknownSync(itemCollection.broadcastSchema)(value),
          ),
        );
      } else {
        collection.insert(
          Schema.decodeUnknownSync(itemCollection.schema)(value),
        );
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
