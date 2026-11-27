import { Effect } from 'effect';
import {
  conditionFailed,
  isInternalEntity,
  type ContractFailure,
} from '../../std-table/contract/index.js';
import { SnapshotEntities } from '../../std-table/definition/index.js';
import type { IDBConnection } from '../database/index.js';
import { abortQuietly, withConnection } from './connection.js';
import { transactionPromise } from './transaction.js';
import { writeFailure } from './write.js';

/**
 * Deletes every item of the store but the internal entities', in one
 * transaction that holds only while the `__snapshot` item's `_u` is still
 * `expected` (`undefined` for none): otherwise nothing is deleted and it
 * fails with `ConditionFailure`. It walks the store itself, not the
 * `_entity` index, since it runs before setup reconciles the indexes.
 */
export const wipeStore = (
  database: IDBConnection,
  storeName: string,
  expected: string | undefined,
): Effect.Effect<void, ContractFailure> =>
  Effect.tryPromise({
    try: () =>
      withConnection(database, async (connection) => {
        const transaction = connection.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const cursor = store.openCursor();
        let found: string | undefined;
        // Decided inside the transaction, so no other tab writes in between;
        // aborting it undoes every delete already made.
        const moved = () => {
          abortQuietly(transaction);
          return conditionFailed();
        };
        await new Promise<void>((resolve, reject) => {
          cursor.onerror = () => reject(cursor.error);
          cursor.onsuccess = () => {
            const current = cursor.result;
            if (current === null)
              return found === expected ? resolve() : reject(moved());
            const record = current.value as {
              readonly _e: string;
              readonly _u: string;
            };
            if (record._e === SnapshotEntities.snapshot.name) {
              if (record._u !== expected) return reject(moved());
              found = record._u;
            } else if (!isInternalEntity(record._e)) current.delete();
            current.continue();
          };
        });
        await transactionPromise(transaction);
      }),
    catch: writeFailure,
  });
