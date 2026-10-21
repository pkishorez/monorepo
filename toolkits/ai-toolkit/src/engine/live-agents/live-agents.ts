import { Context, Deferred, Effect, Layer, type Scope } from 'effect';
import type { HarnessError, HarnessSession } from '../../harness/index.js';

/*
 * Every Session's agent, by Session id, for the calls that need an answer
 * from it: a Message to an actor answers nothing, so the engine finds the
 * agent here instead. A Session registers its agent while it runs; one not
 * registered yet is waited for, since every Session registers as it starts.
 */

/** A Session's agent, as the engine reaches it. */
export interface LiveAgent {
  /** The agent, opened now if it is not open. */
  readonly get: Effect.Effect<HarnessSession, HarnessError>;
  /** The agent if it is open now, without opening it. */
  readonly opened: Effect.Effect<HarnessSession | undefined>;
}

const make = Effect.sync(() => {
  const agents = new Map<string, Deferred.Deferred<LiveAgent>>();
  const slot = (sessionId: string) => {
    let found = agents.get(sessionId);
    if (!found) {
      found = Deferred.makeUnsafe<LiveAgent>();
      agents.set(sessionId, found);
    }
    return found;
  };
  return {
    register: (sessionId: string, agent: LiveAgent) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const before = agents.get(sessionId);
          if (before && Deferred.isDoneUnsafe(before)) agents.delete(sessionId);
          const mine = slot(sessionId);
          Deferred.doneUnsafe(mine, Effect.succeed(agent));
          return mine;
        }),
        (mine) =>
          Effect.sync(() => {
            if (agents.get(sessionId) === mine) agents.delete(sessionId);
          }),
      ).pipe(Effect.asVoid),
    of: (sessionId: string) => Deferred.await(slot(sessionId)),
  };
});

export class LiveAgents extends Context.Service<
  LiveAgents,
  {
    /** Makes `agent` the Session's until the Scope closes. */
    readonly register: (
      sessionId: string,
      agent: LiveAgent,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** The Session's agent, once it has registered one. */
    readonly of: (sessionId: string) => Effect.Effect<LiveAgent>;
  }
>()('@kestack/ai-toolkit/engine/LiveAgents') {
  static readonly layer: Layer.Layer<LiveAgents> = Layer.effect(
    LiveAgents,
    make,
  );
}
