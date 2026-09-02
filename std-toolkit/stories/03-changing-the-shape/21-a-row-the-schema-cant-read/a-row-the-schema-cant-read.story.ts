import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// Another tool's idea of a Task: same name, same version, but it stores the title as a number. Its own table instance, because one instance holds one shape per name.
const tableOfAnotherTool = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
const taskOfAnotherTool = tableOfAnotherTool
  .entity(
    EntityESchema.make('Task', 'taskId', {
      boardId: Schema.String,
      title: Schema.Number,
      status: Schema.Literals(['open', 'done']),
      assignee: Schema.NullOr(Schema.String),
      colour: Schema.String,
      notes: Schema.String,
    }).build(),
  )
  .primary({ pk: ['boardId'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The row the other tool writes, and an ordinary task beside it on the same board.
const key = { taskId: 't1', boardId: 'work' };
const fromAnotherTool = {
  ...key,
  title: 7,
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;
const neighbour = {
  taskId: 't2',
  boardId: 'work',
  title: 'Review it',
  status: 'open',
  assignee: 'ben',
  colour: 'blue',
  notes: '',
} as const;

export const aRowTheSchemaCantRead = Story.make({
  title: "A row the schema can't read",
  description:
    'One stored task does not match the shape its version stamp promises. What a read does, what it does to the other tasks, and what an unknown version stamp does.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'One task in storage does not match the version it claims. What happens when it is read?',
      {
        answer:
          'The read fails with `DecodeFailed`, naming the kind of thing and carrying the reason; it never hands back a task it guessed at. The fault shows up at the row that holds it, at the moment something reads it.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // The other tool writes a Task with a number for a title.
              yield* taskOfAnotherTool.insert(fromAnotherTool);
              // Read it as a Task; the failure comes back as a value.
              const failure = yield* task.get(key).pipe(Effect.flip);
              yield* Story.assert(
                'the read fails instead of guessing',
                failure.reason._tag === 'DecodeFailed' &&
                  failure.reason.entity === 'Task',
              );
              return { reason: failure.reason };
            }),
          ),
        ),
      },
    ),
    Story.question('Do the other tasks on the board still come back?', {
      answer:
        'Read by key, yes: each row is decoded on its own, so the bad one does not touch its neighbours. A list of the board that has to pass through the bad row fails at it, so the fix is to repair or remove that row, not to wait for the list to skip it.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // The bad row and an ordinary task, on the same board.
            yield* taskOfAnotherTool.insert(fromAnotherTool);
            yield* task.insert(neighbour);
            // The neighbour reads by key as if nothing were wrong.
            const fine = yield* task.get({ taskId: 't2', boardId: 'work' });
            // Listing the board runs into the bad row; the failure comes back as a value.
            const listing = yield* task
              .query('primary', { pk: { boardId: 'work' }, '>=': null })
              .pipe(Effect.flip);
            yield* Story.assert(
              'the neighbour is unaffected',
              fine?.value.title === 'Review it',
            );
            yield* Story.assert(
              'the list fails at the bad row',
              listing.reason._tag === 'DecodeFailed',
            );
            return { fine, listing: listing.reason._tag };
          }),
        ),
      ),
    }),
    Story.question(
      'The stamp `_v` names a version the shape does not have. What happens?',
      {
        answer:
          "Decoding stops at once with an error that names the version, and nothing is converted or guessed. It is the same failure that code from last year hits when it meets a row written by this year's code, so it is worth recognising.",
        proof: Story.trace(
          Effect.gen(function* () {
            // Decode a row stamped with a version Task never had; the refusal comes back as a value.
            const refused = yield* Task.decode({
              _v: 'v9',
              ...neighbour,
            }).pipe(Effect.flip);
            yield* Story.assert(
              'the error names the unknown version',
              refused._tag === 'ESchemaError' &&
                refused.message === 'Unknown schema version: v9',
            );
            return { refused: refused.message };
          }),
        ),
      },
    ),
  ],
});
