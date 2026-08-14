import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import { StdTableService } from '../../std-table/contract/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { SQLite } from '../index.js';

describe('SQLite setup', () => {
  it('shares one database runtime and creates separate physical tables', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const people = StdTable.make('people').primary('pk', 'sk').build();
    const orders = StdTable.make('orders').primary('pk', 'sk').build();
    await Effect.runPromise(
      Effect.all(
        [
          SQLite.make(people, { database }).setup,
          SQLite.make(orders, { database }).setup,
        ],
        { discard: true },
      ),
    );
    const rows = await Effect.runPromise(
      database.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ),
    );
    expect(rows.map(({ name }) => name)).toEqual(['orders', 'people']);
  });

  it('additively creates missing index columns without backfilling', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE items (pk TEXT NOT NULL, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (pk, sk))',
      ),
    );
    await Effect.runPromise(
      database.run(
        'INSERT INTO items (pk, sk, _e, _v, _u, _d, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          'existing-pk',
          'existing-sk',
          'Record',
          'v1',
          '01CURRENT',
          0,
          JSON.stringify({
            _v: 'v1',
            recordId: 'record-1',
            category: 'documents',
          }),
        ],
      ),
    );
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    await Effect.runPromise(SQLite.make(table, { database }).setup);
    const columns = await Effect.runPromise(
      database.all('PRAGMA table_info("items")'),
    );
    expect(columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['GSI1PK', 'GSI1SK']),
    );
    const rows = await Effect.runPromise(
      database.all('SELECT GSI1PK, GSI1SK FROM items'),
    );
    expect(rows).toEqual([{ GSI1PK: null, GSI1SK: null }]);
  });

  it('rejects an existing table with an incompatible base schema', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE items (pk TEXT NOT NULL, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, PRIMARY KEY (pk, sk))',
      ),
    );
    const table = StdTable.make('items').primary('pk', 'sk').build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message: 'SQLite table "items" has an incompatible base schema: data',
        }),
      },
    });
  });

  it('rejects incompatible existing index columns', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE items (pk TEXT NOT NULL, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, data TEXT NOT NULL, GSI1PK INTEGER, GSI1SK TEXT NOT NULL, PRIMARY KEY (pk, sk))',
      ),
    );
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message:
            'SQLite table "items" has incompatible index columns: GSI1PK, GSI1SK',
        }),
      },
    });
  });

  it('rejects an index column with a non-null default', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        "CREATE TABLE items (pk TEXT NOT NULL, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, data TEXT NOT NULL, GSI1PK TEXT DEFAULT 'wrong', GSI1SK TEXT, PRIMARY KEY (pk, sk))",
      ),
    );
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message:
            'SQLite table "items" has incompatible index columns: GSI1PK',
        }),
      },
    });
  });

  it('rejects an undeclared required column', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE items (pk TEXT NOT NULL, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, data TEXT NOT NULL, external TEXT NOT NULL, PRIMARY KEY (pk, sk))',
      ),
    );
    const table = StdTable.make('items').primary('pk', 'sk').build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message:
            'SQLite table "items" has unsupported required columns: external',
        }),
      },
    });
  });

  it('rejects an undeclared unique index', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const table = StdTable.make('items').primary('pk', 'sk').build();
    await Effect.runPromise(SQLite.make(table, { database }).setup);
    await Effect.runPromise(
      database.run('CREATE UNIQUE INDEX external_unique ON items (_e)'),
    );

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message:
            'SQLite table "items" has an undeclared unique index "external_unique"',
        }),
      },
    });
  });

  it('rejects an incompatible primary-index collation', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE items (pk TEXT NOT NULL COLLATE NOCASE, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (pk, sk))',
      ),
    );
    const table = StdTable.make('items').primary('pk', 'sk').build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message: 'SQLite table "items" has an incompatible primary index',
        }),
      },
    });
  });

  it('recreates an incompatible physical secondary index', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE items (pk TEXT NOT NULL, sk TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL, data TEXT NOT NULL, GSI1PK TEXT, GSI1SK TEXT, PRIMARY KEY (pk, sk))',
      ),
    );
    await Effect.runPromise(
      database.run(
        'CREATE UNIQUE INDEX idx_items_GSI1 ON items (GSI1SK COLLATE NOCASE, GSI1PK) WHERE GSI1PK IS NOT NULL',
      ),
    );
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();

    await Effect.runPromise(SQLite.make(table, { database }).setup);

    const listed = await Effect.runPromise(
      database.all('PRAGMA index_list("items")'),
    );
    expect(listed.find(({ name }) => name === 'idx_items_GSI1')).toMatchObject({
      unique: 0,
      partial: 0,
    });
    const info = await Effect.runPromise(
      database.all('PRAGMA index_xinfo("idx_items_GSI1")'),
    );
    expect(
      info
        .filter(({ key }) => key === 1)
        .map(({ name, desc, coll }) => ({ name, desc, coll })),
    ).toEqual([
      { name: 'GSI1PK', desc: 0, coll: 'BINARY' },
      { name: 'GSI1SK', desc: 0, coll: 'BINARY' },
    ]);
  });

  it('rejects a physical index name owned by another table', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      database.run(
        'CREATE TABLE other (pk TEXT NOT NULL, sk TEXT NOT NULL, PRIMARY KEY (pk, sk))',
      ),
    );
    await Effect.runPromise(
      database.run('CREATE INDEX IDX_ITEMS_GSI1 ON other (pk, sk)'),
    );
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message: 'SQLite index "idx_items_GSI1" belongs to table "other"',
        }),
      },
    });
  });

  it('rejects case-insensitive physical index-name collisions', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .gsi('gsi1', 'GSI2PK', 'GSI2SK')
      .build();

    const result = await Effect.runPromise(
      SQLite.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'OperationFailure',
        cause: expect.objectContaining({
          message: 'SQLite table "items" has colliding physical index names',
        }),
      },
    });
  });

  it('accepts topology completed by a concurrent setup winner', async () => {
    const physical = makeNodeSQLite({ path: ':memory:' });
    let firstTransaction = true;
    const database: SQLiteDriver = {
      ...physical,
      transaction: (statements) => {
        if (!firstTransaction) return physical.transaction(statements);
        firstTransaction = false;
        return physical
          .transaction(statements)
          .pipe(Effect.andThen(Effect.fail(new Error('lost setup race'))));
      },
    };
    const table = StdTable.make('items')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();

    await Effect.runPromise(SQLite.make(table, { database }).setup);

    const columns = await Effect.runPromise(
      database.all('PRAGMA table_info("items")'),
    );
    expect(columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['GSI1PK', 'GSI1SK']),
    );
  });

  it('resumes from a stable keyset position when earlier rows are deleted', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const table = StdTable.make('items').primary('pk', 'sk').build();
    const configured = SQLite.make(table, { database });
    await Effect.runPromise(configured.setup);
    for (const key of ['a', 'b', 'c']) {
      await Effect.runPromise(
        database.run(
          'INSERT INTO items (pk, sk, _e, _v, _u, _d, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['p', key, 'Item', 'v1', key, 0, JSON.stringify({})],
        ),
      );
    }
    const runtime = configured.layer;
    const service = await Effect.runPromise(
      StdTableService('items').pipe(Effect.provide(runtime)),
    );
    const first = await Effect.runPromise(
      service.contract.queryItems({ pk: 'p', descending: false, limit: 1 }),
    );
    expect(first.hasMore).toBe(true);
    const last = first.items.at(-1)!;
    await Effect.runPromise(
      database.run('DELETE FROM items WHERE pk = ? AND sk = ?', ['p', 'a']),
    );
    const second = await Effect.runPromise(
      service.contract.queryItems({
        pk: 'p',
        descending: false,
        limit: 2,
        startAfter: { pk: last.pk, sk: last.sk },
      }),
    );
    expect(second.items.map(({ sk }) => sk)).toEqual(['b', 'c']);
    expect(second.hasMore).toBe(false);
  });

  it('reports malformed stored data as a runtime failure', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const table = StdTable.make('items').primary('pk', 'sk').build();
    const configured = SQLite.make(table, { database });
    await Effect.runPromise(configured.setup);
    await Effect.runPromise(
      database.run(
        'INSERT INTO items (pk, sk, _e, _v, _u, _d, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['p', 's', 'Item', 'v1', '1', 0, '{invalid'],
      ),
    );
    const service = await Effect.runPromise(
      StdTableService('items').pipe(Effect.provide(configured.layer)),
    );

    const result = await Effect.runPromise(
      service.contract.getItem({ pk: 'p', sk: 's' }).pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'OperationFailure' },
    });
  });
});
