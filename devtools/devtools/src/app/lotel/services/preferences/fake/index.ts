import { Effect, Option, Schema } from 'effect';
import { Preferences } from '../contract/index.js';

/*
 * Preferences kept in memory, for tests: saved as the browser keeps them,
 * as encoded text, and read back through their Schema, so one that no
 * longer fits is forgotten. Handing the same one to a second app is a
 * reload.
 */

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
