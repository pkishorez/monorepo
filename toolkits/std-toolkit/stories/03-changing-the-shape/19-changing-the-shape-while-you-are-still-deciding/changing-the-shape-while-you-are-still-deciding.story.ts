import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema, toSchema } from 'std-toolkit/eschema';
import { fresh } from '../../env.js';
import { TaskV4 } from '../18-removing-and-renaming-fields/removing-and-renaming-fields.story.js';

// The v4 history from chapter 18 with one more step: `dueDate` is tried as v5. A version that has shipped is frozen, so the only place a new field can go is the next version.
export const TaskTryingDueDate = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { colour: null }, ({ colour: _colour, ...v2 }) => v2)
  .evolve(
    'v4',
    { notes: null, details: Schema.String },
    ({ notes, ...v3 }) => ({
      ...v3,
      details: notes,
    }),
  )
  .evolve('v5', { dueDate: Schema.NullOr(Schema.String) }, (v4) => ({
    ...v4,
    dueDate: null,
  }))
  .build();

// The table as it shipped, holding Task at v4. One table instance holds one shape per name, so the trial gets its own instance of the same table.
const tableShipped = StdTable.make('board').primary('pk', 'sk').build();
const taskShipped = tableShipped
  .entity(TaskV4)
  .primary({ pk: ['boardId'] })
  .build();
const tableTrying = StdTable.make('board').primary('pk', 'sk').build();
const taskTrying = tableTrying
  .entity(TaskTryingDueDate)
  .primary({ pk: ['boardId'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory. Every run starts empty, like a page reload or a restarted dev server.
const onBoard = fresh('memory', tableShipped);

// A task as it sits in storage today, at v4, and the key that finds it.
const key = { taskId: 't1', boardId: 'work' };
const storedToday = {
  _v: 'v4',
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: 'ana',
  priority: 'high',
  details: 'Ask Ana first',
} as const;

// The same task as the app holds it while trying the due date.
const withDueDate = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: 'ana',
  priority: 'high',
  details: 'Ask Ana first',
  dueDate: '2026-09-30',
} as const;

export const changingTheShapeWhileYouAreStillDeciding = Story.make({
  title: 'Changing the shape while you are still deciding',
  description:
    'A due date is tried as the next version against a board that lives only in memory. Changing your mind is deleting a step; a real database is where that stops being free.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Version 4 has shipped and you want to try a due date. What do you write?',
      {
        answer:
          "The next step, `evolve('v5', …)`, exactly as chapters 17 and 18 did, and you keep editing it until it ships. A version is frozen only once it is approved in a snapshot (chapter 22), so v5 is yours to change until then. A stored v4 row reads through it and gets the step's default.",
        proof: Story.trace(
          Effect.gen(function* () {
            // Read a v4 row through the shape that is trying v5; the new field is filled in.
            const seen = yield* Schema.decodeUnknownEffect(
              toSchema(TaskTryingDueDate),
            )(storedToday);
            yield* Story.assert(
              'the app sees the new field with its default',
              seen.dueDate === null && seen.details === 'Ask Ana first',
            );
            yield* Story.assert(
              'the trial is an ordinary next version',
              TaskTryingDueDate.latestVersion === 'v5',
            );
            return { seen, latestVersion: TaskTryingDueDate.latestVersion };
          }),
        ),
      },
    ),
    Story.question(
      'You change your mind halfway through. What is left behind?',
      {
        answer:
          "Nothing. Deleting the `evolve('v5', …)` line is the whole revert, because the board you tried it on lives in memory: it starts empty on every run, so there are no v5 rows to read back. That is the reason to develop against the Memory adapter, on the server and in the browser alike, until a version ships.",
        proof: Story.trace(
          Effect.gen(function* () {
            // One run of the app while trying v5: a task with a due date is saved, and it is a v5 row.
            const duringTheTrial = yield* onBoard(
              Effect.gen(function* () {
                yield* taskTrying.insert(withDueDate);
                const saved = yield* taskTrying.get(key);
                return saved?.value.dueDate ?? null;
              }),
            );
            // The next run, after the step was deleted: the board starts empty again, and the shipped shape finds nothing to migrate.
            const afterTheRevert = yield* onBoard(taskShipped.get(key));
            yield* Story.assert(
              'the trial saved a task with the due date',
              duringTheTrial === '2026-09-30',
            );
            yield* Story.assert(
              'the next run has no v5 row left to read',
              afterTheRevert === null,
            );
            return { duringTheTrial, afterTheRevert };
          }),
        ),
      },
    ),
    Story.question(
      'Why does the same trick not work against a real database?',
      {
        answer:
          'Because a real database keeps the rows. Once the app has saved a task at v5, the v4 code that remains after the revert cannot read it: the stamp names a version the shape no longer has, so the read fails the way chapter 21 showed. A trial version therefore stays on the Memory adapter, and it reaches a durable database only when it is approved and shipped, at which point it is a version like any other.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // The trial saves a task at v5 into a board that keeps its rows.
              yield* taskTrying.insert(withDueDate);
              // The step is deleted, and the shipped shape tries to read that row; the failure comes back as a value.
              const failure = yield* taskShipped.get(key).pipe(Effect.flip);
              yield* Story.assert(
                'the reverted code cannot read the row the trial wrote',
                failure.reason._tag === 'DecodeFailed' &&
                  failure.reason.entity === 'Task',
              );
              return { reason: failure.reason };
            }),
          ),
        ),
      },
    ),
  ],
});
