import { Console, Effect, Schema } from 'effect';
import { Settings, SettingsAdopted } from '../components/settings.ts';

// Saved long before versioning: no _v anywhere.
const legacy = { theme: 'dark' };

export const program = Effect.gen(function* () {
  // Adopted as v1, it reads exactly as it was.
  yield* Console.log(
    'adopted:',
    yield* Schema.decodeUnknownEffect(SettingsAdopted.schema)(legacy),
  );

  // With a v2, the same row is read as v1 and migrated.
  yield* Console.log(
    'after v2:',
    yield* Schema.decodeUnknownEffect(Settings.schema)(legacy),
  );

  // A row that never matched v1 fails loudly, never as a guess.
  const wrong = yield* Schema.decodeUnknownEffect(Settings.schema)({
    colourScheme: 'dark',
  }).pipe(Effect.flip);
  return wrong.message;
});
