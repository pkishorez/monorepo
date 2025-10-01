import { IDBEntity, IDBStore } from '@monorepo/effect-idb';
import type { EmptyESchema } from '@monorepo/eschema';
import type { ItemCollection } from './collection.js';
import type {
  createCollection as tanstackCreateCollection,
  SyncConfig,
} from '@tanstack/db';
import { Effect, Schema } from 'effect';
import { update } from 'effect/Differ';

export const tanstackCollection = <
  Collection extends ItemCollection<string, EmptyESchema, any>,
>({
  createCollection,
  itemCollection,
  sync,
  syncIndexedDb = true,
}: {
  createCollection: typeof tanstackCreateCollection;
  itemCollection: Collection;
  sync?: {
    query: Effect.Effect<Collection['Type'][], never, never>;
    queryNew?: (
      value: Collection['Type'],
    ) => Effect.Effect<Collection['Type'][], never, never>;
    queryOld?: (
      value: Collection['Type'],
    ) => Effect.Effect<Collection['Type'][], never, never>;
    onInsert?: (
      value: Collection['Type'],
    ) => Effect.Effect<void | Collection['Type']>;
    onUpdate?: (
      value: Collection['broadcastSchema']['Type'],
    ) => Effect.Effect<void | Collection['broadcastSchema']['Type']>;
  };
  syncIndexedDb?: boolean;
}) => {
  type UpdateItemType = Collection['broadcastSchema']['Type'];
  let syncParams: { current: Parameters<SyncConfig['sync']>[0] | null } = {
    current: null,
  };

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
    if (!syncParams.current) {
      return;
    }

    const { begin, write, commit, collection } = syncParams.current;
    begin();

    const itemsForIdb: any[] = [];

    try {
      items.forEach((item) => {
        const existing = collection.get(item[itemCollection.key]);
        if (collection.has(item[itemCollection.key])) {
          const updateValue = Schema.decodeUnknownSync(itemCollection.schema)({
            ...existing,
            ...item,
          });
          console.log('UPDATING>>>::: ', item);
          write({
            type: 'update',
            value: updateValue,
          });
          itemsForIdb.push(updateValue);
        } else {
          console.log('INSERTING::: ', item);
          write({
            type: 'insert',
            value: Schema.decodeUnknownSync(itemCollection.schema)(item),
          });
          itemsForIdb.push(item);
        }
      });
    } catch (err) {
      console.error('ERROR: ', err);
    } finally {
      commit();

      if (syncIndexedDb) {
        (async () => {
          const idb = await idbEntity;
          if (!idb) return;
          await Promise.all(itemsForIdb.map((item) => idb.put(item)));
        })();
      }
    }
  };

  const collection = createCollection({
    getKey: (v: Collection['Type']) => v[itemCollection.key],
    startSync: true,
    sync: {
      sync: (params) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const { markReady } = params;
            syncParams.current = params;

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
          const onInsert = sync?.onInsert;
          if (onInsert) {
            console.log('CALLING INSERT API WITH: ', input);
            const result = yield* Effect.all(
              input.map((v) =>
                onInsert(v).pipe(
                  Effect.map((result) => ({ result, value: v })),
                ),
              ),
              { concurrency: 'unbounded' },
            );
            console.log('SUCCEEDED INSERT API WITH: ', input);
            bulkUpsert(result.map((v) => (v.result ? v.result : v.value)));
          } else {
            console.log('DIRECT BULK UPSERT: ', input);
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
          input.forEach((input) =>
            Schema.decodeUnknownSync(itemCollection.schema)({
              ...collection.get((input as any)[itemCollection.key]),
              ...input,
            }),
          );
          const onUpdate = sync?.onUpdate;
          if (onUpdate) {
            const values = yield* Effect.all(
              input.map((v) =>
                onUpdate(v).pipe(
                  Effect.map((result) => ({ result, origValue: v })),
                ),
              ),
            );
            bulkUpsert(values.map((v) => (v.result ? v.result : v.origValue)));
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
        try {
          collection.insert(
            Schema.decodeUnknownSync(itemCollection.schema)(value),
          );
        } catch (err) {
          console.error('ERROR IN INSERT UPSERT: ', err);
        }
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
