import { Console, Effect, Schema } from 'effect';
import { Theme } from '../components/theme.ts';

const read = Schema.decodeUnknownEffect(Theme.schema);
const write = Schema.encodeEffect(Theme.schema);

export const program = Effect.gen(function* () {
  // Saved by v1, in an envelope: the value and its version.
  yield* Console.log(
    'v1 envelope reads as',
    yield* read({ _v: 'v1', _value: 'night' }),
  );

  // Saved before versioning at all: a bare value reads as v1.
  yield* Console.log('bare value reads as', yield* read('sunset'));

  // A save always writes the latest version, in an envelope.
  return yield* write('dark');
});
