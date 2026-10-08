import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { ValueESchema } from '@kstackz/std-toolkit/eschema';

const Theme = ValueESchema.make('Theme', Schema.String).build();

export default Proof.make({
  title: 'A versioned value with unexpected keys is refused, not guessed at',
  description:
    'The `_value` key marks an envelope; an envelope carrying more is not guessed at.',
  prepare: Effect.gen(function* () {
    const good = yield* Schema.decodeUnknownEffect(Theme.schema)({
      _v: 'v1',
      _value: 'dark',
    });
    yield* Proof.assert('a well-formed envelope reads', good === 'dark');
    return { good };
  }),
  act: () =>
    Schema.decodeUnknownEffect(Theme.schema)({
      _v: 'v1',
      _value: 'dark',
      extra: true,
    }).pipe(
      Effect.match({
        onFailure: (error) => ({ refused: true, message: error.message }),
        onSuccess: (value) => ({ refused: false, message: String(value) }),
      }),
    ),
  verify: ({ refused }) =>
    Proof.assert('the envelope with an extra key is refused', refused),
});
