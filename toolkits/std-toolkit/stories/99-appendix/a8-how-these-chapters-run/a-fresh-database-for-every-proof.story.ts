import { Effect } from 'effect';
import { Story } from 'laymos/story';
import type { DatabaseError } from 'std-toolkit/db';
import { adapterNames, fresh } from '../../env.js';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// The task one proof leaves behind, and the key the next proof looks for.
const key = { taskId: 't1', boardId: 'work' };
const leftover = {
  ...key,
  title: 'Leftover',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

export const aFreshDatabaseForEveryProof = Story.make({
  title: 'A fresh database for every proof',
  description:
    'Every proof in these chapters runs inside `fresh(adapter, table)` from `stories/env.ts`, the one helper the chapters share. It hands out an empty database and takes it back.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Each proof writes tasks into a real database. What stops the next proof from finding them?',
      {
        answer:
          '`fresh` gives each program a database nobody else has: a new in-memory table, a new `:memory:` SQLite connection, an IndexedDB database with a name unique to this process and call, or a DynamoDB table named the same way. When the program ends the table is dropped, the connection closed, the database deleted, so the next `fresh` starts empty on every adapter.',
        proof: Story.trace(
          Effect.gen(function* () {
            // On each adapter: save a task in one fresh database, then look for it in the next.
            const results = yield* Effect.forEach(adapterNames, (adapter) =>
              Effect.gen(function* () {
                yield* fresh(adapter, table)(task.insert(leftover));
                const found = yield* fresh(adapter, table)(task.get(key));
                return [adapter, found] as const;
              }),
            );
            yield* Story.assert(
              'no adapter carries a task from one fresh database into the next',
              results.every(([, found]) => found === null),
            );
            return Object.fromEntries(results);
          }),
        ),
      },
    ),
    Story.question('Does that still happen when a proof fails?', {
      answer:
        'Yes. The teardown is attached with `Effect.ensuring`, so it runs whether the program succeeds, fails or is interrupted. A proof that fails halfway leaves nothing for the next one.',
      proof: Story.trace(
        Effect.gen(function* () {
          // On each adapter: a program that saves a task and then fails; then a look in the next fresh database.
          const results = yield* Effect.forEach(adapterNames, (adapter) =>
            Effect.gen(function* () {
              const failure = yield* fresh(
                adapter,
                table,
              )(
                Effect.gen(function* () {
                  yield* task.insert(leftover);
                  return yield* task.insert(leftover);
                }),
              ).pipe(Effect.flip);
              const found = yield* fresh(adapter, table)(task.get(key));
              return [
                adapter,
                { failed: (failure as DatabaseError).reason._tag, found },
              ] as const;
            }),
          );
          yield* Story.assert(
            'every program really did fail',
            results.every(([, { failed }]) => failed === 'ItemAlreadyExists'),
          );
          yield* Story.assert(
            'and left nothing behind',
            results.every(([, { found }]) => found === null),
          );
          return Object.fromEntries(results);
        }),
      ),
    }),
    Story.question('Why do the update stamps in every chapter read 1, 2, 3?', {
      answer:
        'Because `fresh` also hands the program a `Ulid` (the stamp maker behind `_u`) that counts up from one instead of the random, time-based one a real app uses. Every run starts the count again, so the same chapter gives the same stamps on every database and every day, which is what lets the chapters compare answers across adapters.',
      proof: Story.trace(
        Effect.gen(function* () {
          // Save two tasks in one fresh database and look at their stamps.
          const stamps = yield* fresh(
            'memory',
            table,
          )(
            Effect.gen(function* () {
              const first = yield* task.insert(leftover);
              const second = yield* task.insert({ ...leftover, taskId: 't2' });
              return [first.meta._u, second.meta._u];
            }),
          );
          // A second fresh database starts the count again.
          const again = yield* fresh(
            'memory',
            table,
          )(task.insert(leftover).pipe(Effect.map(({ meta }) => meta._u)));
          yield* Story.assert(
            'stamps count up from one',
            stamps.join() ===
              ['1'.padStart(26, '0'), '2'.padStart(26, '0')].join(),
          );
          yield* Story.assert(
            'and start again in the next fresh database',
            again === stamps[0],
          );
          return { stamps, again };
        }),
      ),
    }),
  ],
});
