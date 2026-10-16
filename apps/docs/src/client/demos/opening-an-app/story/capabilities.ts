import { Context } from 'effect';
import type { Effect } from 'effect';

/** What App Provides while Inside: a way for anything below to sign out. */
export class Session extends Context.Service<
  Session,
  { readonly signOut: Effect.Effect<void> }
>()('Session') {}

/**
 * What Downloads Provides to its files: a way for one to take itself off the
 * list, or to ask to be paused or resumed, since Downloads owns that.
 */
export class Shelf extends Context.Service<
  Shelf,
  {
    readonly remove: (id: string) => Effect.Effect<void>;
    readonly pause: (id: string) => Effect.Effect<void>;
    readonly resume: (id: string) => Effect.Effect<void>;
  }
>()('Shelf') {}
