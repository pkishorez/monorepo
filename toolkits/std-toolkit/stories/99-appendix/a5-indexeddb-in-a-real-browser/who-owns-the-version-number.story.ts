import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { IDB } from 'std-toolkit/db/idb';
import { table as plainTable } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task as plainTask } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';
import {
  table as indexedTable,
  task as indexedTask,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// Update stamps for the proofs, counting up from one like every chapter.
let issued = 0;
const stamped = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provideService(Ulid, () => String(++issued).padStart(26, '0')),
  );

// A task on the work board, assigned to Ana.
const draft = (taskId: string) =>
  ({
    taskId,
    boardId: 'work',
    title: `Task ${taskId}`,
    status: 'open',
    assignee: 'ana',
    colour: 'blue',
    notes: '',
  }) as const;

export const whoOwnsTheVersionNumber = Story.make({
  title: 'Who owns the version number',
  description:
    'IndexedDB changes its shape only inside a version change. The adapter works the version out from the declared table; you never pick a number.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Who decides the IndexedDB version number?', {
      answer:
        'The adapter. You declare the table; `setup` looks at the live database, raises the version only when a declared store or index is missing, and leaves it alone when nothing changed. IndexedDB is the only database here whose shape can change only inside a version change, so the arithmetic belongs to it.',
      proof: Story.trace(
        Effect.gen(function* () {
          // A private IndexedDB and a named database in it.
          const database = IDB.database({
            databaseName: 'board',
            indexedDB: new IDBFactory(),
          });
          // Set up the plain table from chapter 2, then set it up again.
          const plain = IDB.make(plainTable, { database });
          yield* plain.setup;
          const afterFirst = (yield* Effect.promise(database.open)).version;
          yield* plain.setup;
          const afterRepeat = (yield* Effect.promise(database.open)).version;
          // Now set up the table from chapter 10, which adds two index slots.
          const indexed = IDB.make(indexedTable, { database });
          yield* indexed.setup;
          const upgraded = yield* Effect.promise(database.open);
          // The indexes the store now has.
          const indexNames = Array.from(
            upgraded.transaction('board', 'readonly').objectStore('board')
              .indexNames,
          );
          yield* Story.assert(
            'an unchanged declaration never moves the version',
            afterRepeat === afterFirst,
          );
          yield* Story.assert(
            'declaring the slots moved it exactly once, and created them',
            upgraded.version === afterFirst + 1 &&
              indexNames.includes('LSI1') &&
              indexNames.includes('GSI1'),
          );
          return {
            afterFirst,
            afterRepeat,
            upgraded: upgraded.version,
            indexNames,
          };
        }),
      ),
    }),
    Story.question(
      'What happens to the rows already there when the shape grows?',
      {
        answer:
          'They stay exactly as they are: the upgrade only adds, never rewrites, and never fills in the past. A task saved before the by-person slot existed carries no key for it, so that slot does not list it, while a read by key still finds it.',
        proof: Story.trace(
          Effect.gen(function* () {
            // A private IndexedDB and a named database in it.
            const database = IDB.database({
              databaseName: 'board',
              indexedDB: new IDBFactory(),
            });
            // Save a task through the plain table, before any slot exists.
            const plain = IDB.make(plainTable, { database });
            yield* plain.setup;
            yield* stamped(
              plainTask.insert(draft('t1')).pipe(Effect.provide(plain.layer)),
            );
            // Grow the shape to the indexed table.
            const indexed = IDB.make(indexedTable, { database });
            yield* indexed.setup;
            // Save a second task through it, then ask the by-person slot and read the old task by key.
            const result = yield* stamped(
              Effect.gen(function* () {
                yield* indexedTask.insert(draft('t2'));
                const ana = yield* indexedTask.query('byAssignee', {
                  pk: { assignee: 'ana' },
                  '>=': null,
                });
                const survivor = yield* indexedTask.get({
                  taskId: 't1',
                  boardId: 'work',
                });
                return {
                  listed: ana.items.map(({ value }) => value.taskId),
                  survivor,
                };
              }).pipe(Effect.provide(indexed.layer)),
            );
            yield* Story.assert(
              'the task from before the upgrade still reads back',
              result.survivor?.value.title === 'Task t1',
            );
            yield* Story.assert(
              'the new slot lists only tasks saved after it existed',
              result.listed.join() === 't2',
            );
            return result;
          }),
        ),
      },
    ),
  ],
});
