import { Console, Effect, Schema } from 'effect';
import { Theme } from '../components/theme.ts';

const read = Schema.decodeUnknownEffect(Theme.schema);
const write = Schema.encodeEffect(Theme.schema);

export const program = Effect.gen(function* () {
  // A save writes the latest version, in an envelope.
  yield* Console.log({ saving: 'dark', stores: yield* write('dark') });

  // An envelope saved by v1, read now: the migration runs.
  const old = { _v: 'v1', _value: 'night' };
  yield* Console.log({ stored: old, readsAs: yield* read(old) });

  // Saved before it was versioned at all: a bare value reads as v1.
  yield* Console.log({ stored: 'sunset', readsAs: yield* read('sunset') });

  // A word v2 doesn't allow is refused on save, before it is stored.
  const refused = yield* write('blue' as 'dark').pipe(Effect.flip);
  return refused.message;
});
