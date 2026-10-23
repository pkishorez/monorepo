import { Effect } from 'effect';
import {
  contractLayer,
  OperationFailure,
} from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import type { TableSource as SnapshotSource } from '../../snapshot/index.js';
import {
  captureContract,
  contractFromSnapshot,
  type SetupRefused,
  type TableMode,
} from '../stored-contract/index.js';
import type { SQLiteDriver } from './database/index.js';
import { makeTableContract } from './table/index.js';
import { setUpSQLiteTable } from './setup/index.js';

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

type TopologySource = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
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
 * Prepares the physical table under its Stored contract, kept beside the data
 * in the database. A persistent table refuses a breaking change and is never
 * wiped; a disposable table is wiped and recreated on any change its stored
 * rows cannot take. Then it creates the table when missing, adds missing
 * index columns and indexes, and replaces incompatible ones. Run it where no
 * request pays for it: at deploy (the Alchemy D1 target does), at process
 * start, or on a Durable Object's first access. An unchanged contract skips
 * the comparison.
 */
const setup = <Name extends string>(
  table: TableSource<Name> & SnapshotSource,
  config: SQLiteSetupConfig,
): Effect.Effect<void, OperationFailure | SetupRefused> =>
  captureContract(table, config.mode).pipe(
    Effect.flatMap((contract) =>
      setUpSQLiteTable(
        config.database,
        table,
        config.tableName ?? table.logicalName,
        contract,
      ),
    ),
  );

/**
 * `setup` from a serialized table snapshot, for a deploy target that carries
 * the snapshot instead of the table.
 */
export const setUpFromSnapshot = (
  topology: TopologySource,
  snapshot: unknown,
  config: SQLiteSetupConfig & { readonly tableName: string },
): Effect.Effect<void, OperationFailure | SetupRefused> =>
  contractFromSnapshot(snapshot, config.mode).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
    Effect.flatMap((contract) =>
      setUpSQLiteTable(config.database, topology, config.tableName, contract),
    ),
  );

export const SQLite = { make, setup } as const;

export type { SQLiteDriver } from './database/index.js';
