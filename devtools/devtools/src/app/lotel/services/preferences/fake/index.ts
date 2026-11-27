import { Effect, Option, Schema } from 'effect';
import { Preferences } from '../contract/index.js';

export const fakePreferences = () => {
  const kept = new Map<string, string>();
  return Preferences.of({
    load: (key, schema) =>
      Effect.sync(() => {
        const text = kept.get(key);
        return text === undefined
          ? Option.none()
          : Schema.decodeUnknownOption(schema)(JSON.parse(text));
      }),
    save: (key, schema, value) =>
      Effect.sync(() => {
        kept.set(key, JSON.stringify(Schema.encodeSync(schema)(value)));
      }),
  });
};
