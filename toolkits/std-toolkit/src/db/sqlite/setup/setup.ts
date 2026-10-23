import { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { OperationFailure } from '../../std-table/contract/index.js';
import {
  planSetup,
  SetupRefused,
  type CurrentContract,
} from '../../stored-contract/index.js';
import { SQLiteChangesMismatch, type SQLiteDriver } from '../database/index.js';
import { CONTRACT_TABLE, Statement } from '../statement/index.js';
import { reconcileSQLiteTopology } from './topology.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

/** Creates the physical table when it is missing; never alters an existing one. */
export const ensureSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  database.run(Statement.createTable(tableName, table).sql).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );

/** Adds missing index columns and indexes, and replaces incompatible ones. */
export const reconcileSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  reconcileSQLiteTopology(database, table, tableName).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );

const failed = (cause: unknown) => new OperationFailure({ cause });

const readStoredContract = (database: SQLiteDriver, tableName: string) =>
  Effect.gen(function* () {
    yield* database.run(Statement.createContractTable().sql);
    const read = Statement.readContract(tableName);
    const row = (yield* database.all(read.sql, read.parameters)).at(0);
    if (row === undefined) return undefined;
    const { mode, hash } = row;
    if (
      (mode !== 'persistent' && mode !== 'disposable') ||
      typeof hash !== 'string'
    )
      return yield* Effect.fail(
        new Error(`SQLite stored contract of "${tableName}" is malformed`),
      );
    return { mode, hash } as const;
  }).pipe(Effect.mapError(failed));

const readStoredSnapshot = (database: SQLiteDriver, tableName: string) =>
  Effect.gen(function* () {
    const read = Statement.readContractSnapshot(tableName);
    const row = (yield* database.all(read.sql, read.parameters)).at(0);
    if (typeof row?.snapshot !== 'string')
      return yield* Effect.fail(
        new Error(`SQLite stored contract of "${tableName}" has no snapshot`),
      );
    return JSON.parse(row.snapshot) as unknown;
  });

// Another setup recorded a contract after this one read it: start over.
class ContractMoved extends Error {}

const ATTEMPTS = 3;

const setUpOnce = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  contract: CurrentContract,
) =>
  Effect.gen(function* () {
    const stored = yield* readStoredContract(database, tableName);
    const plan = yield* planSetup({
      current: contract,
      stored,
      loadStoredSnapshot: readStoredSnapshot(database, tableName),
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof SetupRefused ? cause : failed(cause),
      ),
    );
    const next = {
      mode: contract.record.mode,
      hash: contract.record.hash,
      snapshot: JSON.stringify(contract.record.snapshot),
    };
    // Every write of the contract holds only while it is the one read above,
    // so a setup deciding on a stale read never wipes or overwrites.
    const record =
      stored === undefined
        ? Statement.insertContract(tableName, next)
        : Statement.swapContract(tableName, stored, next);
    if (plan.kind === 'wipe') {
      yield* Effect.logWarning(
        `std-toolkit: wiped disposable table "${tableName}" for a change its stored rows cannot take`,
      );
      yield* database
        .transaction([
          { ...record, expectedChanges: 1 },
          Statement.dropTable(tableName),
        ])
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof SQLiteChangesMismatch
              ? new ContractMoved()
              : failed(cause),
          ),
        );
    }
    yield* ensureSQLiteTable(database, table, tableName);
    yield* reconcileSQLiteTable(database, table, tableName);
    if (plan.kind !== 'apply') return;
    const { changes } = yield* database
      .run(record.sql, record.parameters)
      .pipe(Effect.mapError(failed));
    if (changes !== 1) return yield* Effect.fail(new ContractMoved());
  });

/**
 * Prepares the physical table under its Stored contract: compares the
 * current contract with the one stored beside the data, refuses a persistent
 * table's breaking change, wipes a disposable table's, then applies the
 * topology and records the new contract. An unchanged contract is one read
 * and skips the comparison; the physical table is still checked. A setup
 * that loses a race with another starts over from the contract it recorded.
 */
export const setUpSQLiteTable = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  contract: CurrentContract,
): Effect.Effect<void, OperationFailure | SetupRefused> =>
  Effect.gen(function* () {
    if (tableName.toLowerCase() === CONTRACT_TABLE)
      return yield* Effect.fail(
        failed(new Error(`SQLite table name "${CONTRACT_TABLE}" is reserved`)),
      );
    for (let attempt = 1; ; attempt++) {
      const result = yield* setUpOnce(
        database,
        table,
        tableName,
        contract,
      ).pipe(Effect.result);
      if (result._tag === 'Success') return;
      if (!(result.failure instanceof ContractMoved))
        return yield* Effect.fail(result.failure);
      if (attempt === ATTEMPTS)
        return yield* Effect.fail(
          failed(
            new Error(
              `SQLite setup for table "${tableName}" kept racing another setup`,
            ),
          ),
        );
    }
  });
