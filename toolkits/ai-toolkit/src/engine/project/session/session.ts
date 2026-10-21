import { Duration, Effect, Layer, Schema, Stream, Struct } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki';
import { Harnesses, Titler } from '../../../harness/index.js';
import {
  SessionSchema,
  type Session as SessionRecord,
} from '../../../records/index.js';
import { Store } from '../../../store/index.js';
import { makeAgent } from './agent.js';
import { Turn, TurnContext } from './turn/index.js';

/*
 * A Session: one conversation with a Coding Harness in a Project's folder.
 *
 * - Idle     a message starts a Turn.
 * - Running  a message steers the Turn; a cancel asks it to stop; the Turn
 *            reports when it has ended, and the Session is idle again.
 *
 * It keeps one live agent for its Turns (see agent.ts), saves itself
 * whenever its record changes, and asks the Titler for a title after its
 * first message.
 */

/** How long the Titler may take before the first line stays the title. */
const TITLE_TIMEOUT = Duration.seconds(60);

/** What a Session keeps of its record; its status is its State. */
const Saved = Schema.Struct(SessionSchema.fields).mapFields(
  Struct.omit(['status']),
);

const First = Schema.Struct({ text: Schema.String, turnId: Schema.String });

export const SessionInput = Schema.Struct({
  session: Saved,
  cwd: Schema.String,
  /** The message it was started with, if it was started just now. */
  first: Schema.NullOr(First),
});
export type SessionInput = typeof SessionInput.Type;

const Model = Schema.Struct({
  session: Saved,
  cwd: Schema.String,
  /** The first message, until the Titler has had its say. */
  untitled: Schema.NullOr(Schema.String),
});

const Steer = Schema.Struct({ id: Schema.String, text: Schema.String });

const State = Schema.TaggedUnion({
  Idle: {},
  Running: {
    turnId: Schema.String,
    text: Schema.String,
    steers: Schema.Array(Steer),
    cancelling: Schema.Boolean,
    /** Sent while cancelling: they start the next turn once this one ends. */
    queued: Schema.Array(Steer),
  },
});

type State = typeof State.Type;

/** A new turn for a message, the ones sent after it steering it. */
const running = ([first, ...rest]: readonly [
  typeof Steer.Type,
  ...Array<typeof Steer.Type>,
]): State => ({
  _tag: 'Running',
  turnId: first.id,
  text: first.text,
  steers: rest,
  cancelling: false,
  queued: [],
});

const Message = Schema.TaggedUnion({
  /** A user message: starts a Turn, or steers the running one. */
  Send: { text: Schema.String, turnId: Schema.String },
  Cancel: {},
  TurnEnded: { turnId: Schema.String },
  NativeId: { nativeId: Schema.String },
  Titled: { title: Schema.String },
});

type SessionSelf = Self<
  typeof Model.Type,
  typeof State.Type,
  typeof Message.Type
>;

/** The first line of a message, as a title until a better one comes. */
export const fallbackTitle = (text: string) =>
  text.trim().split('\n')[0]!.trim().slice(0, 60) || 'New session';

const recordOf = (
  model: typeof Model.Type,
  state: typeof State.Type,
): SessionRecord => ({
  ...model.session,
  status: state._tag === 'Running' ? 'running' : 'idle',
});

/** The TurnContext every Turn of this Session gets: its harness and live agent. */
const turnContext = (self: SessionSelf) =>
  Layer.effect(
    TurnContext,
    Effect.gen(function* () {
      const harnesses = yield* Harnesses;
      const { model } = yield* self.get;
      const harness = harnesses.get(model.session.harness);
      const agent = yield* makeAgent(
        Effect.flatMap(self.get, ({ model }) =>
          harness.open({
            cwd: model.cwd,
            model: model.session.model,
            settings: model.session.settings,
            ...(model.session.nativeId === null
              ? {}
              : { nativeId: model.session.nativeId }),
          }),
        ),
      );
      return {
        harness,
        agent: agent.get,
        opened: agent.opened,
        reset: agent.reset,
        report: (report) => self.send(report),
      };
    }),
  );

/**
 * Saves the Session's record every time it changes, in order. A Session
 * that stops, with its project removed or the server stopping, stopped its
 * turn too: it is saved idle.
 */
const persist = (self: SessionSelf) =>
  Effect.gen(function* () {
    const store = yield* Store;
    let last: SessionRecord | undefined;
    yield* self.changes.pipe(
      Stream.map(({ model, state }) => recordOf(model, state)),
      Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      Stream.runForEach((record) => {
        last = record;
        return store.saveSession(record);
      }),
      Effect.onInterrupt(() =>
        last?.status === 'running'
          ? store.saveSession({ ...last, status: 'idle' })
          : Effect.void,
      ),
    );
  });

const title = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const titler = yield* Titler;
    const text = model.untitled ?? '';
    const titled = yield* titler.title(text).pipe(
      Effect.timeout(TITLE_TIMEOUT),
      Effect.map((title) => title.trim()),
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning('Titler failed; keeping the first line', error),
          '',
        ),
      ),
    );
    yield* self.send({
      _tag: 'Titled',
      title: titled === '' ? fallbackTitle(text) : titled,
    });
  });

export const Session = Actor.build(
  Actor.define('Session', {
    requires: [Harnesses, Store, Titler],
    input: SessionInput,
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: ({ session, cwd, first }) => ({
      model: { session, cwd, untitled: first?.text ?? null },
      state: first
        ? running([{ id: first.turnId, text: first.text }])
        : { _tag: 'Idle' },
    }),
    provides: (self) => turnContext(self),
    on: {
      NativeId: ({ nativeId }, { model }) => ({
        model: { ...model, session: { ...model.session, nativeId } },
      }),
      Titled: ({ title }, { model }) => ({
        model: {
          ...model,
          untitled: null,
          session: { ...model.session, title },
        },
      }),
    },
    workers: {
      persist: { run: (self) => persist(self) },
      title: {
        while: ({ model }) => model.untitled !== null,
        run: (self) => title(self),
      },
    },
    state: {
      Idle: {
        on: {
          Send: ({ text, turnId }) => ({
            state: running([{ id: turnId, text }]),
          }),
        },
      },
      Running: {
        on: {
          Send: ({ text, turnId }, { state }) => ({
            state: {
              ...state,
              steers: [...state.steers, { id: turnId, text }],
            },
          }),
          Cancel: (_, { state }) => ({ state: { ...state, cancelling: true } }),
          TurnEnded: ({ turnId }, { state }) =>
            turnId === state.turnId ? { state: { _tag: 'Idle' } } : {},
        },
        children: {
          turn: {
            actor: Turn,
            key: ({ state }) => state.turnId,
            input: ({ model, state }) => ({
              sessionId: model.session.id,
              turnId: state.turnId,
              text: state.text,
            }),
            props: ({ state }) => ({
              steers: state.steers,
              cancelling: state.cancelling,
            }),
          },
        },
      },
    },
  },
);
