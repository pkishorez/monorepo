import { Effect, Schema, Stream } from 'effect';
import {
  CodeClient,
  type Session as SessionRecord,
} from '@kestack/connect/code';
import { Page, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import {
  connectionIn,
  projectIn,
  session,
} from '../../../../../../routes/index.ts';
import { Refused } from '../../../../connection/link/index.ts';
import {
  lineage,
  Messages,
  SessionRow,
} from '../../../../connection/records/index.ts';
import { Connections } from '../../../../connections.ts';
import { Seen } from '../../../../connection/store/index.ts';
import { Draft } from '../draft/index.ts';
import { cancel, forkSession, markSeen } from './commands.ts';
import { Question } from './question/index.ts';

/*
 * A session: its row, its messages, its Draft (`draft/`), and the Question
 * Panel that stands in for it while its agent asks (`question/`).
 *
 * 1. Read     the row says whether it runs; its messages sync while the
 *             page is open, through the session's Window. A Worker follows
 *             the row and the rows of the sessions it was forked from: the
 *             agent and project it is in, and, for a fork, each session up
 *             the chain, whose messages sync too, one Window each, so the
 *             history it carries on from can be drawn before its own.
 *             Reading it marks it seen on this device, up to the end of
 *             its last turn, and so does each turn ending while it is open.
 * 2. Draft    the next message, a Child of its own, fresh for each session,
 *             handed the session's agent and whether it runs.
 * 3. Fork     a new session from this one's context up to a turn's end;
 *             the app moves to it.
 * 4. Stop     cancels the running turn.
 * 5. Open     which tool calls, thoughts and subagents are shown open.
 * 6. Ready     it is drawn whole, transcript and Draft in one step, once
 *              all of it is read from this device (`readyOf`): its row, its
 *              messages, those it carries on from, and its Saved Draft.
 *              Its View says so once, so Layout first draws it whole.
 * 7. Question  the Agent Questions its agent waits on, answered in the
 *              Question Panel, a Child of its own, fresh for each session.
 */

const ForkedFrom = Schema.NullOr(
  Schema.Struct({ sessionId: Schema.String, turnId: Schema.String }),
);

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
});
type Model = typeof Model.Type;

/** A Query as the page reads it: whether it is read from this device yet. */
interface Reading {
  readonly status: 'loading' | 'ready' | 'failed';
}

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
  requires: [CodeClient, Replicas, Seen, Connections],
  model: Model,
  message: Schema.TaggedUnion({
    Read: Read.fields,
    StopAsked: {},
    Stopped: {},
    Toggled: { id: Schema.String },
    ForkAsked: { afterTurnId: Schema.String },
    Forked: { projectId: Schema.String, sessionId: Schema.String },
    Refused,
    /** All it draws is read from this device: it can be drawn whole. */
    Ready: {},
  }),
});

export const SessionLive = Page.build(Session, {
  init: () => ({
    model: {
      stopping: false,
      problem: null,
      open: [],
      row: null,
      lineage: [],
      forking: null,
      ready: false,
    },
  }),
  children: {
    // 1. Read
    session: {
      actor: SessionRow,
      props: ({ props }) => ({
        connectionId: connectionIn(props.route.params),
        sessionId: props.params.sessionId,
      }),
    },
    messages: {
      actor: Messages,
      props: ({ props }) => ({
        connectionId: connectionIn(props.route.params),
        sessionId: props.params.sessionId,
      }),
    },
    // A Fork is on its original's Connection.
    earlier: {
      actor: Messages,
      each: ({ model }) => model.lineage.map(({ id }) => id),
      props: ({ props }, sessionId) => ({
        connectionId: connectionIn(props.route.params),
        sessionId,
      }),
    },
    // 2. Draft: once its row is this session's, the agent it runs.
    draft: {
      actor: Draft.actor,
      key: ({ props }) => props.params.sessionId,
      props: ({ model, props }) => {
        const row = model.row?.id === props.params.sessionId ? model.row : null;
        return {
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
    },
    // 7. Question
    question: {
      actor: Question.actor,
      key: ({ props }) => props.params.sessionId,
      props: ({ props }) => ({
        connectionId: connectionIn(props.route.params),
        sessionId: props.params.sessionId,
      }),
    },
  },
  workers: {
    // 1. Read
    row: {
      each: ({ props }) => [props.params.sessionId],
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
    Read: ({ row, lineage }, { model, props }) => ({
      model: { ...model, row, lineage },
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
        session(connectionIn(props.route.params), projectId, sessionId),
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
    Refused: ({ reason }, { model }) => ({
      model: { ...model, problem: reason, stopping: false, forking: null },
    }),
    // 6. Ready, once.
    Ready: (_, { model }) =>
      model.ready ? {} : { model: { ...model, ready: true } },
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
