import { Effect } from 'effect';
import { isResolved, Resource, RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Provider from 'alchemy/Provider';
import {
  setUpFromSnapshot,
  type SQLiteDriver,
  type TableMode,
} from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { TableSource } from '../../snapshot/index.js';
import type { Providers } from '../collection/index.js';

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
  /** The order the table declares its local secondary indexes in, which the snapshot does not keep. */
  readonly localIndexOrder: readonly string[];
}

export type D1Table = Resource<
  'StdToolkit.D1.Table',
  D1TableProps,
  D1TableProps,
  never,
  Providers
>;

export const D1Table = Resource<D1Table>('StdToolkit.D1.Table');

// SQLite setup keeps the local secondary indexes in the order the topology
// lists them.
const topologyFromSnapshot = (
  snapshot: TableSnapshot,
  localIndexOrder: readonly string[],
) => ({
  logicalName: snapshot.logicalName,
  primary: snapshot.topology.primary,
  localSecondaryIndexes: Object.fromEntries(
    [...snapshot.topology.localSecondaryIndexes]
      .sort(
        (left, right) =>
          localIndexOrder.indexOf(left.name) -
          localIndexOrder.indexOf(right.name),
      )
      .map((index) => [index.name, { ...index, kind: 'lsi' as const }]),
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
    yield* setUpFromSnapshot(
      topologyFromSnapshot(snapshot, props.localIndexOrder),
      props.snapshot,
      {
        database: yield* database,
        tableName: props.tableName,
        mode: props.mode,
      },
    );
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
 * Creates or updates the table in D1 at deploy, running SQLite setup against
 * the database with the table's serialized snapshot: the table checks the
 * snapshot it keeps in its own internal entities, so setup refuses a
 * persistent table's breaking change, with nothing changed, and wipes a
 * disposable one's.
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
      localIndexOrder: Object.keys(options.table.localSecondaryIndexes),
    });
  });

export const D1 = { table } as const;
