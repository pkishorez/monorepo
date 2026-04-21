import { Database } from 'bun:sqlite';
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'bun:test';
import { Effect } from 'effect';
import { SqliteDBBun } from '../bun.js';
import { SqliteDB, SqliteDBError } from '../../db.js';
import * as Sql from '../../helpers/index.js';

describe('SqliteDBBun adapter', () => {
  let db: Database;
  let layer: ReturnType<typeof SqliteDBBun>;

  beforeAll(() => {
    db = new Database(':memory:');
    layer = SqliteDBBun(db);
  });

  afterAll(() => db.close());

  const run = <A>(effect: Effect.Effect<A, SqliteDBError, SqliteDB>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));

  describe('createTable', () => {
    test('creates a table with columns and primary key', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.createTable(
            'test_table',
            ['id TEXT', 'name TEXT', 'age INTEGER'],
            ['id'],
          );
        }),
      );

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
        )
        .all();
      expect(tables).toHaveLength(1);
    });

    test('creates table with composite primary key', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.createTable(
            'composite_pk',
            ['pk TEXT', 'sk TEXT', 'data TEXT'],
            ['pk', 'sk'],
          );
        }),
      );

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='composite_pk'",
        )
        .all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('addColumn', () => {
    test('adds a new column to existing table', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.addColumn('test_table', 'email', 'TEXT');
        }),
      );

      const columns = db.prepare('PRAGMA table_info(test_table)').all() as {
        name: string;
      }[];
      expect(columns.map((c) => c.name)).toContain('email');
    });

    test('is idempotent for existing columns', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.addColumn('test_table', 'email', 'TEXT');
        }),
      );
    });
  });

  describe('createIndex', () => {
    test('creates an index on columns', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.createIndex('test_table', 'idx_test_name', ['name']);
        }),
      );

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_test_name'",
        )
        .all();
      expect(indexes).toHaveLength(1);
    });
  });

  describe('insert', () => {
    test('inserts a row and returns changes count', async () => {
      const result = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.insert('test_table', {
            id: '1',
            name: 'Alice',
            age: 30,
            email: 'alice@example.com',
          });
        }),
      );

      expect(result.rowsWritten).toBe(1);
    });

    test('inserted data is retrievable via raw query', async () => {
      const row = db
        .prepare('SELECT * FROM test_table WHERE id = ?')
        .get('1') as Record<string, unknown>;
      expect(row.name).toBe('Alice');
      expect(row.age).toBe(30);
    });
  });

  describe('update', () => {
    test('updates a row and returns changes count', async () => {
      const result = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.update(
            'test_table',
            { name: 'Alice Updated', age: 31 },
            Sql.where('id', '=', '1'),
          );
        }),
      );

      expect(result.rowsWritten).toBe(1);

      const row = db
        .prepare('SELECT name, age FROM test_table WHERE id = ?')
        .get('1') as Record<string, unknown>;
      expect(row.name).toBe('Alice Updated');
      expect(row.age).toBe(31);
    });

    test('returns 0 changes when no rows match', async () => {
      const result = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.update(
            'test_table',
            { name: 'Nobody' },
            Sql.where('id', '=', 'nonexistent'),
          );
        }),
      );

      expect(result.rowsWritten).toBe(0);
    });
  });

  describe('get', () => {
    test('retrieves a single row', async () => {
      const row = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.get<{ id: string; name: string }>(
            'test_table',
            Sql.where('id', '=', '1'),
          );
        }),
      );

      expect(row.id).toBe('1');
      expect(row.name).toBe('Alice Updated');
    });

    test('fails when row not found', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.get(
            'test_table',
            Sql.where('id', '=', 'missing'),
          );
        }).pipe(Effect.provide(layer), Effect.either),
      );

      expect(result._tag).toBe('Left');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      db.prepare('DELETE FROM test_table').run();
      db.prepare('INSERT INTO test_table (id, name, age) VALUES (?, ?, ?)').run(
        'a',
        'Alice',
        25,
      );
      db.prepare('INSERT INTO test_table (id, name, age) VALUES (?, ?, ?)').run(
        'b',
        'Bob',
        30,
      );
      db.prepare('INSERT INTO test_table (id, name, age) VALUES (?, ?, ?)').run(
        'c',
        'Charlie',
        35,
      );
    });

    test('returns all matching rows', async () => {
      const rows = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.query<{ id: string; name: string }>(
            'test_table',
            Sql.whereNone,
          );
        }),
      );

      expect(rows).toHaveLength(3);
    });

    test('respects limit option', async () => {
      const rows = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.query('test_table', Sql.whereNone, {
            limit: 2,
          });
        }),
      );

      expect(rows).toHaveLength(2);
    });

    test('respects orderBy option', async () => {
      const rows = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.query<{ name: string }>(
            'test_table',
            Sql.whereNone,
            { orderBy: 'DESC', orderByColumn: 'name' },
          );
        }),
      );

      expect(rows[0]!.name).toBe('Charlie');
      expect(rows[2]!.name).toBe('Alice');
    });
  });

  describe('deleteAll', () => {
    test('deletes all rows and returns count', async () => {
      const result = await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          return yield* sqliteDB.deleteAll('test_table');
        }),
      );

      expect(result.rowsDeleted).toBe(3);

      const rows = db.prepare('SELECT * FROM test_table').all();
      expect(rows).toHaveLength(0);
    });
  });

  describe('transactions', () => {
    beforeEach(async () => {
      db.prepare('DELETE FROM test_table').run();
    });

    test('commit persists changes', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.begin();
          yield* sqliteDB.insert('test_table', {
            id: 'tx-1',
            name: 'TxUser',
            age: 40,
          });
          yield* sqliteDB.commit();
        }),
      );

      const rows = db
        .prepare("SELECT * FROM test_table WHERE id = 'tx-1'")
        .all();
      expect(rows).toHaveLength(1);
    });

    test('rollback discards changes', async () => {
      await run(
        Effect.gen(function* () {
          const sqliteDB = yield* SqliteDB;
          yield* sqliteDB.begin();
          yield* sqliteDB.insert('test_table', {
            id: 'tx-2',
            name: 'RollbackUser',
            age: 50,
          });
          yield* sqliteDB.rollback();
        }),
      );

      const rows = db
        .prepare("SELECT * FROM test_table WHERE id = 'tx-2'")
        .all();
      expect(rows).toHaveLength(0);
    });
  });
});
