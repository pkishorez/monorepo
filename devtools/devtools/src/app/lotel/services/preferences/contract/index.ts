import { Context } from 'effect';
import type { Effect, Option, Schema } from 'effect';

/*
 * What the Lotel Tool remembers of how it was left, the Filters and how an
 * opened Trace is laid out, so a reload or a visit to another Tool finds
 * it as it was. Each is kept under its own key and read back through its
 * Schema: one that no longer fits is forgotten.
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
>()('Lotel/service/Preferences') {}
