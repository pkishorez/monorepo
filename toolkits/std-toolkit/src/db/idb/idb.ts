import { contractLayer } from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
import { makeTableContract } from './table/index.js';
import { setupIDBTable } from './upgrade/index.js';

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
  readonly setup: ReturnType<typeof setupIDBTable>;
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
    setup: setupIDBTable(config.database, table, storeName),
  };
};

export const IDB = { make, database: makeIDBDatabase } as const;

export type { IDBDatabaseConfig, IDBConnection };
