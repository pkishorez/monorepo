import { Duration, Effect, Layer, Schema, Stream, Struct } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki';
import { HarnessBinaries, Harnesses, Titler } from '../../../harness/index.js';
import { TURN_END_STATUSES } from '../../../projection/index.js';
import {
  SessionSchema,
  type Session as SessionRecord,
  type SessionStatus,
} from '../../../records/index.js';
import { Store } from '../../../store/index.js';
import { Prompt } from '../../attachments/index.js';
import { LiveAgents } from '../../live-agents/index.js';
import { AgentTurns } from './agent-turns/index.js';
import { makeAgent, SessionAgent } from './agent/index.js';
import { BackgroundJobs } from './background-jobs/index.js';
import { Turn } from './turn/index.js';

/*
 * A Session: one conversation with a Coding Harness in a Project's folder.
 *
 * - Idle     a message starts a Turn, and so does the agent starting one
 *            on its own. It keeps how the last Turn ended, unless it was
 *            done: cancelled, failed or interrupted.
 * - Running  a message steers the Turn, or waits for the next one while
 *            it is cancelling; a cancel asks it to stop; the Turn reports
 *            each steer the agent took, and when it has ended. Then a
 *            message it never delivered, steer or waiting, starts the next
 *            Turn; with none, the Session is idle again.
 *
 * It keeps one live agent for its Turns (see agent/), with its Background
 * Jobs beside it, saves itself whenever its record changes, takes a
 * message's model and settings from that Turn on, and asks the Titler for
 * a title after its first message. Each Turn that starts marks it active,
 * and each that ends marks when;
 * Settling it changes nothing else, and any message un-settles it.
 */

/** How long the Titler may take before the first line stays the title. */
const TITLE_TIMEOUT = Duration.seconds(60);

/** What a Session keeps of its record; its status is its State. */
const Saved = Schema.Struct(SessionSchema.fields).mapFields(
  Struct.omit(['status']),
);

export const SessionInput = Schema.Struct({
  /** As stored: its status is how its last turn ended. */
  session: Schema.Struct(SessionSchema.fields),
  cwd: Schema.String,
  /** The message it was started with, if it was started just now. */
  first: Schema.NullOr(Prompt),
});
export type SessionInput = typeof SessionInput.Type;

const Model = Schema.Struct({
  session: Saved,
  cwd: Schema.String,
  /** The first message, until the Titler has had its say. */
  untitled: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

/** How a turn ended, as a Session keeps it: anything but done. */
const Ended = Schema.Literals(['cancelled', 'failed', 'interrupted']);

const State = Schema.TaggedUnion({
  Idle: { ended: Schema.NullOr(Ended) },
  Running: {
    turnId: Schema.String,
    /** The message the Turn runs; null when the agent started it. */
    prompt: Schema.NullOr(Prompt),
    /** Sent while it runs, until the agent takes them. */
    steers: Schema.Array(Prompt),
    cancelling: Schema.Boolean,
    /** Sent while cancelling: they start the next turn once this one ends. */
    queued: Schema.Array(Prompt),
  },
});

type State = typeof State.Type;

/** A new turn for a message, the ones sent after it steering it. */
const running = ([first, ...rest]: readonly [
  Prompt,
  ...Array<Prompt>,
]): State => ({
  _tag: 'Running',
  turnId: first.id,
  prompt: first,
  steers: rest,
  cancelling: false,
  queued: [],
});

/*
 * `at` on a message is when it was sent, so a Turn it starts marks the
 * Session active then.
 */
const Message = Schema.TaggedUnion({
  /** A user message: starts a Turn, or steers the running one. */
  Send: { prompt: Prompt, at: Schema.Finite },
  Cancel: {},
  TurnEnded: {
    turnId: Schema.String,
    status: Schema.Literals(TURN_END_STATUSES),
    at: Schema.Finite,
  },
  NativeId: { nativeId: Schema.String },
  /** The agent took a steer of the running Turn. */
  Steered: { turnId: Schema.String, id: Schema.String },
  /** The agent started a Turn on its own. */
  AgentTurn: { turnId: Schema.String, at: Schema.Finite },
  Titled: { title: Schema.String },
  Settle: { at: Schema.Finite },
  Unsettle: {},
});

type SessionSelf = Self<Model, State, typeof Message.Type>;

/** The first line of a message, as a title until a better one comes. */
export const fallbackTitle = (text: string) =>
  text.trim().split('\n')[0]!.trim().slice(0, 60) || 'New session';

const recordOf = (model: Model, state: State): SessionRecord => ({
  ...model.session,
  status: state._tag === 'Running' ? 'running' : (state.ended ?? 'idle'),
});

/** The Idle a stored status stands for; a stored `running` was swept before. */
const idleOf = (status: SessionStatus): State => ({
  _tag: 'Idle',
  ended: status === 'idle' || status === 'running' ? null : status,
});

/** The Session with what a Turn starting at `at` changes: it is active then. */
const active = (model: Model, at: number): Model => ({
  ...model,
  session: { ...model.session, activeAt: at },
});

/** A user message un-settles the Session. */
const unsettled = (model: Model): Model =>
  model.session.settledAt === null
    ? model
    : { ...model, session: { ...model.session, settledAt: null } };

/** A message's model and settings hold from its Turn on. */
const choose = (model: Model, prompt: Prompt): Model =>
  prompt.model === undefined && prompt.settings === undefined
    ? model
    : {
        ...model,
        session: {
          ...model.session,
          model: prompt.model ?? model.session.model,
          // Settings a message leaves out keep their value.
          settings: { ...model.session.settings, ...prompt.settings },
        },
      };

/**
 * What the Session hands its children: its harness and live agent. The
 * agent opens with the Session's model and settings as they are then, and
 * is registered for the engine's calls that need an answer from it.
 */
const sessionAgent = (self: SessionSelf) =>
  Layer.effect(
    SessionAgent,
    Effect.gen(function* () {
      const harnesses = yield* Harnesses;
      const binaries = yield* HarnessBinaries;
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
        ).pipe(Effect.provideService(HarnessBinaries, binaries)),
      );
      yield* (yield* LiveAgents).register(model.session.id, agent);
      return {
        harness,
        ...agent,
        agent: agent.get,
        report: (report) => self.send(report),
      };
    }),
  );

