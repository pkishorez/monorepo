import { Effect } from 'effect';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import type { SQLiteDriver } from 'std-toolkit/db/sqlite';
import { Story } from 'laymos/story';

import { note, table } from '../support.js';
import { onDriver } from './support.js';

interface RecordedStatement {
  readonly sql: string;
  readonly expectedChanges?: number;
}

const recordingDriver = (inner: SQLiteDriver) => {
  const recorded: RecordedStatement[] = [];
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
        for (const { sql, expectedChanges } of statements) {
          recorded.push(
            expectedChanges === undefined ? { sql } : { sql, expectedChanges },
          );
        }
        return inner.transaction(statements);
      }),
    ...(inner.close === undefined ? {} : { close: inner.close }),
  };
  return { driver, recorded };
};

export const writeYourOwnDriver = Story.make({
  title: 'Write your own driver',
  description: 'Anything that executes SQL can host the whole table.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How much must a custom driver supply?', {
      answer:
        'Three methods: `run`, `all`, and `transaction`. A `close` method is optional. Anything that executes SQL can therefore host the whole table. This Story wraps the node driver in about twelve lines to record each statement, and the whole entity surface runs through it without a change. The seam is thus a good place for logging, metrics, or retries.',
      proof: Effect.gen(function* () {
        const { driver, recorded } = recordingDriver(
          makeNodeSQLite({ path: ':memory:' }),
        );
        const result = yield* onDriver(
          driver,
          Effect.gen(function* () {
            yield* note.insert({
              noteId: 'n1',
              notebook: 'custom',
              title: 'Observed',
              status: 'open',
            });
            const fetched = yield* note.get({
              noteId: 'n1',
              notebook: 'custom',
            });
            return fetched?.value.title ?? null;
          }),
        );
        const kinds = new Set(
          recorded.map(({ sql }) => sql.trim().split(/\s+/)[0]?.toUpperCase()),
        );
        yield* Story.assert(
          'the entity surface works through the custom driver',
          result === 'Observed',
        );
        yield* Story.assert(
          'the wrapper observed real INSERT and SELECT traffic',
          kinds.has('INSERT') && kinds.has('SELECT'),
        );
        return { result, observed: [...kinds] };
      }),
    }),
    Story.question('How does a conditional write reach your driver?', {
      answer:
        'As data, not as a callback. A single conditional write goes through `run`, and the adapter compares the number of changed rows itself. Inside a batch, each statement carries the number of rows that it expects, and your driver compares that number.',
      proof: Effect.gen(function* () {
        const { driver, recorded } = recordingDriver(
          makeNodeSQLite({ path: ':memory:' }),
        );
        yield* onDriver(
          driver,
          Effect.gen(function* () {
            yield* note.insert({
              noteId: 'n1',
              notebook: 'custom',
              title: 'Guarded',
              status: 'open',
            });
            const ops = yield* Effect.all([
              note.getAndUpdateOp(
                { noteId: 'n1', notebook: 'custom' },
                { status: 'done' },
              ),
              note.insertOp({
                noteId: 'n2',
                notebook: 'custom',
                title: 'Fresh',
                status: 'open',
              }),
            ]);
            yield* table.transact(ops);
          }),
        );
        const guarded = recorded.filter(
          ({ expectedChanges }) => expectedChanges !== undefined,
        );
        yield* Story.assert(
          'every transacted statement carried its expectation as data',
          guarded.length === 2 &&
            guarded.every(({ expectedChanges }) => expectedChanges === 1),
        );
        return { guarded };
      }),
    }),
  ],
});
