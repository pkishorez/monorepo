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
    'Data is validated against the version it claims before any rung runs.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when the data does not match the version it claims?',
      {
        answer:
          'It fails with `Decode failed` before any migration runs — the payload is validated against its declared version first.',
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
    Story.question('Does a valid payload of the same version still decode?', {
      answer:
        'Yes — a healthy v1 payload sails through and gets the v2 backfill.',
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
