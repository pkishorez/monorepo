import { Effect, Schema } from 'effect';
import {
  checkFailed,
  conditionFailed,
  transactItemKey,
  type StdTableContract,
} from '../../std-table/contract/index.js';
import type { IDBConnection } from '../database/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { queryItems } from './query.js';
import { nativeFailure, requestPromise } from './request.js';
import { transactionPromise } from './transaction.js';
import { storedConditionHolds, writeFailure } from './write.js';
import { decodeKey, itemSchema } from '../item-schema/index.js';

const abortQuietly = (transaction: IDBTransaction) => {
  try {
    transaction.abort();
  } catch {
    return;
  }
};

export const makeTableContract = (
  database: IDBConnection,
  table: Pick<
    TableDefinition,
    'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  storeName: string,
): StdTableContract => {
  const schema = itemSchema(table);
  const decodeItem = Schema.decodeSync(schema);
  const encodeItem = Schema.encodeSync(schema);
  return {
    getItem: (key) =>
      Effect.tryPromise({
        try: async () => {
          const connection = await database.open();
          const request = connection
            .transaction(storeName)
            .objectStore(storeName)
            .get(decodeKey(key));
          const result = (await requestPromise(request)) as
            | Record<string, unknown>
            | undefined;
          return result === undefined ? null : encodeItem(result);
        },
        catch: nativeFailure,
      }),
    writeItem: (write) =>
      Effect.tryPromise({
        try: async () => {
          const connection = await database.open();
          const transaction = connection.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          if (!(await storedConditionHolds(store, write.item, write.condition)))
            throw conditionFailed();
          store.put(decodeItem(write.item));
          await transactionPromise(transaction);
        },
        catch: writeFailure,
      }),
    transactWriteItems: (writes) =>
      Effect.tryPromise({
        try: async () => {
          const connection = await database.open();
          const transaction = connection.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          try {
            for (const [index, write] of writes.entries()) {
              if (
                !(await storedConditionHolds(
                  store,
                  transactItemKey(write),
                  write.condition,
                ))
              )
                throw checkFailed(writes.length, index, write.condition);
              if (write.kind === 'put') store.put(decodeItem(write.item));
            }
          } catch (cause) {
            abortQuietly(transaction);
            throw cause;
          }
          await transactionPromise(transaction);
        },
        catch: writeFailure,
      }),
    hardDeleteItem: (key) =>
      Effect.tryPromise({
        try: async () => {
          const connection = await database.open();
          const transaction = connection.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).delete(decodeKey(key));
          await transactionPromise(transaction);
        },
        catch: nativeFailure,
      }),
    hardDeleteEntityItems: (entity) =>
      Effect.tryPromise({
        try: async () => {
          const connection = await database.open();
          const transaction = connection.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const cursor = store
            .index('_entity')
            .openKeyCursor(IDBKeyRange.only(entity));
          let removed = 0;
          await new Promise<void>((resolve, reject) => {
            cursor.onerror = () => reject(cursor.error);
            cursor.onsuccess = () => {
              const current = cursor.result;
              if (current === null) return resolve();
              store.delete(current.primaryKey);
              removed++;
              current.continue();
            };
          });
          await transactionPromise(transaction);
          return removed;
        },
        catch: nativeFailure,
      }),
    hardDeleteAllItems: () =>
      Effect.tryPromise({
        try: async () => {
          const connection = await database.open();
          const transaction = connection.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const removed = await requestPromise(store.count());
          store.clear();
          await transactionPromise(transaction);
          return removed;
        },
        catch: nativeFailure,
      }),
    queryItems: (query) =>
      Effect.tryPromise({
        try: async () =>
          queryItems(
            await database.open(),
            table,
            storeName,
            query,
            database.compare,
          ),
        catch: nativeFailure,
      }),
  };
};
