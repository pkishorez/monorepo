import { Console, Effect, Schema } from 'effect';
import { eschemaOf } from '@kestack/std-toolkit/schema';
import { Settings } from '../components/settings.ts';

export const program = Effect.gen(function* () {
  // Saved back when the theme was free text: Settings v1, Theme v1.
  const stored = {
    _v: 'v1',
    language: 'en',
    theme: { _v: 'v1', _value: 'night' },
  };
  yield* Console.log('stored:', stored);

  // Read now: Settings has nothing to upgrade, its theme does.
  const read = yield* Schema.decodeUnknownEffect(Settings.schema)(stored);
  yield* Console.log('reads as:', read);

  // Saved again: each level carries its own version.
  yield* Console.log(
    'saved again:',
    yield* Schema.encodeEffect(Settings.schema)(read),
  );

  // Which fields are versioned shapes of their own?
  return {
    theme: eschemaOf(Settings.fields.theme)?.name,
    language: eschemaOf(Settings.fields.language)?.name,
  };
});
