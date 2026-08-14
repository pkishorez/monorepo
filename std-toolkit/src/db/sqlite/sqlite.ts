import { contractLayer } from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import type { SQLiteDriver } from './database/index.js';
import { makeTableContract } from './table/index.js';
import { setupSQLiteTable } from './setup/index.js';

export interface SQLiteConfig {
  readonly database: SQLiteDriver;
  readonly tableName?: string;
}

type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  | 'logicalName'
  | 'primary'
  | 'localSecondaryIndexes'
  | 'globalSecondaryIndexes'
  | 'snapshot'
>;

export interface SQLiteTable<Name extends string> {
  readonly tableName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
  readonly setup: ReturnType<typeof setupSQLiteTable>;
}

const make = <Name extends string>(
  table: TableSource<Name>,
  config: SQLiteConfig,
): SQLiteTable<Name> => {
  const tableName = config.tableName ?? table.logicalName;
  const contract = makeTableContract(config.database, table, tableName);
  return {
    tableName,
    layer: contractLayer(table.logicalName, contract),
    setup: setupSQLiteTable(config.database, table, tableName),
  };
};

export const SQLite = { make } as const;

export type { SQLiteDriver } from './database/index.js';
