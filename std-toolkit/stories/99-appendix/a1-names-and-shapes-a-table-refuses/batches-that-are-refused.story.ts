import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// A second, unrelated table with Task attached to it in the same way.
const archive = StdTable.make('archive').primary('pk', 'sk').build();
const archivedTask = archive
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// A task with the given id on the work board.
const draft = (taskId: string) =>
  ({
    taskId,
    boardId: 'work',
    title: `Task ${taskId}`,
    status: 'open',
    assignee: null,
    colour: 'blue',
    notes: '',
  }) as const;

export const batchesThatAreRefused = Story.make({
  title: 'Batches that are refused',
  description:
    'A batch touches each row once, holds at most a hundred ops, and belongs to one table. It is checked before anything is written.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What if a batch touches the same task twice?', {
      answer:
        'It fails with `DuplicateTransactionTarget` before anything is written. Each row may appear once in a batch, so two changes to one task must be folded into one op.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Describe one save, then hand it over twice.
            const op = yield* task.insertOp(draft('t1'));
            const failure = yield* table.transact([op, op]).pipe(Effect.flip);
            // Read what the table kept.
            const stored = yield* task.get({ taskId: 't1', boardId: 'work' });
            yield* Story.assert(
              'the repeated row is refused',
              failure.reason._tag === 'DuplicateTransactionTarget',
            );
            yield* Story.assert('and nothing was written', stored === null);
            return { reason: failure.reason, stored };
          }),
        ),
      ),
    }),
    Story.question('How many tasks can one batch touch?', {
      answer:
        'One hundred, the DynamoDB ceiling, kept on every database so a batch that works here works there. A batch of a hundred commits; one more fails with `TransactionTooLarge` without writing.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Describe a hundred and one saves.
            const ops = yield* Effect.forEach(
              Array.from({ length: 101 }, (_, index) =>
                String(index + 1).padStart(3, '0'),
              ),
              (suffix) => task.insertOp(draft(`t${suffix}`)),
            );
            // The first hundred land together.
            const written = yield* table.transact(ops.slice(0, 100));
            // All hundred and one are refused as one batch.
            const failure = yield* table.transact(ops).pipe(Effect.flip);
            yield* Story.assert(
              'a hundred ops commit and a hundred and one are refused',
              written.length === 100 &&
                failure.reason._tag === 'TransactionTooLarge',
            );
            return { written: written.length, reason: failure.reason };
          }),
        ),
      ),
    }),
    Story.question('What if an op was built against another table?', {
      answer:
        'The batch fails with `ForeignTransactionItem`, naming both tables, and nothing is written. Every op in a batch must come from the table that commits it.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // One op from this table, one built by the archive table (given its own in-memory copy to build it against).
            const mine = yield* task.insertOp(draft('t1'));
            const foreign = yield* archivedTask
              .insertOp(draft('t1'))
              .pipe(Effect.provide(Memory.make(archive).layer));
            // Commit both here; the archive op is refused.
            const failure = yield* table
              .transact([mine, foreign as never])
              .pipe(Effect.flip);
            // Read what the table kept.
            const stored = yield* task.get({ taskId: 't1', boardId: 'work' });
            yield* Story.assert(
              'the op from the other table is refused',
              failure.reason._tag === 'ForeignTransactionItem',
            );
            yield* Story.assert('and nothing was written', stored === null);
            return { reason: failure.reason, stored };
          }),
        ),
      ),
    }),
  ],
});
