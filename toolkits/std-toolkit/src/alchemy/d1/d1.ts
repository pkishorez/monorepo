import { Effect } from 'effect';
import { isResolved, Resource } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import * as Provider from 'alchemy/Provider';
import { SQLite, type SQLiteDriver } from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { TableSource } from '../../snapshot/index.js';
import { guardTable, type Providers } from '../snapshot-guard/index.js';

interface D1TableOptions {
  readonly table: TableSource;
  readonly database: Cloudflare.D1.Database;
  /** Physical table name inside the database. Defaults to the logical name. */
  readonly tableName?: string;
}

interface D1TableProps {
  readonly databaseId: string;
  readonly tableName: string;
  readonly snapshot: unknown;
}

export type D1Table = Resource<
  'StdToolkit.D1.Table',
  D1TableProps,
  D1TableProps,
  never,
  Providers
>;

export const D1Table = Resource<D1Table>('StdToolkit.D1.Table');

const topologyFromSnapshot = (snapshot: TableSnapshot) => ({
  logicalName: snapshot.logicalName,
  primary: snapshot.topology.primary,
  localSecondaryIndexes: Object.fromEntries(
    snapshot.topology.localSecondaryIndexes.map((index) => [
      index.name,
      { ...index, kind: 'lsi' as const },
    ]),
  ),
  globalSecondaryIndexes: Object.fromEntries(
    snapshot.topology.globalSecondaryIndexes.map((index) => [
      index.name,
      { ...index, kind: 'gsi' as const },
    ]),
  ),
});

export const setUpD1Table = <R>(
  props: D1TableProps,
  database: Effect.Effect<SQLiteDriver, never, R>,
) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshot.parse(props.snapshot);
    yield* SQLite.setup(topologyFromSnapshot(snapshot), {
      database: yield* database,
      tableName: props.tableName,
    });
    return props;
  });

const openD1 = (databaseId: string) =>
  Effect.gen(function* () {
    // QueryDatabaseLocal expects a database id accessor from the resource.
    const database = {
      databaseId: Effect.succeed(Effect.succeed(databaseId)),
    } as unknown as Cloudflare.D1.Database;
    const query = yield* Cloudflare.D1.QueryDatabase(database);
    return makeD1SQLite({ database: yield* query.raw });
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseLocal));

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

const table = (id: string, options: D1TableOptions) =>
  Effect.gen(function* () {
    const tableName = options.tableName ?? options.table.logicalName;
    const guard = yield* guardTable(`${id}Snapshot`, {
      table: options.table,
      target: Output.interpolate`${options.database.databaseId}/${tableName}`,
    });
    return yield* D1Table(id, {
      databaseId: options.database.databaseId,
      tableName,
      snapshot: guard.snapshot,
    });
  });

export const D1 = { table } as const;
