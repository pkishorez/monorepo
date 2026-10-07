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
import { scanItems } from './scan.js';
import { transactionPromise } from './transaction.js';
import { storedConditionHolds, writeFailure } from './write.js';
import { toNativeKey, itemSchema } from '../item-schema/index.js';

const abortQuietly = (transaction: IDBTransaction) => {
  try {
    transaction.abort();
  } catch {
    return;
  }
};

// A version change (another table of the same database adding its store,
// in this tab or another) closes the connection under whatever was running
// on it. That ran nothing, so it runs again on the connection opened next.
const closedUnderneath = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  (cause.name === 'InvalidStateError' || cause.name === 'AbortError');

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
  const onConnection = async <A>(
    run: (connection: IDBDatabase) => Promise<A>,
  ): Promise<A> => {
    try {
      return await run(await database.open());
    } catch (cause) {
      if (!closedUnderneath(cause)) throw cause;
      return run(await database.open());
    }
  };
  return {
    getItem: (key) =>
      Effect.tryPromise({
        try: () =>
          onConnection(async (connection) => {
            const request = connection
              .transaction(storeName)
              .objectStore(storeName)
              .get(toNativeKey(key));
            const result = (await requestPromise(request)) as
              | Record<string, unknown>
              | undefined;
            return result === undefined ? null : encodeItem(result);
          }),
        catch: nativeFailure,
      }),
    writeItem: (write) =>
      Effect.tryPromise({
        try: () =>
          onConnection(async (connection) => {
            const transaction = connection.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            if (
              !(await storedConditionHolds(store, write.item, write.condition))
            )
              throw conditionFailed();
            store.put(decodeItem(write.item));
            await transactionPromise(transaction);
          }),
        catch: writeFailure,
      }),
    transactWriteItems: (writes) =>
      Effect.tryPromise({
        try: () =>
          onConnection(async (connection) => {
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
          }),
        catch: writeFailure,
      }),
    hardDeleteItem: (key) =>
      Effect.tryPromise({
        try: () =>
          onConnection(async (connection) => {
            const transaction = connection.transaction(storeName, 'readwrite');
            transaction.objectStore(storeName).delete(toNativeKey(key));
            await transactionPromise(transaction);
          }),
        catch: nativeFailure,
      }),
    hardDeleteEntityItems: (entity) =>
      Effect.tryPromise({
        try: () =>
          onConnection(async (connection) => {
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
          }),
        catch: nativeFailure,
      }),
    hardDeleteAllItems: () =>
      Effect.tryPromise({
        try: () =>
          onConnection(async (connection) => {
            const transaction = connection.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const removed = await requestPromise(store.count());
            store.clear();
            await transactionPromise(transaction);
            return removed;
          }),
        catch: nativeFailure,
      }),
    queryItems: (query) =>
      Effect.tryPromise({
        try: () =>
          onConnection((connection) =>
            queryItems(connection, table, storeName, query, database.compare),
          ),
        catch: nativeFailure,
      }),
    scanItems: (request) =>
      Effect.tryPromise({
        try: () =>
          onConnection((connection) =>
            scanItems(connection, table, storeName, request),
          ),
        catch: nativeFailure,
      }),
  };
};
