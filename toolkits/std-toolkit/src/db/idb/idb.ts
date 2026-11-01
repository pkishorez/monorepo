import { Cause, Data, Effect, Exit } from 'effect';
import {
  contractLayer,
  OperationFailure,
  type StdTableContract,
} from '../std-table/contract/index.js';
import type { StdTable } from '../std-table/table/index.js';
import {
  runSetup,
  isOutdatedCode,
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

/** What `IDB.make` needs: a StdTable, whose rows setup may reindex. */
export type IDBTableSource<Name extends string> = StdTable<Name>;

export interface IDBTable<Name extends string> {
  readonly storeName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
}

interface LockManager {
  request<A>(name: string, callback: () => Promise<A>): Promise<A>;
}

// Setups of one database run one at a time across this browser's tabs, so
// two tabs opening at once never reindex the same rows side by side. Without
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

const lockName = (connection: IDBConnection) =>
  `std-toolkit:idb-setup:${connection.databaseName}`;

/**
 * Another tab set this database up under a Stored contract this layer was
 * not built for, so its rows would be written under the wrong one. The
 * layer stays closed: the page must reload to get the newer code.
 */
export class Outdated extends Data.TaggedError('Outdated')<{
  readonly database: string;
  readonly store: string;
  readonly message: string;
}> {}

const outdated = (connection: IDBConnection, storeName: string) =>
  new Outdated({
    database: connection.databaseName,
    store: storeName,
    message: `std-toolkit: another tab upgraded IndexedDB database "${connection.databaseName}" (store "${storeName}"); reload this page.`,
  });

/**
 * Prepares the store with the shared setup (ADR 0019, 0021, 0022): the
 * Stored contract is reserved rows inside the store, read through the
 * adapter's own StdTable contract, so the store must exist first. A missing
 * store holds nothing, so it is created whole, indexes included, before
 * setup reads it; an existing one is left alone until setup has planned.
 *
 * IndexedDB changes an index only inside a versionchange transaction, which
 * closes as soon as it waits on anything else. So setup runs on ordinary
 * transactions at the current version, and its `apply` closes the
 * connection and opens the next version, whose upgrade creates and deletes
 * indexes synchronously; the reindex then runs at that version. `apply` opens
 * a new version for every contract change, indexes or not, so every other
 * tab's connection sees it before any row is rewritten. A setup that fails on the
 * database, such as losing the contract write to another tab, starts over
 * and finds that tab's contract.
 */
const prepareStore = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
): Effect.Effect<SetupOutcome, unknown> => {
  const connection = config.database;
  const indexes = tableIndexes(table);
  return exclusive(
    lockName(connection),
    Effect.gen(function* () {
      for (let attempt = 1; ; attempt++) {
        // A store created just now already took a new version.
        const created = yield* connection.createStore(storeName, indexes);
        const topology: SetupTopology = {
          apply: () =>
            (created
              ? connection.setup(storeName, indexes)
              : connection.changeVersion(storeName, indexes)
            ).pipe(Effect.mapError((cause) => new OperationFailure({ cause }))),
        };
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

const STOPPED = Symbol('std-toolkit:idb-check');
const stopped = () => Effect.fail(new OperationFailure({ cause: STOPPED }));

// The store for a check: reads pass, and anything setup would change stops it.
const readOnly = (store: StdTableContract): StdTableContract => ({
  ...store,
  writeItem: stopped,
  transactWriteItems: stopped,
  hardDeleteItem: stopped,
  hardDeleteEntityItems: stopped,
  hardDeleteAllItems: stopped,
});

/**
 * Whether the stored contract is still the one this table was set up
 * under, checked after another connection changed the version. It runs
 * setup, which is one read when unchanged, on a store it cannot change,
 * under the setup lock, so it never reads while another tab's setup is part
 * way through its reindex.
 */
const contractIsCurrent = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
): Effect.Effect<boolean, unknown> =>
  exclusive(
    lockName(config.database),
    runSetup({
      table,
      mode: config.mode,
      store: readOnly(makeTableContract(config.database, table, storeName)),
      topology: { apply: stopped },
    }).pipe(
      Effect.map((outcome) => outcome.kind === 'unchanged'),
      Effect.catch((failure) =>
        failure instanceof OperationFailure && failure.cause !== STOPPED
          ? Effect.fail(failure)
          : Effect.succeed(false),
      ),
    ),
  );

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

/**
 * Realizes a StdTable on one IndexedDB database. The store is prepared under
 * its Stored contract the first time the table opens the connection, which is
 * how IndexedDB itself works: schema lives in the open request.
 *
 * Once another connection, such as another tab's setup, changes the
 * version, the next operation checks the stored contract first. If it is no
 * longer this table's, every operation from then on fails with `Outdated`,
 * and so does one on a persistent store newer code already set up: the
 * layer never writes rows under a contract it does not know. A disposable
 * store newer code set up is wiped on open, as for any unsafe change.
 */
const make = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
): IDBTable<Name> => {
  const storeName = config.storeName ?? table.logicalName;
  const database = config.database;
  let closed: Outdated | undefined;
  // The version changes seen when the contract was last known current.
  let checkedAt: number | undefined;
  let prepared: Promise<void> | undefined;
  let checking: Promise<void> | undefined;

  const settle = async (
    effect: Effect.Effect<unknown, unknown>,
    onSuccess: (value: unknown) => void,
  ) => {
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isSuccess(exit)) return onSuccess(exit.value);
    const failure = failureOf(exit);
    if (isOutdatedCode(failure)) closed = outdated(database, storeName);
    throw closed ?? failure;
  };
  const prepare = () => {
    const seen = database.versionChanges();
    return (prepared ??= settle(prepareStore(table, config, storeName), () => {
      checkedAt = seen;
    }).catch((cause) => {
      prepared = undefined;
      throw cause;
    }));
  };
  const check = () => {
    const seen = database.versionChanges();
    return (checking ??= settle(
      contractIsCurrent(table, config, storeName),
      (current) => {
        if (current) checkedAt = seen;
        else closed = outdated(database, storeName);
      },
    ).finally(() => {
      checking = undefined;
    }));
  };
  const open = async (): Promise<IDBDatabase> => {
    for (;;) {
      if (closed !== undefined) throw closed;
      if (checkedAt === undefined) await prepare();
      const seen = database.versionChanges();
      if (seen !== checkedAt) {
        await check();
        continue;
      }
      const connection = await database.open();
      // A version change while opening is checked before anything runs.
      if (database.versionChanges() === seen) return connection;
    }
  };
  return {
    storeName,
    layer: contractLayer(
      table.logicalName,
      makeTableContract({ ...database, open }, table, storeName),
    ),
  };
};

/**
 * Adapter-native: prepares the store now instead of on the table's first
 * open. Useful when a page wants the version change to happen at a moment it
 * controls, since IndexedDB upgrades block on other tabs, or wants to handle
 * `SetupRefused` itself.
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
