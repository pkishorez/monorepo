import { Effect, Stream } from 'effect';
import { Migrations } from '../../migrations/index.js';
import type { TableSource as SnapshotSource } from '../../snapshot/index.js';
import {
  ConditionFailure,
  contractLayer,
  type StdTableService,
  type StoredItem,
} from '../std-table/contract/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  captureTable,
  checkTableSnapshot,
  type BackfillChoice,
  type StoredSnapshot,
  type TableMode,
} from '../table-snapshot/index.js';
import {
  makeIDBDatabase,
  type IDBDatabaseConfig,
  type IDBConnection,
} from './database/index.js';
import { prune } from './prune/index.js';
import { makeTableContract, wipeStore } from './table/index.js';
import { ensureIDBStore, reconcileIDBStore } from './upgrade/index.js';

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

// The internal entities have no secondary keys, so the check reads and
// writes through the store's primary key alone.
const baseTopology = {
  localSecondaryIndexes: {},
  globalSecondaryIndexes: {},
} as const;

/**
 * Prepares the store under the snapshot it keeps in its own internal
 * entities (ADR 0020), in this order:
 *
 * 1. Runs the registered migrations, and creates the store with its indexes
 *    when it is missing, in one version change; an existing store is only
 *    checked, and its indexes are left as they are.
 * 2. Checks the stored snapshot against the code's. A refusal changes
 *    nothing. A disposable store's wipe deletes its rows in one transaction
 *    that holds only while `__snapshot` is still the one read.
 * 3. Adds or replaces the indexes the topology declares, and reindexes the
 *    stored rows when a change needs a backfill: a persistent store always
 *    does, a disposable one as `onBackfill` chooses, and throws its rows away
 *    if they cannot be reindexed.
 * 4. Writes the changed snapshot items, last, so a setup stopped before then
 *    reindexes again on its next run.
 *
 * Index changes wait for step 3, so a refused change leaves the store, its
 * indexes and its rows as they were. Another tab setting up the same store
 * at once makes a write's or a wipe's condition fail, and the check starts
 * over from what that tab recorded.
 */
const prepareStore = <Name extends string>(
  table: IDBTableSource<Name>,
  config: IDBConfig,
  storeName: string,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const connection = config.database;
    const snapshot = captureTable(table);
    const upgrades = yield* Migrations.idb({ storeName });
    yield* ensureIDBStore(connection, table, storeName, upgrades);
    const wipe = (stored: StoredSnapshot) =>
      wipeStore(connection, storeName, stored.snapshot?.meta._u);
    yield* checkTableSnapshot<unknown>({
      contract: makeTableContract(connection, baseTopology, storeName),
      snapshot,
      mode: config.mode,
      localIndexOrder: Object.keys(table.localSecondaryIndexes),
      backfill:
        config.mode === 'persistent'
          ? 'reindex'
          : (config.onBackfill ?? 'reindex'),
      wipe,
      prepare: (plan, stored) =>
        Effect.gen(function* () {
          yield* reconcileIDBStore(connection, table, storeName);
          if (plan.kind !== 'apply' || plan.backfill.length === 0) return;
          const reindexed = reindexAll(table, connection, storeName);
          if (config.mode === 'persistent') return yield* reindexed;
          // Disposable rows that cannot be reindexed are thrown away instead.
          const result = yield* Effect.result(reindexed);
          if (result._tag === 'Failure') {
            yield* Effect.logWarning(
              `std-toolkit: wiped disposable IndexedDB store "${storeName}": its rows could not be reindexed`,
            );
            yield* wipe(stored);
          }
        }),
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof ConditionFailure
          ? new Error(
              `IndexedDB setup for Store "${storeName}" kept racing another tab`,
            )
          : cause,
      ),
    );
  });

/**
 * Realizes a StdTable on one IndexedDB database. The store is prepared under
 * the snapshot it keeps the first time the table opens the connection, which
 * is how IndexedDB itself works: schema lives in the open request.
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
