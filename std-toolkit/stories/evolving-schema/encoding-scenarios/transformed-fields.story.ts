import { Effect, Schema, SchemaTransformation } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const StoredNumber = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (value) => Number(value),
      encode: (value) => String(value),
    }),
  ),
);

const Reading = ESchema.make('Reading', {
  celsius: StoredNumber,
})
  .evolve('v2', { fahrenheit: Schema.Number }, (previous) => ({
    ...previous,
    fahrenheit: previous.celsius * 1.8 + 32,
  }))
  .build();

export const transformedFields = Story.make({
  title: 'Transformed fields',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Which side of a codec field does a migration see — stored or decoded?',
      {
        answer:
          'The decoded side, always — fields decode first, so the migration receives `celsius` as a real number and can do arithmetic on it.',
        proof: Effect.gen(function* () {
          const decoded = yield* Reading.decode({ _v: 'v1', celsius: '21.5' });
          yield* Story.assert(
            'the field decoded from string to number',
            decoded.celsius === 21.5,
          );
          yield* Story.assert(
            'the migration computed with the decoded number',
            decoded.fahrenheit === 21.5 * 1.8 + 32,
          );
          return decoded;
        }),
      },
    ),
    Story.question('What does encode write back for a codec field?', {
      answer:
        'The stored representation — each field runs its `encode`, so `celsius` goes back to a string in a row stamped `_v: "v2"`.',
      proof: Effect.gen(function* () {
        const decoded = yield* Reading.decode({ _v: 'v1', celsius: '21.5' });
        const encoded = yield* Reading.encode(decoded);
        yield* Story.assert(
          'the stored side is a string again',
          encoded.celsius === '21.5',
        );
        yield* Story.assert(
          'the stored row is stamped v2',
          encoded._v === 'v2',
        );
        return encoded;
      }),
    }),
  ],
});
