import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { SQLiteChangesMismatch } from '../database/index.js';
import { makeExpoSQLite } from '../drivers/expo/index.js';
import { SQLite } from '../index.js';
import {
  conformanceTable,
  runConformanceSuite,
} from '../../std-table/__tests__/conformance.js';
import { fakeExpoDatabase } from './expo-database.js';

runConformanceSuite({
  name: 'SQLite Expo',
  makeLayer: () => {
    const config = {
      database: makeExpoSQLite({ database: fakeExpoDatabase() }),
    };
    return Layer.unwrap(
      SQLite.setup(conformanceTable, config).pipe(
        Effect.as(SQLite.make(conformanceTable, config).layer),
      ),
    );
  },
});

describe('Expo SQLite driver', () => {
  it('round-trips values, blobs included', async () => {
    const driver = makeExpoSQLite({ database: fakeExpoDatabase() });
    await Effect.runPromise(
      driver.run('CREATE TABLE things (id TEXT PRIMARY KEY, value BLOB)'),
    );
    expect(
      await Effect.runPromise(
        driver.run('INSERT INTO things VALUES (?, ?)', [
          'one',
          new Uint8Array([0, 128, 255]),
        ]),
      ),
    ).toEqual({ changes: 1 });
    expect(await Effect.runPromise(driver.all('SELECT * FROM things'))).toEqual(
      [{ id: 'one', value: new Uint8Array([0, 128, 255]) }],
    );
  });

  it('rolls a transaction back when a guarded statement changes no rows', async () => {
    const driver = makeExpoSQLite({ database: fakeExpoDatabase() });
    await Effect.runPromise(
      driver.run('CREATE TABLE things (id TEXT PRIMARY KEY)'),
    );
    const result = await Effect.runPromise(
      driver
        .transaction([
          { sql: "INSERT INTO things VALUES ('one')", expectedChanges: 1 },
          { sql: "DELETE FROM things WHERE id = 'two'", expectedChanges: 1 },
        ])
        .pipe(Effect.result),
    );
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure')
      expect(result.failure).toEqual(new SQLiteChangesMismatch(1));
    expect(await Effect.runPromise(driver.all('SELECT * FROM things'))).toEqual(
      [],
    );
  });

  it('rejects bigint parameters', async () => {
    const driver = makeExpoSQLite({ database: fakeExpoDatabase() });
    const result = await Effect.runPromise(
      driver.all('SELECT ? AS value', [1n]).pipe(Effect.result),
    );
    expect(result._tag).toBe('Failure');
  });
});
