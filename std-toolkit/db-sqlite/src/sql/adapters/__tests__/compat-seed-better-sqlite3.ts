import Database from 'better-sqlite3';
import { Effect } from 'effect';
import { SqliteDBBetterSqlite3 } from '../better-sqlite3.js';
import { SqliteDB } from '../../db.js';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: compat-seed-better-sqlite3.ts <db-path>');
  process.exit(1);
}

const db = new Database(dbPath);
const layer = SqliteDBBetterSqlite3(db);

await Effect.runPromise(
  Effect.gen(function* () {
    const sqliteDB = yield* SqliteDB;

    yield* sqliteDB.createTable(
      'compat_test',
      ['id TEXT', 'name TEXT', 'age INTEGER', 'active TEXT'],
      ['id'],
    );

    yield* sqliteDB.createIndex('compat_test', 'idx_compat_name', ['name']);

    yield* sqliteDB.insert('compat_test', {
      id: 'bs3-1',
      name: 'Alice',
      age: 30,
      active: 'true',
    });
    yield* sqliteDB.insert('compat_test', {
      id: 'bs3-2',
      name: 'Bob',
      age: 25,
      active: 'false',
    });
    yield* sqliteDB.insert('compat_test', {
      id: 'bs3-3',
      name: 'Charlie',
      age: 35,
      active: 'true',
    });
  }).pipe(Effect.provide(layer)),
);

db.close();
console.log('better-sqlite3 seed complete');
