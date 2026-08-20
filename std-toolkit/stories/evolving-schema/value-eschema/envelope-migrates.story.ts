import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchemaError, ValueESchema } from 'std-toolkit/eschema';

const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (previous) =>
    previous === 'night' ? 'dark' : 'light',
  )
  .build();

export const envelopeMigrates = Story.make({
  title: 'The envelope decides which rung',
  description:
    'The stamp on the envelope is what picks the starting version — and an envelope is never something you nest yourself.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      "The notebook's theme was free text and is now one of two words. How does a stored theme find its way forward?",
      {
        answer:
          "By its envelope's `_v`. Decode dispatches on the stamp, reads the value with that version's codec, then runs the rungs above it.",
        proof: Effect.gen(function* () {
          const migrated = yield* Theme.decode({ _v: 'v1', value: 'night' });
          yield* Story.assert(
            'the old theme mapped onto the new word',
            migrated === 'dark',
          );
          return migrated;
        }),
      },
    ),
    Story.question('What if an envelope somehow ends up inside an envelope?', {
      answer:
        'It fails. The unwrap happens exactly once, so the inner envelope is handed to the codec as a value and is rejected.',
      proof: Effect.gen(function* () {
        const error = yield* Effect.flip(
          Theme.decode({ _v: 'v1', value: { _v: 'v1', value: 'night' } }),
        );
        yield* Story.assert(
          'only one layer unwraps',
          error instanceof ESchemaError && error.message === 'Decode failed',
        );
        return error;
      }),
    }),
  ],
});
