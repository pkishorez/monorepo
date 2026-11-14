import { Effect, Schedule, Schema, Stream } from 'effect';
import {
  BackgroundJobSchema,
  CodeClient,
  ContextUsageSchema,
  type Session as SessionRecord,
} from '@kestack/connect/code';
import { Page, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import {
  accountIn,
  connectionIn,
  projectIn,
  session,
} from '../../../../app.ts';
import { Refused } from '../../../connection/link/index.ts';
import {
  lineage,
  readingOf,
  runsAfter,
} from '../../../connection/records/index.ts';
import { Connections } from '../../../account.ts';
import { ContextShown, Preferences } from '../../../../storage/index.ts';
import { Storage } from '../../../../storage/index.ts';
import { Draft } from '../draft/index.ts';
import {
  cancel,
  forkSession,
  markSeen,
  openAfterDrawer,
  openCommandAfterDrawer,
  stopJob,
} from './commands.ts';
import { Question } from './panels/question/index.ts';
import {
  choiceOf,
  RunningChosen,
  RunningItem,
  RunningPicker,
  Transcript,
} from './transcript/index.ts';
import * as Picker from '../../../../../ui/controls/picker/index.ts';
import { Actor } from '@kestack/kabuki';

/*
 * A session: its transcript (`transcript/`), its row and messages and the
 * Running Picker over them; its Draft (`draft/`); and the Question Panel
 * that stands in for the Draft while its agent asks (`panels/question/`).
 * These are its three kinds of Children; all it does with them is here.
 *
 * 1. Read     the transcript reads the row, which says whether it runs,
 *             and the messages, which sync while the page is open,
 *             through the session's Window. A Worker follows
 *             the row and the rows of the sessions it was forked from: the
 *             agent and project it is in, and, for a fork, each session up
 *             the chain, whose messages the transcript syncs too, one
 *             Window each, so the history it carries on from can be drawn
 *             before its own.
 *             Reading it marks it seen on this device, up to the end of
 *             its last turn, and so does each turn ending while it is open.
 * 2. Draft    the next message, a Child of its own, fresh for each session,
 *             handed the session's agent and whether it runs.
 * 3. Fork     a new session from this one's context up to a turn's end;
 *             the app moves to it.
 * 4. Stop     stops everything it runs: its turn and its Background Jobs,
 *             which it follows live, so it shows as working while only
 *             its jobs run; or one job on its own.
 * 5. Open     which tool calls and thoughts are shown open, and the
 *             subagents opened over the page, outermost first: on a
 *             desktop one dialog shows the deepest, with a way back; on
 *             a phone each is a drawer over the one before.
 * 8. Running  what it runs now, as its View reads it from its rows and
 *             jobs, and how the Running Picker over it is open, which the
 *             transcript places: a subagent or a command chosen opens,
 *             and the last row stops all.
 * 6. Ready     it is drawn whole, transcript and Draft in one step, once
 *              all of it is read from this device (`readyOf`): its row, its
 *              messages, those it carries on from, and its Saved Draft.
 *              Its View says so once, so the frame first draws it whole, and
 *              again once its row is held, so a Session just started is
 *              drawn whole only with its row (`held`).
 * 7. Question  the Agent Questions its agent waits on, answered in the
 *              Question Panel, a Child of its own, fresh for each session.
 * 9. Context   how full its agent's context is, and the plan's limits, as
 *              the agent says, asked as the page opens, as each turn ends,
 *              every so often while one runs, and as its details open.
 *              An agent not open has nothing to say, as after a restart:
 *              what was last told stays, and the Draft and its details
 *              can fetch it by hand, which opens nothing to keep. When the
 *              Draft shows it is a Preference, followed as it changes. Its
 *              details are open or not here, so they are asked afresh.
 * 10. Output   the background command open over the page, and what it
 *              writes, followed while it is open: the last of it first,
 *              then each piece as it comes. It stays drawn once the
 *              command ends, until it is closed.
 * 11. Here     only while its Connection runs here, the Account the one
 *              active and listing it, does it read the Connection's
 *              records or ask the Connection anything; each time it runs
 *              here again, the transcript starts over, so it reads the
 *              records anew.
 */

const ForkedFrom = Schema.NullOr(
  Schema.Struct({ sessionId: Schema.String, turnId: Schema.String }),
);

// 10. Output

/** How much of what a command wrote is kept, from its end. */
const OUTPUT_CHARS = 256 * 1024;

/** The background command open over the page, and what it wrote. */
const OpenCommand = Schema.Struct({
  jobId: Schema.String,
  /** Its job as last listed, so it stays drawn once it has ended. */
  job: BackgroundJobSchema,
  /** What it wrote, piece by piece, the oldest dropped past `OUTPUT_CHARS`. */
  output: Schema.Array(Schema.String),
  /** How many pieces were dropped before the first kept. */
  dropped: Schema.Finite,
  /** Whether it was asked to stop from here. */
  stopped: Schema.Boolean,
  /**
   * Which read of its output the pieces are from, counted from 1. A new
   * one, after the socket was lost, starts again from the last of it, so
   * its first piece replaces the pieces of the one before.
   */
  run: Schema.Finite,
});
type OpenCommand = typeof OpenCommand.Type;

/**
 * The command with one more piece of what it wrote, its oldest dropped
 * past `OUTPUT_CHARS`; the first of a new read in place of all before.
 */
export const written = (
  command: OpenCommand,
  run: number,
  text: string,
): OpenCommand => {
  if (run !== command.run)
    return { ...command, run, output: [text], dropped: 0 };
  const output = [...command.output, text];
  let size = output.reduce((sum, each) => sum + each.length, 0);
  let drop = 0;
  while (output.length - drop > 1 && size > OUTPUT_CHARS) {
    size -= output[drop]!.length;
    drop += 1;
  }
  return {
    ...command,
    output: output.slice(drop),
    dropped: command.dropped + drop,
  };
};

/** What the page acts on of its session's row. */
const Row = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  /** The Harness Account it runs as. */
  account: Schema.String,
  /** The model and settings it runs with now. */
  model: Schema.String,
  settings: Schema.Record(Schema.String, Schema.String),
  running: Schema.Boolean,
  forkedFrom: ForkedFrom,
  /** When its last turn ended; null until one has. */
  endedAt: Schema.NullOr(Schema.Finite),
});

