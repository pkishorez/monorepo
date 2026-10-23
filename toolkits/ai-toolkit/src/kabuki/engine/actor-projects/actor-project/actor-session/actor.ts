import { Clock, Data, Effect, Schema, Stream, Struct } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import { BackgroundJobSchema } from '../../../../../services/harness/wire/index.js';
import {
  HarnessBinaries,
  Harnesses,
  Titler,
  type HarnessError,
  type HarnessSession,
} from '../../../../../services/harness/contract/index.js';
import { TURN_END_STATUSES } from '../../../../../services/records/projection/index.js';
import {
  SessionSchema,
  type Session as SessionRecord,
  type SessionStatus,
} from '../../../../../services/records/entities/index.js';
import { Store } from '../../../../../services/records/store/index.js';
import { Desks } from '../../../capabilities/index.js';
import { Prompt } from '../../../prompt/index.js';
import { StopJob } from './commands.js';
import { desk } from './desk.js';
import { fallbackTitle, title } from './title.js';
import { cancel, run } from './turn.js';

/*
 * A Session: one conversation with a Coding Harness in a Project's folder.
 *
 * - Idle     a message starts a Turn, and so does the agent starting one
 *            on its own. It keeps how the last Turn ended, unless it was
 *            done: cancelled, failed or interrupted.
 * - Running  exactly one Turn runs, as the turn Worker (see turn.ts). A
 *            message steers it, or waits for the next one while it is
 *            cancelling; a cancel asks it to stop; the Worker reports each
 *            steer the agent took, and when it has ended. Then a message
 *            it never delivered, steer or waiting, starts the next Turn;
 *            with none, the Session is idle again.
 *
 * Across both it keeps one live agent for its Turns, out at its Desk (see
 * desk.ts) for the engine's questions and its own Workers; follows the
 * Background Jobs the agent reports, stops one on a StopJob (see
 * commands.ts) and keeps the reason when the harness refuses; saves itself whenever its record changes; takes a message's
 * model and settings from that Turn on; and asks the Titler for a title
 * after its first message (see title.ts). Each Turn that starts marks it
 * active, and each that ends marks when; Settling it changes nothing else,
 * and any message un-settles it.
 *
 * What the agent says of itself, its MCP Server Status and Context Usage,
 * it answers as Queries, from the agent while it is open: a Query never
 * opens it, so a closed agent answers AgentClosed.
 */

/** A Query was asked of the agent while it is closed; the next Turn opens it. */
export class AgentClosed extends Data.TaggedError('AgentClosed')<{}> {}

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
  /** The agent's Background Jobs as it last listed them; in memory only. */
  jobs: Schema.Array(BackgroundJobSchema),
  /** Stops the harness refused, for jobs still listed; in memory only. */
  refusedStops: Schema.Array(
    Schema.Struct({ jobId: Schema.String, reason: Schema.String }),
  ),
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
  Jobs: { jobs: Schema.Array(BackgroundJobSchema) },
  /** Stop one of the agent's Background Jobs. */
  StopJob: { jobId: Schema.String },
  /** The harness refused to stop a job. */
  JobStopFailed: { jobId: Schema.String, reason: Schema.String },
  Titled: { title: Schema.String },
  Settle: { at: Schema.Finite },
  Unsettle: {},
});

export type SessionSelf = Self<Model, State, typeof Message.Type>;

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

/** Follows the Background Jobs the agent reports; none while it is closed. */
const jobs = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const out = yield* (yield* Desks).of(model.session.id);
    yield* Stream.runForEach(out.jobs, (jobs) =>
      self.send({ _tag: 'Jobs', jobs }),
    );
  });

/** Asks the open agent `read`; AgentClosed while it is closed. */
const fromAgent = <A>(
  self: Pick<SessionSelf, 'get'>,
  read: (agent: HarnessSession) => Effect.Effect<A, HarnessError>,
) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const out = yield* (yield* Desks).of(model.session.id);
    const agent = yield* out.opened;
    if (!agent) return yield* new AgentClosed();
    return yield* read(agent);
  });

/**
 * Waits, while idle, for the agent to start a Turn on its own; then runs
 * it. A Turn the agent starts while another runs waits until idle again.
 */
const agentTurn = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const out = yield* (yield* Desks).of(model.session.id);
    yield* out.nextAgentTurn;
    yield* self.send({
      _tag: 'AgentTurn',
      turnId: yield* nextUlid,
      at: yield* Clock.currentTimeMillis,
    });
  });

export const Session = Actor.build(
  Actor.define('Session', {
    requires: [Desks, Harnesses, HarnessBinaries, Store, Titler],
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
        jobs: [],
        refusedStops: [],
      },
      state: first ? running([first]) : idleOf(session.status),
    }),
    on: {
      NativeId: ({ nativeId }, { model }) => ({
        model: { ...model, session: { ...model.session, nativeId } },
      }),
      Jobs: ({ jobs }, { model }) => ({
        model: {
          ...model,
          jobs,
          refusedStops: model.refusedStops.filter((refused) =>
            jobs.some((job) => job.id === refused.jobId),
          ),
        },
      }),
      StopJob: ({ jobId }, { model }) => ({
        model: {
          ...model,
          refusedStops: model.refusedStops.filter((r) => r.jobId !== jobId),
        },
        command: StopJob({ sessionId: model.session.id, jobId }),
      }),
      // A refusal for a job the agent no longer lists is moot.
      JobStopFailed: ({ jobId, reason }, { model }) =>
        model.jobs.some((job) => job.id === jobId)
          ? {
              model: {
                ...model,
                refusedStops: [...model.refusedStops, { jobId, reason }],
              },
            }
          : {},
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
    workers: {
      desk: { run: (self) => desk(self) },
      jobs: { run: (self) => jobs(self) },
      persist: { run: (self) => persist(self) },
      title: {
        while: ({ model }) => model.untitled !== null,
        run: (self) => title(self),
      },
    },
    queries: {
      mcpStatus: { run: (self) => fromAgent(self, (agent) => agent.mcpStatus) },
      contextUsage: {
        run: (self) => fromAgent(self, (agent) => agent.contextUsage),
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
        workers: {
          agentTurn: { run: (self) => agentTurn(self) },
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
        workers: {
          turn: {
            each: ({ state }) => [state.turnId],
            run: (self, turnId) => run(self, turnId),
          },
          cancel: {
            while: ({ state }) => state.cancelling,
            run: (self) => cancel(self),
          },
        },
      },
    },
  },
);

export { fallbackTitle };
