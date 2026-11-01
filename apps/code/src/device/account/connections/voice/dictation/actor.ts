import { Effect, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../../store.ts';
import { Dictations, Owner } from '../voice.ts';
import { type Known, Connections } from '../../connections.ts';
import { Recorder } from '../recorder/index.ts';
import { transcribe } from './api.ts';
import { connectionFor } from './choose.ts';

/*
 * The Dictation: the one the app has, a Child of Voice for as long as the
 * Account is drawn, so it carries on while the user moves between Sessions,
 * Pickers and Settings. Space, Ctrl+Space, a field's mic and the header's
 * cancel ask Voice, which hands each ask on through `Dictations`. Each one
 * is for its Owner, the field that started it, named as it starts: its
 * text goes there, wherever the user is as it stops, and every other
 * field sees only that one is recording, not for it.
 *
 * 1. Hear     each listed Connection, as `Connections` says it: whether its
 *             Speech to Text is Ready, as its setup holds it, and
 *             whether it answers, so a Dictation knows where it can be
 *             transcribed before it starts.
 * 2. Start    for its Owner; with no Owner, as Space in Settings, or no
 *             Connection to transcribe on, it does not start, and says
 *             why for a few seconds; else it is Waiting while the
 *             microphone chosen in Preferences opens, and denied or
 *             missing, says why the same way. One chosen that is not there
 *             falls back to the default, and says so. Asked again while it
 *             waits, it lets go.
 * 3. Record   once the microphone is live: the level, for the meter, an eighth of a second at a time; at
 *             five minutes it stops itself. Another microphone chosen
 *             while it records is recorded from for the rest of it, into
 *             the same clip.
 *             Cancelled, the microphone lets go and nothing goes into a
 *             field, even once it is being transcribed.
 * 4. Stop     from anywhere: transcribed on its Owner's Connection, if it
 *             can, else any that can. While it transcribes, its Owner
 *             shows it is coming.
 * 5. Text     kept for its Owner until it takes it and says so; one not
 *             drawn now takes it once it is drawn again. Nothing heard, it
 *             says so. Refused, its Owner offers a retry, from the clip
 *             the Recorder keeps until the next Dictation.
 */

/** A Dictation's text, kept until its Owner, by key, takes it. */
const Text = Schema.Struct({
  id: Schema.Finite,
  owner: Schema.String,
  text: Schema.String,
});

/** How long it records at most, in ms. */
export const LIMIT = 5 * 60_000;

/** How long why it could not start is shown, in ms. */
const NOTICE = 4_000;

const Hearing = Schema.Struct({
  ready: Schema.Boolean,
  answering: Schema.Boolean,
  /** How far its Speech to Text has downloaded, 0 to 1, while it does. */
  downloading: Schema.NullOr(Schema.Number),
});

/** How far a download has come, in whole percent so its progress draws rarely. */
const progressOf = (done: number, total: number | null) =>
  total === null || total === 0 ? 0 : Math.floor((done / total) * 100) / 100;

/** What `Connections` says, as far as a Dictation needs it. */
const heardOf = ({ connections, links, setups }: Known) => {
  const listed = (connections ?? []).map(({ id }) => id);
  return {
    listed,
    connections: Object.fromEntries(
      listed.map((id) => {
        const speech = setups[id]?.speech;
        return [
          id,
          {
            ready: speech?._tag === 'Ready',
            answering: links[id] === 'linked',
            downloading:
              speech?._tag === 'Downloading'
                ? progressOf(speech.done, speech.total)
                : null,
          },
        ];
      }),
    ),
  };
};

const sameHeard = Schema.toEquivalence(
  Schema.Struct({
    listed: Schema.Array(Schema.String),
    connections: Schema.Record(Schema.String, Hearing),
  }),
);

const Props = Schema.Struct({
  /** Whether its Account is the one drawn: only then does it hear asks. */
  drawn: Schema.Boolean,
});

const Model = Schema.Struct({
  /** How many have started, so each has its own id. */
  count: Schema.Finite,
  /** The listed Connections' ids, in the list's order. */
  listed: Schema.Array(Schema.String),
  /** What each Connection can do for it, by id. */
  connections: Schema.Record(Schema.String, Hearing),
  /** The microphone chosen in Preferences, by `deviceId`; null for the default. */
  microphone: Schema.NullOr(Schema.String),
  /** Text not yet in its field. */
  texts: Schema.Array(Text),
  /** Why the last one could not start or came to nothing, while it shows; `at` tells one from the next. */
  notice: Schema.NullOr(
    Schema.Struct({ reason: Schema.String, at: Schema.Number }),
  ),
});
type Model = typeof Model.Type;

/** Where the Dictation is. */
export const State = Schema.TaggedUnion({
  Idle: {},
  /** The microphone asked for and not yet live, as while the browser asks for permission. */
  Waiting: { id: Schema.Finite, owner: Owner },
  /**
   * `heard`: the Time of the level last heard; `microphone`: the name of
   * the one heard; `using`: the one chosen it was opened for, by `deviceId`.
   */
  Recording: {
    id: Schema.Finite,
    owner: Owner,
    started: Schema.Number,
    level: Schema.Number,
    heard: Schema.Number,
    microphone: Schema.String,
    using: Schema.NullOr(Schema.String),
  },
  Transcribing: {
    id: Schema.Finite,
    owner: Owner,
    connectionId: Schema.String,
  },
  Failed: {
    id: Schema.Finite,
    owner: Owner,
    reason: Schema.String,
  },
});

export const Dictation = Actor.define('Dictation', {
  requires: [CodeClients, Connections, Preferences, Recorder, Dictations],
  props: Props,
  model: Model,
  state: State,
  message: Schema.TaggedUnion({
    // What the app asks, through `Dictations`.
    Toggle: { owner: Schema.NullOr(Owner) },
    Cancel: {},
    Retry: { id: Schema.Finite },
    Took: { id: Schema.Finite },
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
    ConnectionsHeard: {
      listed: Schema.Array(Schema.String),
      connections: Schema.Record(Schema.String, Hearing),
    },
    MicrophoneRead: { microphone: Schema.NullOr(Schema.String) },
    Dismiss: { at: Schema.Number },
  }),
});

const noticed = (model: Model, reason: string, at: number) => ({
  model: { ...model, notice: { reason, at } },
});

const idle = { _tag: 'Idle' as const };

const FELL_BACK =
  "The microphone chosen isn't connected, so the default one is recording";

const NO_OWNER = 'Open a Draft to dictate into';

/** Where it is transcribed: on its Owner's Connection, if it can. */
const transcribing = (model: Model, id: number, owner: Owner) => {
  const choice = connectionFor(
    model.connections,
    model.listed,
    owner.connectionId,
  );
  return choice._tag === 'On'
    ? {
        state: {
          _tag: 'Transcribing' as const,
          id,
          owner,
          connectionId: choice.connectionId,
        },
      }
    : {
        state: { _tag: 'Failed' as const, id, owner, reason: choice.reason },
      };
};

// 2. Start
const start = (model: Model, owner: Owner | null, at: number) => {
  if (owner === null) return noticed(model, NO_OWNER, at);
  const choice = connectionFor(
    model.connections,
    model.listed,
    owner.connectionId,
  );
  if (choice._tag === 'None') return noticed(model, choice.reason, at);
  return {
    model: { ...model, count: model.count + 1, notice: null },
    state: { _tag: 'Waiting' as const, id: model.count + 1, owner },
  };
};

/** The Dictation Voice holds, and its asks. */
export const DictationLive = Dictation.build({
  init: () => ({
    model: {
      count: 0,
      listed: [],
      connections: {},
      microphone: null,
      texts: [],
      notice: null,
    },
    state: idle,
  }),
  workers: {
    // 1. Hear: what `Connections` says of each, only as far as it matters
    // here, so a Heartbeat changes nothing, and a download's progress
    // only by the percent.
    connections: {
      run: (self) =>
        Effect.flatMap(Connections, ({ state }) =>
          state.pipe(
            Stream.map(heardOf),
            Stream.changesWith(sameHeard),
            Stream.runForEach((heard) =>
              self.send({ _tag: 'ConnectionsHeard', ...heard }),
            ),
          ),
        ),
    },
    // 2. Start: the microphone chosen, read again after every write.
    microphone: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), Preferences.changes).pipe(
          Stream.mapEffect(() =>
            Effect.map(Preferences.read, ({ microphone }) => microphone),
          ),
          Stream.changes,
          Stream.runForEach((microphone) =>
            self.send({ _tag: 'MicrophoneRead', microphone }),
          ),
        ),
    },
    asks: {
      while: ({ props }) => props.drawn,
      run: (self) =>
        Effect.flatMap(Dictations, ({ asked }) =>
          Stream.runForEach(Stream.fromQueue(asked), self.send),
        ),
    },
    // 3. Record: one Worker from the microphone opening to the stop, so
    // the clip is one.
    record: {
      each: ({ state }) =>
        state._tag === 'Waiting' || state._tag === 'Recording'
          ? [String(state.id)]
          : [],
      run: (self) =>
        Effect.gen(function* () {
          const { model: asked } = yield* self.get;
          const using = asked.microphone;
          const { heard, levels } = yield* (yield* Recorder).record(using);
          const { state } = yield* self.get;
          if (state._tag === 'Waiting')
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
      each: ({ state, model }) =>
        state._tag === 'Recording' && state.using !== model.microphone
          ? [`${state.id} ${model.microphone ?? ''}`]
          : [],
      run: (self) =>
        Effect.gen(function* () {
          const using = (yield* self.get).model.microphone;
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
          const result = yield* transcribe(state.connectionId, clip);
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
  states: {
    Idle: {
      on: {
        Toggle: ({ owner }, { model, at }) => start(model, owner, at),
      },
    },
    Waiting: {
      on: {
        // Asked again before the microphone opened: nothing to keep.
        Toggle: () => ({ state: idle }),
        Opened: ({ microphone, fellBack, using }, { model, state, at }) => ({
          ...(fellBack ? noticed(model, FELL_BACK, at) : {}),
          state: {
            _tag: 'Recording',
            id: state.id,
            owner: state.owner,
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
        // 4. Stop: from anywhere, for its Owner.
        Toggle: (_, { model, state }) =>
          transcribing(model, state.id, state.owner),
        Stop: (_, { model, state }) =>
          transcribing(model, state.id, state.owner),
      },
    },
    Transcribing: {
      on: {
        Toggle: (_, { model, at }) =>
          noticed(model, 'Still writing out the last Dictation', at),
        // 5. Text: kept for its Owner, the last one for it.
        Said: ({ id, text }, { model, state, at }) => {
          if (id !== state.id) return {};
          const said = text.trim();
          if (said === '')
            return {
              ...noticed(model, 'Heard nothing to write', at),
              state: idle,
            };
          const owner = state.owner.key;
          return {
            model: {
              ...model,
              texts: [
                ...model.texts.filter((each) => each.owner !== owner),
                { id, owner, text: said },
              ],
            },
            state: idle,
          };
        },
        NotSaid: ({ id, reason }, { state }) =>
          id !== state.id
            ? {}
            : {
                state: {
                  _tag: 'Failed',
                  id,
                  owner: state.owner,
                  reason,
                },
              },
      },
    },
    Failed: {
      on: {
        Toggle: ({ owner }, { model, at }) => start(model, owner, at),
        Retry: ({ id }, { model, state }) =>
          id !== state.id ? {} : transcribing(model, state.id, state.owner),
      },
    },
  },
  on: {
    // Thrown away wherever it is, its text too if it has come and its
    // field has not taken it: a Cancel that comes after a Stop still wins.
    // What came for a field before it stays.
    Cancel: (_, { model }) => ({
      model: {
        ...model,
        texts: model.texts.filter(({ id }) => id !== model.count),
      },
      state: idle,
    }),
    // 5. Text: taken by its field.
    Took: ({ id }, { model }) => ({
      model: { ...model, texts: model.texts.filter((each) => each.id !== id) },
    }),
    ConnectionsHeard: ({ listed, connections }, { model }) => ({
      model: { ...model, listed, connections },
    }),
    MicrophoneRead: ({ microphone }, { model }) => ({
      model: { ...model, microphone },
    }),
    Dismiss: ({ at }, { model }) =>
      model.notice?.at === at ? { model: { ...model, notice: null } } : {},
  },
});
