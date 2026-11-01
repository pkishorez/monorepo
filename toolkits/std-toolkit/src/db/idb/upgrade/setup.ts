import type { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { inspectUpgrade, nothingToChange, upgradeDatabase } from './upgrade.js';

interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

type TableSource = Pick<
  TableDefinition,
  'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

/** The secondary indexes a table's topology declares, as IndexedDB indexes. */
export const tableIndexes = (
  table: TableSource,
): readonly IDBIndexDefinition[] => [
  ...Object.values(table.localSecondaryIndexes).map((index) => ({
    name: index.name,
    keyPath: ['pk', index.sk] as const,
  })),
  ...Object.values(table.globalSecondaryIndexes).map((index) => ({
    name: index.name,
    keyPath: [index.pk, index.sk] as const,
  })),
];

interface UpgradeableDatabase {
  readonly setup: (
    storeName: string,
    indexes: readonly IDBIndexDefinition[],
  ) => Effect.Effect<unknown, unknown>;
}

/** Makes the store and its indexes exactly what the topology declares. */
export const reconcileIDBStore = (
  database: UpgradeableDatabase,
  table: TableSource,
  storeName: string,
) => database.setup(storeName, tableIndexes(table));

export const makeIDBSetup = (connection: {
  readonly open: () => Promise<IDBDatabase>;
  readonly upgrade: (
    version: number,
    onUpgrade: (database: IDBDatabase, transaction: IDBTransaction) => void,
  ) => Promise<IDBDatabase>;
}) => {
  let queue: Promise<void> = Promise.resolve();

  // Upgrades run one at a time, each until its inspection finds nothing
  // left. An index changes only in a versionchange transaction, so each
  // round closes the connection and opens the next version, whose upgrade
  // makes the change; a competing upgrade from another tab is inspected
  // again on the next round. With `bump`, at least one round runs even when
  // nothing is left, so every other connection sees a version change.
  // Answers whether a round created the store.
  const upgradeUntil = (
    storeName: string,
    indexes: readonly IDBIndexDefinition[],
    exact: boolean,
    bump: boolean,
  ): Promise<boolean> => {
    if (indexes.some(({ name }) => name === '_entity'))
      return Promise.reject(
        new Error('IndexedDB index slot name "_entity" is reserved'),
      );
    const run = queue.then(async () => {
      let created = false;
      let bumped = !bump;
      for (;;) {
        const database = await connection.open();
        const plan =
          inspectUpgrade(database, storeName, indexes, exact) ??
          (bumped ? null : nothingToChange(storeName));
        if (plan === null) return created;
        created ||= plan.createStore;
        bumped = true;
        const nextVersion = database.version + 1;
        database.close();
        await connection.upgrade(nextVersion, (next, transaction) =>
          upgradeDatabase(next, transaction, plan),
        );
      }
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    /** Creates the store, with these indexes, only when it is missing. */
    createStore: (
      storeName: string,
      indexes: readonly IDBIndexDefinition[],
    ): Promise<boolean> => upgradeUntil(storeName, indexes, false, false),
    /** Creates the store when missing and makes its indexes exactly these. */
    setup: (
      storeName: string,
      indexes: readonly IDBIndexDefinition[],
    ): Promise<boolean> => upgradeUntil(storeName, indexes, true, false),
    /** Like `setup`, but in a new version even when nothing else changes. */
    changeVersion: (
      storeName: string,
      indexes: readonly IDBIndexDefinition[],
    ): Promise<boolean> => upgradeUntil(storeName, indexes, true, true),
  };
};
