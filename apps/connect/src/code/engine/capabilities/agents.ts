import {
  Context,
  type Effect,
  type Option,
  type Scope,
  type Stream,
} from 'effect';
import type {
  Agent,
  HarnessError,
  TurnHandle,
} from '@kestack/ai-toolkit/harness';
import type { BackgroundJob } from '@kestack/ai-toolkit/contract';

/*
 * Every Session's Agent, by Session id. The Session's agent Worker keeps
 * it here for as long as the Session lives, and opens it on first use;
 * its other Workers, its Commands and its Queries read it here, since an
 * Actor's own Workers cannot use its own Provide. One not kept yet is
 * waited for; every Session keeps one as it starts. The implementation is
 * services/agents/.
 */

/** A Session's Agent, as the Session's Workers, Commands and Queries share it. */
export interface SessionAgent {
  /** The Agent, opened now if it is not open. */
  readonly agent: Effect.Effect<Agent, HarnessError>;
  /** The Agent if it is open now, without opening it. */
  readonly opened: Effect.Effect<Agent | undefined>;
  /** Closes the Agent; the next Turn opens it again, resumed by its Native Id. */
  readonly reset: Effect.Effect<void>;
  /** The Agent's Background Jobs now, then each change; none while it is closed. */
  readonly jobs: Stream.Stream<ReadonlyArray<BackgroundJob>>;
  /** Waits until the Agent has started a Turn of its own that has not run. */
  readonly nextAgentTurn: Effect.Effect<void>;
  /** The oldest Turn the Agent started that has not run, taken to run now. */
  readonly takeAgentTurn: Effect.Effect<Option.Option<TurnHandle>>;
}

export class Agents extends Context.Service<
  Agents,
  {
    /**
     * Keeps the Session's Agent until the Scope closes: closed until first
     * used, then opened by `open` in a Scope of its own.
     */
    readonly keep: (
      sessionId: string,
      open: Effect.Effect<Agent, HarnessError, Scope.Scope>,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** The Session's Agent, once it is kept. */
    readonly of: (sessionId: string) => Effect.Effect<SessionAgent>;
  }
>()('@kestack/connect/engine/Agents') {}
