import { Duration, Effect, Option, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki';
import type {
  HarnessError,
  HarnessSession,
  RawOut,
} from '../../../../harness/index.js';
import type { Projected, TurnEndStatus } from '../../../../projection/index.js';
import type { Raw } from '../../../../raw/index.js';
import { Store } from '../../../../store/index.js';
import { Prompt, toTurnInput } from '../../../attachments/index.js';
import { EngineRaw } from '../../../engine-raw/index.js';
import { SessionAgent } from '../agent/index.js';

/*
 * A Turn: one user message to the agent, or a Turn the agent started on its
 * own, and everything it emits until it is idle again. It lives while its
 * Session runs it.
 *
 * - run     writes `turn.started`, streams the agent's records into Raw, and
 *           writes `turn.ended` with the Turn's Fork Point, if the agent
 *           gave it a new one.
 * - steer   each message sent while it runs, once the agent has been asked
 *           for the turn: the agent takes it when the turn has started,
 *           then a `turn.started` that steered records it and the Session
 *           hears. One the agent does not take, as when the turn ended
 *           first, the Session runs as the next Turn.
 * - cancel  while cancelling: tells the agent to stop; if it does not end in
 *           time, the Turn is ended from here, which stops it.
 *
 * A Turn stopped without a cancel, by the server stopping or its project
 * being removed, stops the agent and writes nothing: a stop may not get the
 * chance to, so the next start finds the turn cut off and ends it
 * `interrupted` (see bootstrap.ts).
 */

/** How long an agent may take to stop after a cancel before the Turn is ended anyway. */
const CANCEL_GRACE = Duration.seconds(10);

const Input = Schema.Struct({
  sessionId: Schema.String,
  turnId: Schema.String,
  /** The user message it runs; null for a Turn the agent started. */
  prompt: Schema.NullOr(Prompt),
});

const Props = Schema.Struct({
  steers: Schema.Array(Prompt),
  cancelling: Schema.Boolean,
});

const Model = Schema.Struct({
  ...Input.fields,
  /** The agent has been asked for the turn, so it takes steers. */
  accepting: Schema.Boolean,
});

const Message = Schema.TaggedUnion({ Accepting: {} });

type TurnSelf = Self<
  typeof Model.Type,
  { readonly _tag: 'Single' },
  typeof Message.Type,
  typeof Props.Type
>;

/** Writes what a writer emitted into Raw, as part of this turn. */
const writer = (model: typeof Model.Type) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const { harness } = yield* SessionAgent;
    return (out: RawOut, source: 'engine' | 'harness' = 'engine') =>
      EngineRaw.stamp(
        {
          sessionId: model.sessionId,
          turnId: model.turnId,
          harness: source === 'engine' ? 'engine' : harness.name,
        },
        out,
      ).pipe(Effect.flatMap(store.appendRaw));
  });

/** The harness's own projection of a record; null for one it cannot project. */
const projected = (
  project: (raw: Raw) => Projected | null,
  raw: Raw,
): Projected | null => {
  try {
    return project(raw);
  } catch {
    return null;
  }
};

/** How a projected record ends the turn, if it does. */
const endedAs = (message: Projected | null): TurnEndStatus | undefined => {
  for (const part of message?.parts ?? [])
    if (part.type === 'turnEnded') return part.status;
  return undefined;
};

const started = (prompt: Prompt | null) =>
  prompt === null
    ? EngineRaw.turnStarted({ text: '', steered: false, agentStarted: true })
    : EngineRaw.turnStarted({
        text: prompt.text,
        steered: false,
        attachments: prompt.attachments,
      });

/** The records of the Turn: the user's, or the one the agent started. */
const recordsOf = (
  agent: HarnessSession,
  prompt: Prompt | null,
): Effect.Effect<Stream.Stream<RawOut, HarnessError>, never, SessionAgent> =>
  prompt === null
    ? Effect.map(SessionAgent, (context) =>
        Stream.unwrap(
          Effect.map(
            context.takeAgentTurn,
            Option.getOrElse(() => Stream.empty),
          ),
        ),
      )
    : Effect.sync(() => agent.turn(toTurnInput(prompt)));

