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
    'The stamp on the envelope selects the starting version. An envelope must not contain another envelope.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The theme of the notebook was free text. It is now one of two words. How does a stored theme move forward?',
      {
        answer:
          'By the `_v` on its envelope. `decode` reads the stamp, reads the value with the codec for that version, and then runs the steps above it.',
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
    Story.question('What happens when an envelope contains another envelope?', {
      answer:
        'It fails. The system removes one envelope only. It gives the inner envelope to the codec as a value, and the codec rejects it.',
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
