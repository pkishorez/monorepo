import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.String,
  fontSize: Schema.Number,
}).build();

export const makePartialValidates = Story.make({
  title: 'makePartial',
  description: '`makePartial` adds a version stamp. It checks nothing.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does `makePartial` do to a partial update?', {
      answer:
        'It copies the fields that you gave it and adds the newest version stamp. It does not check the value and it does not encode it. A field that you did not name stays absent.',
      proof: Effect.gen(function* () {
        const patch = Settings.makePartial({ theme: 'dark' });
        yield* Story.assert(
          'the partial is stamped with the latest version',
          patch._v === 'v1',
        );
        yield* Story.assert(
          'unmentioned fields are simply absent',
          !('fontSize' in patch),
        );
        return patch;
      }),
    }),
    Story.question('What happens when the partial is empty?', {
      answer:
        'It returns a value that has a stamp and nothing else. Nothing checks that the update contains a field. Use `encode` when you need that check.',
      proof: Effect.gen(function* () {
        const empty = Settings.makePartial({});
        yield* Story.assert(
          'even an empty partial is produced without complaint',
          empty._v === 'v1' && Object.keys(empty).length === 1,
        );
        return empty;
      }),
    }),
  ],
});
