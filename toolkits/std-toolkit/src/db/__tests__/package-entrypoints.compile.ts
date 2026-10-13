import { StdTable, type TableDefinition } from '@kestack/std-toolkit/db';
import type { DynamoDBConfig } from '@kestack/std-toolkit/db/dynamodb';
import type { IDBConfig } from '@kestack/std-toolkit/db/idb';
import { Memory, type MemoryTable } from '@kestack/std-toolkit/db/memory';
import type { SQLiteConfig } from '@kestack/std-toolkit/db/sqlite';
import type {
  BetterSQLite3Config,
  BetterSQLite3Driver,
} from '@kestack/std-toolkit/db/sqlite/better-sqlite3';
import type {
  BunSQLiteConfig,
  BunSQLiteDriver,
} from '@kestack/std-toolkit/db/sqlite/bun';
import type {
  DurableObjectSQLiteConfig,
  DurableObjectSQLiteDriver,
} from '@kestack/std-toolkit/db/sqlite/durable-object';
import type {
  NodeSQLiteConfig,
  NodeSQLiteDriver,
} from '@kestack/std-toolkit/db/sqlite/node';

const people = StdTable.make('people').primary('pk', 'sk').build();

const definition: TableDefinition<'people'> = people;
const memory: MemoryTable<'people'> = Memory.make(people);

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

export { definition, memory, type PackageEntrypoints };
