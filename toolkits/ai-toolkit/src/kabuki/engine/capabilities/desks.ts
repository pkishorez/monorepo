import {
  Context,
  Data,
  type Effect,
  type Option,
  type Scope,
  type Stream,
} from 'effect';
import type {
  AskAnswer,
  BackgroundJob,
  HarnessError,
  HarnessSession,
  TurnHandle,
} from '../../../services/harness/contract/index.js';
import type { Json } from '../../../services/records/raw/index.js';
import type { Session } from '../../../services/records/entities/index.js';

/*
 * Every Session's Desk, by Session id. A Message answers nothing, so what
 * the engine must ask a Session, it asks at its Desk: its live agent, a
 * Fork, a new Title, an Ask. The Session puts its Desk out while it lives,
 * and its own Workers share the agent through the same Desk, since a
 * Provide reaches only Children. A Desk not out yet is waited for; every
 * Session puts one out as it starts. The implementation is services/desks.ts.
 */

export class NotForkable extends Data.TaggedError('NotForkable')<{
  readonly reason: string;
}> {}
export class AskFailed extends Data.TaggedError('AskFailed')<{
  readonly message: string;
}> {}

/** What a Session puts out: for the engine, and for its own Workers. */
export interface Desk {
  /** The agent, opened now if it is not open. */
  readonly agent: Effect.Effect<HarnessSession, HarnessError>;
  /** The agent if it is open now, without opening it. */
  readonly opened: Effect.Effect<HarnessSession | undefined>;
  /**
   * A new idle Session with the context up to a finished Turn's end, its
   * own or one it inherited; null takes the latest. Its Project adds it.
   */
  readonly fork: (
    afterTurnId: string | null,
  ) => Effect.Effect<Session, NotForkable>;
  /** Writes the Title afresh from the user's latest messages; the Title after. */
  readonly retitle: Effect.Effect<string>;
  /** Answers a question from the Session's context, leaving it untouched. */
  readonly ask: (
    question: string,
    schema: Json | null,
  ) => Effect.Effect<AskAnswer, AskFailed>;

  /** Closes the agent; the next Turn opens it again, resumed by its native id. */
  readonly reset: Effect.Effect<void>;
  /** The agent's Background Jobs now, then each change; none while it is closed. */
  readonly jobs: Stream.Stream<ReadonlyArray<BackgroundJob>>;
  /** Waits until the agent has started a Turn of its own that has not run. */
  readonly nextAgentTurn: Effect.Effect<void>;
  /** The oldest Turn the agent started that has not run, taken to run now. */
  readonly takeAgentTurn: Effect.Effect<Option.Option<TurnHandle>>;
}

export class Desks extends Context.Service<
  Desks,
  {
    /** Puts `desk` out as the Session's until the Scope closes. */
    readonly put: (
      sessionId: string,
      desk: Desk,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** The Session's Desk, once it is out. */
    readonly of: (sessionId: string) => Effect.Effect<Desk>;
  }
>()('@kestack/ai-toolkit/engine/Desks') {}
