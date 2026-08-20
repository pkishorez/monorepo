import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Metric = ESchema.make('Metric', {
  count: Schema.Number,
})
  .evolve('v2', { unit: Schema.String }, (previous) => ({
    ...previous,
    unit: 'items',
  }))
  .build();

export const malformedPayload = Story.make({
  title: 'Malformed payload',
  description:
    'Data is checked against the version that it claims before any step runs.',
  setupNote:
    'A Metric with one step. This Story supplies data that does not match its own version.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when the data does not match the version that it claims?',
      {
        answer:
          'It fails before any step runs. The system checks the data against its declared version first.',
        proof: Effect.gen(function* () {
          const error = yield* Effect.flip(
            Metric.decode({ _v: 'v1', count: 'not-a-number' }),
          );
          yield* Story.assert(
            'validation failed before any migration ran',
            error instanceof ESchemaError && error.message === 'Decode failed',
          );
          return error;
        }),
      },
    ),
    Story.question('Does correct data of the same version still decode?', {
      answer:
        'Yes. Correct v1 data passes the check and then receives the v2 value.',
      proof: Effect.gen(function* () {
        const valid = yield* Metric.decode({ _v: 'v1', count: 3 });
        yield* Story.assert(
          'a valid payload of the same version sails through',
          valid.unit === 'items',
        );
        return valid;
      }),
    }),
  ],
});
