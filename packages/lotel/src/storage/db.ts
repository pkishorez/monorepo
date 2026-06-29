import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Context, Effect, Layer } from 'effect';
import type { EntityType } from 'std-toolkit/core';
import {
  EntityRegistry,
  SQLiteEntity,
  SQLiteTable,
  SqliteDB,
  SqliteDBError,
} from 'std-toolkit/sqlite';
import { nodeSqliteLayer } from 'std-toolkit/sqlite/adapters/node';
import {
  LogRecordSchema,
  MetricRecordSchema,
  TraceRecordSchema,
  type StoredLogRecordValue,
  type StoredMetricRecordValue,
  type StoredTraceRecordValue,
} from '../domain/index.js';

export const DEFAULT_DB_PATH = '.lotel/lotel.sqlite';
export const DEFAULT_TABLE_NAME = 'lotel_data';

export interface DbOptions {
  dbPath?: string;
  tableName?: string;
  database?: DatabaseSync;
  closeDatabase?: boolean;
}

const ensureDbParent = (dbPath: string) => {
  if (dbPath === ':memory:') return;
  mkdirSync(dirname(dbPath), { recursive: true });
};

const makeDatabase = (options: DbOptions) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      if (options.database) return options.database;
      const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
      ensureDbParent(dbPath);
      return new DatabaseSync(dbPath);
    }),
    (database) =>
      Effect.sync(() => {
        const shouldClose = options.database
          ? options.closeDatabase === true
          : options.closeDatabase !== false;
        if (shouldClose) database.close();
      }),
  );

type PrimaryCursor = { sk: { '>': string | null } };

interface EntityService<T extends object> {
  insert(value: T): Effect.Effect<EntityType<T>, SqliteDBError, SqliteDB>;
  query(
    key: 'primary',
    params: PrimaryCursor,
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityType<T>[] }, SqliteDBError, SqliteDB>;
}

interface RegistryService {
  transaction<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqliteDBError, R | SqliteDB>;
}

interface TableService {
  dangerouslyRemoveAllRows(
    confirmation: 'i know what i am doing',
  ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB>;
}

export interface DbShape {
  table: TableService;
  registry: RegistryService;
  traceRecord: EntityService<StoredTraceRecordValue>;
  logRecord: EntityService<StoredLogRecordValue>;
  metricRecord: EntityService<StoredMetricRecordValue>;
}

const dbEffect = (): Effect.Effect<DbShape, SqliteDBError, SqliteDB> =>
  Effect.gen(function* () {
    const table = SQLiteTable.make().primary('pk', 'sk').build();

    const traceRecord = SQLiteEntity.make(table)
      .eschema(TraceRecordSchema)
      .primary()
      .build();

    const logRecord = SQLiteEntity.make(table)
      .eschema(LogRecordSchema)
      .primary()
      .build();

    const metricRecord = SQLiteEntity.make(table)
      .eschema(MetricRecordSchema)
      .primary()
      .build();

    const registry = EntityRegistry.make(table)
      .register(traceRecord)
      .register(logRecord)
      .register(metricRecord)
      .build();

    yield* registry.setup();

    return {
      table,
      registry,
      traceRecord,
      logRecord,
      metricRecord,
    };
  });

export class Db extends Context.Service<Db, DbShape>()('lotel/Db') {}

export const makeDbLayer = (options: DbOptions = {}) => {
  const sqliteLayer = Layer.effect(
    SqliteDB,
    makeDatabase(options).pipe(
      Effect.map((database) =>
        nodeSqliteLayer(database, options.tableName ?? DEFAULT_TABLE_NAME),
      ),
      Effect.flatMap((layer) => Layer.build(layer)),
      Effect.map((context) => Context.getUnsafe(context, SqliteDB)),
    ),
  );

  return Layer.effect(Db, dbEffect()).pipe(Layer.provideMerge(sqliteLayer));
};
