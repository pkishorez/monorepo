import type { D1Database } from '@cloudflare/workers-types';
import { Effect, Layer } from 'effect';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQLiteChangesMismatch } from '../database/index.js';
import { makeD1SQLite } from '../drivers/d1/index.js';
import { SQLite } from '../index.js';
import {
  conformanceTable,
  runConformanceSuite,
} from '../../std-table/__tests__/conformance.js';

let miniflare: Miniflare;
let binding: D1Database;
let driver: ReturnType<typeof makeD1SQLite>;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("D1 tests"); } }',
    compatibilityDate: '2026-07-30',
    d1Databases: ['DB'],
  });
  binding = await miniflare.getD1Database('DB');
  // Compile against Cloudflare's own binding type as well as exercising D1.
  driver = makeD1SQLite({ database: binding });
}, 30_000);

afterAll(async () => {
  await miniflare?.dispose();
});

let tableSequence = 0;
runConformanceSuite({
  name: 'SQLite D1',
  makeLayer: () => {
    const table = SQLite.make(conformanceTable, {
      database: driver,
      tableName: `conformance_${++tableSequence}`,
    });
    return Layer.unwrap(table.setup.pipe(Effect.as(table.layer)));
  },
});

const failure = async (effect: Effect.Effect<unknown, unknown>) => {
  const result = await Effect.runPromise(effect.pipe(Effect.result));
  expect(result._tag).toBe('Failure');
  if (result._tag !== 'Failure') throw new Error('Expected failure');
  return result.failure;
};

describe('D1 SQLite driver', () => {
  it('binds values, normalizes blobs, and counts direct writes with triggers', async () => {
    await binding.exec(
      'CREATE TABLE values_test (id TEXT PRIMARY KEY, value BLOB)',
    );
    await binding.exec('CREATE TABLE audit_test (id TEXT)');
    await binding.exec(
      'CREATE TRIGGER values_audit AFTER INSERT ON values_test BEGIN INSERT INTO audit_test VALUES (new.id); END',
    );
    const bytes = new Uint8Array([9, 0, 128, 255, 8]).subarray(1, 4);
    expect(
      await Effect.runPromise(
        driver.run('INSERT INTO values_test VALUES (?, ?)', ['one', bytes]),
      ),
    ).toEqual({ changes: 1 });
    expect(
      await Effect.runPromise(
        driver.all('SELECT * FROM values_test WHERE id = ?', ['one']),
      ),
    ).toEqual([{ id: 'one', value: new Uint8Array([0, 128, 255]) }]);
    expect(
      await Effect.runPromise(
        driver.all('SELECT ? AS empty, ? AS text, ? AS number', [
          null,
          'hello',
          1.25,
        ]),
      ),
    ).toEqual([{ empty: null, text: 'hello', number: 1.25 }]);
    expect(
      await failure(driver.run('SELECT ?', [9007199254740993n])),
    ).toBeInstanceOf(TypeError);
  });

  it.each([0, 1, 2])(
    'rolls back the batch and reports original failing index %i',
    async (index) => {
      const table = `rollback_${index}`;
      await binding.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
      const cause = await failure(
        driver.transaction(
          [0, 1, 2].map((position) =>
            position === index
              ? {
                  sql: `UPDATE ${table} SET id = id WHERE id = 99`,
                  expectedChanges: 1,
                }
              : {
                  sql: `INSERT INTO ${table} VALUES (?)`,
                  parameters: [position],
                  expectedChanges: 1,
                },
          ),
        ),
      );
      expect(cause).toBeInstanceOf(SQLiteChangesMismatch);
      expect(cause).toMatchObject({ index });
      expect(
        await Effect.runPromise(driver.all(`SELECT * FROM ${table}`)),
      ).toEqual([]);
    },
  );

  it('honors zero expected changes, empty batches, and successful guarded writes', async () => {
    await binding.exec(
      'CREATE TABLE successful_batch (id INTEGER PRIMARY KEY)',
    );
    await Effect.runPromise(driver.transaction([]));
    await Effect.runPromise(
      driver.transaction([
        { sql: 'UPDATE successful_batch SET id = id', expectedChanges: 0 },
        { sql: 'INSERT INTO successful_batch VALUES (1)', expectedChanges: 1 },
        { sql: 'INSERT INTO successful_batch VALUES (2)' },
        { sql: 'UPDATE successful_batch SET id = id', expectedChanges: 2 },
      ]),
    );
    expect(
      await Effect.runPromise(
        driver.all('SELECT * FROM successful_batch ORDER BY id'),
      ),
    ).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('preserves ordinary SQL failures and rolls back earlier writes', async () => {
    await binding.exec('CREATE TABLE sql_failure (id INTEGER PRIMARY KEY)');
    const cause = await failure(
      driver.transaction([
        { sql: 'INSERT INTO sql_failure VALUES (1)', expectedChanges: 1 },
        { sql: 'INSERT INTO sql_failure VALUES (1)' },
      ]),
    );
    expect(cause).toBeInstanceOf(Error);
    expect(cause).not.toBeInstanceOf(SQLiteChangesMismatch);
    expect(
      await Effect.runPromise(driver.all('SELECT * FROM sql_failure')),
    ).toEqual([]);
  });

  it('reconciles setup repeatedly using the caller-owned binding', async () => {
    const table = SQLite.make(conformanceTable, {
      database: driver,
      tableName: 'repeated_setup',
    });
    await Effect.runPromise(table.setup);
    await Effect.runPromise(table.setup);
    expect(
      (await Effect.runPromise(driver.all('PRAGMA index_list(repeated_setup)')))
        .length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('rolls back a full 100-statement batch when the last condition fails', async () => {
    await binding.exec('CREATE TABLE full_batch (id INTEGER PRIMARY KEY)');
    const cause = await failure(
      driver.transaction(
        Array.from({ length: 100 }, (_, index) => ({
          sql: 'INSERT INTO full_batch VALUES (?)',
          parameters: [index],
          expectedChanges: index === 99 ? 0 : 1,
        })),
      ),
    );
    expect(cause).toBeInstanceOf(SQLiteChangesMismatch);
    expect(cause).toMatchObject({ index: 99 });
    expect(
      await Effect.runPromise(driver.all('SELECT * FROM full_batch')),
    ).toEqual([]);
  });

  it('allows only one concurrent conditional batch to commit', async () => {
    await binding.exec('CREATE TABLE contested (version INTEGER)');
    await binding.exec('INSERT INTO contested VALUES (0)');
    await binding.exec('CREATE TABLE winners (id INTEGER)');
    const results = await Promise.all(
      [1, 2].map((id) =>
        Effect.runPromise(
          makeD1SQLite({ database: binding })
            .transaction([
              {
                sql: 'UPDATE contested SET version = ? WHERE version = 0',
                parameters: [id],
                expectedChanges: 1,
              },
              { sql: 'INSERT INTO winners VALUES (?)', parameters: [id] },
            ])
            .pipe(Effect.result),
        ),
      ),
    );
    expect(results.filter((result) => result._tag === 'Success')).toHaveLength(
      1,
    );
    expect(results.filter((result) => result._tag === 'Failure')).toHaveLength(
      1,
    );
    const rows = await Effect.runPromise(driver.all('SELECT * FROM winners'));
    expect(rows).toHaveLength(1);
    expect(
      await Effect.runPromise(driver.all('SELECT version FROM contested')),
    ).toEqual([{ version: rows[0]?.id }]);
  });
});