/** A session it was forked from, as far as its history needs. */
const Ancestor = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  forkedFrom: ForkedFrom,
});

const Read = Schema.Struct({ row: Row, lineage: Schema.Array(Ancestor) });
const sameRead = Schema.toEquivalence(Read);
const sameJobs = Schema.toEquivalence(Schema.Array(BackgroundJobSchema));

/** 1. Read: the row and the sessions up its chain, nearest first. */
const readOf = ([own, ...up]: ReadonlyArray<SessionRecord>) =>
  own === undefined
    ? null
    : {
        row: {
          id: own.id,
          projectId: own.projectId,
          account: own.account,
          model: own.model,
          settings: own.settings,
          running: own.status === 'running',
          forkedFrom: own.forkedFrom,
          endedAt: own.endedAt,
        },
        lineage: up.map(({ id, title, forkedFrom }) => ({
          id,
          title,
          forkedFrom,
        })),
      };

const Model = Schema.Struct({
  stopping: Schema.Boolean,
  /** Why a stop or a fork was refused, until the next. */
  problem: Schema.NullOr(Schema.String),
  open: Schema.Array(Schema.String),
  row: Schema.NullOr(Row),
  /** The sessions it was forked from, nearest first: none for one not forked. */
  lineage: Schema.Array(Ancestor),
  /** The turn a fork is being made after. */
  forking: Schema.NullOr(Schema.String),
  /** Whether it could once be drawn whole, from this device (6. Ready). */
  ready: Schema.Boolean,
  /** Whether it was drawn whole with its row held here, not as missing (6. Ready). */
  held: Schema.Boolean,
  /** Its agent's Background Jobs, live (4. Stop). */
  jobs: Schema.Array(BackgroundJobSchema),
  /** The jobs asked to stop, until the feed drops them or the stop is refused. */
  stoppingJobs: Schema.Array(Schema.String),
  /** The subagents open over the page, by row id, outermost first (5. Open). */
  drawers: Schema.Array(Schema.String),
  /** The background command open over the page (10. Output). */
  command: Schema.NullOr(OpenCommand),
  /** What it runs now, as its View read it (8. Running). */
  running: Schema.Array(RunningItem),
  /** How the Running Picker is open; null while it is not. */
  picking: Schema.NullOr(Picker.How),
  /** How many times it was opened, so each opening is a fresh Picker. */
  opened: Schema.Finite,
  /** How full its agent's context is, as last told; null while not known (9. Context). */
  context: Schema.NullOr(ContextUsageSchema),
  /** Whether its agent has been asked since the page opened: until then, no way to fetch it shows. */
  contextAsked: Schema.Boolean,
  /** Whether it is being fetched, agent open or closed. */
  contextFetching: Schema.Boolean,
  /** Why it last could not be fetched; null when it could. */
  contextProblem: Schema.NullOr(Schema.String),
  /** When the Draft shows the context, as Preferences say. */
  contextShown: ContextShown,
  /** Whether the session's details are open. */
  details: Schema.Boolean,
  /** Whether its Connection runs here: the Account is the one active, and lists it (11. Here). */
  here: Schema.Boolean,
  /** How many times its Connection started running here while the page was open. */
  runs: Schema.Finite,
});
type Model = typeof Model.Type;

