import { DatabaseSync } from 'node:sqlite';
import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeBetterSQLite3 } from 'std-toolkit/db/sqlite/better-sqlite3';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from 'std-toolkit/db/sqlite/durable-object';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// The program every driver runs: save two tasks, finish one, list the board. It never names a driver.
const program = Effect.gen(function* () {
  yield* task.insert({
    taskId: 't1',
    boardId: 'work',
    title: 'Write the plan',
    status: 'open',
    assignee: null,
    colour: 'blue',
    notes: '',
  });
  yield* task.insert({
    taskId: 't2',
    boardId: 'work',
    title: 'Review it',
    status: 'open',
    assignee: null,
    colour: 'blue',
    notes: '',
  });
  const finished = yield* task.getAndUpdate(
    { taskId: 't1', boardId: 'work' },
    { status: 'done' },
  );
  const work = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  return {
    ids: work.items.map(({ value }) => value.taskId),
    finished: finished.value.status,
    stamp: finished.meta._u,
  };
});

// Runs the program on one SQLite driver: set the table up, run, close, with stamps counting up from one.
const onDriver = (database: ReturnType<typeof makeNodeSQLite>) =>
  Effect.gen(function* () {
    const configured = SQLite.make(table, { database });
    yield* configured.setup;
    let issued = 0;
    return yield* program.pipe(
      Effect.provide(configured.layer),
      Effect.provideService(Ulid, () => String(++issued).padStart(26, '0')),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    );
  });

// A stand-in for the storage a Cloudflare Durable Object hands you: the same two calls, over node:sqlite.
const durableObjectStorage = (): DurableObjectSQLiteStorage => {
  const database = new DatabaseSync(':memory:');
  return {
    sql: {
      exec: (sql, ...parameters) => {
        const statement = database.prepare(sql);
        const reads = /^\s*(select|pragma|with)/i.test(sql);
        const rows = reads
          ? statement.all(...parameters)
          : (statement.run(...parameters), []);
        return { toArray: () => rows as never, rowsWritten: 0 };
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

export const oneTableFourRuntimes = Story.make({
  title: 'One table, four runtimes',
  description:
    'The SQLite adapter sits on a driver of three methods, and there is a driver for each runtime that ships SQLite in its own way.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which runtimes can run the SQLite table?', {
      answer:
        'Any that has SQLite: there is a driver for `node:sqlite`, for `better-sqlite3`, for Bun, and for Cloudflare Durable Objects, each one entrypoint under `std-toolkit/db/sqlite/`. This proof runs the same program on three of them (the Bun driver only runs under Bun, so it is named and not proved) and gets the same answer, stamp included.',
      proof: Story.trace(
        Effect.gen(function* () {
          // The same program on three drivers, each over a database in memory.
          const results = yield* Effect.all({
            node: onDriver(makeNodeSQLite({ path: ':memory:' })),
            betterSqlite3: onDriver(makeBetterSQLite3({ path: ':memory:' })),
            durableObject: onDriver(
              makeDurableObjectSQLite({ storage: durableObjectStorage() }),
            ),
          });
          // One string per driver; they should all be the same string.
          const answers = new Set(
            Object.values(results).map((result) => JSON.stringify(result)),
          );
          yield* Story.assert(
            'the update landed on every driver',
            Object.values(results).every(({ finished }) => finished === 'done'),
          );
          yield* Story.assert(
            'and every driver agrees exactly',
            answers.size === 1,
          );
          return results;
        }),
      ),
    }),
  ],
});
