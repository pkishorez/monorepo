import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { ValueESchema } from '@kstackz/std-toolkit/eschema';

// A theme was free text; v2 makes it one of two words. There is no object to hold `_v`, so it lives in an envelope.
const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (text) =>
    text === 'night' ? 'dark' : 'light',
  )
  .build();

export default Proof.make({
  title:
    'A versioned value nested in a row upgrades to its latest version on its own',
  description:
    'ValueESchema stores `{ _v, _value }`; a v1 envelope reads as the v2 value and writes back as a v2 envelope.',
  critical: true,
  prepare: Effect.gen(function* () {
    const stored = { _v: 'v1', _value: 'night' };
    yield* Proof.assert('the schema is at v2', Theme.latestVersion === 'v2');
    return { stored };
  }),
  act: ({ stored }) =>
    Effect.gen(function* () {
      const read = yield* Schema.decodeUnknownEffect(Theme.schema)(stored);
      const written = yield* Schema.encodeEffect(Theme.schema)(read);
      return { read, written };
    }),
  verify: ({ read, written }) =>
    Effect.gen(function* () {
      yield* Proof.assert("'night' migrates to 'dark'", read === 'dark');
      yield* Proof.assert(
        'it is written back as a v2 envelope',
        written._v === 'v2' && written._value === 'dark',
      );
    }),
});