/** How long what a command writes is gathered before the page is told. */
const OUTPUT_EVERY = '200 millis';

/** How long after a read of a command's output is cut off it is read again. */
const OUTPUT_AGAIN = '2 seconds';

/** The page with a command opened over it, in place of what was open; nothing for a job no longer listed. */
const opened = (model: Model, jobId: string): Model => {
  const job = model.jobs.find((each) => each.id === jobId);
  if (job === undefined) return model;
  if (model.command?.jobId === jobId) return { ...model, drawers: [] };
  return {
    ...model,
    drawers: [],
    command: {
      jobId,
      job,
      output: [],
      dropped: 0,
      stopped: model.stoppingJobs.includes(jobId),
      run: 0,
    },
  };
};

/** How often a running turn's context is asked again. */
const CONTEXT_EVERY = '15 seconds';

/** How long fetching the context waits on its Connection before it says it could not. */
const CONTEXT_FETCH_WAIT = '30 seconds';

/** A Query as the page reads it: whether it is read from this device yet. */
interface Reading {
  readonly status: 'loading' | 'ready' | 'failed';
}

// 9. Context
/**
 * The page once its agent was asked: an agent not open answers null, which
 * takes back no reading, whether it last told it or it was fetched without it.
 */
export const contextRead = <
  M extends Pick<Model, 'context' | 'contextAsked' | 'contextProblem'>,
>(
  model: M,
  context: Model['context'],
): M => ({
  ...model,
  context: context ?? model.context,
  contextAsked: true,
  contextProblem: context === null ? model.contextProblem : null,
});

// 6. Ready
/**
 * Whether the session can be drawn whole: its row and messages read from
 * this device; for a row held here, the page's read of it too, each
 * session it carries on from, and its Saved Draft. A row not held here is
 * drawn whole as it is: missing, or waiting for its Connection.
 */
export const readyOf = ({
  sessionId,
  model,
  found,
  messages,
  earlier,
  restored,
}: {
  readonly sessionId: string;
  readonly model: Pick<Model, 'row' | 'lineage'>;
  /** Its row's Query, and whether it holds the row. */
  readonly found: (Reading & { readonly held: boolean }) | undefined;
  readonly messages: Reading | undefined;
  /** The messages of each session it carries on from. */
  readonly earlier: ReadonlyArray<Reading>;
  /** Whether its Draft's Saved Draft is read back. */
  readonly restored: boolean | undefined;
}) => {
  const read = (query: Reading | undefined) =>
    query !== undefined && query.status !== 'loading';
  if (!read(found) || !read(messages)) return false;
  if (found?.held !== true) return true;
  return (
    model.row?.id === sessionId &&
    restored === true &&
    earlier.length >= model.lineage.length &&
    earlier.every(read)
  );
};

