import { Context } from 'effect';
import type { Effect, Option, Schema } from 'effect';

export interface PreferencesService {
  readonly load: <A, I>(
    key: string,
    schema: Schema.Codec<A, I>,
  ) => Effect.Effect<Option.Option<A>>;
  readonly save: <A, I>(
    key: string,
    schema: Schema.Codec<A, I>,
    value: A,
  ) => Effect.Effect<void>;
}

export class Preferences extends Context.Service<
  Preferences,
  PreferencesService
>()('DevTools/service/Preferences') {}
