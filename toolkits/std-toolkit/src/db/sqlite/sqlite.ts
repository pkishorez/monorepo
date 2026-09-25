import { Effect } from 'effect';
import {
  contractLayer,
  OperationFailure,
} from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import { LEGACY_BASELINE_KEY } from '../std-table/key/index.js';
import type { SQLiteDriver } from './database/index.js';
import { makeTableContract } from './table/index.js';
import { ensureSQLiteTable, reconcileSQLiteTable } from './setup/index.js';

export interface SQLiteConfig {
  readonly database: SQLiteDriver;
  readonly tableName?: string;
}

type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

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
 * Prepares the physical table: creates it when missing, then adds missing
 * index columns and indexes and replaces incompatible ones. Nothing else
 * creates a SQLite table, so a deploy runs this once before serving; the
 * Alchemy D1 target does it for you. Whether the shape is safe for the rows
 * already stored is the snapshot guard's job, not this one's.
 */
const setup = <Name extends string>(
  table: TableSource<Name>,
  config: SQLiteConfig,
): Effect.Effect<void, OperationFailure> => {
  const tableName = config.tableName ?? table.logicalName;
  const contract = makeTableContract(config.database, table, tableName);
  return Effect.gen(function* () {
    yield* ensureSQLiteTable(config.database, table, tableName);
    yield* reconcileSQLiteTable(config.database, table, tableName);
    // Releases before the snapshot guard kept a baseline item in the table.
    yield* contract
      .hardDeleteItem(LEGACY_BASELINE_KEY)
      .pipe(Effect.mapError((cause) => new OperationFailure({ cause })));
  });
};

export const SQLite = { make, setup } as const;

export type { SQLiteDriver } from './database/index.js';