export const Session = Page.define({
  path: '/s/:sessionId',
  params: { sessionId: Schema.String },
  metadata: { title: 'Session · code' },
  requires: [CodeClient, Replicas, Storage, Connections, Preferences],
  model: Model,
  message: Schema.TaggedUnion({
    Read: Read.fields,
    StopAsked: {},
    Stopped: {},
    Toggled: { id: Schema.String },
    JobsHeard: { jobs: Schema.Array(BackgroundJobSchema) },
    JobStopAsked: { jobId: Schema.String },
    JobStopped: { jobId: Schema.String },
    /** A subagent opened over the drawers open, or, `under` that many, in place of those above. */
    DrawerOpened: { id: Schema.String, under: Schema.Finite },
    /** The drawers from `depth` on closed: 0 closes them all. */
    DrawersClosed: { depth: Schema.Finite },
    RunningRead: { items: Schema.Array(RunningItem) },
    /** A background command opened over the page, in place of what was open. */
    CommandOpened: { jobId: Schema.String },
    CommandClosed: {},
    /** What the open command wrote since. */
    OutputHeard: {
      jobId: Schema.String,
      run: Schema.Finite,
      text: Schema.String,
    },
    RunningOpened: { how: Picker.How },
    /** The Running Picker finished: on its last choice, or with none. */
    RunningDone: { last: Schema.NullOr(RunningChosen) },
    ForkAsked: { afterTurnId: Schema.String },
    Forked: { projectId: Schema.String, sessionId: Schema.String },
    Refused,
    /** All it draws is read from this device: it can be drawn whole, its row held or not. */
    Ready: { held: Schema.Boolean },
    /** How full the session's context is, as its agent said; null when it could not. */
    ContextRead: {
      sessionId: Schema.String,
      context: Schema.NullOr(ContextUsageSchema),
    },
    ContextShownRead: { shown: ContextShown },
    /** The context asked for by hand, even with its agent closed. */
    ContextFetchAsked: {},
    /** How that went: what it read, or why it could not. */
    ContextFetched: {
      sessionId: Schema.String,
      context: Schema.NullOr(ContextUsageSchema),
      problem: Schema.NullOr(Schema.String),
    },
    DetailsToggled: { open: Schema.Boolean },
    /** Whether its Connection runs here now. */
    ConnectionKnown: { here: Schema.Boolean },
  }),
});