const run = (self: TurnSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const context = yield* SessionAgent;
    const write = yield* writer(model);
    /** How the harness's last record ended the turn, if it did. */
    let endedByHarness: TurnEndStatus | undefined;
    let ended: TurnEndStatus | undefined;
    let nativeId: string | undefined;
    /** The agent's last Fork Point before this Turn ran. */
    let forkPointBefore: string | undefined;

    /** The Fork Point this Turn made, if the agent moved on to a new one. */
    const forkPoint = Effect.gen(function* () {
      const agent = yield* context.opened;
      const now = agent && (yield* agent.lastTurnNativeId);
      return now === forkPointBefore ? undefined : now;
    });

    const end = (status: TurnEndStatus, error?: string) =>
      Effect.gen(function* () {
        if (ended) return;
        ended = endedByHarness ?? status;
        const nativeTurnId = yield* forkPoint;
        yield* write(
          EngineRaw.turnEnded(ended, {
            ...(nativeTurnId === undefined ? {} : { nativeTurnId }),
            ...(endedByHarness !== undefined
              ? { byHarness: true }
              : error === undefined
                ? {}
                : { error }),
          }),
        );
      });

    /** Tells the Session the agent's native id once it has a new one. */
    const noteNativeId = Effect.gen(function* () {
      const agent = yield* context.opened;
      const now = agent && (yield* agent.nativeId);
      if (now === undefined || now === nativeId) return;
      nativeId = now;
      yield* context.report({ _tag: 'NativeId', nativeId: now });
    });

    const keep = (out: RawOut) =>
      Effect.gen(function* () {
        const saved = yield* write(out, 'harness');
        // Only the result that closes the Turn says how it ended: the
        // harness ends the stream there. One for a Background Job's report
        // says nothing once the main agent answers on.
        const message = projected(context.harness.project, saved.value);
        const status = endedAs(message);
        if (status !== undefined) endedByHarness = status;
        else if (message?.role === 'assistant' && message.agentId === null)
          endedByHarness = undefined;
        yield* noteNativeId;
      });

    const stream = Effect.gen(function* () {
      const agent = yield* context.agent;
      forkPointBefore = yield* agent.lastTurnNativeId;
      if ((yield* self.get).props.cancelling) return;
      const records = yield* recordsOf(agent, model.prompt);
      // Asked for: the agent holds a steer until the turn has started.
      yield* self.send({ _tag: 'Accepting' });
      yield* Stream.runForEach(records, keep);
    });

    const finish = (failed: HarnessError | undefined) =>
      Effect.gen(function* () {
        const { props } = yield* self.get;
        if (failed) {
          // The agent failing outweighs any result it reported before.
          endedByHarness = undefined;
          yield* end('failed', failed.message);
          yield* context.reset;
        } else yield* end(props.cancelling ? 'cancelled' : 'done');
        yield* noteNativeId;
      });

    const body = Effect.gen(function* () {
      yield* write(started(model.prompt));
      const result = yield* Effect.result(stream);
      yield* finish(result._tag === 'Failure' ? result.failure : undefined);
    });

    // Stopped from outside: by a forced cancel, which ends it cancelled, or
    // by the Session stopping, which leaves it for the next start to find.
    const stopped = Effect.gen(function* () {
      const agent = yield* context.opened;
      if (agent) yield* agent.cancel;
      if ((yield* self.get).props.cancelling) yield* end('cancelled');
      yield* context.reset;
    });

    yield* body.pipe(Effect.onInterrupt(() => stopped));
    // Reported once ended: the Session stopping this Turn as it hears it
    // must not reach the agent, which may be running the next Turn.
    yield* context.report({
      _tag: 'TurnEnded',
      turnId: model.turnId,
      status: ended ?? 'done',
    });
  });

const steer = (self: TurnSelf, id: string) =>
  Effect.gen(function* () {
    const { model, props } = yield* self.get;
    const prompt = props.steers.find((each) => each.id === id);
    if (prompt === undefined) return;
    const context = yield* SessionAgent;
    const write = yield* writer(model);
    const steered = yield* Effect.result(
      Effect.flatMap(context.agent, (agent) =>
        agent.steer(toTurnInput(prompt)),
      ),
    );
    if (steered._tag === 'Failure')
      return yield* Effect.logInfo(
        'The agent did not take a steer; it runs as the next turn',
        steered.failure,
      );
    yield* write(
      EngineRaw.turnStarted({
        text: prompt.text,
        steered: true,
        attachments: prompt.attachments,
      }),
    );
    yield* context.report({ _tag: 'Steered', turnId: model.turnId, id });
  });

const cancel = () =>
  Effect.gen(function* () {
    const context = yield* SessionAgent;
    const agent = yield* context.opened;
    if (agent) yield* agent.cancel;
    yield* Effect.sleep(CANCEL_GRACE);
    yield* Effect.logWarning('The agent did not stop in time; ending the turn');
  });

export const Turn = Actor.build(
  Actor.define('Turn', {
    requires: [SessionAgent, Store],
    input: Input,
    props: Props,
    model: Model,
    message: Message,
  }),
  {
    init: (input) => ({ model: { ...input, accepting: false } }),
    on: {
      Accepting: (_, { model }) => ({ model: { ...model, accepting: true } }),
    },
    workers: {
      run: { run: (self) => run(self) },
      steer: {
        each: ({ model, props }) =>
          model.accepting ? props.steers.map((each) => each.id) : [],
        run: (self, id) => steer(self, id),
      },
      cancel: {
        while: ({ props }) => props.cancelling,
        run: (self) =>
          cancel().pipe(
            Effect.andThen(
              Effect.flatMap(self.get, ({ model }) =>
                Effect.flatMap(SessionAgent, (context) =>
                  context.report({
                    _tag: 'TurnEnded',
                    turnId: model.turnId,
                    status: 'cancelled',
                  }),
                ),
              ),
            ),
          ),
      },
    },
  },
);
