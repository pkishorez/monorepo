import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema, ESchemaError } from 'std-toolkit/eschema';

const Payload = ValueESchema.make(
  'Payload',
  Schema.Struct({ _v: Schema.String, value: Schema.String }),
).build();

export const valueWithVersionKey = Story.make({
  title: 'Value with version key',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a bare value whose own type contains `_v` is decoded?',
      {
        answer:
          'Envelope detection is structural, so the bare value is mistaken for an envelope and its business `_v` is misread as a schema version.',
        proof: Effect.gen(function* () {
          const collided = yield* Effect.flip(
            Payload.decode({ _v: 'vendor-3', value: 'hello' }),
          );
          yield* Story.assert(
            'the business _v was misread as a schema version',
            collided instanceof ESchemaError &&
              collided.message === 'Unknown schema version: vendor-3',
          );
          return collided;
        }),
      },
    ),
    Story.question(
      'What happens when the same value goes through `encode` before being read back?',
      {
        answer:
          'Stamped data is unambiguous — the outer envelope peels exactly once and the inner object round-trips untouched, business `_v` and all.',
        proof: Effect.gen(function* () {
          const encoded = yield* Payload.encode({
            _v: 'vendor-3',
            value: 'hello',
          });
          const stamped = yield* Payload.decode(encoded);
          yield* Story.assert(
            'stamped data is unambiguous — the inner _v survives',
            stamped._v === 'vendor-3' && stamped.value === 'hello',
          );
          return stamped;
        }),
      },
    ),
  ],
});
