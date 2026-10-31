import { Clock, Data, Effect, Schema, Stream, Struct } from 'effect';
import { Actor } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  AgentQuestionSchema,
  BackgroundJobSchema,
  QuestionAnswerSchema,
  TURN_END_STATUSES,
  type Json,
} from '@kestack/ai-toolkit/contract';
import {
  HarnessAccount,
  Harnesses,
  OneShotPrompt,
  type Agent,
  HarnessError,
} from '@kestack/ai-toolkit/harness';
import {
  SessionSchema,
  type Session as SessionRecord,
  type SessionStatus,
} from '../../../records/index.js';
import {
  Agents,
  Answers,
  Git,
  HarnessAccounts,
  Store,
} from '../../capabilities/index.js';
import { followBranch } from './branch.js';
import { AnswerNotAsked, AnswerQuestion, StopJob } from './commands.js';
import { forkFrom } from './fork.js';
import { Prompt } from './prompt.js';
import { title, retitle } from './title.js';
import { cancel, run } from './turn.js';

/*
 * A Session: one Agent of a Coding Harness in a Project's folder, or in
 * its Worktree, kept.
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
 * Across both it keeps one Agent for its Turns in Agents (the agent
 * Worker), where its other Workers, its Commands and its Queries find it;
 * follows the Background Jobs the Agent reports, stops one on a StopJob
 * (see commands.ts) and keeps the reason when the harness refuses; follows
 * the Agent Questions its running Turn waits on, and gives the agent an
 * Answer, its Commands telling the caller in Answers how it went; saves
 * itself whenever its record changes, a new one only once its Agent has
 * opened and its first message is written; takes a message's model and settings
 * from that Turn on; asks a One-shot Prompt for a title after its first
 * message (see title.ts); and, while not Settled, keeps the branch its
 * Worktree is on (see branch.ts). Each Turn that starts marks it active, and each
 * that ends marks when; Settling it changes nothing else, and any message
 * un-settles it.
 *
 * What code outside the tree asks of it is a Query: a Fork (see fork.ts),
 * an Ask, a new Title, and what the Agent says of itself, its MCP Server
 * Status and Context Usage. The last two read the Agent while it is open:
 * a Query never opens it, so a closed Agent answers AgentClosed.
 */

/** A Query was asked of the agent while it is closed; the next Turn opens it. */
export class AgentClosed extends Data.TaggedError('AgentClosed')<{}> {}

export class AskFailed extends Data.TaggedError('AskFailed')<{
  readonly message: string;
}> {}

/** What a Session keeps of its record; its status is its State. */
const Saved = Schema.Struct(SessionSchema.fields).mapFields(
  Struct.omit(['status']),
);

export const SessionInput = Schema.Struct({
  /** As stored: its status is how its last turn ended. */
  session: Schema.Struct(SessionSchema.fields),
  cwd: Schema.String,
  /**
   * The message it starts Running: a new Session's first, or the Prompt the
   * Bootstrap Sweep Resumes a cut-off Turn with; null to start Idle.
   */
  first: Schema.NullOr(Prompt),
});
export type SessionInput = typeof SessionInput.Type;

const Model = Schema.Struct({
  session: Saved,
  cwd: Schema.String,
  /** The first message, until it has a title. */
  untitled: Schema.NullOr(Schema.String),
  /** The agent's Background Jobs as it last listed them; in memory only. */
  jobs: Schema.Array(BackgroundJobSchema),
  /** Stops the harness refused, for jobs still listed; in memory only. */
  refusedStops: Schema.Array(
    Schema.Struct({ jobId: Schema.String, reason: Schema.String }),
  ),
  /** The Agent Questions as the agent last listed them; in memory only. */
  questions: Schema.Array(AgentQuestionSchema),
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
  Questions: { questions: Schema.Array(AgentQuestionSchema) },
  /**
   * Answer one of the agent's Agent Questions; null declines it. Its caller
   * waits on `answerId` in Answers for how it went.
   */
  Answer: {
    answerId: Schema.String,
    questionId: Schema.String,
    answer: Schema.NullOr(QuestionAnswerSchema),
  },
  Titled: { title: Schema.String },
  /** The branch its Worktree is on now; null for none. */
  BranchFound: { branch: Schema.NullOr(Schema.String) },
  Settle: { at: Schema.Finite },
  Unsettle: {},
});

export type SessionSelf = Actor.Self<Model, State, typeof Message.Type>;
/** What a Query reads of the Session: its data, never a Send. */
export type SessionQuerySelf = Pick<SessionSelf, 'get'>;

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
 * Waits until a new Session has started: its Agent opened, its first
 * message written and itself saved. One that fails to never does, for the
 * engine drops it, so it waits on until stopped.
 */
const started = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const kept = yield* (yield* Agents).of(model.session.id);
    yield* kept.firstSave.await.pipe(Effect.catch(() => Effect.never));
  });

/**
 * Saves the Session's record every time it changes, in order; a new one,
 * still untitled, from when its Agent has opened and its first message is
 * written, which it says once saved, so a start counts only then. A Session
 * that stops, with its project removed or the server stopping, saves
 * nothing more: one stopped running is still `running` in the Store, and
 * the next start marks it interrupted and Resumes it once.
 */
const persist = (self: SessionSelf) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const { model } = yield* self.get;
    const kept = yield* (yield* Agents).of(model.session.id);
    if (model.untitled !== null)
      yield* kept.firstRecord.await.pipe(Effect.catch(() => Effect.never));
    yield* self.changes.pipe(
      Stream.map(({ model, state }) => recordOf(model, state)),
      Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      Stream.runForEach((record) =>
        Effect.andThen(store.saveSession(record), kept.firstSave.mark),
      ),
      // A new Session that could not be saved does not start.
      Effect.onExit(() =>
        kept.firstSave.fail(
          new HarnessError({ message: 'The session could not be saved' }),
        ),
      ),
    );
  });

