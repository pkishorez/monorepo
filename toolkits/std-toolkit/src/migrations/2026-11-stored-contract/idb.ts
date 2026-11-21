import { Effect } from 'effect';
import { OperationFailure } from '../../db/std-table/contract/index.js';
import { LEGACY_CONTRACT_STORE } from './legacy.js';

/** A version change, as IndexedDB setup makes it. */
export interface LegacyIDBUpgrade {
  /** Whether the open database still needs it. */
  readonly needed: (database: IDBDatabase) => boolean;
  /** Makes it, inside the version change. */
  readonly apply: (database: IDBDatabase, transaction: IDBTransaction) => void;
}

export interface LegacyIDBTarget {
  /** The table store's name in the database. */
  readonly storeName: string;
}

const deleteContractStore: LegacyIDBUpgrade = {
  needed: (database) =>
    database.objectStoreNames.contains(LEGACY_CONTRACT_STORE),
  apply: (database) => {
    if (database.objectStoreNames.contains(LEGACY_CONTRACT_STORE))
      database.deleteObjectStore(LEGACY_CONTRACT_STORE);
  },
};

/**
 * Deletes the `_std_contract` store a database kept every store's Stored
 * contract in (ADR 0019). Nothing in it is moved: every IndexedDB table in
 * this repo is disposable, so a store with rows and no snapshot is wiped by
 * the check, and a persistent one keeps its rows under the code's snapshot.
 * Refuses a table store named `_std_contract`, which the deletion would take.
 */
export const migrateIDB = (
  target: LegacyIDBTarget,
): Effect.Effect<readonly LegacyIDBUpgrade[], OperationFailure> =>
  target.storeName === LEGACY_CONTRACT_STORE
    ? Effect.fail(
        new OperationFailure({
          cause: new Error(
            `IndexedDB Store name "${LEGACY_CONTRACT_STORE}" is reserved for the stored contracts it once held`,
          ),
        }),
      )
    : Effect.succeed([deleteContractStore]);
