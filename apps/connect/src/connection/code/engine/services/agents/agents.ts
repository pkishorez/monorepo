import {
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import type {
  Agent,
  HarnessError,
  TurnHandle,
} from '@kestack/ai-toolkit/harness';
import type {
  AgentQuestion,
  BackgroundJob,
} from '@kestack/ai-toolkit/contract';
import { Agents, type SessionAgent } from '../../capabilities/index.js';

/*
 * The Agents: one Deferred per Session id, done once its Agent is kept.
 *
 * A kept Agent is opened on first use and kept open for the Turns after.
 * It lives in a Scope of its own inside the keeper's, so a reset closes
 * just the Agent and the next use opens it again, and the Session stopping
 * closes it with everything else. An open that fails leaves nothing open.
 *
 * While open, what the Agent reports is kept here, apart from any one
 * Turn: its Background Jobs, its Agent Questions, and the Turns it started
 * on its own, waiting for the Session to run them. Closing the Agent
 * clears all three: its jobs die with it, and its questions with its Turn.
 */

const kept = (open: Effect.Effect<Agent, HarnessError, Scope.Scope>) =>
  Effect.gen(function* () {
    const outer = yield* Effect.scope;
    const lock = yield* Semaphore.make(1);
    const jobs = yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]);
    const questions = yield* SubscriptionRef.make<ReadonlyArray<AgentQuestion>>(
      [],
    );
    const waiting = yield* SubscriptionRef.make<ReadonlyArray<TurnHandle>>([]);
    let current:
      | { readonly agent: Agent; readonly scope: Scope.Closeable }
      | undefined;

    /** Keeps what the open Agent reports until its Scope closes. */
    const follow = (agent: Agent) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.all([
            SubscriptionRef.set(jobs, []),
            SubscriptionRef.set(questions, []),
            SubscriptionRef.set(waiting, []),
          ]),
        );
        yield* Effect.forkScoped(
          Stream.runForEach(agent.backgroundJobs, (now) =>
            SubscriptionRef.set(jobs, now),
          ),
        );
        yield* Effect.forkScoped(
          Stream.runForEach(agent.questions, (now) =>
            SubscriptionRef.set(questions, now),
          ),
        );
        yield* Effect.forkScoped(
          Stream.runForEach(agent.agentTurns, (turn) =>
            SubscriptionRef.update(waiting, (all) => [...all, turn]),
          ),
        );
      });

    const get = lock.withPermits(1)(
      Effect.suspend(() => {
        if (current) return Effect.succeed(current.agent);
        return Effect.gen(function* () {
          const scope = yield* Scope.fork(outer);
          const agent = yield* Scope.provide(open, scope).pipe(
            Effect.onError(() => Scope.close(scope, Exit.void)),
          );
          yield* Scope.provide(follow(agent), scope);
          current = { agent, scope };
          return agent;
        });
      }),
    );

    const reset = lock.withPermits(1)(
      Effect.suspend(() => {
        const closing = current;
        current = undefined;
        return closing ? Scope.close(closing.scope, Exit.void) : Effect.void;
      }),
    );

    const agent: SessionAgent = {
      agent: get,
      opened: Effect.sync(() => current?.agent),
      reset,
      jobs: SubscriptionRef.changes(jobs),
      questions: SubscriptionRef.changes(questions),
      nextAgentTurn: Effect.asVoid(
        SubscriptionRef.changes(waiting).pipe(
          Stream.filter((all) => all.length > 0),
          Stream.runHead,
        ),
      ),
      takeAgentTurn: SubscriptionRef.modify(
        waiting,
        ([first, ...rest]) => [Option.fromUndefinedOr(first), rest] as const,
      ),
    };
    return agent;
  });

const make = Effect.sync(() => {
  const agents = new Map<string, Deferred.Deferred<SessionAgent>>();
  const slot = (sessionId: string) => {
    let found = agents.get(sessionId);
    if (!found) {
      found = Deferred.makeUnsafe<SessionAgent>();
      agents.set(sessionId, found);
    }
    return found;
  };
  return {
    keep: (
      sessionId: string,
      open: Effect.Effect<Agent, HarnessError, Scope.Scope>,
    ) =>
      Effect.gen(function* () {
        const agent = yield* kept(open);
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const before = agents.get(sessionId);
            if (before && Deferred.isDoneUnsafe(before))
              agents.delete(sessionId);
            const mine = slot(sessionId);
            Deferred.doneUnsafe(mine, Effect.succeed(agent));
            return mine;
          }),
          (mine) =>
            Effect.sync(() => {
              if (agents.get(sessionId) === mine) agents.delete(sessionId);
            }),
        );
      }),
    of: (sessionId: string) => Deferred.await(slot(sessionId)),
  };
});

export const agents: Layer.Layer<Agents> = Layer.effect(Agents, make);
