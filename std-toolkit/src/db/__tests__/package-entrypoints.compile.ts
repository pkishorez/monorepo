import { StdTable, type TableDefinition } from 'std-toolkit/db';
import type { DynamoDBConfig } from 'std-toolkit/db/dynamodb';
import type { IDBConfig } from 'std-toolkit/db/idb';
import type { SQLiteConfig } from 'std-toolkit/db/sqlite';
import type {
  BetterSQLite3Config,
  BetterSQLite3Driver,
} from 'std-toolkit/db/sqlite/better-sqlite3';
import type {
  BunSQLiteConfig,
  BunSQLiteDriver,
} from 'std-toolkit/db/sqlite/bun';
import type {
  DurableObjectSQLiteConfig,
  DurableObjectSQLiteDriver,
} from 'std-toolkit/db/sqlite/durable-object';
import type {
  NodeSQLiteConfig,
  NodeSQLiteDriver,
} from 'std-toolkit/db/sqlite/node';

const people = StdTable.make('people').primary('pk', 'sk').build();

const definition: TableDefinition<'people'> = people;

type PackageEntrypoints =
  | BetterSQLite3Config
  | BetterSQLite3Driver
  | BunSQLiteConfig
  | BunSQLiteDriver
  | DurableObjectSQLiteConfig
  | DurableObjectSQLiteDriver
  | DynamoDBConfig
  | IDBConfig
  | NodeSQLiteConfig
  | NodeSQLiteDriver
  | SQLiteConfig;

export { definition, type PackageEntrypoints };
