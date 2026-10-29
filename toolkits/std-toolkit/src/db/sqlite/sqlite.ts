import { Effect } from 'effect';
import {
  contractLayer,
  type OperationFailure,
} from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import type { DatabaseError } from '../std-table/error/index.js';
import type { StdTable } from '../std-table/table/index.js';
import {
  runSetup,
  type SetupOutcome,
  type SetupRefused,
  type TableMode,
} from '../setup/index.js';
import type { SQLiteDriver } from './database/index.js';
import { makeTableContract } from './table/index.js';
import { ensureSQLiteTable, sqliteTopology } from './setup/index.js';

export interface SQLiteConfig {
  readonly database: SQLiteDriver;
  readonly tableName?: string;
}

type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export interface SQLiteSetupConfig extends SQLiteConfig {
  /** Required: whether this physical table's data must survive every schema change. */
  readonly mode: TableMode;
}

export interface SQLiteTable<Name extends string> {
  readonly tableName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
}

/** Realizes a StdTable on one SQLite database. Providing the layer never changes the schema. */
const make = <Name extends string>(
  table: TableSource<Name>,
  config: SQLiteConfig,
): SQLiteTable<Name> => {
  const tableName = config.tableName ?? table.logicalName;
  return {
    tableName,
    layer: contractLayer(
      table.logicalName,
      makeTableContract(config.database, table, tableName),
    ),
  };
};

/**
 * Prepares the physical table under its mode (ADR 0019, 0021): creates it
 * when missing, reads the Stored contract kept as reserved rows inside it,
 * then refuses (persistent) or wipes (disposable) a change its rows cannot
 * take, applies the SQL indexes the new snapshot needs, reindexes the rows
 * an index change touches, and records the new contract. An unchanged table
 * is one read.
 * Run it where no request pays for it: at deploy (the Alchemy D1 target
 * does), at process start, or on a Durable Object's first access.
 */
const setup = <Name extends string>(
  table: StdTable<Name>,
  config: SQLiteSetupConfig,
): Effect.Effect<
  SetupOutcome,
  OperationFailure | SetupRefused | DatabaseError
> => {
  const tableName = config.tableName ?? table.logicalName;
  return ensureSQLiteTable(config.database, table, tableName).pipe(
    Effect.andThen(
      runSetup({
        table,
        mode: config.mode,
        store: makeTableContract(config.database, table, tableName),
        topology: sqliteTopology(config.database, table, tableName),
      }),
    ),
  );
};

export const SQLite = { make, setup } as const;

export type { SQLiteDriver } from './database/index.js';
