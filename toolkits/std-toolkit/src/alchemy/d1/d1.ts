import { Effect } from 'effect';
import { isResolved, Resource } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Provider from 'alchemy/Provider';
import {
  setUpFromSnapshot,
  type SQLiteDriver,
  type TableMode,
} from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { TableSource } from '../../snapshot/index.js';
import { guardContract, type Providers } from '../deploy-guard/index.js';

interface D1TableOptions {
  readonly table: TableSource;
  readonly database: Cloudflare.D1.Database;
  /** Physical table name inside the database. Defaults to the logical name. */
  readonly tableName?: string;
  /** Required: whether this table's data must survive every schema change. */
  readonly mode: TableMode;
}

interface D1TableProps {
  readonly databaseId: string;
  readonly tableName: string;
  readonly mode: TableMode;
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
    yield* setUpFromSnapshot(topologyFromSnapshot(snapshot), props.snapshot, {
      database: yield* database,
      tableName: props.tableName,
      mode: props.mode,
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

/**
 * Creates or updates the table in D1 at deploy, under its Stored contract
 * kept in the same database: setup refuses a persistent table's breaking
 * change and wipes a disposable one's. A persistent table also gets a deploy
 * guard, which refuses the change before setup runs.
 */
const table = (id: string, options: D1TableOptions) =>
  Effect.gen(function* () {
    const tableName = options.tableName ?? options.table.logicalName;
    const snapshot =
      options.mode === 'persistent'
        ? (yield* guardContract(
            `${id}DeployGuard`,
            options.table,
            'persistent',
          )).snapshot
        : yield* TableSnapshot.serialize(
            TableSnapshot.capture(options.table),
          ).pipe(Effect.orDie);
    return yield* D1Table(id, {
      databaseId: options.database.databaseId,
      tableName,
      mode: options.mode,
      snapshot,
    });
  });

export const D1 = { table } as const;
