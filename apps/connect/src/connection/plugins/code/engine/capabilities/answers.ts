import { Context, type Effect } from 'effect';

/*
 * The callers waiting on how their Answer to an Agent Question went, by an
 * Answer id the caller mints. A caller waits from just before it Sends the
 * Answer until it has the outcome or stops waiting, and is forgotten then
 * either way; the Session's Commands tell it the outcome. Nothing of it is
 * in the Session's Model: an outcome is a reply to one caller, not a fact
 * about the Session. The implementation is services/answers/.
 */

/** How an Answer went. */
export type AnswerOutcome =
  /** The agent took it. */
  | { readonly _tag: 'Taken' }
  /** The question is no longer asked, or its agent is not open. */
  | { readonly _tag: 'NotAsked' }
  /** The harness refused it, saying why. */
  | { readonly _tag: 'Refused'; readonly reason: string };

export class Answers extends Context.Service<
  Answers,
  {
    /**
     * Runs `send`, which Sends the Answer `answerId`, then waits for its
     * outcome; fails as `send` does. Nothing of the wait is kept once it
     * ends, however it ends.
     */
    readonly await: <E>(
      answerId: string,
      send: Effect.Effect<void, E>,
    ) => Effect.Effect<AnswerOutcome, E>;
    /** Tells the caller waiting on `answerId`; nothing when none waits. */
    readonly settle: (
      answerId: string,
      outcome: AnswerOutcome,
    ) => Effect.Effect<void>;
  }
>()('@kestack/connect/engine/Answers') {}
