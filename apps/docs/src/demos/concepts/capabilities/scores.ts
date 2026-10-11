import { Context, Effect } from 'effect';

/**
 * The Scores Capability: what the Board Provides to every Scorer below it.
 * `total` is a projection of the Board's Model; `add` is a Request, a
 * Message sent to the Board by whichever Instance Provides it.
 */
export class Scores extends Context.Service<
  Scores,
  {
    readonly total: Effect.Effect<number>;
    readonly add: (name: string) => Effect.Effect<void>;
  }
>()('docs/concepts/Scores') {}
