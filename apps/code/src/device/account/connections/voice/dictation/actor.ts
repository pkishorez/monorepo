import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../../store.ts';
import { Dictations, Owner } from '../voice.ts';
import { Recorder } from '../recorder/index.ts';
import { TakeLive } from './take/index.ts';

/*
 * The Dictation: the one the app has, a Child of Voice for as long as the
 * Account is drawn, so it carries on while the user moves between Sessions,
 * Pickers and Settings. Space, Ctrl+Space, a field's mic and the header's
 * cancel ask Voice, which hands each ask on through `Dictations`. Each one
 * is for its Owner, the field that started it, named as it starts: its
 * text goes there, wherever the user is as it stops, and every other
 * field sees only that one is recording, not for it.
 *
 * 1. Start   for its Owner; with no Owner, as Space in Settings, it does
 *            not start, and says why for a few seconds. Else it is
 *            Waiting while the microphone chosen in Preferences opens,
 *            whatever its Connection says: missing, it says why the same
 *            way; blocked, as iOS Safari at times does on its own, a
 *            dialog asks to load the page again. One chosen that is not
 *            there falls back to the default, and says so. Asked again
 *            while it waits, it lets go.
 * 2. Record  once the microphone is live: the level, for the meter, an
 *            eighth of a second at a time; at five minutes it stops
 *            itself. Another microphone chosen while it records is
 *            recorded from for the rest of it, into the same clip.
 * 3. Hear    its Take, a Child from the microphone opening to the text,
 *            sends the audio to its Owner's Connection as it is recorded,
 *            and says what is heard there: while the model downloads, how
 *            far; then the text so far.
 *            Cancelled, the microphone lets go and nothing goes into a
 *            field, even once it is being written out.
 * 4. Stop    from anywhere: the rest of the audio goes, and its Owner
 *            shows the text is coming.
 * 5. Text    the whole of it, once the Take is Done, kept for its Owner
 *            until it takes it and says so; one not drawn now takes it
 *            once it is drawn again. Nothing heard, it says so. Failed,
 *            its Owner offers a retry: a new Take from the clip the
 *            Recorder keeps until the next Dictation.
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

/** How far the model has downloaded on its Connection, while it does. */
const Downloading = Schema.NullOr(
  Schema.Struct({ done: Schema.Number, total: Schema.NullOr(Schema.Number) }),
);

const Props = Schema.Struct({
  /** Whether its Account is the one drawn: only then does it hear asks. */
  drawn: Schema.Boolean,
});

const Model = Schema.Struct({
  /** How many have started, so each has its own id. */
  count: Schema.Finite,
  /** The microphone chosen in Preferences, by `deviceId`; null for the default. */
  microphone: Schema.NullOr(Schema.String),
  /** Text not yet in its field. */
  texts: Schema.Array(Text),
  /**
   * The browser refused the microphone: iOS Safari at times does so on its
   * own, and only loading the page again lets it go. Shown until dismissed.
   */
  blocked: Schema.Boolean,
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
   * the one heard; `using`: the one chosen it was opened for, by
   * `deviceId`; `take`: its Take's id; `text`: what is heard so far.
   */
  Recording: {
    id: Schema.Finite,
    owner: Owner,
    started: Schema.Number,
    level: Schema.Number,
    heard: Schema.Number,
    microphone: Schema.String,
    using: Schema.NullOr(Schema.String),
    take: Schema.String,
    text: Schema.String,
    downloading: Downloading,
  },
  Transcribing: {
    id: Schema.Finite,
    owner: Owner,
    take: Schema.String,
    text: Schema.String,
    downloading: Downloading,
  },
  Failed: {
    id: Schema.Finite,
    owner: Owner,
    take: Schema.String,
    reason: Schema.String,
  },
});

