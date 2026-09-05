import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { makeBunSQLite, type BunSQLiteDatabase } from '../drivers/bun/index.js';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '../drivers/durable-object/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { makeBetterSQLite3 } from '../drivers/better-sqlite3/index.js';

describe('SQLite driver contracts', () => {
  it('Node and better-sqlite3 can reuse caller-owned connections', async () => {
    const nodeDatabase = new DatabaseSync(':memory:');
    const betterDatabase = new BetterSqlite3(':memory:');
    const node = makeNodeSQLite({ database: nodeDatabase });
    const better = makeBetterSQLite3({ database: betterDatabase });

    for (const runtime of [node, better]) {
      await Effect.runPromise(
        runtime.run('CREATE TABLE things (id TEXT PRIMARY KEY)'),
      );
      await Effect.runPromise(
        runtime.run('INSERT INTO things (id) VALUES (?)', ['one']),
      );
      expect(
        await Effect.runPromise(runtime.all('SELECT id FROM things')),
      ).toEqual([{ id: 'one' }]);
    }

    nodeDatabase.close();
    betterDatabase.close();
  });

  it('Bun executes transaction statements through its native transaction', () => {
    const run = vi.fn(() => ({ changes: 1 }));
    const transactionCalls: Array<() => unknown> = [];
    const transaction: BunSQLiteDatabase['transaction'] = (body) => {
      transactionCalls.push(body);
      return body;
    };
    const database = {
      query: vi.fn(() => ({ run, all: () => [] })),
      transaction,
    } satisfies BunSQLiteDatabase;
    Effect.runSync(
      makeBunSQLite({ database }).transaction([
        {
          sql: 'INSERT INTO things VALUES (?)',
          parameters: ['one'],
          expectedChanges: 1,
        },
      ]),
    );
    expect(transactionCalls).toHaveLength(1);
    expect(run).toHaveBeenCalledWith('one');
  });

  it('Durable Object rolls back when a conditional statement changes no rows', async () => {
    const statements: string[] = [];
    let writes = 0;
    let changes = 0;
    const storage: DurableObjectSQLiteStorage = {
      sql: {
        exec: (sql) => {
          statements.push(sql);
          if (sql === 'SELECT changes() AS changes')
            return {
              toArray: () => [{ changes }],
              rowsWritten: 0,
            };
          writes++;
          changes = sql.startsWith('UPDATE') ? 0 : 1;
          return {
            toArray: () => [],
            rowsWritten: 3,
          };
        },
      },
      transactionSync: (callback) => {
        const before = writes;
        try {
          return callback();
        } catch (cause) {
          writes = before;
          throw cause;
        }
      },
    };
    const result = await Effect.runPromise(
      makeDurableObjectSQLite({ storage })
        .transaction([
          { sql: 'UPDATE things SET value = 1', expectedChanges: 1 },
        ])
        .pipe(Effect.result),
    );
    expect(result._tag).toBe('Failure');
    expect(statements).toEqual([
      'UPDATE things SET value = 1',
      'SELECT changes() AS changes',
    ]);
    expect(writes).toBe(0);
  });

  it('Durable Object reports affected rows instead of billed index writes', () => {
    const storage: DurableObjectSQLiteStorage = {
      sql: {
        exec: (sql) => ({
          toArray: () =>
            sql === 'SELECT changes() AS changes' ? [{ changes: 1 }] : [],
          rowsWritten: sql === 'SELECT changes() AS changes' ? 0 : 3,
        }),
      },
      transactionSync: (callback) => callback(),
    };

    expect(
      Effect.runSync(
        makeDurableObjectSQLite({ storage }).run('UPDATE indexed_table'),
      ),
    ).toEqual({ changes: 1 });
  });
});
import { DatabaseSync } from 'node:sqlite';
import BetterSqlite3 from 'better-sqlite3';
