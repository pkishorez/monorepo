import { Effect } from 'effect';
import { isResolved, Resource, RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Provider from 'alchemy/Provider';
import {
  SQLite,
  type SQLiteDriver,
  type TableMode,
} from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
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
   * The table itself, which setup needs for its Backfills. A function, so
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
 * applies its indexes and runs its pending Backfills. A refusal fails the
 * deploy with the SetupRefused message.
 *
 * Bind the result's `tableName` into the Worker's env and build the adapter
 * from it (`SQLite.make(table, { database, tableName })`). The Worker then
 * depends on this resource, so Alchemy deploys it only after setup and its
 * Backfills; a Worker that binds only the database may go live first.
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

export const D1 = { table } as const;
