import { Clock, Duration, Effect, Option, Stream } from 'effect';
import {
  HarnessError,
  Harnesses,
  isRecord,
  type HarnessSession,
  type RawOut,
  type TurnEnd,
  type TurnHandle,
  type TurnOut,
} from '../../../../../services/harness/contract/index.js';
import type { TurnEndStatus } from '../../../../../services/records/projection/index.js';
import { Store } from '../../../../../services/records/store/index.js';
import { EngineRaw } from '../../../engine-raw/index.js';
import { toTurnInput, type Prompt } from '../../../prompt/index.js';
import { Desks } from '../../../capabilities/index.js';
import type { SessionSelf } from './actor.js';

/*
 * The turn Worker: one user message to the agent, or a Turn the agent
 * started on its own, and everything it emits until it is idle again. It
 * runs while the Session is Running that Turn.
 *
 * - run     writes `turn.started`, then reads the turn's stream in order
 *           (ADR 0013): the agent's records go into Raw, a steer the agent
 *           took becomes a `turn.started` that steered and the Session
 *           hears of it, and the stream's `TurnEnd` gives `turn.ended` its
 *           status and Fork Point. A stream that ends without one ended
 *           cancelled, or failed when nobody cancelled it.
 *           Each message sent while it runs goes to the agent through
 *           this turn's own handle, so it can join no other; one whose
 *           `TurnSteered` never comes the Session runs as the next Turn.
 * - cancel  while cancelling: tells the agent to stop; if it does not end in
 *           time, the Turn is ended from here, which stops it.
 *
 * A Turn stopped without a cancel, by the server stopping or its project
 * being removed, stops the agent and writes nothing: a stop may not get the
 * chance to, so the next start finds the turn cut off and ends it
 * `interrupted` (see actor-projects/sweep.ts).
 */

/** How long an agent may take to stop after a cancel before the Turn is ended anyway. */
const CANCEL_GRACE = Duration.seconds(10);

/** What the Session says of this Turn now; nothing once it has moved on. */
const ofTurn = (self: SessionSelf, turnId: string) =>
  Effect.map(self.get, ({ state }) =>
    state._tag === 'Running' && state.turnId === turnId
      ? { steers: state.steers, cancelling: state.cancelling }
      : { steers: [], cancelling: false },
  );

const started = (prompt: Prompt | null) =>
  prompt === null
    ? EngineRaw.turnStarted({ text: '', steered: false, agentStarted: true })
    : EngineRaw.turnStarted({
        text: prompt.text,
        steered: false,
        attachments: prompt.attachments,
      });

/** An agent turn that is gone before it was taken: nothing to run. */
const noTurn: TurnHandle = {
  out: Stream.empty,
  steer: () => Effect.fail(new HarnessError({ message: 'No turn to steer' })),
};

/**
 * Hands each message sent while the Turn runs to its handle, once; the
 * turn's stream says which the agent took.
 */
const steerAll = (self: SessionSelf, turnId: string, handle: TurnHandle) => {
  const handed = new Set<string>();
  return self.changes.pipe(
    Stream.runForEach(({ state }) =>
      Effect.forEach(
        state._tag === 'Running' && state.turnId === turnId
          ? state.steers.filter((each) => !handed.has(each.id))
          : [],
        (prompt) => {
          handed.add(prompt.id);
          return handle.steer(prompt.id, toTurnInput(prompt)).pipe(
            Effect.catch((error) =>
              Effect.logInfo(
                'The agent did not take a steer; it runs as the next turn',
                error,
              ),
            ),
            Effect.forkChild,
          );
        },
        { discard: true },
      ),
    ),
  );
};

