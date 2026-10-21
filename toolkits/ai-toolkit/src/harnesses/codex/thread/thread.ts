import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Queue,
  Stream,
  SubscriptionRef,
  type Scope,
} from 'effect';
import {
  HarnessError,
  type BackgroundJob,
  type HarnessSession,
  type McpServerStatus,
  type RawOut,
  type TurnInput,
} from '../../../harness/index.js';
import {
  isNotification,
  type AppServer,
  type BackgroundTerminal,
  type Notification,
  type ReasoningEffort,
  type SandboxMode,
  type SkillMetadata,
  type ThreadTokenUsage,
} from '../app-server/index.js';
import { listSkills } from '../catalog/index.js';
import { finishedTurnId } from './fork-point.js';
import { mayNameSkill, toUserInput } from './input.js';
import { makeSubAgents, terminalJobs, touchesTerminals } from './jobs.js';
import { makeLineage, type Lineage } from './lineage.js';
import { toRawOut } from './records.js';
import { sandboxPolicy, threadOptions } from './settings.js';
import { toContextUsage, toMcpStatus } from './status.js';
import { makeStreams, type Streams } from './streams.js';

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
 * How often background terminals are listed while any runs or a turn does:
 * Codex says nothing when one exits on its own.
 */
const TERMINALS_POLL = Duration.seconds(3);

/**
 * Thread statuses that mean a sub-agent will not finish its turn. `idle` is
 * not one: Codex reports it just before the turn/completed still to come.
 */
const GONE = new Set(['notLoaded', 'systemError']);

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
  streams: Streams,
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
      // Streamed text is all the client sees of it: send what still waits.
      streams.flushAll();
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

/**
 * The notification as stored: an item's streamed text goes out as chunks
 * first and is kept as pointers to them, in the item and in the main
 * thread's finished turn. A sub-agent's finished turn keeps its text inline:
 * its last message is the result of the spawn call.
 */
