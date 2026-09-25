import { Effect } from 'effect';
import { isResolved, Resource } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Provider from 'alchemy/Provider';
import { SQLite, type SQLiteDriver } from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
import { TableSnapshot, TableSnapshotESchema } from '../../snapshot/index.js';
import {
  acceptSnapshot,
  type DeployableTable,
  type Providers,
} from '../snapshot-guard/index.js';

export interface D1TableOptions {
  readonly table: DeployableTable;
  readonly database: Cloudflare.D1.Database;
  /** Physical table name inside the database. Defaults to the logical name. */
  readonly tableName?: string;
}

export interface D1TableProps {
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

const physicalTarget = ({ databaseId, tableName }: D1TableProps) =>
  `${databaseId}/${tableName}`;

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

export const reconcileD1Table = <R>(
  news: D1TableProps,
  output: D1TableProps | undefined,
  database: Effect.Effect<SQLiteDriver, never, R>,
) =>
  Effect.gen(function* () {
    yield* acceptSnapshot(
      output === undefined
        ? undefined
        : { target: physicalTarget(output), snapshot: output.snapshot },
      { target: physicalTarget(news), snapshot: news.snapshot },
    );
    const snapshot = yield* TableSnapshot.parse(news.snapshot);
    yield* SQLite.setup(topologyFromSnapshot(snapshot), {
      database: yield* database,
      tableName: news.tableName,
    });
    return news;
  });

/** Checks the snapshot and sets up the physical table in one Alchemy resource. */
export const D1TableProvider = () =>
  Provider.succeed(D1Table, {
    diff: ({ olds, news }) =>
      Effect.succeed(
        !isResolved(news)
          ? undefined
          : physicalTarget(olds) !== physicalTarget(news)
            ? { action: 'replace' as const }
            : JSON.stringify(olds.snapshot) !== JSON.stringify(news.snapshot)
              ? { action: 'update' as const }
              : { action: 'noop' as const },
      ),
    reconcile: ({ news, output }) =>
      reconcileD1Table(
        news,
        output,
        Effect.gen(function* () {
          // QueryDatabaseLocal expects a database id accessor from the resource.
          const database = {
            databaseId: Effect.succeed(Effect.succeed(news.databaseId)),
          } as unknown as Cloudflare.D1.Database;
          const query = yield* Cloudflare.D1.QueryDatabase(database);
          return makeD1SQLite({ database: yield* query.raw });
        }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseLocal)),
      ),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

/** Registers the D1 table resource with its deploy-time snapshot. */
const table = (id: string, options: D1TableOptions) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshotESchema.encode(
      TableSnapshot.capture(options.table),
    ).pipe(Effect.orDie);
    return yield* D1Table(id, {
      databaseId: options.database.databaseId,
      tableName: options.tableName ?? options.table.logicalName,
      snapshot,
    });
  });

export const D1 = { table } as const;
