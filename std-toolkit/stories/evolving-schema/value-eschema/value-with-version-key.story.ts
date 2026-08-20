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
    'One shape conflicts with the envelope. Writing it through `encode` first removes the conflict.',
  setupNote: 'An `Imported` value whose own type contains a `_v` field.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note comes from another service. That service adds its own `_v`. What happens when the note is read?',
      {
        answer:
          'The system reads it as an envelope. It detects an envelope by shape, so it reads the `_v` of the other service as a schema version and refuses it as unknown.',
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
    Story.question('How is the conflict removed?', {
      answer:
        'Write the value through `encode` first. The value then carries a real stamp of its own. The system removes one envelope, and the `_v` of the other service passes through unchanged.',
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
