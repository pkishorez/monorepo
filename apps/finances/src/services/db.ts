import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { Context, Effect, Layer } from 'effect';
import {
  EntityRegistry,
  SQLiteEntity,
  SQLiteTable,
  SqliteDB,
} from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { CategorySettingSchema, OverrideSchema } from '../domain/index.js';

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
  .build();

const override = SQLiteEntity.make(table)
  .eschema(OverrideSchema)
  .primary()
  .build();

const categorySetting = SQLiteEntity.make(table)
  .eschema(CategorySettingSchema)
  .primary()
  .build();

const registry = EntityRegistry.make(table)
  .register(override)
  .register(categorySetting)
  .build();

export interface DbShape {
  categorySetting: typeof categorySetting;
  override: typeof override;
  registry: typeof registry;
}

export class Db extends Context.Tag('finances/Db')<Db, DbShape>() {}

export const makeDbLayer = (dbPath: string = DEFAULT_DB_PATH) => {
  const sqliteLayer = Layer.scoped(
    SqliteDB,
    makeDatabase(dbPath).pipe(
      Effect.map((database) => SqliteDBBetterSqlite3(database)),
      Effect.flatMap((layer) => Layer.build(layer)),
      Effect.map((context) => Context.unsafeGet(context, SqliteDB)),
    ),
  );

  const dbLayer = Layer.effect(
    Db,
    Effect.gen(function* () {
      yield* registry.setup();
      return { categorySetting, override, registry };
    }),
  );

  return dbLayer.pipe(Layer.provideMerge(sqliteLayer));
};
