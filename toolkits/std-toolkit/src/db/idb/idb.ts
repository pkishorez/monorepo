import { Effect } from 'effect';
import { contractLayer } from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import { setupTable, type SetupError } from '../std-table/enforcement/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
import { makeTableContract } from './table/index.js';
import { ensureIDBStore, reconcileIDBStore } from './upgrade/index.js';

export interface IDBConfig {
  readonly database: IDBConnection;
  readonly storeName?: string;
}

type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  | 'logicalName'
  | 'primary'
  | 'localSecondaryIndexes'
  | 'globalSecondaryIndexes'
  | 'snapshot'
>;

export interface IDBTable<Name extends string> {
  readonly storeName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
  /** Creates the store, runs table-level enforcement, then upgrades indexes. */
  readonly setup: Effect.Effect<void, unknown | SetupError>;
}

const make = <Name extends string>(
  table: TableSource<Name>,
  config: IDBConfig,
): IDBTable<Name> => {
  const storeName = config.storeName ?? table.logicalName;
  const contract = makeTableContract(config.database, table, storeName);
  return {
    storeName,
    layer: contractLayer(table.logicalName, contract),
    // Suspended so entities registered after `make` are part of the snapshot.
    setup: Effect.suspend(() =>
      setupTable(contract, table.snapshot(), {
        ensure: ensureIDBStore(config.database, storeName),
        reconcile: reconcileIDBStore(config.database, table, storeName),
      }),
    ),
  };
};

export const IDB = { make, database: makeIDBDatabase } as const;

export type { IDBDatabaseConfig, IDBConnection };
