import {
  Context,
  Effect,
  Exit,
  Option,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import type {
  BackgroundJob,
  Harness,
  HarnessError,
  HarnessSession,
  RawOut,
} from '../../../../harness/index.js';
import type { TurnEndStatus } from '../../../../projection/index.js';

/*
 * A Session's agent, opened on first use and kept open for the turns after.
 * It lives in a Scope of its own inside the Session's, so a reset closes
 * just the agent and the next use opens it again, and the Session stopping
 * closes it with everything else. An open that fails leaves nothing open.
 *
 * While open, what the agent reports between Turns is kept here, so it
 * outlives any one Turn: its Background Jobs, and the Turns it started on
 * its own, waiting for the Session to run them. Closing the agent clears
 * both: its jobs die with it.
 */

type AgentTurn = Stream.Stream<RawOut, HarnessError>;

export const makeAgent = (
  open: Effect.Effect<HarnessSession, HarnessError, Scope.Scope>,
) =>
  Effect.gen(function* () {
    const outer = yield* Effect.scope;
    const lock = yield* Semaphore.make(1);
    const jobs = yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]);
    const waiting = yield* SubscriptionRef.make<ReadonlyArray<AgentTurn>>([]);
    let current:
      | { readonly session: HarnessSession; readonly scope: Scope.Closeable }
      | undefined;

    /** Keeps what the open agent reports until its Scope closes. */
    const follow = (session: HarnessSession) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.andThen(
            SubscriptionRef.set(jobs, []),
            SubscriptionRef.set(waiting, []),
          ),
        );
        yield* Effect.forkScoped(
          Stream.runForEach(session.backgroundJobs, (now) =>
            SubscriptionRef.set(jobs, now),
          ),
        );
        yield* Effect.forkScoped(
          Stream.runForEach(session.agentTurns, (turn) =>
            SubscriptionRef.update(waiting, (all) => [...all, turn]),
          ),
        );
      });

    const get = lock.withPermits(1)(
      Effect.suspend(() => {
        if (current) return Effect.succeed(current.session);
        return Effect.gen(function* () {
          const scope = yield* Scope.fork(outer);
          const session = yield* Scope.provide(open, scope).pipe(
            Effect.onError(() => Scope.close(scope, Exit.void)),
          );
          yield* Scope.provide(follow(session), scope);
          current = { session, scope };
          return session;
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

    return {
      get,
      opened: Effect.sync(() => current?.session),
      reset,
      jobs: SubscriptionRef.changes(jobs),
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
  });

/** What a Session's children tell it. */
export type AgentReport =
  | {
      readonly _tag: 'TurnEnded';
      readonly turnId: string;
      readonly status: TurnEndStatus;
    }
  | { readonly _tag: 'NativeId'; readonly nativeId: string }
  /** The agent took a steer of the running Turn. */
  | { readonly _tag: 'Steered'; readonly turnId: string; readonly id: string }
  /** The agent started a Turn on its own; the Session runs it as `turnId`. */
  | { readonly _tag: 'AgentTurn'; readonly turnId: string };

/** What a Session hands its children: its harness and its live agent. */
export class SessionAgent extends Context.Service<
  SessionAgent,
  {
    readonly harness: Harness;
    /** The Session's live agent, opened on first use and shared by its Turns. */
    readonly agent: Effect.Effect<HarnessSession, HarnessError>;
    /** The agent if it is open now, without opening it. */
    readonly opened: Effect.Effect<HarnessSession | undefined>;
    /** Closes the agent; the next Turn opens it again, resumed by its native id. */
    readonly reset: Effect.Effect<void>;
    /** The agent's Background Jobs now, then each change; none while it is closed. */
    readonly jobs: Stream.Stream<ReadonlyArray<BackgroundJob>>;
    /** Waits until the agent has started a Turn of its own that has not run. */
    readonly nextAgentTurn: Effect.Effect<void>;
    /** The oldest Turn the agent started that has not run, taken to run now. */
    readonly takeAgentTurn: Effect.Effect<Option.Option<AgentTurn>>;
    readonly report: (report: AgentReport) => Effect.Effect<void>;
  }
>()('@kestack/ai-toolkit/engine/SessionAgent') {}