export const run = (self: SessionSelf, turnId: string) =>
  Effect.gen(function* () {
    const { model, state } = yield* self.get;
    const sessionId = model.session.id;
    const prompt = state._tag === 'Running' ? state.prompt : null;
    const desk = yield* (yield* Desks).of(sessionId);
    const store = yield* Store;
    const harnessName = model.session.harness;
    const write = (out: RawOut, source: 'engine' | 'harness' = 'engine') =>
      EngineRaw.stamp(
        {
          sessionId,
          turnId,
          harness: source === 'engine' ? 'engine' : harnessName,
        },
        out,
      ).pipe(Effect.flatMap(store.appendRaw));
    /** The stream's own end, once it came. */
    let turnEnd: TurnEnd | undefined;
    let ended: TurnEndStatus | undefined;
    let nativeId: string | undefined;

    const end = (status: TurnEndStatus, error?: string) =>
      Effect.gen(function* () {
        if (ended) return;
        ended = turnEnd?.status ?? status;
        const why = turnEnd ? turnEnd.error : error;
        yield* write(
          EngineRaw.turnEnded(ended, {
            ...(turnEnd?.forkPoint === undefined
              ? {}
              : { nativeTurnId: turnEnd.forkPoint }),
            ...(turnEnd?.shown
              ? { byHarness: true }
              : why === undefined
                ? {}
                : { error: why }),
          }),
        );
      });

    /** Tells the Session the agent's native id once it has a new one. */
    const noteNativeId = Effect.gen(function* () {
      const agent = yield* desk.opened;
      const now = agent && (yield* agent.nativeId);
      if (now === undefined || now === nativeId) return;
      nativeId = now;
      yield* self.send({ _tag: 'NativeId', nativeId: now });
    });

    /** A steer the agent took, recorded where it joined the turn. */
    const steered = (id: string) =>
      Effect.gen(function* () {
        const { steers } = yield* ofTurn(self, turnId);
        const taken = steers.find((each) => each.id === id);
        if (taken === undefined) return;
        yield* write(
          EngineRaw.turnStarted({
            text: taken.text,
            steered: true,
            attachments: taken.attachments,
          }),
        );
        yield* self.send({ _tag: 'Steered', turnId, id });
      });

    const keep = (out: TurnOut) => {
      if (isRecord(out))
        return write(out, 'harness').pipe(Effect.andThen(noteNativeId));
      if (out._tag === 'TurnSteered') return steered(out.id);
      return Effect.sync(() => {
        turnEnd = out;
      });
    };

    /** The Turn: the user's, or the one the agent started. */
    const handleOf = (agent: HarnessSession) =>
      prompt === null
        ? Effect.map(
            desk.takeAgentTurn,
            Option.getOrElse(() => noTurn),
          )
        : Effect.succeed(agent.turn(toTurnInput(prompt)));

    const stream = Effect.gen(function* () {
      const agent = yield* desk.agent;
      if ((yield* ofTurn(self, turnId)).cancelling) return;
      const handle = yield* handleOf(agent);
      yield* Effect.forkChild(steerAll(self, turnId, handle));
      yield* Stream.runForEach(handle.out, keep);
    });

    const finish = (failed: HarnessError | undefined) =>
      Effect.gen(function* () {
        const { cancelling } = yield* ofTurn(self, turnId);
        if (failed) {
          // The agent failing outweighs an end it reported before.
          turnEnd = undefined;
          yield* end('failed', failed.message);
          yield* desk.reset;
        } else if (turnEnd) yield* end(turnEnd.status);
        else if (cancelling) yield* end('cancelled');
        else yield* end('failed', 'The agent stopped without ending the turn');
        yield* noteNativeId;
      });

    const body = Effect.gen(function* () {
      yield* write(started(prompt));
      const result = yield* Effect.result(stream);
      yield* finish(result._tag === 'Failure' ? result.failure : undefined);
    });

    // Stopped from outside: by a forced cancel, which ends it cancelled, or
    // by the Session stopping, which leaves it for the next start to find.
    const stopped = Effect.gen(function* () {
      const agent = yield* desk.opened;
      if (agent) yield* agent.cancel;
      if ((yield* ofTurn(self, turnId)).cancelling) yield* end('cancelled');
      yield* desk.reset;
    });

    yield* body.pipe(Effect.onInterrupt(() => stopped));
    // Sent once ended: the Session stopping this Worker as it hears it must
    // not reach the agent, which may be running the next Turn.
    yield* self.send({
      _tag: 'TurnEnded',
      turnId,
      status: ended ?? 'done',
      at: yield* Clock.currentTimeMillis,
    });
  });

/** The cancel Worker: asks the agent to stop, and ends the Turn if it will not. */
export const cancel = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model, state } = yield* self.get;
    if (state._tag !== 'Running') return;
    const desk = yield* (yield* Desks).of(model.session.id);
    const agent = yield* desk.opened;
    if (agent) yield* agent.cancel;
    yield* Effect.sleep(CANCEL_GRACE);
    yield* Effect.logWarning('The agent did not stop in time; ending the turn');
    yield* self.send({
      _tag: 'TurnEnded',
      turnId: state.turnId,
      status: 'cancelled',
      at: yield* Clock.currentTimeMillis,
    });
  });
