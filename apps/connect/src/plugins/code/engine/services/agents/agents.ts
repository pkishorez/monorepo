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
import {
  HarnessError,
  type Agent,
  type TurnHandle,
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
 * How the first open went is kept, and the steps of a new Session's start
 * after it, for a new Session counts only once its Agent has opened, its
 * first message is written and it is saved.
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
    /** How the first open went, and the start's later steps. */
    const first = yield* Deferred.make<void, HarnessError>();
    const recorded = yield* Deferred.make<void, HarnessError>();
    const saved = yield* Deferred.make<void, HarnessError>();
    const stoppedFirst = new HarnessError({
      message: 'The session stopped before it started',
    });
    yield* Effect.addFinalizer(() =>
      Effect.all([
        Deferred.fail(
          first,
          new HarnessError({
            message: 'The session stopped before its agent opened',
          }),
        ),
        Deferred.fail(recorded, stoppedFirst),
        Deferred.fail(saved, stoppedFirst),
      ]),
    );
    /** A step, awaited after every step before it. */
    const milestone = (
      done: Deferred.Deferred<void, HarnessError>,
      before: ReadonlyArray<Deferred.Deferred<void, HarnessError>>,
    ) => ({
      await: Effect.andThen(
        Effect.forEach(before, Deferred.await, { discard: true }),
        Deferred.await(done),
      ),
      mark: Effect.asVoid(Deferred.succeed(done, undefined)),
      fail: (error: HarnessError) => Effect.asVoid(Deferred.fail(done, error)),
    });

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
            Effect.tapError((error) => Deferred.fail(first, error)),
          );
          yield* Scope.provide(follow(agent), scope);
          current = { agent, scope };
          yield* Deferred.succeed(first, undefined);
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
      firstOpen: Deferred.await(first),
      firstRecord: milestone(recorded, [first]),
      firstSave: milestone(saved, [first, recorded]),
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