/**
 * Saves the Session's record every time it changes, in order. A Session
 * that stops, with its project removed or the server stopping, saves
 * nothing more: one stopped running is still `running` in the Store, and
 * the next start marks it interrupted.
 */
const persist = (self: SessionSelf) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* self.changes.pipe(
      Stream.map(({ model, state }) => recordOf(model, state)),
      Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      Stream.runForEach(store.saveSession),
    );
  });

const title = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const titler = yield* Titler;
    const binaries = yield* HarnessBinaries;
    const text = model.untitled ?? '';
    const titled = yield* titler.title([text]).pipe(
      // A Titler that runs a Harness Binary runs the one the user set.
      Effect.provideService(HarnessBinaries, binaries),
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
    requires: [Harnesses, HarnessBinaries, LiveAgents, Store, Titler],
    input: SessionInput,
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: ({ session, cwd, first }) => ({
      model: {
        session: Struct.omit(session, ['status']),
        cwd,
        untitled: first?.text ?? null,
      },
      state: first ? running([first]) : idleOf(session.status),
    }),
    provides: (self) => sessionAgent(self),
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
      Settle: ({ at }, { model }) =>
        model.session.settledAt !== null
          ? {}
          : {
              model: { ...model, session: { ...model.session, settledAt: at } },
            },
      Unsettle: (_, { model }) => ({ model: unsettled(model) }),
    },
    children: {
      backgroundJobs: { actor: BackgroundJobs },
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
          Send: ({ prompt, at }, { model }) => ({
            model: active(unsettled(choose(model, prompt)), at),
            state: running([prompt]),
          }),
          AgentTurn: ({ turnId, at }, { model }) => ({
            model: active(model, at),
            state: {
              _tag: 'Running',
              turnId,
              prompt: null,
              steers: [],
              cancelling: false,
              queued: [],
            },
          }),
        },
        children: {
          agentTurns: { actor: AgentTurns },
        },
      },
      Running: {
        on: {
          Send: ({ prompt }, { model, state }) => ({
            model: unsettled(choose(model, prompt)),
            state: state.cancelling
              ? { ...state, queued: [...state.queued, prompt] }
              : { ...state, steers: [...state.steers, prompt] },
          }),
          Cancel: (_, { state }) => ({ state: { ...state, cancelling: true } }),
          Steered: ({ turnId, id }, { state }) =>
            turnId !== state.turnId
              ? {}
              : {
                  state: {
                    ...state,
                    steers: state.steers.filter((each) => each.id !== id),
                  },
                },
          TurnEnded: ({ turnId, status, at }, { model, state }) => {
            if (turnId !== state.turnId) return {};
            const ended = {
              ...model,
              session: { ...model.session, endedAt: at },
            };
            const [next, ...rest] = [...state.steers, ...state.queued];
            return next
              ? { model: active(ended, at), state: running([next, ...rest]) }
              : {
                  model: ended,
                  state: {
                    _tag: 'Idle',
                    ended: status === 'done' ? null : status,
                  },
                };
          },
        },
        children: {
          turn: {
            actor: Turn,
            key: ({ state }) => state.turnId,
            input: ({ model, state }) => ({
              sessionId: model.session.id,
              turnId: state.turnId,
              prompt: state.prompt,
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
