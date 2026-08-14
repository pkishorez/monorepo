import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Profile = ESchema.make('Profile', {
  name: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();

export const addAField = Story.make({
  title: 'Add a field',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens to a v1 row after the schema gains `age`?', {
      answer:
        'It decodes: the v1→v2 migration backfills `age: 0` and leaves existing data untouched.',
      proof: Effect.gen(function* () {
        const migrated = yield* Profile.decode({ _v: 'v1', name: 'Ada' });
        yield* Story.assert(
          'the old row gained the new field',
          migrated.age === 0,
        );
        yield* Story.assert(
          'existing data is untouched',
          migrated.name === 'Ada',
        );
        return migrated;
      }),
    }),
    Story.question('What happens to a row already written at v2?', {
      answer: 'It skips the migration entirely.',
      proof: Effect.gen(function* () {
        const fresh = yield* Profile.decode({
          _v: 'v2',
          name: 'Grace',
          age: 36,
        });
        yield* Story.assert('a v2 row skips the migration', fresh.age === 36);
        return fresh;
      }),
    }),
  ],
});
