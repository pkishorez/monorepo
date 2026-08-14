import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Rating = ValueESchema.make('Rating', Schema.String)
  .evolve('v2', Schema.Number, (previous) =>
    previous === 'good' ? 4 : previous === 'bad' ? 1 : 3,
  )
  .build();

export const evolveAValue = Story.make({
  title: 'Evolve a value',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a v1 string envelope is decoded after the value evolved to a number?',
      {
        answer:
          "Each evolution replaces the whole codec, so decode runs the v1→v2 migration and `'good'` becomes `4`.",
        proof: Effect.gen(function* () {
          const migrated = yield* Rating.decode({ _v: 'v1', value: 'good' });
          yield* Story.assert(
            'the v1 string became a v2 number',
            migrated === 4,
          );
          return migrated;
        }),
      },
    ),
    Story.question('What does encoding a current rating write to storage?', {
      answer:
        'A `{ _v, value }` envelope — a bare `4` has nowhere else to carry its version stamp.',
      proof: Effect.gen(function* () {
        const encoded = yield* Rating.encode(5);
        yield* Story.assert(
          'storage wraps the value in an envelope',
          encoded._v === 'v2' && encoded.value === 5,
        );
        return encoded;
      }),
    }),
  ],
});
