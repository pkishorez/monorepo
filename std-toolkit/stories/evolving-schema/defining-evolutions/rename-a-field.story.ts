import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Task = ESchema.make('Task', {
  label: Schema.String,
})
  .evolve(
    'v2',
    { label: null, title: Schema.String },
    ({ label, ...rest }) => ({
      ...rest,
      title: label,
    }),
  )
  .build();

export const renameAField = Story.make({
  title: 'Rename a field',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to a v1 row written under the old `label` name?',
      {
        answer:
          'A rename is a remove plus an add in one delta — the migration carries the value across to `title`.',
        proof: Effect.gen(function* () {
          const migrated = yield* Task.decode({
            _v: 'v1',
            label: 'Ship the release',
          });
          yield* Story.assert(
            'the value now lives under the new name',
            migrated.title === 'Ship the release',
          );
          yield* Story.assert('the old name is gone', !('label' in migrated));
          return migrated;
        }),
      },
    ),
  ],
});
