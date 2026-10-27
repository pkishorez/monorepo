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
  type Agent,
  type McpServerStatus,
  type TurnEnd,
  type TurnHandle,
  type TurnInput,
  type TurnOut,
} from '../../contract/index.js';
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
import { mayNameSkill, toUserInput } from './input.js';
import { makeSubAgents, terminalJobs, touchesTerminals } from './jobs.js';
import { makeLineage, type Lineage } from './lineage.js';
import { makeQuestions } from './questions.js';
import { toRawOut } from './records.js';
import { sandboxPolicy, threadOptions } from './settings.js';
import { toContextUsage, toMcpStatus } from './status.js';
import { makeStreams, type Streams } from './streams.js';
import { turnEndOf } from './turn-end.js';

export interface SessionConfig {
  readonly cwd: string;
  readonly model: string;
  readonly sandbox: SandboxMode;
  readonly effort: ReasoningEffort;
  readonly nativeId?: string | undefined;
  /** Keep the thread out of Codex's saved history (One-shot Prompts). */
  readonly ephemeral?: boolean;
}

/** How long `cancel` waits for Codex to confirm before it ends the turn itself. */
const CANCEL_GRACE = Duration.seconds(5);

/** How long a turn ended from here waits for Codex to answer its steers. */
const STEER_WAIT_MS = 2_000;

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
 * One running turn. It ends once the main thread's turn completes, no
 * sub-agent thread is still working and no steer is still being sent, so a
 * sub-agent left running when the main agent stops still lands in this
 * turn. A cancel ends it as soon as the main thread confirms, without
 * waiting for sub-agents. Its stream ends with how the main thread's turn
 * ended, or cancelled when Codex never said.
 *
 * While a steer is being sent, what Codex says is held back: once Codex
 * takes the steer, its `TurnSteered` goes first, so the steer comes before
 * anything Codex did with it. A turn ended with a steer still unanswered
 * marks it taken: better a message that may have gone unanswered than one
 * sent twice.
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
  /** How the main thread's turn ended, from its `turn/completed`. */
  end: TurnEnd | undefined;
  cancelled: boolean;
  /** Steers sent and not yet answered, by the engine's id. */
  readonly steering: Set<string>;
  /** What Codex said while a steer was being sent, in order. */
  readonly held: Array<Notification>;
  /** Takes in what was held; then settles the turn, when asked to. */
  release: (settle: boolean) => void;
  /** Adds to the turn's stream while it is open. */
  readonly emit: (out: TurnOut) => void;
  /** Ends the stream, with how the turn ended. */
  readonly finish: () => void;
}

const makeRunning = (
  queue: Queue.Queue<TurnOut, HarnessError | Cause.Done>,
  streams: Streams,
  /** Runs as it ends, before how it ended is sent. */
  ending: () => void,
): Running => {
  const ended = Deferred.makeUnsafe<void>();
  const running: Running = {
    turnId: Deferred.makeUnsafe(),
    ended,
    busy: new Map(),
    started: new Set(),
    knownTurnId: undefined,
    mainDone: false,
    end: undefined,
    cancelled: false,
    steering: new Set(),
    held: [],
    release: () => {},
    emit: (out) => {
      Queue.offerUnsafe(queue, out);
    },
    finish: () => {
      if (Deferred.isDoneUnsafe(ended)) return;
      for (const id of running.steering)
        Queue.offerUnsafe(queue, { _tag: 'TurnSteered', id });
      running.steering.clear();
      running.release(false);
      ending();
      // Streamed text is all the client sees of it: send what still waits.
      streams.flushAll();
      Queue.offerUnsafe(
        queue,
        running.end ?? { _tag: 'TurnEnd', status: 'cancelled', shown: false },
      );
      Deferred.doneUnsafe(ended, Effect.void);
      Queue.endUnsafe(queue);
    },
  };
  return running;
};