const stored = (
  streams: Streams,
  notification: Notification,
  agentId: string | undefined,
): Notification => {
  if (isNotification(notification, 'item/completed'))
    return {
      method: notification.method,
      params: {
        ...notification.params,
        item: streams.complete(notification.params.item),
      },
    };
  if (isNotification(notification, 'turn/completed')) {
    const { threadId, turn } = notification.params;
    streams.endThread(threadId);
    if (agentId !== undefined) return notification;
    return {
      method: notification.method,
      params: {
        ...notification.params,
        turn: { ...turn, items: turn.items.map(streams.stored) },
      },
    };
  }
  return notification;
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

/** Lists every page of a paged Codex request. */
const allPages = <A>(
  page: (
    cursor: string | undefined,
  ) => Effect.Effect<
    { readonly data: ReadonlyArray<A>; readonly nextCursor: string | null },
    HarnessError
  >,
): Effect.Effect<ReadonlyArray<A>, HarnessError> =>
  Effect.gen(function* () {
    const all: Array<A> = [];
    let cursor: string | undefined;
    do {
      const next = yield* page(cursor);
      all.push(...next.data);
      cursor = next.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return all;
  });

/**
 * Opens a Codex thread (new, or resumed by nativeId) on a running server.
 * Closing the Scope stops watching its Background Jobs.
 */
export const openSession = (
  server: AppServer,
  config: SessionConfig,
): Effect.Effect<HarnessSession, HarnessError, Scope.Scope> =>
  Effect.gen(function* () {
    const { thread } = yield* startThread(server, config);
    const threadId = thread.id;
    const lineage: Lineage = makeLineage(threadId);
    const subAgents = makeSubAgents(threadId);
    let running: Running | undefined;
    /** The turn last asked for: done once it is the running one. */
    let asked: Deferred.Deferred<Running, HarnessError> | undefined;
    let model = config.model;
    let effort = config.effort;
    let sandbox = config.sandbox;
    let lastTurnId: string | undefined;
    let tokenUsage: ThreadTokenUsage | undefined;
    let skills: ReadonlyArray<SkillMetadata> | undefined;
    let terminals: ReadonlyArray<BackgroundTerminal> = [];
    const terminalsSeen = new Map<string, number>();
    const jobs = yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]);
    const jobChanges = yield* Queue.sliding<'terminals' | 'agents'>(1);

    // This listener hears the whole session, ahead of any turn's listener:
    // a child thread is known before its first record is routed, and a
    // finished turn is a Fork Point before its stream ends.
    server.listen({
      notification: (notification) => {
        lineage.observe(notification);
        if (subAgents.observe(notification, Date.now()))
          Queue.offerUnsafe(jobChanges, 'agents');
        if (notification.method === 'skills/changed') skills = undefined;
        const params = (notification.params ?? {}) as { threadId?: string };
        if (params.threadId !== threadId) return;
        if (touchesTerminals(notification))
          Queue.offerUnsafe(jobChanges, 'terminals');
        if (isNotification(notification, 'thread/tokenUsage/updated'))
          tokenUsage = notification.params.tokenUsage;
        lastTurnId = finishedTurnId(notification, threadId) ?? lastTurnId;
      },
      exit: () => {},
    });

    const listTerminals = allPages((cursor) =>
      server.request('thread/backgroundTerminals/list', {
        threadId,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    ).pipe(Effect.orElseSucceed(() => []));

    // Keeps `jobs` current: on each change, and on a slow poll while a
    // terminal or a turn runs.
    yield* Effect.gen(function* () {
      const change =
        terminals.length > 0 || running !== undefined
          ? yield* Queue.take(jobChanges).pipe(
              Effect.timeoutOption(TERMINALS_POLL),
              Effect.map((taken) =>
                taken._tag === 'Some' ? taken.value : 'terminals',
              ),
            )
          : yield* Queue.take(jobChanges);
      if (change === 'terminals') terminals = yield* listTerminals;
      const next = [
        ...terminalJobs(terminals, terminalsSeen, Date.now()),
        ...subAgents.jobs(),
      ];
      const current = yield* SubscriptionRef.get(jobs);
      if (JSON.stringify(next) !== JSON.stringify(current))
        yield* SubscriptionRef.set(jobs, next);
    }).pipe(Effect.forever, Effect.forkScoped);

    /** The Skills a message may name, read once and again when they change. */
    const skillsFor = (text: string) =>
      !mayNameSkill(text)
        ? Effect.succeed([])
        : skills !== undefined
          ? Effect.succeed(skills)
          : listSkills(server, config.cwd).pipe(
              Effect.tap((listed) =>
                Effect.sync(() => {
                  skills = listed;
                }),
              ),
              // A Skill that cannot be looked up is sent as the text typed.
              Effect.orElseSucceed(() => []),
            );

    const userInput = (input: TurnInput) =>
      skillsFor(input.text).pipe(
        Effect.map((known) => toUserInput(input, known)),
      );

    /** The `turn/start` overrides a Turn's model and settings ask for. */
    const overrides = (input: TurnInput) => {
      // Setting values a Turn leaves out keep their current value.
      const next =
        input.settings === undefined
          ? { effort, sandbox }
          : threadOptions({
              reasoningEffort: effort,
              sandbox,
              ...input.settings,
            });
      const changes = {
        ...(input.model === undefined || input.model === model
          ? {}
          : { model: input.model }),
        effort: next.effort,
        ...(next.sandbox === sandbox
          ? {}
          : { sandboxPolicy: sandboxPolicy(next.sandbox) }),
      };
      model = input.model ?? model;
      effort = next.effort;
      sandbox = next.sandbox;
      return changes;
    };

    // Codex may hold its answer until the turn has stopped; never wait long.
    const interrupt = (turnId: string, thread = threadId) =>
      server
        .request('turn/interrupt', { threadId: thread, turnId })
        .pipe(Effect.timeoutOption(INTERRUPT_WAIT), Effect.ignore);

    const turn = (input: TurnInput): Stream.Stream<RawOut, HarnessError> => {
      // Asked for now, so a steer sent before the turn runs waits for it.
      const claimed = Deferred.makeUnsafe<Running, HarnessError>();
      asked = claimed;
      return Stream.callback<RawOut, HarnessError>((queue) =>
        Effect.gen(function* () {
          if (running !== undefined)
            return yield* new HarnessError({
              message: 'A Codex turn is already running',
            });
          const streams = makeStreams((out) => Queue.offerUnsafe(queue, out));
          const current = makeRunning(queue, streams);
          running = current;
          Deferred.doneUnsafe(claimed, Effect.succeed(current));

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
              if (streams.delta(notification, agentId)) return;
              const out = toRawOut(
                stored(streams, notification, agentId),
                agentId,
              );
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
            streams.close();
            running = undefined;
            // The reader stopped before Codex did: stop Codex too.
            return current.mainDone || current.knownTurnId === undefined
              ? Effect.void
              : interrupt(current.knownTurnId);
          });

          const started = yield* userInput(input).pipe(
            Effect.flatMap((items) =>
              server.request('turn/start', {
                threadId,
                input: items,
                ...overrides(input),
              }),
            ),
            Effect.tapError((error) => Deferred.fail(current.turnId, error)),
          );
          current.knownTurnId = started.turn.id;
          Deferred.doneUnsafe(current.turnId, Effect.succeed(started.turn.id));
        }).pipe(
          Effect.onExit(() =>
            Deferred.fail(
              claimed,
              new HarnessError({ message: 'The Codex turn did not start' }),
            ),
          ),
        ),
      );
    };

    /** Joins the turn last asked for once Codex has started it. */
    const steer = (input: TurnInput) =>
      Effect.gen(function* () {
        const gone = new HarnessError({
          message: 'No Codex turn is running to steer',
        });
        if (asked === undefined) return yield* gone;
        const current = yield* Deferred.await(asked);
        const expectedTurnId = yield* Deferred.await(current.turnId);
        if (running !== current || current.mainDone) return yield* gone;
        yield* server.request('turn/steer', {
          threadId,
          expectedTurnId,
          input: yield* userInput(input),
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

    const stopBackgroundJob = (id: string) =>
      Effect.gen(function* () {
        if (terminals.some((terminal) => terminal.processId === id)) {
          yield* server.request('thread/backgroundTerminals/terminate', {
            threadId,
            processId: id,
          });
          Queue.offerUnsafe(jobChanges, 'terminals');
          return;
        }
        const agentTurnId = subAgents.turnOf(id);
        if (agentTurnId === undefined)
          return yield* new HarnessError({
            message: `No running Codex background job ${id}`,
          });
        yield* interrupt(agentTurnId, id);
      });

    const mcpStatus: Effect.Effect<
      ReadonlyArray<McpServerStatus>,
      HarnessError
    > = allPages((cursor) =>
      server.request('mcpServerStatus/list', {
        threadId,
        detail: 'toolsAndAuthOnly',
        ...(cursor === undefined ? {} : { cursor }),
      }),
    ).pipe(Effect.map((servers) => servers.map(toMcpStatus)));

    // API-key logins have no rate limits to read.
    const contextUsage = server
      .request('account/rateLimits/read', { excludeResetCreditDetails: true })
      .pipe(
        Effect.orElseSucceed(() => ({
          rateLimits: null,
          rateLimitsByLimitId: null,
        })),
        Effect.map((limits) => toContextUsage(tokenUsage, limits)),
      );

    return {
      nativeId: Effect.succeed(threadId),
      turn,
      steer,
      cancel,
      lastTurnNativeId: Effect.sync(() => lastTurnId),
      agentTurns: Stream.never,
      backgroundJobs: SubscriptionRef.changes(jobs),
      stopBackgroundJob,
      mcpStatus,
      contextUsage,
    } satisfies HarnessSession;
  });

export { isToolItem, type ToolItem } from './records.js';
export { SETTINGS, threadOptions } from './settings.js';
export {
  restore,
  TEXT_CHUNK,
  type Channel,
  type StreamPointer,
  type TextChunk,
} from './streams.js';
