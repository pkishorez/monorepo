import { Effect, Layer, Option, Schema } from 'effect';
import { Preferences } from '../contract/index.js';

const preferencesOver = (storage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}) =>
  Preferences.of({
    load: (key, schema) =>
      Effect.sync(() => {
        try {
          const text = storage.getItem(key);
          return text === null
            ? Option.none()
            : Schema.decodeUnknownOption(schema)(JSON.parse(text));
        } catch {
          return Option.none();
        }
      }),
    save: (key, schema, value) =>
      Effect.sync(() => {
        try {
          storage.setItem(
            key,
            JSON.stringify(Schema.encodeSync(schema)(value)),
          );
        } catch {}
      }),
  });

export const preferencesLayer = Layer.sync(Preferences)(() =>
  preferencesOver(globalThis.localStorage),
);
