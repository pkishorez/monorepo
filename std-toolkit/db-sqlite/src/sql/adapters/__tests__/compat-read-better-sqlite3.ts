import Database from 'better-sqlite3';
import { Effect } from 'effect';
import { SqliteDBBetterSqlite3 } from '../better-sqlite3.js';
import { SqliteDB } from '../../db.js';

const [, , dbPath, mode] = process.argv;
if (!dbPath) {
  console.error(
    'Usage: compat-read-better-sqlite3.ts <db-path> [query|get|update]',
  );
  process.exit(1);
}

const db = new Database(dbPath, { readonly: mode !== 'update' });
const layer = SqliteDBBetterSqlite3(db);

if (mode === 'update') {
  db.prepare('UPDATE compat_test SET name = ?, age = ? WHERE id = ?').run(
    'Updated',
    99,
    'rt-1',
  );
  db.prepare('INSERT INTO compat_test (id, name, age) VALUES (?, ?, ?)').run(
    'rt-2',
    'NewRow',
    50,
  );
  console.log(JSON.stringify({ ok: true }));
} else if (mode === 'get') {
  const id = process.argv[4] ?? 'bun-2';
  const row = db.prepare('SELECT * FROM compat_test WHERE id = ?').get(id);
  console.log(JSON.stringify(row));
} else {
  const rows = Effect.runSync(
    Effect.gen(function* () {
      const sqliteDB = yield* SqliteDB;
      return yield* sqliteDB.query('compat_test', {
        clause: '1=1',
        params: [],
      });
    }).pipe(Effect.provide(layer)),
  );
  console.log(JSON.stringify(rows));
}

db.close();
