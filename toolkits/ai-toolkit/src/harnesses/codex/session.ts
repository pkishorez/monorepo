import { Cause, Deferred, Duration, Effect, Queue, Stream } from 'effect';
import {
  HarnessError,
  type HarnessSession,
  type RawOut,
} from '../../harness/index.js';
import {
  isNotification,
  type AppServer,
  type Notification,
  type ReasoningEffort,
  type SandboxMode,
} from './app-server/index.js';
import { makeLineage, type Lineage } from './lineage.js';
import { toRawOut } from './records.js';

export interface SessionConfig {
  readonly cwd: string;
  readonly model: string;
  readonly sandbox: SandboxMode;
  readonly effort: ReasoningEffort;
  readonly nativeId?: string | undefined;
  /** Keep the thread out of Codex's saved history (the titler's one-shots). */
  readonly ephemeral?: boolean;
}

/** How long `cancel` waits for Codex to confirm before it ends the turn itself. */
const CANCEL_GRACE = Duration.seconds(5);

/** How long one `turn/interrupt` answer is waited for. */
const INTERRUPT_WAIT = Duration.seconds(2);

/**
 * Thread statuses that mean a sub-agent will not finish its turn. `idle` is
 * not one: Codex reports it just before the turn/completed still to come.
 */
const GONE = new Set(['notLoaded', 'systemError']);

const text = (value: string) => [
  { type: 'text' as const, text: value, text_elements: [] },
];

/**
 * One running turn. It ends once the main thread's turn completes and no
 * sub-agent thread is still working, so a sub-agent left running when the
 * main agent stops still lands in this turn. A cancel ends it as soon as
 * the main thread confirms, without waiting for sub-agents.
 */
interface Running {
  readonly turnId: Deferred.Deferred<string, HarnessError>;
  readonly ended: Deferred.Deferred<void>;
  /** Sub-agent threads still working, with their current turn id once known. */
  readonly busy: Map<string, string | undefined>;
  /** Sub-agent threads whose turn has started during this turn. */
  readonly started: Set<string>;
  /** The main thread's turn id, once `turn/start` answers. */
  knownTurnId: string | undefined;
  mainDone: boolean;
  cancelled: boolean;
  /** Ends the stream. */
  readonly finish: () => void;
}

const makeRunning = (
  queue: Queue.Queue<RawOut, HarnessError | Cause.Done>,
): Running => {
  const ended = Deferred.makeUnsafe<void>();
  return {
    turnId: Deferred.makeUnsafe(),
    ended,
    busy: new Map(),
    started: new Set(),
    knownTurnId: undefined,
    mainDone: false,
    cancelled: false,
    finish: () => {
      Deferred.doneUnsafe(ended, Effect.void);
      Queue.endUnsafe(queue);
    },
  };
};

/** Ends the turn once nothing it waits for is still working. */
const settle = (running: Running) => {
  if (running.mainDone && (running.cancelled || running.busy.size === 0))
    running.finish();
};

/** A main-thread record from an earlier turn (a late interrupt answer). */
const isStale = (
  running: Running,
  params: { turnId?: string; turn?: { id?: string } },
) => {
  const turnId = params.turnId ?? params.turn?.id;
  return (
    running.knownTurnId !== undefined &&
    turnId !== undefined &&
    turnId !== running.knownTurnId
  );
};

/** Tracks which sub-agent threads are working, from their own notifications. */
const trackSubAgents = (
  running: Running,
  notification: Notification,
  mainThreadId: string,
) => {
  if (
    isNotification(notification, 'item/completed') &&
    notification.params.item.type === 'collabAgentToolCall' &&
    notification.params.item.tool === 'spawnAgent'
  )
    // Busy from the spawn on, unless its turn has already been heard from.
    for (const threadId of notification.params.item.receiverThreadIds)
      if (!running.started.has(threadId)) running.busy.set(threadId, undefined);
  const { threadId } = (notification.params ?? {}) as { threadId?: string };
  if (threadId === undefined || threadId === mainThreadId) return;
  if (isNotification(notification, 'turn/started')) {
    running.started.add(threadId);
    running.busy.set(threadId, notification.params.turn.id);
  } else if (isNotification(notification, 'turn/completed'))
    running.busy.delete(threadId);
  else if (notification.method === 'thread/status/changed') {
    const status = (notification.params as { status?: { type?: string } })
      .status?.type;
    if (status !== undefined && GONE.has(status)) running.busy.delete(threadId);
  }
};

