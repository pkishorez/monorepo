import type { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { inspectUpgrade, upgradeDatabase } from './upgrade.js';

interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

type TableSource = Pick<
  TableDefinition,
  'localSecondaryIndexes' | 'globalSecondaryIndexes' | 'snapshot'
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

export const setupIDBTable = (
  database: {
    readonly setup: (
      storeName: string,
      indexes: readonly IDBIndexDefinition[],
    ) => Effect.Effect<void, unknown>;
  },
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

  return (
    storeName: string,
    indexes: readonly IDBIndexDefinition[],
  ): Promise<void> => {
    if (indexes.some(({ name }) => name === '_entity'))
      return Promise.reject(
        new Error('IndexedDB index slot name "_entity" is reserved'),
      );
    const setup = queue.then(async () => {
      for (;;) {
        const database = await connection.open();
        const plan = inspectUpgrade(database, storeName, indexes);
        if (plan === null) return;
        const nextVersion = database.version + 1;
        database.close();
        await connection.upgrade(nextVersion, (next, transaction) =>
          upgradeDatabase(next, transaction, plan),
        );
      }
    });
    queue = setup.catch(() => undefined);
    return setup;
  };
};