/** Ends the turn once nothing it waits for is still working. */
const settle = (running: Running) => {
  if (
    running.mainDone &&
    running.steering.size === 0 &&
    (running.cancelled || running.busy.size === 0)
  )
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
): Effect.Effect<Agent, HarnessError, Scope.Scope> =>
  Effect.gen(function* () {
    const { thread } = yield* startThread(server, config);
    const threadId = thread.id;
    const lineage: Lineage = makeLineage(threadId);
    const subAgents = makeSubAgents(threadId);
    let running: Running | undefined;
    let model = config.model;
    let effort = config.effort;
    let sandbox = config.sandbox;
    /**
     * Changes a steer asked for: `turn/steer` cannot carry them, so they
     * go with the next `turn/start`.
     */
    let asked: Pick<TurnInput, 'model' | 'settings'> = {};
    let tokenUsage: ThreadTokenUsage | undefined;
    let skills: ReadonlyArray<SkillMetadata> | undefined;
    let terminals: ReadonlyArray<BackgroundTerminal> = [];
    const terminalsSeen = new Map<string, number>();
    const jobs = yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]);
    const jobChanges = yield* Queue.sliding<'terminals' | 'agents'>(1);
    const questions = yield* makeQuestions(
      (out) => running?.emit(out),
      lineage.agentOf,
      () => running !== undefined,
    );
    const untake = server.takeQuestions(questions.take);
    yield* Effect.addFinalizer(() => Effect.sync(untake));

    // This listener hears the whole session, ahead of any turn's listener:
    // a child thread is known before its first record is routed, and a
    // finished turn is a Fork Point before its stream ends.
    server.listen({
      notification: (notification) => {
        lineage.observe(notification);
        if (subAgents.observe(notification, Date.now()))
          Queue.offerUnsafe(jobChanges, 'agents');
        if (notification.method === 'skills/changed') skills = undefined;
        questions.observe(notification);
        const params = (notification.params ?? {}) as { threadId?: string };
        if (params.threadId !== threadId) return;
        if (touchesTerminals(notification))
          Queue.offerUnsafe(jobChanges, 'terminals');
        if (isNotification(notification, 'thread/tokenUsage/updated'))
          tokenUsage = notification.params.tokenUsage;
      },
      exit: () => questions.clear(false),
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

    /** Remembers what a steer asks for, until the next `turn/start`. */
    const remember = ({ model, settings }: TurnInput) => {
      asked = {
        ...asked,
        ...(model === undefined ? {} : { model }),
        ...(settings === undefined
          ? {}
          : { settings: { ...asked.settings, ...settings } }),
      };
    };

    /**
     * The `turn/start` overrides a Turn's model and settings ask for, with
     * what the steers before it asked for.
     */
    const overrides = (input: TurnInput) => {
      const wanted = input.model ?? asked.model;
      const settings =
        input.settings === undefined && asked.settings === undefined
          ? undefined
          : { ...asked.settings, ...input.settings };
      asked = {};
      // Setting values a Turn leaves out keep their current value.
      const next =
        settings === undefined
          ? { effort, sandbox }
          : threadOptions({
              reasoningEffort: effort,
              sandbox,
              ...settings,
            });
      const changes = {
        ...(wanted === undefined || wanted === model ? {} : { model: wanted }),
        effort: next.effort,
        ...(next.sandbox === sandbox
          ? {}
          : { sandboxPolicy: sandboxPolicy(next.sandbox) }),
      };
      model = wanted ?? model;
      effort = next.effort;
      sandbox = next.sandbox;
      return changes;
    };

    // Codex may hold its answer until the turn has stopped; never wait long.
    const interrupt = (turnId: string, thread = threadId) =>
      server
        .request('turn/interrupt', { threadId: thread, turnId })
        .pipe(Effect.timeoutOption(INTERRUPT_WAIT), Effect.ignore);

    /**
     * Sends a steer into its own turn once Codex has started it; refused
     * once that turn has ended or another runs.
     */
    const steerInto = (
      claimed: Deferred.Deferred<Running, HarnessError>,
      id: string,
      input: TurnInput,
    ) =>
      Effect.gen(function* () {
        const current = yield* Deferred.await(claimed);
        const expectedTurnId = yield* Deferred.await(current.turnId);
        const runs = () =>
          running === current &&
          !current.mainDone &&
          !Deferred.isDoneUnsafe(current.ended);
        if (!runs())
          return yield* new HarnessError({
            message: 'Its Codex turn is not the one running',
          });
        const items = yield* userInput(input);
        // Looking up Skills may take a while: the turn may be over by now.
        if (!runs())
          return yield* new HarnessError({
            message: 'Its Codex turn ended before the steer was sent',
          });
        // Counted from the moment it is sent: only a sent steer may be
        // marked taken by a turn that ends before Codex answers.
        current.steering.add(id);
        remember(input);
        yield* server
          .request('turn/steer', { threadId, expectedTurnId, input: items })
          .pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (current.steering.delete(id))
                  current.emit({ _tag: 'TurnSteered', id });
              }),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                current.steering.delete(id);
                if (current.steering.size === 0) current.release(true);
              }),
            ),
          );
      });

    const turn = (input: TurnInput): TurnHandle => {
      // Asked for now, so a steer sent before the turn runs waits for it.
      const claimed = Deferred.makeUnsafe<Running, HarnessError>();
      const out = Stream.callback<TurnOut, HarnessError>((queue) =>
        Effect.gen(function* () {
          if (running !== undefined)
            return yield* new HarnessError({
              message: 'A Codex turn is already running',
            });
          const streams = makeStreams((out) => Queue.offerUnsafe(queue, out));
          // Its Agent Questions go with it.
          const current = makeRunning(queue, streams, () =>
            questions.clear(true),
          );
          running = current;
          Deferred.doneUnsafe(claimed, Effect.succeed(current));

          const hear = (notification: Notification) => {
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
            const end =
              agentId === undefined
                ? turnEndOf(notification, threadId)
                : undefined;
            if (end !== undefined) {
              current.end = end;
              current.mainDone = true;
            }
          };
          current.release = (then) => {
            for (const notification of current.held.splice(0))
              hear(notification);
            if (then) settle(current);
          };

          const unlisten = server.listen({
            notification: (notification) => {
              if (current.steering.size > 0) {
                current.held.push(notification);
                return;
              }
              hear(notification);
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
      return {
        out,
        steer: (id, steer) => steerInto(claimed, id, steer),
      };
    };

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
      if (confirmed._tag === 'Some') return;
      // A steer Codex may still take is waited for, a little.
      const until = Date.now() + STEER_WAIT_MS;
      while (current.steering.size > 0 && Date.now() < until)
        yield* Effect.sleep(50);
      current.finish();
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
      cancel,
      agentTurns: Stream.never,
      backgroundJobs: SubscriptionRef.changes(jobs),
      stopBackgroundJob,
      questions: questions.changes,
      answer: questions.answer,
      mcpStatus,
      contextUsage,
    } satisfies Agent;
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
