import { Context, type Effect } from 'effect';

/* How what runs under Identity ends the whole program. */

export class Identity extends Context.Service<
  Identity,
  {
    /** A Request: stop, and why; null when asked to. */
    readonly stop: (reason: string | null) => Effect.Effect<void>;
  }
>()('@kestack/connect/Identity') {}
