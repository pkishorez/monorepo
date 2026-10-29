import { Effect } from 'effect';
import {
  contractLayer,
  OperationFailure,
} from '../std-table/contract/index.js';
import type { StdTable } from '../std-table/table/index.js';
import {
  runSetup,
  type SetupOutcome,
  type SetupTopology,
  type TableMode,
} from '../setup/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
import { prune } from './prune/index.js';
import { makeTableContract } from './table/index.js';
import { tableIndexes } from './upgrade/index.js';

export interface IDBConfig {
  readonly database: IDBConnection;
  readonly storeName?: string;
  /** Required: whether this store's data must survive every schema change. */
  readonly mode: TableMode;
}

/** What `IDB.make` needs: a StdTable, whose Backfills setup runs. */
export type IDBTableSource<Name extends string> = StdTable<Name>;

export interface IDBTable<Name extends string> {
  readonly storeName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
}

interface LockManager {
  request<A>(name: string, callback: () => Promise<A>): Promise<A>;
}

// Setups of one database run one at a time across this browser's tabs, so
// two tabs opening at once never run the same Backfill side by side. Without
// Web Locks they may race; the guarded contract write then sends the loser
// round again.
const exclusive = <A, E>(
  name: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E | unknown> => {
  const locks = (globalThis as { navigator?: { locks?: LockManager } })
    .navigator?.locks;
  if (locks === undefined) return effect;
  return Effect.tryPromise({
    try: () => locks.request(name, () => Effect.runPromiseExit(effect)),
    catch: (cause) => cause,
  }).pipe(Effect.flatMap((exit) => exit));
};

const ATTEMPTS = 3;

/**
 * Prepares the store with the shared setup (ADR 0019, 0020, 0021): the
 * Stored contract is reserved rows inside the store, read through the
 * adapter's own StdTable contract, so the store must exist first. A missing
 * store holds nothing, so it is created whole, indexes included, before
 * setup reads it; an existing one is left alone until setup has planned.
 *
 * IndexedDB changes an index only inside a versionchange transaction, which
 * closes as soon as it waits on anything else. So setup runs on ordinary
 * transactions at the current version, and its `apply` closes the
 * connection and opens the next version, whose upgrade creates and deletes
 * indexes synchronously; Backfills then run at that version. A setup that
 * fails on the database, such as losing the contract write to another tab,
 * starts over and finds that tab's contract.
 */
const prepareStore = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
): Effect.Effect<SetupOutcome, unknown> => {
  const connection = config.database;
  const indexes = tableIndexes(table);
  const topology: SetupTopology = {
    apply: () =>
      connection
        .setup(storeName, indexes)
        .pipe(Effect.mapError((cause) => new OperationFailure({ cause }))),
  };
  return exclusive(
    `std-toolkit:idb-setup:${connection.databaseName}`,
    Effect.gen(function* () {
      for (let attempt = 1; ; attempt++) {
        yield* connection.createStore(storeName, indexes);
        const result = yield* runSetup({
          table,
          mode: config.mode,
          store: makeTableContract(connection, table, storeName),
          topology,
        }).pipe(Effect.result);
        if (result._tag === 'Success') return result.success;
        if (
          !(result.failure instanceof OperationFailure) ||
          attempt === ATTEMPTS
        )
          return yield* Effect.fail(result.failure);
      }
    }),
  );
};

/**
 * Realizes a StdTable on one IndexedDB database. The store is prepared under
 * its Stored contract the first time the table opens the connection, which is
 * how IndexedDB itself works: schema lives in the open request.
 */
const make = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
): IDBTable<Name> => {
  const storeName = config.storeName ?? table.logicalName;
  let prepared: Promise<void> | undefined;
  const prepare = () =>
    (prepared ??= Effect.runPromise(
      prepareStore(table, config, storeName).pipe(Effect.asVoid, Effect.orDie),
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
 * Adapter-native: prepares the store now instead of on the table's first
 * open. Useful when a page wants the version change to happen at a moment it
 * controls, since IndexedDB upgrades block on other tabs, or wants to handle
 * `SetupRefused` or `BackfillFailed` itself.
 */
const setup = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
): Effect.Effect<SetupOutcome, unknown> =>
  prepareStore(table, config, config.storeName ?? table.logicalName);

export const IDB = {
  make,
  setup,
  database: makeIDBDatabase,
  prune,
} as const;

export type { IDBDatabaseConfig, IDBConnection };
