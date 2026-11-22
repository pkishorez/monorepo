import { Context, Effect, Layer, Option, Schema } from 'effect';

/*
 * What the Lotel Tool remembers of how it was left, the Filters and how an
 * opened Trace is laid out, so a reload or a visit to another Tool finds
 * it as it was. Kept in the browser's localStorage, each under its own key
 * and read back through its Schema: one that no longer fits is forgotten.
 */

export interface PreferencesService {
  /** What was saved under `key`, if it still fits `schema`. */
  readonly load: <A, I>(
    key: string,
    schema: Schema.Codec<A, I>,
  ) => Effect.Effect<Option.Option<A>>;
  /** Saves `value` under `key`, as `schema` encodes it. */
  readonly save: <A, I>(
    key: string,
    schema: Schema.Codec<A, I>,
    value: A,
  ) => Effect.Effect<void>;
}

export class Preferences extends Context.Service<
  Preferences,
  PreferencesService
>()('@kestack/devtools/lotel/Preferences') {}

/** Preferences over a place that keeps text by key, as `localStorage` does. */
export const preferencesOver = (storage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}): PreferencesService => ({
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
        storage.setItem(key, JSON.stringify(Schema.encodeSync(schema)(value)));
      } catch {
        // Storage full or refused: the Tool works on, it only forgets.
      }
    }),
});

/** Preferences kept in this browser's localStorage. */
export const preferencesLayer = Layer.sync(Preferences)(() =>
  preferencesOver(globalThis.localStorage),
);

/** Preferences kept in memory, for tests and stories. */
export const memoryPreferences = () => {
  const kept = new Map<string, string>();
  return preferencesOver({
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  });
};
