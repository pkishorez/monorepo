import { IDBEntity, IDBStore } from '@std-toolkit/idb';
import type { EmptyESchema } from '@std-toolkit/eschema';
import type { ItemCollection } from './collection.js';
import { createCollection, SyncConfig, Collection } from '@tanstack/react-db';
import { Effect, Option, Schema } from 'effect';

export const tanstackCollection = <
  TCollection extends ItemCollection<string, EmptyESchema, any>,
>({
  itemCollection,
  sync,
  syncIndexedDb,
}: {
  itemCollection: TCollection;
  sync?: {
    query: Effect.Effect<TCollection['Type'][], never, never>;
    queryNew?: (
      value: TCollection['Type'],
    ) => Effect.Effect<TCollection['Type'][], never, never>;
    queryOld?: (
      value: TCollection['Type'],
    ) => Effect.Effect<TCollection['Type'][], never, never>;
    onInsert?: (
      value: TCollection['Type'],
    ) => Effect.Effect<void | TCollection['Type']>;
    onUpdate?: (
      value: TCollection['broadcastSchema']['Type'],
    ) => Effect.Effect<void | TCollection['broadcastSchema']['Type']>;
  };
  syncIndexedDb?: boolean;
}) => {
  type UpdateItemType = TCollection['broadcastSchema']['Type'];
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

  const bulkUpdate = (items: UpdateItemType[]) => {
    if (!syncParams.current) {
      return;
    }
    const { begin, write, commit, collection } = syncParams.current;

    begin();

    const itemsForIdb: any[] = [];

    items.forEach((item) => {
      const key = item[itemCollection.key];

      const existing = collection._state.get(key);
      const updateValue = Effect.runSync(
        Schema.decodeUnknown(itemCollection.schema)({
          ...existing,
          ...item,
        }).pipe(
          Effect.tapError((err) =>
            Effect.logError('ERROR WITH EXISTING!!!', {
              name: itemCollection.name,
              key,
              existing,
              item,
              err,
            }),
          ),
        ),
      );
      write({
        type: 'update',
        value: updateValue,
      });
      itemsForIdb.push(updateValue);
    });

    commit();

    if (syncIndexedDb) {
      (async () =>
        await Promise.all(
          itemsForIdb.map(async (v) => (await idbEntity)?.put(v)),
        ))();
    }
  };
  const bulkInsert = (items: UpdateItemType[]) => {
    if (!syncParams.current) {
      return;
    }
    const { begin, write, commit } = syncParams.current;

    begin();

    const itemsForIdb: any[] = [];
    const validatedItems = items
      .map((item) =>
        Schema.decodeUnknownOption(itemCollection.schema)(item).pipe(
          Option.orElse(() => {
            console.error('insert parse error: ', itemCollection.name, item);
            return Option.none();
          }),
          Option.getOrNull,
        ),
      )
      .filter((v) => !!v);

    validatedItems.forEach((item) => {
      write({
        type: 'insert',
        value: item,
      });
      itemsForIdb.push(item);
    });

    commit();

    if (syncIndexedDb) {
      (async () =>
        await Promise.all(
          itemsForIdb.map(async (v) => (await idbEntity)?.put(v)),
        ))();
    }
  };

  const bulkUpsert = (items: UpdateItemType[]) => {
    if (!syncParams.current) {
      return;
    }

    const { collection } = syncParams.current;

    const updates: any[] = [];
    const inserts: any[] = [];

    items.forEach((item) => {
      const key = item[itemCollection.key];

      const existing = collection._state.syncedData.get(key);
      if (existing) {
        updates.push(item);
      } else {
        inserts.push(item);
      }
    });

    if (updates.length > 0) {
      bulkUpdate(updates);
    }
    if (inserts.length > 0) {
      bulkInsert(inserts);
    }
  };

  const collection: Collection<
    TCollection['Type'],
    string,
    {},
    never,
    TCollection['Type']
  > = createCollection({
    id: itemCollection.name,
    getKey: (v: TCollection['Type']) => v[itemCollection.key],
    startSync: true,
    sync: {
      rowUpdateMode: 'full',
      sync: (params) => {
        Effect.runPromise(
          Effect.gen(function* () {
            syncParams.current = params;

            if (sync) {
              const data = yield* sync.query;
              bulkUpsert(data);
            }

            return () => {
              console.log('OUT OF SYNC!!');
            };
          }).pipe(Effect.ensuring(Effect.sync(params.markReady))),
        )
      },
    },
    onInsert: ({ transaction }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const input = yield* Effect.all(
            transaction.mutations.map((mutation) =>
              Schema.decodeUnknown(itemCollection.schema)(
                mutation.changes,
              ).pipe(
                Effect.tapError((e) =>
                  Effect.logError({
                    name: itemCollection.name,
                    changes: mutation.changes,
                    err: e,
                  }),
                ),
              ),
            ),
            { concurrency: 'unbounded' },
          );
          const onInsert = sync?.onInsert;
          transaction.metadata.data = input;
          if (onInsert) {
            const data = yield* Effect.all(
              input.map((origValue) =>
                onInsert(origValue).pipe(
                  Effect.flatMap((apiResult) =>
                    Schema.decodeUnknown(itemCollection.schema)({
                      ...origValue,
                      ...apiResult,
                    }).pipe(
                      Effect.tapError((e) =>
                        Effect.logError({
                          name: itemCollection.name,
                          origValue,
                          apiResult,
                          err: e,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
              { concurrency: 'unbounded' },
            );

            transaction.metadata.data = data;
          }
          bulkUpdate(transaction.metadata.data as any);
        }),
      ),
    onUpdate: ({ transaction }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const input = transaction.mutations.map((mutation) => ({
            update: {
              [itemCollection.key]: mutation.key,
              ...mutation.changes,
            },
            optimistic: Schema.decodeUnknownSync(itemCollection.schema)({
              ...collection.get(mutation.key),
              ...mutation.changes,
            }),
          }));

          const onUpdate = sync?.onUpdate;
          transaction.metadata.data = input.map((v) => v.optimistic);
          if (onUpdate) {
            const data = yield* Effect.all(
              input.map(({ update, optimistic }) =>
                onUpdate(update).pipe(
                  Effect.flatMap((apiValue) =>
                    Schema.decodeUnknown(itemCollection.schema)({
                      ...optimistic,
                      ...apiValue,
                    }).pipe(
                      Effect.tapError(() =>
                        Effect.logError({
                          update,
                          optimistic,
                          apiValue,
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            );
            transaction.metadata.data = data;
          }

          bulkUpdate(transaction.metadata.data as any);
        }),
      ),
  });

  const update = (value: UpdateItemType) =>
    collection.update(value[itemCollection.key], (draft) =>
      Object.assign(draft, value),
    );
  const insert = (data: TCollection['Type']) => collection.insert(data);
  return {
    collection,
    get: (key: string) => collection.get(key),
    update,
    insert,
    upsert: (value: TCollection['Type']) => {
      if (collection.get(value[itemCollection.key])) {
        return update(value);
      }
      return insert(value);
    },
    localInsert(v: TCollection['Type']) {
      bulkInsert([v]);
    },
    localUpdate(v: UpdateItemType) {
      bulkUpdate([v]);
    },
    localUpsert(v: UpdateItemType) {
      bulkUpsert([v]);
    },

    Type: null as TCollection['Type'],
    TypeUpdate: null as unknown as UpdateItemType,
  };
};
