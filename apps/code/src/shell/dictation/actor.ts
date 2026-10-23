import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';
import { AiClients } from '@kestack/ai-toolkit/client';
import { Actor, Command } from '@kestack/kabuki';
import { Recorder } from '../recorder/index.ts';
import { answeringOn, readyOn, transcribe } from './api.ts';
import { machineFor } from './choose.ts';

/*
 * The Dictation: the one the app has, a Child of the root page for as long
 * as the app is drawn, so it carries on while the user moves between
 * Sessions, Pickers and Settings. Space, Ctrl+Space and the Status Line's
 * mic button ask the root page, which hands each ask on through
 * `Dictations`.
 *
 * 1. Hear     each listed Machine: whether its Speech to Text is Ready and
 *             whether it answers, so a Dictation knows where it can be
 *             transcribed before it starts.
 * 2. Start    with no Machine to transcribe on, it does not start, and says
 *             why for a few seconds; else the microphone chosen in Device
 *             State opens, and denied or missing, says why the same way.
 *             One chosen that is not there falls back to the default, and
 *             says so.
 * 3. Record   the level, for the meter, an eighth of a second at a time; at
 *             five minutes it stops itself. Another microphone chosen
 *             while it records is recorded from for the rest of it, into
 *             the same clip.
 * 4. Stop     the Draft open now is where its text goes, and the Machine is
 *             the open Session's, if it can, else any that can. While it
 *             transcribes, that Draft shows it is coming.
 * 5. Text     the Draft takes it and says so, and the Dictation is done;
 *             nothing heard, it says so. Refused, the Draft offers a
 *             retry, from the clip the Recorder keeps until the next
 *             Dictation.
 */

/** A Draft: the new session's of a project, or a Session's. */
const Target = Schema.Struct({
  machineId: Schema.String,
  projectId: Schema.String,
  sessionId: Schema.NullOr(Schema.String),
});

/** What the app asks of the Dictation, through the root page. */
const asks = {
  /** Start one, or stop the one recording. */
  Toggle: {},
  /** Transcribe the failed one again. */
  Retry: { id: Schema.Finite },
  /** Its Draft put the text in. */
  Took: { id: Schema.Finite },
};
export const Ask = Schema.TaggedUnion(asks);

/** How long it records at most, in ms. */
export const LIMIT = 5 * 60_000;

/** How long why it could not start is shown, in ms. */
const NOTICE = 4_000;

/** Between the root page, which hears the app's asks, and the Dictation. */
export class Dictations extends Context.Service<
  Dictations,
  { readonly asked: Queue.Queue<typeof Ask.Type> }
>()('code/Dictations') {
  static readonly layer: Layer.Layer<Dictations> = Layer.effect(
    Dictations,
    Effect.map(Queue.unbounded<typeof Ask.Type>(), (asked) => ({ asked })),
  );
}

const Hearing = Schema.Struct({
  ready: Schema.Boolean,
  answering: Schema.Boolean,
});

const Props = Schema.Struct({
  machineIds: Schema.Array(Schema.String),
  /** The microphone chosen in Device State, by `deviceId`; null for the default. */
  microphone: Schema.NullOr(Schema.String),
  /** The Draft open now, if any. */
  place: Schema.NullOr(Target),
});
type Props = typeof Props.Type;

const Model = Schema.Struct({
  /** How many have started, so each has its own id. */
  count: Schema.Finite,
  /** What each Machine can do for it, by id. */
  machines: Schema.Record(Schema.String, Hearing),
  /** Why the last one could not start or came to nothing, while it shows; `at` tells one from the next. */
  notice: Schema.NullOr(
    Schema.Struct({ reason: Schema.String, at: Schema.Number }),
  ),
});
type Model = typeof Model.Type;

/** Where the Dictation is. */
export const State = Schema.TaggedUnion({
  Idle: {},
  /** Waiting for the microphone. */
  Starting: { id: Schema.Finite },
  /**
   * `heard`: the Time of the level last heard; `microphone`: the name of
   * the one heard; `using`: the one chosen it was opened for, by `deviceId`.
   */
  Recording: {
    id: Schema.Finite,
    started: Schema.Number,
    level: Schema.Number,
    heard: Schema.Number,
    microphone: Schema.String,
    using: Schema.NullOr(Schema.String),
  },
  /** `target`: the Draft its text goes to; null, the next one drawn. */
  Transcribing: {
    id: Schema.Finite,
    target: Schema.NullOr(Target),
    machineId: Schema.String,
  },
  Failed: {
    id: Schema.Finite,
    target: Schema.NullOr(Target),
    reason: Schema.String,
  },
  /** The text, until its Draft takes it. */
  Done: {
    id: Schema.Finite,
    target: Schema.NullOr(Target),
    text: Schema.String,
  },
});

