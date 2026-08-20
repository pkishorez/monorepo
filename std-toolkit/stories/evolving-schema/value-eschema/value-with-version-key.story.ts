import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchemaError, ValueESchema } from 'std-toolkit/eschema';

const Imported = ValueESchema.make(
  'Imported',
  Schema.Struct({ _v: Schema.String, value: Schema.String }),
).build();

export const valueWithVersionKey = Story.make({
  title: 'When a value already has a _v of its own',
  description:
    'The one shape that collides with the envelope, and why writing it through encode settles it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note is imported from another service, and that service stamps its own `_v`. What happens on the way in?',
      {
        answer:
          'It is mistaken for an envelope. Envelope detection is structural, so the imported `_v` is read as a schema version and rejected as unknown.',
        proof: Effect.gen(function* () {
          const collided = yield* Effect.flip(
            Imported.decode({ _v: 'vendor-3', value: 'Buy milk' }),
          );
          yield* Story.assert(
            'the imported _v was read as a schema version',
            collided instanceof ESchemaError &&
              collided.message === 'Unknown schema version: vendor-3',
          );
          return collided;
        }),
      },
    ),
    Story.question('What makes it unambiguous?', {
      answer:
        'Writing it through encode first. Once the value carries a real stamp of its own, the outer envelope peels exactly once and the imported `_v` rides through untouched.',
      proof: Effect.gen(function* () {
        const stored = yield* Imported.encode({
          _v: 'vendor-3',
          value: 'Buy milk',
        });
        const read = yield* Imported.decode(stored);
        yield* Story.assert(
          'the imported stamp survives the round trip',
          read._v === 'vendor-3' && read.value === 'Buy milk',
        );
        return read;
      }),
    }),
  ],
});