export const SessionLive = Session.build({
  init: () => ({
    model: {
      stopping: false,
      problem: null,
      open: [],
      row: null,
      lineage: [],
      forking: null,
      ready: false,
      held: false,
      jobs: [],
      stoppingJobs: [],
      drawers: [],
      command: null,
      running: [],
      picking: null,
      opened: 0,
      context: null,
      contextAsked: false,
      contextFetching: false,
      contextProblem: null,
      contextShown: 'always',
      details: false,
      here: false,
      runs: 0,
    },
  }),
  // 8. Running
  provides: (self) =>
    RunningPicker.owner((last) => self.send({ _tag: 'RunningDone', last })),
  children: {
    // 1. Read, 8. Running: the transcript, and the Running Picker over it.
    // 11. Here: anew once its Connection runs here again.
    transcript: Actor.child(Transcript.actor, {
      key: ({ model }) => readingOf(model.runs),
      props: ({ model, props }) => ({
        connectionId: connectionIn(props.route.params),
        sessionId: props.params.sessionId,
        earlier: model.lineage.map(({ id }) => id),
        running: model.running,
        picking: model.picking,
        opened: model.opened,
      }),
    }),
    // 2. Draft: once its row is this session's, the agent it runs.
    draft: Actor.child(Draft.actor, {
      key: ({ props }) => props.params.sessionId,
      props: ({ model, props }) => {
        const row = model.row?.id === props.params.sessionId ? model.row : null;
        return {
          accountId: accountIn(props.route.params),
          connectionId: connectionIn(props.route.params),
          projectId: projectIn(props.route.params),
          to: {
            _tag: 'Session' as const,
            sessionId: props.params.sessionId,
            agent:
              row === null
                ? null
                : {
                    account: row.account,
                    model: row.model,
                    settings: row.settings,
                  },
            running: row?.running ?? false,
          },
        };
      },
    }),
    // 7. Question
    question: Actor.child(Question.actor, {
      key: ({ props }) => props.params.sessionId,
      props: ({ props }) => ({
        connectionId: connectionIn(props.route.params),
        sessionId: props.params.sessionId,
      }),
    }),
  },
  workers: {
    // 9. Context: asked again as a turn ends or starts, and as its details open.
    context: {
      each: ({ model, props }) =>
        model.here && model.row?.id === props.params.sessionId
          ? [
              [
                props.params.sessionId,
                model.row.endedAt ?? 0,
                model.row.running,
                model.details,
              ].join(' '),
            ]
          : [],
      run: (self) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const { sessionId } = props.params;
          const ask = CodeClient.use((api) =>
            api.contextUsage({ sessionId }),
          ).pipe(
            Effect.map((context) => context as typeof model.context),
            Effect.orElseSucceed(() => null),
            Effect.flatMap((context) =>
              self.send({ _tag: 'ContextRead', sessionId, context }),
            ),
          );
          yield* ask;
          // While a turn runs, it fills: asked again every so often.
          if (model.row?.running === true)
            yield* Effect.forever(
              Effect.andThen(Effect.sleep(CONTEXT_EVERY), ask),
            );
        }),
    },
    // 9. Context: asked for by hand, even with its agent closed.
    contextFetch: {
      each: ({ model, props }) =>
        model.here && model.contextFetching ? [props.params.sessionId] : [],
      run: (self, sessionId) =>
        CodeClient.use((api) => api.fetchContext({ sessionId })).pipe(
          Effect.timeout(CONTEXT_FETCH_WAIT),
          Effect.match({
            onSuccess: (context) => ({
              context: context as Model['context'],
              problem: null,
            }),
            onFailure: (error) => ({
              context: null,
              problem:
                error._tag === 'HarnessFailed'
                  ? error.message
                  : 'Its Connection did not answer',
            }),
          }),
          Effect.flatMap((fetched) =>
            self.send({ _tag: 'ContextFetched', sessionId, ...fetched }),
          ),
        ),
    },
    contextShown: {
      run: (self) =>
        Stream.runForEach(
          Stream.concat(Stream.make(undefined), Preferences.changes),
          () =>
            Effect.flatMap(Preferences.read, ({ context }) =>
              self.send({ _tag: 'ContextShownRead', shown: context }),
            ),
        ),
    },
    // 10. Output: the open command's, while it is open, a few pieces at a
    // time. A read the socket cut off is read again, from the last of it.
    output: {
      each: ({ model }) =>
        model.here && model.command !== null ? [model.command.jobId] : [],
      run: (self, jobId) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const { sessionId } = props.params;
          let run = 0;
          const read = Effect.suspend(() => {
            run += 1;
            const now = run;
            return Stream.unwrap(
              Effect.map(CodeClient, (api) =>
                api.backgroundJobOutput({ sessionId, jobId }),
              ),
            ).pipe(
              Stream.groupedWithin(256, OUTPUT_EVERY),
              Stream.map((pieces) => pieces.join('')),
              Stream.runForEach((text) =>
                self.send({ _tag: 'OutputHeard', jobId, run: now, text }),
              ),
            );
          });
          // Its output is only shown: one that cannot be read shows none.
          yield* read.pipe(
            Effect.retry(Schedule.spaced(OUTPUT_AGAIN)),
            Effect.ignore,
          );
        }),
    },
    // 4. Stop: its jobs, live.
    jobs: {
      each: ({ props }) => [props.params.sessionId],
      run: (self, sessionId) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const connections = yield* Connections;
          yield* connections.jobs(connectionIn(props.route.params)).pipe(
            Stream.map(
              (all) =>
                all.find((each) => each.sessionId === sessionId)?.jobs ?? [],
            ),
            Stream.changesWith(sameJobs),
            Stream.runForEach((jobs) =>
              self.send({ _tag: 'JobsHeard', jobs: [...jobs] }),
            ),
          );
        }),
    },
    // 11. Here
    connection: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const connections = yield* Connections;
          yield* connections.connection(connectionIn(props.route.params)).pipe(
            Stream.map((listed) => listed !== null),
            Stream.changes,
            Stream.runForEach((here) =>
              self.send({ _tag: 'ConnectionKnown', here }),
            ),
          );
        }),
    },
    // 1. Read
    row: {
      each: ({ model, props }) => (model.here ? [props.params.sessionId] : []),
      run: (self, sessionId) =>
        Effect.flatMap(self.get, ({ props }) =>
          lineage(connectionIn(props.route.params), sessionId).pipe(
            Stream.map(readOf),
            Stream.filter((read) => read !== null),
            Stream.changesWith(sameRead),
            Stream.runForEach((read) => self.send({ _tag: 'Read', ...read })),
          ),
        ),
    },
  },
  on: {
    // 11. Here
    ConnectionKnown: ({ here }, { model }) => ({
      model: {
        ...model,
        here,
        runs: runsAfter(model, here),
        contextFetching: here && model.contextFetching,
      },
    }),
    // 9. Context
    ContextRead: ({ sessionId, context }, { model, props }) =>
      sessionId === props.params.sessionId
        ? { model: contextRead(model, context) }
        : {},
    ContextFetchAsked: (_, { model }) =>
      !model.here || model.contextFetching
        ? {}
        : { model: { ...model, contextFetching: true } },
    ContextFetched: ({ sessionId, context, problem }, { model, props }) =>
      sessionId === props.params.sessionId
        ? {
            model: {
              ...model,
              context: context ?? model.context,
              contextFetching: false,
              contextProblem: problem,
            },
          }
        : {},
    ContextShownRead: ({ shown }, { model }) =>
      model.contextShown === shown
        ? {}
        : { model: { ...model, contextShown: shown } },
    DetailsToggled: ({ open }, { model }) =>
      model.details === open ? {} : { model: { ...model, details: open } },
    Read: ({ row, lineage }, { model, props }) => ({
      model: {
        ...model,
        row,
        lineage,
        // Another session's context is not this one's.
        ...(model.row !== null && model.row.id !== row.id
          ? {
              context: null,
              contextAsked: false,
              contextFetching: false,
              contextProblem: null,
              details: false,
            }
          : {}),
      },
      // Seen up to the end of its last turn: on opening, and as each ends.
      ...(model.row?.id === row.id && model.row.endedAt === row.endedAt
        ? {}
        : {
            command: markSeen({
              connectionId: connectionIn(props.route.params),
              projectId: row.projectId,
              sessionId: row.id,
              seen: row.endedAt ?? 0,
            }),
          }),
    }),
    // 3. Fork
    ForkAsked: ({ afterTurnId }, { model, props }) =>
      model.forking !== null
        ? {}
        : {
            model: { ...model, forking: afterTurnId, problem: null },
            command: forkSession({
              sessionId: props.params.sessionId,
              afterTurnId,
            }),
          },
    Forked: ({ projectId, sessionId }, { model, props }) => ({
      model: { ...model, forking: null },
      command: Router.push(
        session(
          accountIn(props.route.params),
          connectionIn(props.route.params),
          projectId,
          sessionId,
        ),
      ),
    }),
    // 4. Stop
    StopAsked: (_, { model, props }) =>
      model.stopping
        ? {}
        : {
            model: { ...model, stopping: true, problem: null },
            command: cancel({ sessionId: props.params.sessionId }),
          },
    Stopped: (_, { model }) => ({ model: { ...model, stopping: false } }),
    JobsHeard: ({ jobs }, { model }) => ({
      model: {
        ...model,
        jobs,
        // The open command keeps its job as last listed.
        command:
          model.command === null
            ? null
            : {
                ...model.command,
                job:
                  jobs.find((job) => job.id === model.command?.jobId) ??
                  model.command.job,
              },
        stoppingJobs: model.stoppingJobs.filter((id) =>
          jobs.some((job) => job.id === id),
        ),
      },
    }),
    JobStopAsked: ({ jobId }, { model, props }) =>
      model.stoppingJobs.includes(jobId)
        ? {}
        : {
            model: {
              ...model,
              stoppingJobs: [...model.stoppingJobs, jobId],
              problem: null,
              command:
                model.command?.jobId === jobId
                  ? { ...model.command, stopped: true }
                  : model.command,
            },
            command: stopJob({ sessionId: props.params.sessionId, jobId }),
          },
    // Stopped: the feed drops it.
    JobStopped: () => ({}),
    Refused: ({ reason }, { model }) => ({
      model: {
        ...model,
        problem: reason,
        stopping: false,
        forking: null,
        stoppingJobs: [],
        // A stop refused did not stop it: it may yet end on its own.
        command:
          model.command === null ? null : { ...model.command, stopped: false },
      },
    }),
    DrawerOpened: ({ id, under }, { model }) => {
      const kept = model.drawers.slice(0, under);
      return kept.at(-1) === id
        ? { model: { ...model, drawers: kept, command: null } }
        : { model: { ...model, drawers: [...kept, id], command: null } };
    },
    // 10. Output
    CommandOpened: ({ jobId }, { model }) => ({
      model: opened(model, jobId),
    }),
    CommandClosed: (_, { model }) =>
      model.command === null ? {} : { model: { ...model, command: null } },
    OutputHeard: ({ jobId, run, text }, { model }) =>
      model.command?.jobId !== jobId
        ? {}
        : { model: { ...model, command: written(model.command, run, text) } },
    // 8. Running: an open Picker stays until it is closed, whatever ends
    // meanwhile, so the keys never wait on one that is gone.
    RunningRead: ({ items }, { model }) => ({
      model: { ...model, running: items },
    }),
    RunningOpened: ({ how }, { model }) =>
      model.picking !== null
        ? {}
        : { model: { ...model, picking: how, opened: model.opened + 1 } },
    RunningDone: ({ last }, { model, props }) => {
      const closed = { ...model, picking: null };
      const choice = last === null ? null : choiceOf(last, model.running);
      if (choice === null) return { model: closed };
      switch (choice._tag) {
        // Chosen in a Drawer, by touch: once it has slid away.
        case 'Open':
          return model.picking === 'touch'
            ? {
                model: { ...closed, drawers: [] },
                command: openAfterDrawer({ id: choice.rowId }),
              }
            : { model: { ...closed, drawers: [choice.rowId] } };
        case 'OpenCommand':
          return model.picking === 'touch'
            ? {
                model: { ...closed, command: null },
                command: openCommandAfterDrawer({ jobId: choice.jobId }),
              }
            : { model: opened(closed, choice.jobId) };
        case 'StopAll':
          return model.stopping
            ? { model: closed }
            : {
                model: { ...closed, stopping: true, problem: null },
                command: cancel({ sessionId: props.params.sessionId }),
              };
      }
    },
    DrawersClosed: ({ depth }, { model }) =>
      model.drawers.length <= depth
        ? {}
        : { model: { ...model, drawers: model.drawers.slice(0, depth) } },
    // 6. Ready, once, and once more when its row is held.
    Ready: ({ held }, { model }) =>
      model.ready && (model.held || !held)
        ? {}
        : { model: { ...model, ready: true, held } },
    // 5. Open
    Toggled: ({ id }, { model }) => ({
      model: {
        ...model,
        open: model.open.includes(id)
          ? model.open.filter((each) => each !== id)
          : [...model.open, id],
      },
    }),
  },
});