const startThread = (server: AppServer, config: SessionConfig) =>
  config.nativeId === undefined
    ? server.request('thread/start', {
        model: config.model,
        cwd: config.cwd,
        sandbox: config.sandbox,
        approvalPolicy: 'never',
        ...(config.ephemeral === true ? { ephemeral: true } : {}),
      })
    : server.request('thread/resume', {
        threadId: config.nativeId,
        model: config.model,
        cwd: config.cwd,
        sandbox: config.sandbox,
        approvalPolicy: 'never',
        excludeTurns: true,
      });

/** Opens a Codex thread (new, or resumed by nativeId) on a running server. */
export const openSession = (
  server: AppServer,
  config: SessionConfig,
): Effect.Effect<HarnessSession, HarnessError> =>
  Effect.gen(function* () {
    const { thread } = yield* startThread(server, config);
    const threadId = thread.id;
    const lineage: Lineage = makeLineage(threadId);
    let running: Running | undefined;

    // Lineage listens for the whole session, ahead of any turn's listener,
    // so a child thread is known before its first record is routed.
    server.listen({ notification: lineage.observe, exit: () => {} });

    // Codex may hold its answer until the turn has stopped; never wait long.
    const interrupt = (turnId: string, thread = threadId) =>
      server
        .request('turn/interrupt', { threadId: thread, turnId })
        .pipe(Effect.timeoutOption(INTERRUPT_WAIT), Effect.ignore);

    const turn = (input: string): Stream.Stream<RawOut, HarnessError> =>
      Stream.callback<RawOut, HarnessError>((queue) =>
        Effect.gen(function* () {
          if (running !== undefined)
            return yield* new HarnessError({
              message: 'A Codex turn is already running',
            });
          const current = makeRunning(queue);
          running = current;

          const unlisten = server.listen({
            notification: (notification) => {
              trackSubAgents(current, notification, threadId);
              const params = (notification.params ?? {}) as {
                threadId?: string;
                turnId?: string;
                turn?: { id?: string };
              };
              if (params.threadId === undefined) return;
              const agentId = lineage.agentOf(params.threadId);
              if (agentId === undefined && isStale(current, params)) return;
              const out = toRawOut(notification, agentId);
              if (out !== undefined) Queue.offerUnsafe(queue, out);
              if (
                agentId === undefined &&
                isNotification(notification, 'turn/completed')
              )
                current.mainDone = true;
              settle(current);
            },
            exit: (error) => {
              Deferred.doneUnsafe(current.turnId, Effect.fail(error));
              Deferred.doneUnsafe(current.ended, Effect.void);
              Queue.failCauseUnsafe(queue, Cause.fail(error));
            },
          });

          yield* Effect.addFinalizer(() => {
            unlisten();
            running = undefined;
            // The reader stopped before Codex did: stop Codex too.
            return current.mainDone || current.knownTurnId === undefined
              ? Effect.void
              : interrupt(current.knownTurnId);
          });

          const started = yield* server
            .request('turn/start', {
              threadId,
              input: text(input),
              effort: config.effort,
            })
            .pipe(
              Effect.tapError((error) => Deferred.fail(current.turnId, error)),
            );
          current.knownTurnId = started.turn.id;
          Deferred.doneUnsafe(current.turnId, Effect.succeed(started.turn.id));
        }),
      );

    const steer = (input: string) =>
      Effect.gen(function* () {
        const current = running;
        if (current === undefined || current.mainDone)
          return yield* new HarnessError({
            message: 'No Codex turn is running to steer',
          });
        const expectedTurnId = yield* Deferred.await(current.turnId);
        yield* server.request('turn/steer', {
          threadId,
          expectedTurnId,
          input: text(input),
        });
      });

    const cancel = Effect.gen(function* () {
      const current = running;
      if (current === undefined) return;
      current.cancelled = true;
      const turnId = yield* Deferred.await(current.turnId).pipe(Effect.option);
      if (turnId._tag === 'Some' && !current.mainDone)
        yield* interrupt(turnId.value);
      for (const [thread, childTurnId] of current.busy)
        if (childTurnId !== undefined) yield* interrupt(childTurnId, thread);
      settle(current);
      // Codex confirms with the main thread's turn/completed; if it does
      // not, the turn ends here so the session stays usable.
      const confirmed = yield* Deferred.await(current.ended).pipe(
        Effect.timeoutOption(CANCEL_GRACE),
      );
      if (confirmed._tag === 'None') current.finish();
    });

    return {
      nativeId: Effect.succeed(threadId),
      turn,
      steer,
      cancel,
    } satisfies HarnessSession;
  });
