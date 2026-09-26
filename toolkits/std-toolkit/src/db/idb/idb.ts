import { Effect } from 'effect';
import { contractLayer } from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
import { makeTableContract } from './table/index.js';
import { reconcileIDBStore } from './upgrade/index.js';

export interface IDBConfig {
  readonly database: IDBConnection;
  readonly storeName?: string;
}

type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export interface IDBTable<Name extends string> {
  readonly storeName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
}

/**
 * Realizes a StdTable on one IndexedDB database. The store and its indexes
 * are created or upgraded the first time the table opens the connection,
 * which is how IndexedDB itself works: schema lives in the open request.
 */
const make = <Name extends string>(
  table: TableSource<Name>,
  config: IDBConfig,
): IDBTable<Name> => {
  const storeName = config.storeName ?? table.logicalName;
  let prepared: Promise<void> | undefined;
  const prepare = () =>
    (prepared ??= Effect.runPromise(
      reconcileIDBStore(config.database, table, storeName).pipe(Effect.orDie),
    ).catch((cause) => {
      prepared = undefined;
      throw cause;
    }));
  const connection: IDBConnection = {
    ...config.database,
    open: async () => {
      await prepare();
      return config.database.open();
    },
  };
  return {
    storeName,
    layer: contractLayer(
      table.logicalName,
      makeTableContract(connection, table, storeName),
    ),
  };
};

/**
 * Adapter-native: creates the store and its indexes now instead of on the
 * table's first open. Useful when a page wants the version change to happen
 * at a moment it controls, since IndexedDB upgrades block on other tabs.
 */
const setup = <Name extends string>(
  table: TableSource<Name>,
  config: IDBConfig,
): Effect.Effect<void, unknown> =>
  reconcileIDBStore(
    config.database,
    table,
    config.storeName ?? table.logicalName,
  );

export const IDB = { make, setup, database: makeIDBDatabase } as const;

export type { IDBDatabaseConfig, IDBConnection };
