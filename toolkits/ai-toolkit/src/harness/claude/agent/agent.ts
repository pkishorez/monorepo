import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Deferred, Effect, Queue, Stream } from 'effect';
import type { Cause, Scope } from 'effect';
import {
  failureReason,
  HarnessError,
  type Attachment,
  type Agent,
  type RawOut,
  type TurnEnd as TurnEndOut,
  type TurnOut,
  type TurnStream,
} from '../../contract/index.js';
import { resultEnd } from '../project/index.js';
import { makeBackgroundJobs } from './background-jobs/index.js';
import { userContent } from './content.js';
import { queryOptions, type SdkAgentConfig } from './options.js';
import { makeQuestions } from './questions/index.js';
import {
  forkPointOf,
  keptWhileIdle,
  opensTurn,
  skipped,
  toRawOut,
  type SdkRecord,
} from './records.js';
import { contextUsage, mcpStatus } from './status/index.js';
import { makeStreamChunks } from './stream-chunks/index.js';
import { TurnEnd } from './turn-end/index.js';
import { apply, changed, type TurnOptions } from './turn-options.js';
import { userInput } from './user-input.js';

/** Puts a stored record's streamed text back from its chunks. */
export { restore } from './stream-chunks/index.js';

/** One user message, and the options it changes from here on. */
export interface SdkTurn {
  readonly text: string;
  readonly images: ReadonlyArray<Attachment>;
  readonly options: Partial<TurnOptions>;
}

/** One turn, as a `TurnHandle` that steers with `SdkTurn`s. */
export interface SdkTurnHandle {
  readonly out: TurnStream;
  readonly steer: (
    id: string,
    input: SdkTurn,
  ) => Effect.Effect<void, HarnessError>;
}

export type SdkAgent = Omit<Agent, 'turn' | 'agentTurns'> & {
  readonly turn: (input: SdkTurn) => SdkTurnHandle;
  readonly agentTurns: Stream.Stream<SdkTurnHandle>;
};

/** How long a cancelled turn may take to report its result before its stream ends anyway. */
const CANCEL_GRACE_MS = 15_000;

/** Claude Code's runtime takes `{ cancelQueued }`; its typings do not say so yet. */
type Interrupt = (options?: { cancelQueued?: boolean }) => Promise<unknown>;

interface Turn {
  readonly out: Queue.Queue<TurnOut, HarnessError | Cause.Done>;
  readonly agentStarted: boolean;
  /** Ends with the turn, so a user turn can wait out an agent's. */
  readonly done: Deferred.Deferred<void>;
  state: TurnEnd.TurnEnd;
  /** The turn's last transcript entry so far: its Fork Point once it ends. */
  forkPoint: string | undefined;
  /** How the last result that answered one of its messages ended. */
  answered: Pick<TurnEndOut, 'status' | 'error'> | undefined;
  /** Its stream has ended; a late end, such as a cancel's, does nothing. */
  ended: boolean;
}

/**
 * One Agent SDK `query` in streaming-input mode, alive for the Scope.
 * Each turn pushes a user message and streams every whole record the query
 * emits until `TurnEnd` says every message we sent got its result, then
 * how it ended, with the turn's own last transcript entry as its Fork
 * Point. A steer is in the stream where it was pushed. A turn
 * Claude Code starts on its own between ours (to report a finished
 * Background Job) streams the same way on `agentTurns`; a user turn waits
 * for it to end, so the two never interleave, and a steer waits with it.
 * An Agent Question holds its tool call until the user answers it, and is
 * declined when its turn ends. It is open once Claude Code has initialized:
 * one that exits first fails the open, with why.
 */
