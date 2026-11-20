import type { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import {
  ensureStore,
  reconcileStore,
  type IDBIndexDefinition,
  type IDBUpgrade,
} from './upgrade.js';

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
  readonly upgrade: (
    upgrades: readonly IDBUpgrade[],
  ) => Effect.Effect<void, unknown>;
}

/** Creates the store when missing, then adds or replaces the secondary indexes the topology declares. */
export const reconcileIDBStore = (
  database: Pick<UpgradeableDatabase, 'setup'>,
  table: TableSource,
  storeName: string,
) => database.setup(storeName, tableIndexes(table));

/**
 * Creates the store, with the topology's indexes, when it is missing, in the
 * same version change as `upgrades`; an existing store's indexes are left as
 * they are. Fails, changing nothing, when the store can never take the table.
 */
export const ensureIDBStore = (
  database: Pick<UpgradeableDatabase, 'upgrade'>,
  table: TableSource,
  storeName: string,
  upgrades: readonly IDBUpgrade[],
) =>
  database.upgrade([ensureStore(storeName, tableIndexes(table)), ...upgrades]);

export const makeIDBSetup = (connection: {
  readonly open: () => Promise<IDBDatabase>;
  readonly upgrade: (
    version: number,
    onUpgrade: (database: IDBDatabase, transaction: IDBTransaction) => void,
  ) => Promise<IDBDatabase>;
}) => {
  let queue: Promise<void> = Promise.resolve();

  // Upgrades run one at a time, each until the open database needs none of
  // its version changes: another tab may have made them, or more, meanwhile.
  const upgradeUntil = (upgrades: readonly IDBUpgrade[]): Promise<void> => {
    const run = queue.then(async () => {
      for (;;) {
        const database = await connection.open();
        const needed = upgrades.filter((upgrade) => upgrade.needed(database));
        if (needed.length === 0) return;
        const nextVersion = database.version + 1;
        database.close();
        await connection.upgrade(nextVersion, (next, transaction) => {
          for (const upgrade of needed) upgrade.apply(next, transaction);
        });
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    setup: (
      storeName: string,
      indexes: readonly IDBIndexDefinition[],
    ): Promise<void> => upgradeUntil([reconcileStore(storeName, indexes)]),
    upgrade: (upgrades: readonly IDBUpgrade[]): Promise<void> =>
      upgradeUntil(upgrades),
  };
};