/**
 * The agent Worker: keeps the Session's Agent in Agents for as long as the
 * Session lives. It opens on first use, with the Session's model and
 * settings as they are then.
 */
const agent = (self: SessionSelf) =>
  Effect.gen(function* () {
    const harnesses = yield* Harnesses;
    const accounts = yield* HarnessAccounts;
    const { model } = yield* self.get;
    const harness = harnesses.get(model.session.harness);
    yield* (yield* Agents).keep(
      model.session.id,
      Effect.gen(function* () {
        const { model } = yield* self.get;
        const account = yield* accounts.as(model.session.account);
        return yield* harness
          .open({
            cwd: model.cwd,
            model: model.session.model,
            settings: model.session.settings,
            ...(model.session.nativeId === null
              ? {}
              : { nativeId: model.session.nativeId }),
          })
          .pipe(Effect.provideService(HarnessAccount, account));
      }),
    );
    yield* Effect.never;
  });

/** Follows the Background Jobs the agent reports; none while it is closed. */
const jobs = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const kept = yield* (yield* Agents).of(model.session.id);
    yield* Stream.runForEach(kept.jobs, (jobs) =>
      self.send({ _tag: 'Jobs', jobs }),
    );
  });

/** Follows the Agent Questions the agent asks; none while it is closed. */
const questions = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const kept = yield* (yield* Agents).of(model.session.id);
    yield* Stream.runForEach(kept.questions, (questions) =>
      self.send({ _tag: 'Questions', questions }),
    );
  });

/** Asks the open agent `read`; AgentClosed while it is closed. */
const fromAgent = <A>(
  self: SessionQuerySelf,
  read: (agent: Agent) => Effect.Effect<A, HarnessError>,
) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const kept = yield* (yield* Agents).of(model.session.id);
    const agent = yield* kept.opened;
    if (!agent) return yield* new AgentClosed();
    return yield* read(agent);
  });

/** The ask Query: a question put to the Agent's context, leaving it untouched. */
const ask = (self: SessionQuerySelf, question: string, schema: Json | null) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const { harness, nativeId, model: languageModel } = model.session;
    if (nativeId === null)
      return yield* new AskFailed({
        message:
          'This session has no context to ask about yet; wait for its first turn to start.',
      });
    const harnesses = yield* Harnesses;
    const accounts = yield* HarnessAccounts;
    return yield* accounts.as(model.session.account).pipe(
      Effect.flatMap((account) =>
        harnesses
          .get(harness)
          .ask({
            cwd: model.cwd,
            nativeId,
            model: languageModel,
            question,
            ...(schema === null ? {} : { schema }),
          })
          .pipe(Effect.provideService(HarnessAccount, account)),
      ),
      Effect.mapError((error) => new AskFailed({ message: error.message })),
    );
  });

/**
 * Waits, while idle, for the agent to start a Turn on its own; then runs
 * it. A Turn the agent starts while another runs waits until idle again.
 */
const agentTurn = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const kept = yield* (yield* Agents).of(model.session.id);
    yield* kept.nextAgentTurn;
    yield* self.send({
      _tag: 'AgentTurn',
      turnId: yield* nextUlid,
      at: yield* Clock.currentTimeMillis,
    });
  });

export const Session = Actor.build(
  Actor.define('Session', {
    requires: [
      Agents,
      Answers,
      Git,
      Harnesses,
      HarnessAccounts,
      OneShotPrompt,
      Store,
    ],
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
        // A Resumed Session has its title; only a first message asks for one.
        untitled: first && !first.resumed ? first.text : null,
        jobs: [],
        refusedStops: [],
        questions: [],
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
      Questions: ({ questions }, { model }) => ({
        model: { ...model, questions },
      }),
      // One no longer asked is not given: the agent would refuse it anyway.
      Answer: ({ answerId, questionId, answer }, { model }) => ({
        command: model.questions.some((question) => question.id === questionId)
          ? AnswerQuestion({
              sessionId: model.session.id,
              answerId,
              questionId,
              answer,
            })
          : AnswerNotAsked({ answerId }),
      }),
      Titled: ({ title }, { model }) => ({
        model: {
          ...model,
          untitled: null,
          session: { ...model.session, title },
        },
      }),
      BranchFound: ({ branch }, { model }) =>
        branch === model.session.branch
          ? {}
          : { model: { ...model, session: { ...model.session, branch } } },
      Settle: ({ at }, { model }) =>
        model.session.settledAt !== null
          ? {}
          : {
              model: { ...model, session: { ...model.session, settledAt: at } },
            },
      Unsettle: (_, { model }) => ({ model: unsettled(model) }),
    },
    workers: {
      agent: { run: (self) => agent(self) },
      jobs: { run: (self) => jobs(self) },
      questions: { run: (self) => questions(self) },
      persist: { run: (self) => persist(self) },
      title: {
        while: ({ model }) => model.untitled !== null,
        // Nothing is written, nor its branch renamed, until it has
        // started: a start that fails takes back its branch by name.
        run: (self) => Effect.andThen(started(self), title(self)),
      },
      branch: {
        while: ({ model }) => model.session.settledAt === null,
        run: (self) => followBranch(self),
      },
    },
    queries: {
      fork: {
        run: (self, afterTurnId: string | null) => forkFrom(self, afterTurnId),
      },
      ask: {
        run: (
          self,
          args: { readonly question: string; readonly schema: Json | null },
        ) => ask(self, args.question, args.schema),
      },
      retitle: { run: (self) => retitle(self) },
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

export { Prompt };
export { fallbackTitle } from './title.js';
export { NotForkable } from './fork.js';
