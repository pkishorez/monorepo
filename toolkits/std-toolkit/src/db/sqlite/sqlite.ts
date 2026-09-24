import { Effect } from 'effect';
import { contractLayer } from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import { setupTable, type SetupError } from '../std-table/enforcement/index.js';
import type { OperationFailure } from '../std-table/contract/index.js';
import type { SQLiteDriver } from './database/index.js';
import { makeTableContract } from './table/index.js';
import { ensureSQLiteTable, reconcileSQLiteTable } from './setup/index.js';

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
  /** Creates the table, runs table-level enforcement, then reconciles indexes. */
  readonly setup: Effect.Effect<void, OperationFailure | SetupError>;
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
    // Suspended so entities registered after `make` are part of the snapshot.
    setup: Effect.suspend(() =>
      setupTable(contract, table.snapshot(), {
        ensure: ensureSQLiteTable(config.database, table, tableName),
        reconcile: reconcileSQLiteTable(config.database, table, tableName),
      }),
    ),
  };
};

export const SQLite = { make } as const;

export type { SQLiteDriver } from './database/index.js';
