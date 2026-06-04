import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { Context, Effect, Layer } from 'effect';
import {
  EntityRegistry,
  SQLiteEntity,
  SQLiteSingleEntity,
  SQLiteTable,
  SqliteDB,
} from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import {
  DEFAULT_SETTINGS,
  OverrideSchema,
  SettingsSchema,
  TransactionSchema,
} from '../domain/index.js';

const DEFAULT_DB_PATH = '.finances/finances.sqlite';
const TABLE_NAME = 'finances';

const ensureDbParent = (dbPath: string) => {
  if (dbPath === ':memory:') return;
  mkdirSync(dirname(dbPath), { recursive: true });
};

const makeDatabase = (dbPath: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      ensureDbParent(dbPath);
      return new Database(dbPath);
    }),
    (database) => Effect.sync(() => database.close()),
  );

const table = SQLiteTable.make({ tableName: TABLE_NAME })
  .primary('pk', 'sk')
  .index('Timeline', 'timeline_pk', 'timeline_sk')
  .build();

const transaction = SQLiteEntity.make(table)
  .eschema(TransactionSchema)
  .primary()
  .index('Timeline', 'timeline', { pk: [] })
  .build();

const override = SQLiteEntity.make(table)
  .eschema(OverrideSchema)
  .primary()
  .index('Timeline', 'timeline', { pk: [] })
  .build();

const settings = SQLiteSingleEntity.make(table)
  .eschema(SettingsSchema)
  .default(DEFAULT_SETTINGS);

const registry = EntityRegistry.make(table)
  .register(transaction)
  .register(override)
  .registerSingle(settings)
  .build();

export interface DbShape {
  override: typeof override;
  settings: typeof settings;
  transaction: typeof transaction;
  registry: typeof registry;
}

export class Db extends Context.Service<Db, DbShape>()('finances/Db') {}

export const makeDbLayer = (dbPath: string = DEFAULT_DB_PATH) => {
  const sqliteLayer = Layer.effect(
    SqliteDB,
    makeDatabase(dbPath).pipe(
      Effect.map((database) => SqliteDBBetterSqlite3(database)),
      Effect.flatMap((layer) => Layer.build(layer)),
      Effect.map((context) => Context.getUnsafe(context, SqliteDB)),
    ),
  );

  const dbLayer = Layer.effect(
    Db,
    Effect.gen(function* () {
      yield* registry.setup();
      return { override, registry, settings, transaction };
    }),
  );

  return dbLayer.pipe(Layer.provideMerge(sqliteLayer));
};
