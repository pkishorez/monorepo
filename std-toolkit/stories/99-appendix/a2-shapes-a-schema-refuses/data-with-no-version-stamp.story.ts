import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// A task shape with one step of history: v2 added a priority, and old rows get `normal`.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
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

export const dataWithNoVersionStamp = Story.make({
  title: 'Data with no version stamp',
  description:
    'A row with no `_v` is read as the first version. It is still checked against that version, not guessed at.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens to a row that has no `_v` at all?', {
      answer:
        'It is treated as version one: checked against the v1 shape, then walked up the steps like any v1 row. Rows written before the stamp existed, or by something else entirely, are read without a special case.',
      proof: Effect.gen(function* () {
        // Read a row that carries no stamp; it is taken as v1 and moved to v2.
        const adopted = yield* Task.decode({
          taskId: 't1',
          boardId: 'work',
          title: 'Write the plan',
        });
        yield* Story.assert(
          'the row was taken as v1 and given the v2 field',
          adopted.priority === 'normal',
        );
        yield* Story.assert(
          'its own data came through untouched',
          adopted.title === 'Write the plan',
        );
        return { adopted };
      }),
    }),
    Story.question('And if an unstamped row does not look like version one?', {
      answer:
        'The read fails with `ESchemaError`. Missing the stamp earns a row the v1 check, not a pass; nothing tries to guess which version it might be.',
      proof: Effect.gen(function* () {
        // Read a row that has no stamp and none of the v1 fields.
        const refused = yield* Task.decode({ nonsense: true }).pipe(
          Effect.flip,
        );
        yield* Story.assert(
          'a row that matches no shape is refused',
          refused._tag === 'ESchemaError' &&
            refused.message === 'Decode failed',
        );
        return { refused: refused.message };
      }),
    }),
  ],
});
