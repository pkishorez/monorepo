import { Context, type Effect, type Scope } from 'effect';

/*
 * The control socket `serve` holds, as Identity sees it, so it can be run
 * against a fake one: Identity answers there for as long as it runs.
 */

/** What Identity answers on the control socket. */
export interface Answers {
  /** What the Connection says of itself: its name, its id, and its address. */
  readonly status: Effect.Effect<{
    readonly name: string;
    readonly id: string;
    readonly url: string | null;
  }>;
  readonly stop: Effect.Effect<void>;
}

export class Control extends Context.Service<
  Control,
  {
    /** Answers there with `answers`, for as long as the Scope. */
    readonly answer: (
      answers: Answers,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()('@kestack/connect/Control') {}
