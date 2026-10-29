import { Effect, Layer, Stream } from 'effect';
import { isResolved, Resource, RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Provider from 'alchemy/Provider';
import {
  SQLite,
  type SQLiteDriver,
  type TableMode,
} from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
import { runMigration, type MigrationEvent } from '../../db/setup/index.js';
import type { StdTableService } from '../../db/std-table/contract/index.js';
import type { StdTable } from '../../db/std-table/table/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { Providers } from '../deploy-guard/index.js';

interface D1TableOptions {
  readonly table: StdTable;
  readonly database: Cloudflare.D1.Database;
  /** Physical table name inside the database. Defaults to the logical name. */
  readonly tableName?: string;
  /** Required: whether this table's data must survive every schema change. */
  readonly mode: TableMode;
}

/** What Alchemy keeps in state and diffs: the snapshot says when to set up again. */
interface D1TableAttributes {
  readonly databaseId: string;
  readonly tableName: string;
  readonly mode: TableMode;
  readonly snapshot: unknown;
}

interface D1TableProps extends D1TableAttributes {
  /**
   * The table itself, which setup needs to reindex its rows. A function, so
   * Alchemy passes it through as is and never writes it to state.
   */
  readonly table: () => StdTable;
}

export type D1Table = Resource<
  'StdToolkit.D1.Table',
  D1TableProps,
  D1TableAttributes,
  never,
  Providers
>;

export const D1Table = Resource<D1Table>('StdToolkit.D1.Table');

/** Runs SQLite setup on the D1 database; a refusal fails the deploy. */
export const setUpD1Table = <R>(
  props: D1TableProps,
  database: Effect.Effect<SQLiteDriver, never, R>,
) =>
  Effect.gen(function* () {
    yield* SQLite.setup(props.table(), {
      database: yield* database,
      tableName: props.tableName,
      mode: props.mode,
    });
    const { databaseId, tableName, mode, snapshot } = props;
    return {
      databaseId,
      tableName,
      mode,
      snapshot,
    } satisfies D1TableAttributes;
  });

const openD1 = (databaseId: string) =>
  Effect.gen(function* () {
    // QueryDatabaseLocal expects a database id accessor from the resource.
    const database = {
      databaseId: Effect.succeed(Effect.succeed(databaseId)),
    } as unknown as Cloudflare.D1.Database;
    const query = yield* Cloudflare.D1.QueryDatabase(database);
    return makeD1SQLite({ database: yield* query.raw });
  }).pipe(
    Effect.provide(Cloudflare.D1.QueryDatabaseLocal),
    // The runtime context only resolves a database id still to come; this
    // one is resolved already, so none is read.
    Effect.provide(RuntimeContext.phantom),
  );

export const D1TableProvider = () =>
  Provider.succeed(D1Table, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(
        !isResolved(current)
          ? undefined
          : JSON.stringify(previous) !== JSON.stringify(current)
            ? { action: 'update' as const }
            : { action: 'noop' as const },
      ),
    reconcile: ({ news: current }) =>
      setUpD1Table(current, openD1(current.databaseId)),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

/**
 * Creates or updates the table in D1 at deploy, before the Worker goes
 * live: SQLite setup checks the Stored contract kept inside the table,
 * refuses a persistent table's breaking change, wipes a disposable one's,
 * applies its indexes and reindexes the rows they touch. A refusal fails the
 * deploy with the SetupRefused message.
 *
 * Bind the result's `tableName` into the Worker's env and build the adapter
 * from it (`SQLite.make(table, { database, tableName })`). The Worker then
 * depends on this resource, so Alchemy deploys it only after setup and its
 * reindex; a Worker that binds only the database may go live first.
 */
const table = (id: string, options: D1TableOptions) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshot.serialize(
      TableSnapshot.capture(options.table),
    ).pipe(Effect.orDie);
    return yield* D1Table(id, {
      databaseId: options.database.databaseId,
      tableName: options.tableName ?? options.table.logicalName,
      mode: options.mode,
      snapshot,
      table: () => options.table,
    });
  });

