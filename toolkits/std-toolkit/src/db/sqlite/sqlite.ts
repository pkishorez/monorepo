import { Effect } from 'effect';
import {
  contractLayer,
  OperationFailure,
} from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  TableSnapshot,
  type TableSource as SnapshotSource,
} from '../../snapshot/index.js';
import {
  captureTable,
  type SetupRefused,
  type TableMode,
} from '../table-snapshot/index.js';
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
 * Prepares the physical table under the snapshot it keeps in its own internal
 * entities (ADR 0020). A persistent table refuses a breaking change and is
 * never wiped, and a refusal changes nothing; a disposable table is dropped
 * and recreated on any change its stored rows cannot take. Then it adds
 * missing index columns and indexes, and replaces incompatible ones. A table
 * kept under the retired `_std_contract` table is migrated first.
 *
 * Run it where no request pays for it, before the table is used: at process
 * start for a SQLite file, at deploy for D1 (the Alchemy `D1.table` resource
 * does), and in a Durable Object's constructor, inside
 * `ctx.blockConcurrencyWhile`, so no request reaches the object before its
 * table is set up.
 */
const setup = <Name extends string>(
  table: TableSource<Name> & SnapshotSource,
  config: SQLiteSetupConfig,
): Effect.Effect<void, OperationFailure | SetupRefused> =>
  Effect.suspend(() =>
    setUpSQLiteTable(
      config.database,
      table,
      config.tableName ?? table.logicalName,
      captureTable(table),
      config.mode,
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
  TableSnapshot.parse(snapshot).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
    Effect.flatMap((parsed) =>
      setUpSQLiteTable(
        config.database,
        topology,
        config.tableName,
        parsed,
        config.mode,
      ),
    ),
  );

export const SQLite = { make, setup } as const;

export type { SQLiteDriver } from './database/index.js';
