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
  type TableMode,
} from '../stored-contract/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
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

// A conflict means another tab wrote the row meanwhile, and a write derives
// its keys afresh, so the row needs nothing more.
const reindexAll = <Name extends string>(
  table: IDBTableSource<Name>,
  connection: IDBConnection,
  storeName: string,
) =>
  Stream.runForEach(table.scan(), (item) =>
    table.drift(item).pipe(
      Effect.flatMap(({ drifted, currentForm }) =>
        drifted ? table.reindex(currentForm) : Effect.void,
      ),
      Effect.catchIf(isReindexConflict, () => Effect.void),
    ),
  ).pipe(
    Effect.provide(
      contractLayer(
        table.logicalName,
        makeTableContract(connection, table, storeName),
      ),
    ),
  );

/**
 * Prepares the store under its Stored contract, kept in the same database:
 * a persistent store refuses a breaking change and is never wiped; a
 * disposable one is wiped on any change its stored rows cannot take. Then it
 * creates the store and its indexes, reindexes stored rows when a change
 * needs it, and records the new contract. An unchanged contract is one read
 * and skips the comparison; the store is still checked.
 */
const prepareStore = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
) =>
  Effect.gen(function* () {
    const connection = config.database;
    const contract = yield* captureContract(table, config.mode);
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
    const wipe = Effect.logWarning(
      `std-toolkit: wiped disposable IndexedDB store "${storeName}" for a change its stored rows cannot take`,
    ).pipe(Effect.andThen(connection.clear(storeName)));
    if (plan.kind === 'wipe') yield* wipe;
    yield* reconcileIDBStore(connection, table, storeName);
    if (plan.kind === 'unchanged') return;
    if (plan.kind === 'apply' && plan.backfill.length > 0) {
      const reindexed = reindexAll(table, connection, storeName);
      // Disposable rows that cannot be reindexed are thrown away instead.
      yield* config.mode === 'persistent'
        ? reindexed
        : reindexed.pipe(Effect.catch(() => wipe));
    }
    yield* connection.writeContract(storeName, contract.record);
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

export const IDB = { make, setup, database: makeIDBDatabase } as const;

export type { IDBDatabaseConfig, IDBConnection };