/** A table migration's stream, as `StdTable.migrate` returns it. */
export type TableMigration = Stream.Stream<
  MigrationEvent,
  unknown,
  StdTableService<any>
>;

interface D1TableAddress {
  readonly databaseId: string;
  readonly tableName: string;
}

/** What Alchemy keeps in state: where the migration read from and wrote to. */
interface D1MigrationAttributes {
  readonly from: D1TableAddress;
  readonly to: D1TableAddress;
  /** The new table's physical name. Bind it into the Worker, so the Worker waits for the migration. */
  readonly tableName: string;
}

interface D1MigrationProps extends D1MigrationAttributes {
  /** The two tables and the migration, passed through as they are and never written to state. */
  readonly run: () => {
    readonly from: StdTable;
    readonly to: StdTable;
    readonly migrate: TableMigration;
  };
}

export type D1Migration = Resource<
  'StdToolkit.D1.Migration',
  D1MigrationProps,
  D1MigrationAttributes,
  never,
  Providers
>;

export const D1Migration = Resource<D1Migration>('StdToolkit.D1.Migration');

/** Runs the table migration against both D1 tables; its failure fails the deploy. */
export const runD1Migration = <R>(
  props: D1MigrationProps,
  open: (databaseId: string) => Effect.Effect<SQLiteDriver, never, R>,
) =>
  Effect.gen(function* () {
    const { from, to, migrate } = props.run();
    const source = yield* open(props.from.databaseId);
    const target =
      props.to.databaseId === props.from.databaseId
        ? source
        : yield* open(props.to.databaseId);
    const layer = Layer.merge(
      SQLite.make(from, { database: source, tableName: props.from.tableName })
        .layer,
      SQLite.make(to, { database: target, tableName: props.to.tableName })
        .layer,
    );
    yield* runMigration(
      migrate.pipe(Stream.provide(layer)) as Stream.Stream<
        MigrationEvent,
        unknown
      >,
    );
    return {
      from: props.from,
      to: props.to,
      tableName: props.tableName,
    } satisfies D1MigrationAttributes;
  });

export const D1MigrationProvider = () =>
  Provider.succeed(D1Migration, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(
        !isResolved(current)
          ? undefined
          : JSON.stringify(previous) !== JSON.stringify(current)
            ? { action: 'update' as const }
            : { action: 'noop' as const },
      ),
    reconcile: ({ news: current }) => runD1Migration(current, openD1),
    // The migrated rows outlive the resource: removing it leaves both tables.
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

/**
 * Runs a table migration (`StdTable.migrate`) from one D1 table into a new
 * one at deploy, logging its progress. It runs after both `D1.table`
 * resources, so both tables are set up first, and its failure fails the
 * deploy. Once done it is a no-op: the new table's migration row says
 * `done`, so a run on a later deploy is `Skipped`.
 *
 * Bind the result's `tableName` into the Worker that serves the new table,
 * instead of the new table resource's: the Worker then depends on the
 * migration, so Alchemy deploys it only after every row is through. Keep
 * the old table and its Worker binding until every stage has migrated, then
 * delete the old table resource, this resource and the `StdTable.migrate`
 * call together.
 */
const migration = (
  id: string,
  options: {
    readonly from: D1Table;
    readonly to: D1Table;
    readonly migrate: TableMigration;
  },
) =>
  D1Migration(id, {
    from: {
      databaseId: options.from.databaseId,
      tableName: options.from.tableName,
    },
    to: { databaseId: options.to.databaseId, tableName: options.to.tableName },
    tableName: options.to.tableName,
    run: () => ({
      from: options.from.Props.table(),
      to: options.to.Props.table(),
      migrate: options.migrate,
    }),
  });

export const D1 = { table, migration } as const;