export const Dictation = Actor.define('Dictation', {
  requires: [AiClients, Recorder, Dictations],
  props: Props,
  model: Model,
  state: State,
  message: Schema.TaggedUnion({
    ...asks,
    Opened: {
      microphone: Schema.String,
      fellBack: Schema.Boolean,
      using: Schema.NullOr(Schema.String),
    },
    /** Opened `using` while it records: the one heard now, or why not. */
    Switched: {
      using: Schema.NullOr(Schema.String),
      heard: Schema.NullOr(
        Schema.Struct({ microphone: Schema.String, fellBack: Schema.Boolean }),
      ),
      reason: Schema.NullOr(Schema.String),
    },
    Unable: { reason: Schema.String },
    Level: { level: Schema.Number },
    Stop: {},
    Said: { id: Schema.Finite, text: Schema.String },
    NotSaid: { id: Schema.Finite, reason: Schema.String },
    Ready: { machineId: Schema.String, ready: Schema.Boolean },
    Answering: { machineId: Schema.String, answering: Schema.Boolean },
    Dismiss: { at: Schema.Number },
  }),
});

/** Hands an ask to the Dictation; the root page's Command. */
export const ask = Command.make('AskDictation', {
  args: Ask,
  run: (ask) =>
    Effect.flatMap(Dictations, ({ asked }) =>
      Effect.asVoid(Queue.offer(asked, ask)),
    ),
});

const noticed = (model: Model, reason: string, at: number) => ({
  model: { ...model, notice: { reason, at } },
});

const idle = { _tag: 'Idle' as const };

const FELL_BACK =
  "The microphone chosen isn't connected, so the default one is recording";

/** Where it is transcribed, and where its text goes: from the Draft open now. */
const transcribing = (
  model: Model,
  props: Props,
  id: number,
  target: typeof Target.Type | null,
) => {
  const choice = machineFor(
    model.machines,
    props.machineIds,
    target?.machineId ?? null,
  );
  return choice._tag === 'On'
    ? {
        state: {
          _tag: 'Transcribing' as const,
          id,
          target,
          machineId: choice.machineId,
        },
      }
    : {
        state: { _tag: 'Failed' as const, id, target, reason: choice.reason },
      };
};

// 2. Start
const start = (model: Model, props: Props, at: number) => {
  const choice = machineFor(
    model.machines,
    props.machineIds,
    props.place?.machineId ?? null,
  );
  if (choice._tag === 'None') return noticed(model, choice.reason, at);
  return {
    model: { ...model, count: model.count + 1, notice: null },
    state: { _tag: 'Starting' as const, id: model.count + 1 },
  };
};

