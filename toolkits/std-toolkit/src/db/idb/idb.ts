import { Effect, Stream } from 'effect';
import {
  contractLayer,
  type StdTableService,
  type StoredItem,
} from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import type { TableSource as SnapshotSource } from '../../snapshot/index.js';
import {
  captureContract,
  planSetup,
  type BackfillChoice,
  type CurrentContract,
  type TableMode,
} from '../stored-contract/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
import { prune } from './prune/index.js';
import { makeTableContract } from './table/index.js';
import { reconcileIDBStore } from './upgrade/index.js';

export interface IDBConfig {
  readonly database: IDBConnection;
  readonly storeName?: string;
  /** Required: whether this store's data must survive every schema change. */
  readonly mode: TableMode;
  /**
   * What a disposable store does with a change that needs a backfill:
   * rewrite the stored rows' index keys (`reindex`, the default) or throw
   * them away (`wipe`). A persistent store always reindexes.
   */
  readonly onBackfill?: BackfillChoice;
}

/** What `IDB.make` needs of a StdTable: its topology, entities, and backfill primitives. */
export type IDBTableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
> &
  SnapshotSource & {
    // The StdTable's own backfill primitives, run when a change needs one.
    scan(): Stream.Stream<StoredItem, unknown, StdTableService<Name>>;
    drift(
      item: StoredItem,
    ): Effect.Effect<
      { readonly drifted: boolean; readonly currentForm: StoredItem },
      unknown,
      StdTableService<Name>
    >;
    reindex(
      currentForm: StoredItem,
    ): Effect.Effect<void, unknown, StdTableService<Name>>;
  };

export interface IDBTable<Name extends string> {
  readonly storeName: string;
  readonly layer: ReturnType<typeof contractLayer<Name>>;
}

const isReindexConflict = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'reason' in error &&
  (error.reason as { _tag?: string } | undefined)?._tag === 'ReindexConflict';

// A row another tab wrote meanwhile fails with a conflict. That tab may run
// an older definition, so the row is read again on the next pass rather than
// trusted to carry the new keys.
const PASSES = 5;

const reindexAll = <Name extends string>(
  table: IDBTableSource<Name>,
  connection: IDBConnection,
  storeName: string,
) =>
  Effect.gen(function* () {
    for (let pass = 1; ; pass++) {
      let conflicts = 0;
      yield* Stream.runForEach(table.scan(), (item) =>
        table.drift(item).pipe(
          Effect.flatMap(({ drifted, currentForm }) =>
            drifted ? table.reindex(currentForm) : Effect.void,
          ),
          Effect.catchIf(isReindexConflict, () =>
            Effect.sync(() => void conflicts++),
          ),
        ),
      );
      if (conflicts === 0) return;
      if (pass === PASSES)
        return yield* Effect.fail(
          new Error(
            `IndexedDB Store "${storeName}" kept changing while it was reindexed`,
          ),
        );
    }
  }).pipe(
    Effect.provide(
      contractLayer(
        table.logicalName,
        makeTableContract(connection, table, storeName),
      ),
    ),
  );

class ContractMoved extends Error {}

const prepareOnce = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
  contract: CurrentContract,
) =>
  Effect.gen(function* () {
    const connection = config.database;
    const stored = yield* connection.readContract(storeName);
    const backfill =
      config.mode === 'persistent'
        ? 'reindex'
        : (config.onBackfill ?? 'reindex');
    const plan = yield* planSetup({
      current: contract,
      stored,
      loadStoredSnapshot: Effect.succeed(stored?.snapshot),
      backfill,
    });
    // Every write of the contract holds only while it is the one read above,
    // so a setup deciding on a stale read never wipes or overwrites.
    const record = (wipe: boolean) =>
      connection
        .swapContract(storeName, stored, contract.record, { wipe })
        .pipe(
          Effect.flatMap((swapped) =>
            swapped ? Effect.void : Effect.fail(new ContractMoved()),
          ),
        );
    const wipe = Effect.logWarning(
      `std-toolkit: wiped disposable IndexedDB store "${storeName}" for a change its stored rows cannot take`,
    ).pipe(Effect.andThen(record(true)));
    if (plan.kind === 'wipe') yield* wipe;
    yield* reconcileIDBStore(connection, table, storeName);
    if (plan.kind !== 'apply') return;
    if (plan.backfill.length > 0) {
      const reindexed = reindexAll(table, connection, storeName);
      // Disposable rows that cannot be reindexed are thrown away instead.
      if (config.mode === 'persistent') yield* reindexed;
      else {
        const result = yield* Effect.result(reindexed);
        if (result._tag === 'Failure') return yield* wipe;
      }
    }
    yield* record(false);
  });

const ATTEMPTS = 3;

/**
 * Prepares the store under its Stored contract, kept in the same database:
 * a persistent store refuses a breaking change and is never wiped; a
 * disposable one is wiped on any change its stored rows cannot take. Then it
 * creates the store and its indexes, reindexes stored rows when a change
 * needs it, and records the new contract. An unchanged contract is one read
 * and skips the comparison; the store is still checked. A setup that loses a
 * race with another tab starts over from the contract that tab recorded.
 */
const prepareStore = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
) =>
  Effect.gen(function* () {
    const contract = yield* captureContract(table, config.mode);
    for (let attempt = 1; ; attempt++) {
      const result = yield* prepareOnce(
        table,
        config,
        storeName,
        contract,
      ).pipe(Effect.result);
      if (result._tag === 'Success') return;
      if (!(result.failure instanceof ContractMoved))
        return yield* Effect.fail(result.failure);
      if (attempt === ATTEMPTS)
        return yield* Effect.fail(
          new Error(
            `IndexedDB setup for Store "${storeName}" kept racing another tab`,
          ),
        );
    }
  });

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
      prepareStore(table, config, storeName).pipe(Effect.orDie),
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
 * a persistent store's `SetupRefused` itself.
 */
const setup = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
): Effect.Effect<void, unknown> =>
  prepareStore(table, config, config.storeName ?? table.logicalName);

export const IDB = {
  make,
  setup,
  database: makeIDBDatabase,
  prune,
} as const;

export type { IDBDatabaseConfig, IDBConnection };
