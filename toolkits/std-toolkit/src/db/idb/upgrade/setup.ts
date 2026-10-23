import type { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import {
  CONTRACT_STORE,
  inspectContractStore,
  inspectUpgrade,
  upgradeDatabase,
} from './upgrade.js';

interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

type TableSource = Pick<
  TableDefinition,
  'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const tableIndexes = (table: TableSource): readonly IDBIndexDefinition[] => [
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
  ) => Effect.Effect<void, unknown>;
}

/** Creates the store when missing, then adds or replaces the secondary indexes the topology declares. */
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

  // Upgrades run one at a time, each until its inspection finds nothing left.
  const upgradeUntil = (
    inspect: (database: IDBDatabase) => ReturnType<typeof inspectUpgrade>,
  ): Promise<void> => {
    const run = queue.then(async () => {
      for (;;) {
        const database = await connection.open();
        const plan = inspect(database);
        if (plan === null) return;
        const nextVersion = database.version + 1;
        database.close();
        await connection.upgrade(nextVersion, (next, transaction) =>
          upgradeDatabase(next, transaction, plan),
        );
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    setup: (
      storeName: string,
      indexes: readonly IDBIndexDefinition[],
    ): Promise<void> => {
      if (indexes.some(({ name }) => name === '_entity'))
        return Promise.reject(
          new Error('IndexedDB index slot name "_entity" is reserved'),
        );
      if (storeName === CONTRACT_STORE)
        return Promise.reject(
          new Error(`IndexedDB Store name "${CONTRACT_STORE}" is reserved`),
        );
      return upgradeUntil((database) =>
        inspectUpgrade(database, storeName, indexes),
      );
    },
    prepareContract: (): Promise<void> => upgradeUntil(inspectContractStore),
  };
};
