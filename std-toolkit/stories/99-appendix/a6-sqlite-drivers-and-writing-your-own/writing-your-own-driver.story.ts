import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { SQLite, type SQLiteDriver } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// A driver of our own: it wraps another driver and writes down every statement that passes through.
const recordingDriver = (inner: SQLiteDriver) => {
  const recorded: {
    readonly sql: string;
    readonly expectedChanges?: number;
  }[] = [];
  const driver: SQLiteDriver = {
    run: (sql, parameters) =>
      Effect.suspend(() => {
        recorded.push({ sql });
        return inner.run(sql, parameters);
      }),
    all: (sql, parameters) =>
      Effect.suspend(() => {
        recorded.push({ sql });
        return inner.all(sql, parameters);
      }),
    transaction: (statements) =>
      Effect.suspend(() => {
        for (const { sql, expectedChanges } of statements)
          recorded.push(
            expectedChanges === undefined ? { sql } : { sql, expectedChanges },
          );
        return inner.transaction(statements);
      }),
    ...(inner.close === undefined ? {} : { close: inner.close }),
  };
  return { driver, recorded };
};

// Runs a program through a driver: set the table up, run, close, with stamps counting up from one.
const onDriver = <A, E, R>(
  driver: SQLiteDriver,
  program: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const configured = SQLite.make(table, { database: driver });
    yield* configured.setup;
    let issued = 0;
    return yield* program.pipe(
      Effect.provide(configured.layer),
      Effect.provideService(Ulid, () => String(++issued).padStart(26, '0')),
      Effect.ensuring(Effect.sync(() => driver.close?.())),
    );
  });

// A task on the work board.
const draft = (taskId: string, title: string) =>
  ({
    taskId,
    boardId: 'work',
    title,
    status: 'open',
    assignee: null,
    colour: 'blue',
    notes: '',
  }) as const;

export const writingYourOwnDriver = Story.make({
  title: 'Writing your own driver',
  description:
    'A driver is three methods: `run`, `all` and `transaction`. Anything that executes SQL can supply them, and the whole table runs through it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How much does a driver of my own have to supply?', {
      answer:
        'Three methods, `run`, `all` and `transaction`, plus an optional `close`. The wrapper above is about twenty lines and records every statement; the whole table runs through it unchanged, which makes the driver a good place for logging, metrics or retries.',
      proof: Story.trace(
        Effect.gen(function* () {
          // Wrap the node driver so it records what passes through.
          const { driver, recorded } = recordingDriver(
            makeNodeSQLite({ path: ':memory:' }),
          );
          // Save a task and read it back, through the recording driver.
          const title = yield* onDriver(
            driver,
            Effect.gen(function* () {
              yield* task.insert(draft('t1', 'Observed'));
              const stored = yield* task.get({ taskId: 't1', boardId: 'work' });
              return stored?.value.title ?? null;
            }),
          );
          // The kinds of statement the driver saw.
          const kinds = [
            ...new Set(
              recorded.map(({ sql }) =>
                sql.trim().split(/\s+/)[0]?.toUpperCase(),
              ),
            ),
          ];
          yield* Story.assert(
            'the table works through the custom driver',
            title === 'Observed',
          );
          yield* Story.assert(
            'and the driver saw the real INSERT and SELECT traffic',
            kinds.includes('INSERT') && kinds.includes('SELECT'),
          );
          return { title, kinds };
        }),
      ),
    }),
    Story.question('How does a guarded write reach my driver?', {
      answer:
        'As data, not as a callback. A single guarded write goes through `run`, and the adapter compares the number of changed rows itself. Inside a batch each statement carries `expectedChanges`, and your `transaction` is the one that must compare and roll back.',
      proof: Story.trace(
        Effect.gen(function* () {
          // Wrap the node driver so it records what passes through.
          const { driver, recorded } = recordingDriver(
            makeNodeSQLite({ path: ':memory:' }),
          );
          // Save a task, then commit a batch that changes it and saves another.
          yield* onDriver(
            driver,
            Effect.gen(function* () {
              yield* task.insert(draft('t1', 'Guarded'));
              const finish = yield* task.getAndUpdateOp(
                { taskId: 't1', boardId: 'work' },
                { status: 'done' },
              );
              const add = yield* task.insertOp(draft('t2', 'Fresh'));
              yield* table.transact([finish, add]);
            }),
          );
          // The statements that arrived with an expectation attached.
          const guarded = recorded.filter(
            ({ expectedChanges }) => expectedChanges !== undefined,
          );
          yield* Story.assert(
            'each statement in the batch carried its expectation as data',
            guarded.length === 2 &&
              guarded.every(({ expectedChanges }) => expectedChanges === 1),
          );
          return { guarded };
        }),
      ),
    }),
  ],
});
