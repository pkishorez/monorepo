import { Duration, Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki';
import type { HarnessError, RawOut } from '../../../../harness/index.js';
import type { TurnEndStatus } from '../../../../projection/index.js';
import { Store } from '../../../../store/index.js';
import { EngineRaw } from '../../../engine-raw/index.js';
import { TurnContext } from './context.js';

/*
 * A Turn: one user message to the agent, and everything it emits until it is
 * idle again. It lives while its Session runs it.
 *
 * - run     writes `turn.started`, streams the agent's records into Raw, and
 *           writes `turn.ended` unless the harness ended the turn itself.
 * - steer   each message sent while it runs: a `turn.started` that steered,
 *           then the agent is told.
 * - cancel  while cancelling: tells the agent to stop; if it does not end in
 *           time, the Turn is ended from here, which stops it.
 */

/** How long an agent may take to stop after a cancel before the Turn is ended anyway. */
const CANCEL_GRACE = Duration.seconds(10);

const Steer = Schema.Struct({ id: Schema.String, text: Schema.String });

const Input = Schema.Struct({
  sessionId: Schema.String,
  turnId: Schema.String,
  text: Schema.String,
});

const Props = Schema.Struct({
  steers: Schema.Array(Steer),
  cancelling: Schema.Boolean,
});

const Model = Schema.Struct({
  ...Input.fields,
  /** The agent has started the turn, so it can be steered. */
  streaming: Schema.Boolean,
});

const Message = Schema.TaggedUnion({ Streaming: {} });

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
    const { harness } = yield* TurnContext;
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

/** Whether the harness's own projection of a record ends the turn. */
const endsTurn = (
  project: (raw: Parameters<typeof EngineRaw.project>[0]) => {
    readonly parts: ReadonlyArray<{ readonly type: string }>;
  } | null,
  raw: Parameters<typeof EngineRaw.project>[0],
) => {
  try {
    return (
      project(raw)?.parts.some((part) => part.type === 'turnEnded') ?? false
    );
  } catch {
    return false;
  }
};

const run = (self: TurnSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const context = yield* TurnContext;
    const write = yield* writer(model);
    let ended = false;
    let nativeId: string | undefined;

    const end = (status: TurnEndStatus, error?: string) =>
      Effect.suspend(() => {
        if (ended) return Effect.void;
        ended = true;
        return Effect.asVoid(write(EngineRaw.turnEnded(status, error)));
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
        if (endsTurn(context.harness.project, saved.value)) ended = true;
        yield* noteNativeId;
      });

    const stream = Effect.gen(function* () {
      const agent = yield* context.agent;
      if ((yield* self.get).props.cancelling) return;
      yield* self.send({ _tag: 'Streaming' });
      yield* Stream.runForEach(agent.turn(model.text), keep);
    });

    const finish = (failed: HarnessError | undefined) =>
      Effect.gen(function* () {
        const { props } = yield* self.get;
        if (failed) {
          yield* end('failed', failed.message);
          yield* context.reset;
        } else yield* end(props.cancelling ? 'cancelled' : 'done');
        yield* noteNativeId;
      });

    const body = Effect.gen(function* () {
      yield* write(EngineRaw.turnStarted(model.text, false));
      const result = yield* Effect.result(stream);
      yield* finish(result._tag === 'Failure' ? result.failure : undefined);
      yield* context.report({ _tag: 'TurnEnded', turnId: model.turnId });
    });

    // Stopped from outside, by a forced cancel or the Session stopping.
    const stopped = Effect.gen(function* () {
      const agent = yield* context.opened;
      if (agent) yield* agent.cancel;
      yield* end('cancelled');
      yield* context.reset;
    });

    yield* body.pipe(Effect.onInterrupt(() => stopped));
  });

const steer = (self: TurnSelf, id: string) =>
  Effect.gen(function* () {
    const { model, props } = yield* self.get;
    const text = props.steers.find((each) => each.id === id)?.text;
    if (text === undefined) return;
    const context = yield* TurnContext;
    const write = yield* writer(model);
    yield* write(EngineRaw.turnStarted(text, true));
    const steered = yield* Effect.result(
      Effect.flatMap(context.agent, (agent) => agent.steer(text)),
    );
    if (steered._tag === 'Failure')
      yield* write(
        EngineRaw.failure(`Could not steer: ${steered.failure.message}`),
      );
  });

const cancel = () =>
  Effect.gen(function* () {
    const context = yield* TurnContext;
    const agent = yield* context.opened;
    if (agent) yield* agent.cancel;
    yield* Effect.sleep(CANCEL_GRACE);
    yield* Effect.logWarning('The agent did not stop in time; ending the turn');
  });

export const Turn = Actor.build(
  Actor.define('Turn', {
    requires: [TurnContext, Store],
    input: Input,
    props: Props,
    model: Model,
    message: Message,
  }),
  {
    init: (input) => ({ model: { ...input, streaming: false } }),
    on: {
      Streaming: (_, { model }) => ({ model: { ...model, streaming: true } }),
    },
    workers: {
      run: { run: (self) => run(self) },
      steer: {
        each: ({ model, props }) =>
          model.streaming ? props.steers.map((each) => each.id) : [],
        run: (self, id) => steer(self, id),
      },
      cancel: {
        while: ({ props }) => props.cancelling,
        run: (self) =>
          cancel().pipe(
            Effect.andThen(
              Effect.flatMap(self.get, ({ model }) =>
                Effect.flatMap(TurnContext, (context) =>
                  context.report({ _tag: 'TurnEnded', turnId: model.turnId }),
                ),
              ),
            ),
          ),
      },
    },
  },
);