export const openSdkAgent = (
  config: SdkAgentConfig,
): Effect.Effect<SdkAgent, HarnessError, Scope.Scope> =>
  Effect.gen(function* () {
    const input = userInput();
    // What the user answered is recorded into the Turn it was asked in.
    const questions = yield* makeQuestions((out) =>
      Effect.suspend(() => send([out])),
    );
    const live = yield* Effect.try({
      try: () =>
        query({
          prompt: input.iterable,
          options: queryOptions(config, questions),
        }),
      catch: (cause) =>
        new HarnessError({ message: 'Claude Code did not start', cause }),
    });

    const scope = yield* Effect.scope;
    const jobs = yield* makeBackgroundJobs((id) => live.stopTask(id));
    const agentTurns = yield* Queue.unbounded<SdkTurnHandle>();
    let options: TurnOptions = {
      model: config.model,
      effort: config.effort,
      permissionMode: config.permissionMode,
    };
    let nativeId = config.nativeId;
    let turn: Turn | undefined;
    let stopped: HarnessError | undefined;
    // What a background subagent wrote, and task notifications, while no
    // turn ran: the next turn opens with them.
    let idle: RawOut[] = [];
    const chunks = makeStreamChunks();
    let timerSet = false;

    const send = (outs: ReadonlyArray<RawOut>) =>
      Effect.suspend(() => {
        if (outs.length === 0) return Effect.void;
        if (turn !== undefined) return Queue.offerAll(turn.out, outs);
        idle.push(...outs);
        return Effect.void;
      });

    /**
     * Makes a turn the running one, its stream opening with what came while
     * no turn ran, and runs `then`, such as sending its message. Synchronous,
     * so nothing runs between a check that no turn runs and this.
     */
    const begin = (current: Turn, then?: () => void): Effect.Effect<void> => {
      turn = current;
      then?.();
      const waiting = idle;
      idle = [];
      return Queue.offerAll(current.out, waiting).pipe(Effect.asVoid);
    };

    // Text left waiting in a slow stream is sent once it is due, even when
    // no record arrives to send it with.
    const armTimer: Effect.Effect<void> = Effect.suspend(() => {
      const at = chunks.nextDue();
      if (timerSet || at === undefined) return Effect.void;
      timerSet = true;
      return Effect.sleep(Math.max(0, at - Date.now())).pipe(
        Effect.andThen(
          Effect.suspend(() => {
            timerSet = false;
            return send(chunks.due(Date.now()));
          }),
        ),
        Effect.andThen(armTimer),
        Effect.forkIn(scope),
        Effect.asVoid,
      );
    });

    const newTurn = (agentStarted: boolean, state: TurnEnd.TurnEnd) =>
      Effect.gen(function* () {
        const current: Turn = {
          out: yield* Queue.unbounded<TurnOut, HarnessError | Cause.Done>(),
          agentStarted,
          done: yield* Deferred.make<void>(),
          state,
          forkPoint: undefined,
          answered: undefined,
          ended: false,
        };
        return current;
      });

    // Text still waiting is sent before the turn ends, so a cancelled
    // turn's chunks still add up to what was written; how it ended comes
    // last.
    const finish = (
      current: Turn,
      end: Omit<TurnEndOut, '_tag' | 'forkPoint'> | undefined,
    ) =>
      Effect.suspend(() => {
        if (current.ended) return Effect.void;
        current.ended = true;
        if (turn === current) turn = undefined;
        const last: ReadonlyArray<TurnOut> =
          end === undefined
            ? []
            : [
                {
                  _tag: 'TurnEnd',
                  ...end,
                  ...(current.forkPoint === undefined
                    ? {}
                    : { forkPoint: current.forkPoint }),
                },
              ];
        // Its Agent Questions go with it.
        return questions.clear.pipe(
          Effect.andThen(
            Queue.offerAll(current.out, [...chunks.flushAll(), ...last]),
          ),
          Effect.andThen(Queue.end(current.out)),
          Effect.andThen(Deferred.succeed(current.done, undefined)),
        );
      });

    const interrupt = Effect.promise(() =>
      (live.interrupt as Interrupt)({ cancelQueued: true }).catch(
        () => undefined,
      ),
    );

    const startAgentTurn: Effect.Effect<Turn> = Effect.gen(function* () {
      const current = yield* newTurn(true, TurnEnd.agentStarted);
      // A user turn may have begun while this one was made; the record
      // joins it instead.
      return yield* Effect.suspend(() =>
        turn !== undefined
          ? Effect.succeed(turn)
          : begin(current).pipe(
              Effect.andThen(
                Queue.offer(agentTurns, {
                  out: Stream.fromQueue(current.out).pipe(
                    Stream.ensuring(finishIfCurrent(current)),
                  ),
                  steer: (id, message) =>
                    steerInto(Effect.succeed(current), id, message),
                }),
              ),
              Effect.as(current),
            ),
      );
    });

    /**
     * Ends a turn whose last waiting message will get no result: as its
     * last answer did, which its stream already shows, or cancelled when
     * none came.
     */
    const finishDropped = (current: Turn) =>
      finish(
        current,
        current.answered === undefined
          ? { status: 'cancelled', shown: false }
          : { ...current.answered, shown: true },
      );

    const finishIfCurrent = (current: Turn) =>
      Effect.suspend(() =>
        turn === current ? finish(current, undefined) : Effect.void,
      );

    /**
     * The turn a record joins: the running one, or one the agent starts.
     * Between turns only a background subagent's records and task
     * notifications are kept, for the next turn; the rest is bookkeeping.
     */
    const turnFor = (record: SdkRecord) =>
      Effect.suspend((): Effect.Effect<Turn | 'idle' | undefined> => {
        if (turn !== undefined) return Effect.succeed(turn);
        if (opensTurn(record)) return startAgentTurn;
        return Effect.succeed(keptWhileIdle(record) ? 'idle' : undefined);
      });

    const onMessage = (message: SDKMessage) =>
      Effect.gen(function* () {
        const record = message as unknown as SdkRecord;
        if (opensTurn(record) && typeof record['session_id'] === 'string') {
          nativeId = record['session_id'];
        }
        yield* jobs.observe(record);
        if (record['type'] === 'stream_event') {
          yield* send(chunks.event(record, Date.now()));
          yield* send(chunks.due(Date.now()));
          yield* armTimer;
          return;
        }
        const joined = yield* turnFor(record);
        if (joined === undefined) return;
        if (joined === 'idle') {
          if (skipped(record)) return;
          const whole =
            record['type'] === 'assistant'
              ? chunks.whole(record)
              : { chunks: [], record };
          return yield* send([...whole.chunks, toRawOut(whole.record)]);
        }
        const current = joined;
        if (
          record['type'] === 'command_lifecycle' &&
          record['state'] === 'cancelled' &&
          typeof record['command_uuid'] === 'string'
        ) {
          const [state, step] = TurnEnd.dropped(
            current.state,
            record['command_uuid'],
          );
          current.state = state;
          if (step === 'end') yield* finishDropped(current);
          return;
        }
        if (skipped(record)) return;
        current.forkPoint = forkPointOf(record) ?? current.forkPoint;
        if (record['type'] === 'assistant') {
          const whole = chunks.whole(record);
          yield* send(whole.chunks);
          yield* Queue.offer(current.out, toRawOut(whole.record));
          return;
        }
        if (record['type'] === 'result') yield* send(chunks.flushAll());
        yield* Queue.offer(current.out, toRawOut(record));
        if (record['type'] !== 'result') return;
        const [state, step] = TurnEnd.result(current.state, record);
        if (state.pending.length < current.state.pending.length)
          current.answered = resultEnd(record);
        current.state = state;
        if (step === 'end')
          yield* finish(current, { ...resultEnd(record), shown: true });
        if (step === 'interrupt') yield* interrupt;
      });

    const stop = (error: HarnessError) =>
      Effect.suspend(() => {
        stopped = error;
        const current = turn;
        turn = undefined;
        const rest = chunks.closeAll();
        // Its Background Jobs and Agent Questions went with it.
        const gone = Effect.andThen(jobs.clear, questions.clear);
        if (current === undefined) return gone;
        current.ended = true;
        return Queue.offerAll(current.out, rest).pipe(
          Effect.andThen(gone),
          Effect.andThen(Queue.fail(current.out, error)),
          Effect.andThen(Deferred.succeed(current.done, undefined)),
        );
      });

    const failedIn = {
      harness: 'Claude Code',
      cwd: config.cwd,
      binary: config.executable.path,
    };
    yield* Stream.fromAsyncIterable(
      live,
      (cause) =>
        new HarnessError({
          message: failureReason(cause, failedIn, existsSync),
          cause,
        }),
    ).pipe(
      Stream.runForEach(onMessage),
      Effect.flatMap(() =>
        stop(new HarnessError({ message: 'Claude Code exited' })),
      ),
      Effect.catch(stop),
      Effect.forkScoped,
    );
    // Added after the reader fork so it runs first: closing the query ends
    // the reader, where interrupting the reader first would wait on it.
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        input.close();
        live.close();
      }),
    );
    // Open once Claude Code has answered the SDK's initialize request, so
    // one that exits at once fails the open rather than its first turn.
    yield* Effect.tryPromise({
      try: () => live.initializationResult(),
      catch: (cause) =>
        new HarnessError({
          message: failureReason(cause, failedIn, existsSync),
          cause,
        }),
    });

    /** Applies what a message changes, before the message is sent. */
    const applyOptions = (wanted: Partial<TurnOptions>) =>
      Effect.suspend(() => {
        const changes = changed(options, wanted);
        if (Object.keys(changes).length === 0) return Effect.void;
        return Effect.tryPromise({
          try: () => apply(live, changes),
          catch: (cause) =>
            new HarnessError({
              message: 'Claude Code did not take the new model or settings',
              cause,
            }),
        }).pipe(
          Effect.andThen(
            Effect.sync(() => {
              options = { ...options, ...changes };
            }),
          ),
        );
      });

    /**
     * Waits out agent turns, then makes a user turn the running one and
     * sends its message, so a steer always follows it.
     */
    const claim = (
      current: Turn,
      send: () => void,
    ): Effect.Effect<void, HarnessError> =>
      Effect.suspend(() => {
        if (stopped !== undefined) return Effect.fail(stopped);
        const running = turn;
        if (running === undefined) return begin(current, send);
        if (!running.agentStarted) {
          return Effect.fail(
            new HarnessError({ message: 'A turn is already running' }),
          );
        }
        return Deferred.await(running.done).pipe(
          Effect.andThen(claim(current, send)),
        );
      });

    /**
     * Sends a steer into its own turn once that turn runs: refused once it
     * has ended, or while Claude Code runs another.
     */
    const steerInto = (
      target: Effect.Effect<Turn, HarnessError>,
      id: string,
      message: SdkTurn,
    ) =>
      Effect.gen(function* () {
        const current = yield* target;
        if (current.ended || turn !== current)
          return yield* new HarnessError({
            message: 'Its turn is not the one running',
          });
        // Counted before the options apply, so the turn cannot end on a
        // result before its steer is sent.
        const uuid = randomUUID();
        current.state = TurnEnd.sent(current.state, uuid);
        yield* applyOptions(message.options).pipe(
          Effect.tapError(() => {
            const [state, step] = TurnEnd.dropped(current.state, uuid);
            current.state = state;
            return step === 'end' ? finishDropped(current) : Effect.void;
          }),
        );
        // A cancel or Claude Code exiting may have ended it meanwhile.
        if (current.ended)
          return yield* new HarnessError({
            message: 'The turn ended before its steer was sent',
          });
        // Sent and marked at once: the steer is in the turn's stream
        // right where Claude Code got it, after the text before it.
        Queue.offerAllUnsafe(current.out, chunks.flushAll());
        input.push(uuid, userContent(message.text, message.images));
        Queue.offerUnsafe(current.out, { _tag: 'TurnSteered', id });
      });

    const session: SdkAgent = {
      nativeId: Effect.sync(() => nativeId),
      turn: (message) => {
        // Asked for now, so a steer sent before the turn runs waits for it.
        const claimed = Deferred.makeUnsafe<Turn, HarnessError>();
        const out = Stream.unwrap(
          Effect.gen(function* () {
            yield* applyOptions(message.options);
            const uuid = randomUUID();
            const current = yield* newTurn(false, TurnEnd.start(uuid));
            current.forkPoint = uuid;
            yield* claim(current, () =>
              input.push(uuid, userContent(message.text, message.images)),
            );
            yield* Deferred.succeed(claimed, current);
            return Stream.fromQueue(current.out).pipe(
              Stream.ensuring(
                Effect.sync(() => {
                  if (turn === current) turn = undefined;
                }),
              ),
            );
          }).pipe(
            Effect.onExit(() =>
              Deferred.fail(
                claimed,
                new HarnessError({ message: 'The turn did not start' }),
              ),
            ),
          ),
        );
        return {
          out,
          steer: (id, steer) => steerInto(Deferred.await(claimed), id, steer),
        };
      },
      cancel: Effect.suspend(() => {
        const current = turn;
        if (current === undefined) return Effect.void;
        current.state = TurnEnd.cancel(current.state);
        return interrupt.pipe(
          Effect.andThen(
            Effect.sleep(CANCEL_GRACE_MS).pipe(
              Effect.andThen(
                finish(current, { status: 'cancelled', shown: false }),
              ),
              Effect.forkIn(scope),
            ),
          ),
          Effect.asVoid,
        );
      }),
      agentTurns: Stream.fromQueue(agentTurns),
      backgroundJobs: jobs.changes,
      stopBackgroundJob: jobs.stop,
      questions: questions.changes,
      answer: questions.answer,
      mcpStatus: mcpStatus(live),
      contextUsage: contextUsage(live),
    };
    return session;
  });
