import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// A task shape with one step of history: v2 added a priority, and old rows get `normal`.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
})
  .evolve(
    'v2',
    { priority: Schema.Literals(['low', 'normal', 'high']) },
    (previous) => ({
      ...previous,
      priority: 'normal' as const,
    }),
  )
  .build();

export const dataThatDoesNotMatchItsVersion = Story.make({
  title: 'Data that does not match its version',
  description:
    'A row is checked against the version it claims before any step runs, so a step never sees data it was not written for.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What if a row says it is v1 but does not look like v1?', {
      answer:
        'The read fails with `ESchemaError` before the first step runs. The stamp says which shape to check the row against; a row that fails that check never reaches a migration.',
      proof: Effect.gen(function* () {
        // A row stamped v1 whose status is a word v1 never allowed.
        const refused = yield* Task.decode({
          _v: 'v1',
          taskId: 't1',
          boardId: 'work',
          title: 'Write the plan',
          status: 'maybe',
        }).pipe(Effect.flip);
        yield* Story.assert(
          'the row was refused before any step ran',
          refused._tag === 'ESchemaError' &&
            refused.message === 'Decode failed',
        );
        return { refused: refused.message };
      }),
    }),
    Story.question('Does a correct v1 row still read?', {
      answer:
        'Yes. A v1 row that passes the v1 check walks the step to v2 and comes back in the newest shape.',
      proof: Effect.gen(function* () {
        // The same row with a status v1 allows.
        const accepted = yield* Task.decode({
          _v: 'v1',
          taskId: 't1',
          boardId: 'work',
          title: 'Write the plan',
          status: 'open',
        });
        yield* Story.assert(
          'a correct v1 row reads and gains the v2 field',
          accepted.status === 'open' && accepted.priority === 'normal',
        );
        return { accepted };
      }),
    }),
  ],
});