export const Dictation = Actor.define('Dictation', {
  requires: [Preferences, Recorder, Dictations],
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
      take: Schema.String,
    },
    /** Opened `using` while it records: the one heard now, or why not. */
    Switched: {
      using: Schema.NullOr(Schema.String),
      heard: Schema.NullOr(
        Schema.Struct({ microphone: Schema.String, fellBack: Schema.Boolean }),
      ),
      reason: Schema.NullOr(Schema.String),
    },
    Unable: { reason: Schema.String, blocked: Schema.Boolean },
    /** The blocked microphone's dialog put away. */
    BlockedDismissed: {},
    Level: { level: Schema.Number },
    Stop: {},
    // What its Take says, by the Take's id.
    TakeDownloading: {
      take: Schema.String,
      done: Schema.Number,
      total: Schema.NullOr(Schema.Number),
    },
    TakeHeard: { take: Schema.String, text: Schema.String },
    TakeDone: { take: Schema.String, text: Schema.String },
    TakeFailed: { take: Schema.String, reason: Schema.String },
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

/** A new Take for the same clip: its id, once more. */
const again = (take: string) => {
  const [base, tries] = take.split('#');
  return `${base}#${Number(tries ?? 0) + 1}`;
};

// 1. Start
const start = (model: Model, owner: Owner | null, at: number) => {
  if (owner === null) return noticed(model, NO_OWNER, at);
  return {
    model: { ...model, count: model.count + 1, notice: null },
    state: { _tag: 'Waiting' as const, id: model.count + 1, owner },
  };
};

/** Recording or written out, and what its Take says. */
type Hearing = Extract<
  typeof State.Type,
  { readonly _tag: 'Recording' | 'Transcribing' }
>;

/** What its Take has heard so far, or how far its model has come. */
const hearing = {
  TakeDownloading: (
    { take, done, total }: { take: string; done: number; total: number | null },
    { state }: { state: Hearing },
  ) =>
    take !== state.take
      ? {}
      : { state: { ...state, downloading: { done, total } } },
  TakeHeard: (
    { take, text }: { take: string; text: string },
    { state }: { state: Hearing },
  ) =>
    take !== state.take ? {} : { state: { ...state, text, downloading: null } },
  TakeFailed: (
    { take, reason }: { take: string; reason: string },
    { state }: { state: Hearing },
  ) =>
    take !== state.take
      ? {}
      : {
          state: {
            _tag: 'Failed' as const,
            id: state.id,
            owner: state.owner,
            take: state.take,
            reason,
          },
        },
};

/** The Dictation Voice holds, and its asks. */
export const DictationLive = Dictation.build({
  init: () => ({
    model: {
      count: 0,
      microphone: null,
      blocked: false,
      texts: [],
      notice: null,
    },
    state: idle,
  }),
  children: {
    // 3. Hear: one Take for as long as it records and is written out.
    take: Actor.child(TakeLive, {
      each: ({ state }) =>
        state._tag === 'Recording' || state._tag === 'Transcribing'
          ? [state.take]
          : [],
      input: ({ state }, take) => ({
        id: take,
        connectionId:
          state._tag === 'Recording' || state._tag === 'Transcribing'
            ? state.owner.connectionId
            : '',
      }),
      props: ({ state }) => ({ stopped: state._tag === 'Transcribing' }),
      emits: {
        Downloading: ({ done, total }, take) => ({
          _tag: 'TakeDownloading',
          take,
          done,
          total,
        }),
        Heard: ({ text }, take) => ({ _tag: 'TakeHeard', take, text }),
        Done: ({ text }, take) => ({ _tag: 'TakeDone', take, text }),
        Failed: ({ reason }, take) => ({ _tag: 'TakeFailed', take, reason }),
      },
    }),
  },
  workers: {
    // 1. Start: the microphone chosen, read again after every write.
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
    // 2. Record: one Worker from the microphone opening to the stop, so
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
              take: crypto.randomUUID(),
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
          Effect.catch(({ reason, blocked }) =>
            self.send({ _tag: 'Unable', reason, blocked: blocked === true }),
          ),
        ),
    },
    // 2. Record: another microphone chosen, switched to in the same clip.
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
        Opened: (
          { microphone, fellBack, using, take },
          { model, state, at },
        ) => ({
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
            take,
            text: '',
            downloading: null,
          },
        }),
        // Blocked, a dialog asks for a reload; anything else is a notice.
        Unable: ({ reason, blocked }, { model, at }) => ({
          ...(blocked
            ? { model: { ...model, blocked: true } }
            : noticed(model, reason, at)),
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
        ...hearing,
        // 4. Stop: from anywhere, for its Owner.
        Toggle: (_, { state }) => ({ state: writingOut(state) }),
        Stop: (_, { state }) => ({ state: writingOut(state) }),
      },
    },
    Transcribing: {
      on: {
        Toggle: (_, { model, at }) =>
          noticed(model, 'Still writing out the last Dictation', at),
        ...hearing,
        // 5. Text: kept for its Owner, the last one for it.
        TakeDone: ({ take, text }, { model, state, at }) => {
          if (take !== state.take) return {};
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
                { id: state.id, owner, text: said },
              ],
            },
            state: idle,
          };
        },
      },
    },
    Failed: {
      on: {
        Toggle: ({ owner }, { model, at }) => start(model, owner, at),
        Retry: ({ id }, { state }) =>
          id !== state.id
            ? {}
            : {
                state: {
                  _tag: 'Transcribing',
                  id: state.id,
                  owner: state.owner,
                  take: again(state.take),
                  text: '',
                  downloading: null,
                },
              },
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
    BlockedDismissed: (_, { model }) => ({
      model: { ...model, blocked: false },
    }),
    MicrophoneRead: ({ microphone }, { model }) => ({
      model: { ...model, microphone },
    }),
    Dismiss: ({ at }, { model }) =>
      model.notice?.at === at ? { model: { ...model, notice: null } } : {},
  },
});

/** Recording stopped: what is heard so far stays while the rest comes. */
function writingOut(state: Extract<Hearing, { _tag: 'Recording' }>) {
  return {
    _tag: 'Transcribing' as const,
    id: state.id,
    owner: state.owner,
    take: state.take,
    text: state.text,
    downloading: state.downloading,
  };
}
