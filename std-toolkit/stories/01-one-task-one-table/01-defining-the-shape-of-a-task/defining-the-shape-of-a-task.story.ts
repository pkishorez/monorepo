import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// What a task is, written down once. `taskId` is the field that tells one task from another.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
}).build();

// One task, exactly as the app would hold it.
const draft = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

export const definingTheShapeOfATask = Story.make({
  title: 'Defining the shape of a task',
  description:
    'A task is described once: its fields, their types, and which field identifies it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does a task look like to the toolkit?', {
      answer:
        'A named shape (a schema: the list of fields a task has and what each holds) with one field, `taskId`, singled out as its identity. Anything you hand it is checked against that shape, so a task with a field missing is turned away and any extra field is dropped.',
      proof: Effect.gen(function* () {
        // Hand the shape a complete task; it comes back accepted. (`'~standard'` is the same check any form library can call.)
        const accepted = Task['~standard'].validate(draft);
        // Hand it a task with a field the shape never named; the field is dropped.
        const trimmed = Task['~standard'].validate({ ...draft, urgent: true });
        // Hand it a task with fields missing; it is turned away with the reasons.
        const refused = Task['~standard'].validate({ taskId: 't2' });
        yield* Story.assert('a complete task is accepted', 'value' in accepted);
        yield* Story.assert(
          'an undeclared field does not survive',
          'value' in trimmed && !('urgent' in trimmed.value),
        );
        yield* Story.assert(
          'an incomplete task is refused',
          'issues' in refused,
        );
        return {
          name: Task.name,
          idField: Task.idField,
          accepted,
          trimmed,
          refused,
        };
      }),
    }),
    Story.question(
      'What does the toolkit add when it writes a task down, and does my code have to care?',
      {
        answer:
          'One stamp, `_v`, saying which version of the shape the task was written with; every write uses the newest version. Reading removes the stamp again, so your code never sees it, and the whole `_` prefix is reserved so your own fields can never collide with it.',
        proof: Effect.gen(function* () {
          // Turn the task into what storage will hold; the stamp appears.
          const stored = yield* Task.encode(draft);
          // Turn the stored form back into a task; the stamp is gone.
          const back = yield* Task.decode(stored);
          yield* Story.assert(
            'storage carries the version stamp',
            stored._v === 'v1',
          );
          yield* Story.assert('the app never sees it', !('_v' in back));
          return { stored, back };
        }),
      },
    ),
    Story.question('Can a field be a `Date`?', {
      answer:
        'No: a field that converts on the way in and out is refused the moment the shape is built, because a saved description of the shape must be able to rebuild it from JSON alone. Store the ISO string the date already is, and turn it into a `Date` where you use it.',
      proof: Effect.gen(function* () {
        // Try to declare a due date that parses text into a Date; building the shape throws.
        const refused = yield* Effect.flip(
          Effect.try(() =>
            EntityESchema.make('Task', 'taskId', {
              boardId: Schema.String,
              dueAt: Schema.DateFromString,
            }).build(),
          ),
        );
        // Declare the due date as the string it is stored as; this builds.
        const WithDueDate = EntityESchema.make('Task', 'taskId', {
          boardId: Schema.String,
          dueAt: Schema.String,
        }).build();
        // The stored form keeps the plain string.
        const stored = yield* WithDueDate.encode({
          taskId: 't1',
          boardId: 'work',
          dueAt: new Date('2026-09-01T09:00:00.000Z').toISOString(),
        });
        yield* Story.assert(
          'the converting field is refused at build time',
          refused.cause instanceof Error &&
            refused.cause.name === 'UnrepresentableFieldError' &&
            refused.cause.message.includes('dueAt'),
        );
        yield* Story.assert(
          'the plain string is stored as it is',
          stored.dueAt === '2026-09-01T09:00:00.000Z',
        );
        return { refused: (refused.cause as Error).message, stored };
      }),
    }),
  ],
});