/** The Dictation the root page holds, and its asks. */
export const DictationLive = Actor.build(Dictation, {
  init: () => ({
    model: { count: 0, machines: {}, notice: null },
    state: idle,
  }),
  workers: {
    // 1. Hear
    ready: {
      each: ({ props }) => props.machineIds,
      run: (self, machineId) =>
        Stream.runForEach(readyOn(machineId), (ready) =>
          self.send({ _tag: 'Ready', machineId, ready }),
        ),
    },
    answering: {
      each: ({ props }) => props.machineIds,
      run: (self, machineId) =>
        Stream.runForEach(answeringOn(machineId), (answering) =>
          self.send({ _tag: 'Answering', machineId, answering }),
        ),
    },
    asks: {
      run: (self) =>
        Effect.flatMap(Dictations, ({ asked }) =>
          Stream.runForEach(Stream.fromQueue(asked), self.send),
        ),
    },
    // 3. Record: one Worker from the microphone opening to the stop, so
    // the clip is one.
    record: {
      each: ({ state }) =>
        state._tag === 'Starting' || state._tag === 'Recording'
          ? [String(state.id)]
          : [],
      run: (self) =>
        Effect.gen(function* () {
          const { props: asked } = yield* self.get;
          const using = asked.microphone;
          const { heard, levels } = yield* (yield* Recorder).record(using);
          const { state } = yield* self.get;
          if (state._tag === 'Starting')
            yield* self.send({
              _tag: 'Opened',
              microphone: heard.name,
              fellBack: heard.fellBack,
              using,
            });
          const now = yield* self.now;
          const { state: recording } = yield* self.get;
          const started =
            recording._tag === 'Recording' ? recording.started : now;
          const stop = self.send({ _tag: 'Stop' });
          yield* Effect.raceFirst(
            Stream.runForEach(levels, (level) =>
              self.send({ _tag: 'Level', level }),
            ).pipe(Effect.andThen(stop)),
            Effect.sleep(Math.max(0, started + LIMIT - now)).pipe(
              Effect.andThen(stop),
            ),
          );
        }).pipe(
          Effect.catch(({ reason }) => self.send({ _tag: 'Unable', reason })),
        ),
    },
    // 3. Record: another microphone chosen, switched to in the same clip.
    switch: {
      each: ({ state, props }) =>
        state._tag === 'Recording' && state.using !== props.microphone
          ? [`${state.id} ${props.microphone ?? ''}`]
          : [],
      run: (self) =>
        Effect.gen(function* () {
          const using = (yield* self.get).props.microphone;
          const switched = yield* Effect.result(
            (yield* Recorder).switchTo(using),
          );
          yield* self.send(
            switched._tag === 'Failure'
              ? {
                  _tag: 'Switched',
                  using,
                  heard: null,
                  reason: switched.failure.reason,
                }
              : {
                  _tag: 'Switched',
                  using,
                  heard:
                    switched.success === null
                      ? null
                      : {
                          microphone: switched.success.name,
                          fellBack: switched.success.fellBack,
                        },
                  reason: null,
                },
          );
        }),
    },
    // 4. Stop: the clip, once the microphone has let go of it.
    transcribe: {
      each: ({ state }) =>
        state._tag === 'Transcribing' ? [String(state.id)] : [],
      run: (self) =>
        Effect.gen(function* () {
          const { state } = yield* self.get;
          if (state._tag !== 'Transcribing') return;
          const clip = yield* (yield* Recorder).clip;
          const result = yield* transcribe(state.machineId, clip);
          yield* self.send(
            result._tag === 'Said'
              ? { _tag: 'Said', id: state.id, text: result.text }
              : { _tag: 'NotSaid', id: state.id, reason: result.reason },
          );
        }),
    },
    notice: {
      each: ({ model }) =>
        model.notice === null ? [] : [String(model.notice.at)],
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          if (model.notice === null) return;
          const { at } = model.notice;
          yield* Effect.sleep(Math.max(0, at + NOTICE - (yield* self.now)));
          yield* self.send({ _tag: 'Dismiss', at });
        }),
    },
  },
  state: {
    Idle: {
      on: { Toggle: (_, { model, props, at }) => start(model, props, at) },
    },
    Starting: {
      on: {
        // Asked again before the microphone opened: nothing to keep.
        Toggle: () => ({ state: idle }),
        Opened: ({ microphone, fellBack, using }, { model, state, at }) => ({
          ...(fellBack ? noticed(model, FELL_BACK, at) : {}),
          state: {
            _tag: 'Recording',
            id: state.id,
            started: at,
            level: 0,
            heard: at,
            microphone,
            using,
          },
        }),
        Unable: ({ reason }, { model, at }) => ({
          ...noticed(model, reason, at),
          state: idle,
        }),
      },
    },
    Recording: {
      on: {
        Level: ({ level }, { state, at }) => ({
          state: { ...state, level, heard: at },
        }),
        // Failing, the old one carries on, and it is not tried again.
        Switched: ({ using, heard, reason }, { model, state, at }) => ({
          ...(reason !== null
            ? noticed(model, `Couldn't switch the microphone: ${reason}`, at)
            : heard?.fellBack
              ? noticed(model, FELL_BACK, at)
              : {}),
          state: {
            ...state,
            using,
            ...(heard === null ? {} : { microphone: heard.microphone }),
          },
        }),
        Toggle: (_, { model, props, state }) =>
          transcribing(model, props, state.id, props.place),
        Stop: (_, { model, props, state }) =>
          transcribing(model, props, state.id, props.place),
      },
    },
    Transcribing: {
      on: {
        Toggle: (_, { model, at }) =>
          noticed(model, 'Still writing out the last Dictation', at),
        // 5. Text
        Said: ({ id, text }, { model, state, at }) => {
          if (id !== state.id) return {};
          const said = text.trim();
          return said === ''
            ? { ...noticed(model, 'Heard nothing to write', at), state: idle }
            : {
                state: {
                  _tag: 'Done',
                  id,
                  target: state.target,
                  text: said,
                },
              };
        },
        NotSaid: ({ id, reason }, { state }) =>
          id !== state.id
            ? {}
            : {
                state: {
                  _tag: 'Failed',
                  id,
                  target: state.target,
                  reason,
                },
              },
      },
    },
    Failed: {
      on: {
        Toggle: (_, { model, props, at }) => start(model, props, at),
        Retry: ({ id }, { model, props, state }) =>
          id !== state.id
            ? {}
            : transcribing(model, props, state.id, state.target),
      },
    },
    Done: {
      on: {
        Toggle: (_, { model, props, at }) => start(model, props, at),
        Took: ({ id }, { state }) => (id === state.id ? { state: idle } : {}),
      },
    },
  },
  on: {
    Ready: ({ machineId, ready }, { model }) => ({
      model: {
        ...model,
        machines: {
          ...model.machines,
          [machineId]: {
            answering: model.machines[machineId]?.answering ?? false,
            ready,
          },
        },
      },
    }),
    Answering: ({ machineId, answering }, { model }) => ({
      model: {
        ...model,
        machines: {
          ...model.machines,
          [machineId]: {
            ready: model.machines[machineId]?.ready ?? false,
            answering,
          },
        },
      },
    }),
    Dismiss: ({ at }, { model }) =>
      model.notice?.at === at ? { model: { ...model, notice: null } } : {},
  },
});
