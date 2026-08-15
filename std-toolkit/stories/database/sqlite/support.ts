import { DatabaseSync } from 'node:sqlite';
import { Effect } from 'effect';
import { Ulid } from 'std-toolkit/core';
import { SQLite, type SQLiteDriver } from 'std-toolkit/db/sqlite';
import type { DurableObjectSQLiteStorage } from 'std-toolkit/db/sqlite/durable-object';

import { sequentialUlid, table } from '../support.js';

export const onDriver = <A, E, R>(
  driver: SQLiteDriver,
  program: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const configured = SQLite.make(table, { database: driver });
    yield* configured.setup;
    return yield* program.pipe(
      Effect.provide(configured.layer),
      Effect.provideService(Ulid, sequentialUlid()),
      Effect.ensuring(Effect.sync(() => driver.close?.())),
    );
  });

export const makeSimulatedDurableObjectStorage =
  (): DurableObjectSQLiteStorage => {
    const database = new DatabaseSync(':memory:');
    return {
      sql: {
        exec: (sql, ...parameters) => {
          const statement = database.prepare(sql);
          const reads = /^\s*(select|pragma|with)/i.test(sql);
          const rows = reads
            ? statement.all(...parameters)
            : (statement.run(...parameters), []);
          return {
            toArray: () => rows as never,
            rowsWritten: 0,
          };
        },
      },
      transactionSync: (callback) => {
        database.exec('BEGIN');
        try {
          const result = callback();
          database.exec('COMMIT');
          return result;
        } catch (cause) {
          database.exec('ROLLBACK');
          throw cause;
        }
      },
    };
  };
