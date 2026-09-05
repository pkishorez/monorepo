import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// Task's whole history, four versions long. The first version's fields are written out again only because new versions are being declared: v3 drops `colour` by setting it to `null`, and v4 renames `notes` to `details`, which is one drop and one add in the same step.
export const TaskV4 = EntityESchema.make('Task', 'taskId', {
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
  .build();

// A row exactly as last year's code wrote it: it still has a colour, and its text is under `notes`.
const lastYearsRow = {
  _v: 'v1',
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: 'Ask Ana first',
} as const;

export const removingAndRenamingFields = Story.make({
  title: 'Removing and renaming fields',
  description:
    'Tasks lose their colour and their notes become details. Rows that still carry the old fields keep working, and shed them as they are saved again.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Storage still has a colour on every task, but the shape does not. What does the app see, and what does it write back?',
      {
        answer:
          'It sees no colour: the step to v3 drops it as the row is read, so code written against the newest shape never learns the field existed. The next save writes the row at v4 without it, so the old field leaves storage one task at a time, as each is saved again.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Read last year's row; every step above v1 runs, and the colour is gone.
            const seen = yield* TaskV4.decode(lastYearsRow);
            // Save it again; the row is written at the newest version, still without a colour.
            const written = yield* TaskV4.encode(seen);
            yield* Story.assert(
              'the dropped field does not reach the app',
              !('colour' in seen) && seen.priority === 'low',
            );
            yield* Story.assert(
              'and is not written back; the newest version is the last step declared',
              written._v === 'v4' &&
                !('colour' in written) &&
                TaskV4.latestVersion === 'v4',
            );
            return { seen, written, latestVersion: TaskV4.latestVersion };
          }),
        ),
      },
    ),
    Story.question('Where is the text that used to be under `notes`?', {
      answer:
        'Under `details`: the step to v4 moves it across, so the old name is gone and nothing is lost. A row that was already at v3 runs only that one step, so what it holds in `priority` is left alone.',
      proof: Story.trace(
        Effect.gen(function* () {
          // A v1 row runs three steps: it gains a priority, loses its colour, and its notes move.
          const fromV1 = yield* TaskV4.decode(lastYearsRow);
          // A v3 row runs one step: only the rename, so its own priority survives.
          const fromV3 = yield* TaskV4.decode({
            _v: 'v3',
            taskId: 't2',
            boardId: 'work',
            title: 'Review it',
            status: 'open',
            assignee: 'ben',
            notes: 'Second pass',
            priority: 'high',
          });
          yield* Story.assert(
            'the words moved to the new name',
            fromV1.details === 'Ask Ana first' && !('notes' in fromV1),
          );
          yield* Story.assert(
            'a newer row ran only the steps above it',
            fromV3.details === 'Second pass' && fromV3.priority === 'high',
          );
          return { fromV1, fromV3 };
        }),
      ),
    }),
    Story.question(
      'Some old code still builds a task in the v1 shape. Can it save one?',
      {
        answer:
          'No: steps only run when data leaves storage, never on the way in, so `encode` accepts the newest shape only and refuses the old one. Read the old row first, and save what the read hands back.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Try to save a v1-shaped task straight away; the refusal comes back as a value.
            const { _v: _stamp, ...v1Shape } = lastYearsRow;
            const refused = yield* TaskV4.encode(v1Shape as never).pipe(
              Effect.flip,
            );
            // Read the row first, then save what the read gave back; this lands at v4.
            const current = yield* TaskV4.decode(lastYearsRow);
            const written = yield* TaskV4.encode(current);
            yield* Story.assert(
              'the old shape is refused',
              refused._tag === 'ESchemaError' &&
                refused.message === 'Encode failed',
            );
            yield* Story.assert(
              'read first, then save, lands at the newest version',
              written._v === 'v4' && written.details === 'Ask Ana first',
            );
            return { refused: refused.message, written };
          }),
        ),
      },
    ),
  ],
});
