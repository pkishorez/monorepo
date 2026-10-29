import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import {
  AttachmentSchema,
  ContextUsageSchema,
  JsonSchema,
  McpServerStatusSchema,
} from '@kestack/ai-toolkit/contract';
import { SessionSchema } from '../../records/index.js';
import {
  AskFailed,
  GitFailed,
  HarnessFailed,
  NotForkable,
  ProjectNotFound,
  SessionNotFound,
  UnknownAccount,
} from './errors.js';
import { Batch, Cursor, Opaque, tagged } from './wire.js';

/* Sessions as a whole: started, forked, Settled, asked, and how they stand. */

/** A Session as a reply carries it, with its version. */
export const SessionValue = SessionSchema.schema;

/** An Ask's answer: text, or data shaped by the schema it was given. */
const AskAnswer = ValueESchema.make(
  'AskAnswer',
  Schema.Union([
    tagged('Text', { text: Schema.String }),
    tagged('Data', { data: JsonSchema }),
  ]),
).build();

/** Which MCP servers a Session's agent has; a status has optional fields, so the list is one value. */
const McpServers = ValueESchema.make(
  'McpServers',
  Schema.Array(McpServerStatusSchema),
).build();

/** How full a Session's context is; its counts are optional, so it is a value. */
const ContextUsage = ValueESchema.make(
  'ContextUsage',
  ContextUsageSchema,
).build();

/**
 * The steps of starting a Session, each run only when it is needed:
 *
 * - switchingBranch  the Project's folder switches to the branch picked, an
 *                    Origin branch first made a local one that tracks it.
 * - makingWorktree   a new Worktree is made, on a new branch from the one
 *                    picked.
 * - startingAgent    the Session starts, running its first message.
 */
export const START_STEPS = [
  'switchingBranch',
  'makingWorktree',
  'startingAgent',
] as const;
export type StartStepName = (typeof START_STEPS)[number];

/**
 * How starting a Session goes: each step as it begins and as it is done,
 * then Started with the Session. A git step that fails ends it with
 * GitFailed, and no Session is kept.
 */
export const StartStep = ValueESchema.make(
  'StartStep',
  Schema.Union([
    tagged('Step', {
      step: Schema.Literals(START_STEPS),
      state: Schema.Literals(['running', 'done']),
    }),
    tagged('Started', { session: SessionValue }),
  ]),
).build();
export type StartStep = typeof StartStep.Type;

/** What a command on one Session takes, named for its command. */
const OnSession = (name: string) =>
  ESchema.make(name, { sessionId: Schema.String }).build().schema;

export const SessionsRpc = RpcGroup.make(
  /**
   * Starts a Session, already running its first message, and streams how
   * it goes: each StartStep, ending with Started.
   */
  Rpc.make('startSession', {
    payload: ESchema.make('StartSessionPayload', {
      /**
       * Its id, chosen by the App so it knows the Session before the
       * answer: a ULID. The Connection chooses one when it is null, or
       * is another Project's Session's. Asked again with one of this
       * Project's, it starts nothing and answers Started with that Session
       * as it is now.
       */
      id: Schema.NullOr(
        Schema.String.check(Schema.isPattern(/^[0-9A-HJKMNP-TV-Z]{26}$/)),
      ),
      projectId: Schema.String,
      /** The Harness Account it runs as, and so its harness. */
      account: Schema.String,
      model: Schema.String,
      settings: Schema.Record(Schema.String, Schema.String),
      text: Schema.String,
      attachments: Schema.Array(AttachmentSchema),
    })
      .evolve(
        'v2',
        {
          /**
           * The branch it runs on, local (`main`) or Origin (`origin/main`);
           * null for wherever the Project's folder is. Ignored when the
           * Project is not a git repository.
           */
          branch: Schema.NullOr(Schema.String),
          /**
           * Whether it runs in a new Worktree, on a new branch from `branch`;
           * else in the Worktree that has `branch`, or the Project's folder
           * switched to it.
           */
          newWorktree: Schema.Boolean,
        },
        (previous) => ({ ...previous, branch: null, newWorktree: false }),
      )
      .build().schema,
    success: StartStep.schema,
    error: Schema.Union([ProjectNotFound, UnknownAccount, GitFailed]),
    stream: true,
  }),
  /**
   * A new Session in the same harness with the context up to the end of a
   * finished Turn, its own or one it inherited; null forks after the latest.
   * Nothing is copied: `forkedFrom` names the Session whose Messages hold
   * that Turn, and the Fork's own Messages start after it.
   */
  Rpc.make('forkSession', {
    payload: ESchema.make('ForkSessionPayload', {
      sessionId: Schema.String,
      afterTurnId: Schema.NullOr(Schema.String),
    }).build().schema,
    success: SessionValue,
    error: Schema.Union([SessionNotFound, NotForkable]),
  }),
  /** Settles a Session; a running Turn carries on. */
  Rpc.make('settleSession', {
    payload: OnSession('SettleSessionPayload'),
    error: SessionNotFound,
  }),
  Rpc.make('unsettleSession', {
    payload: OnSession('UnsettleSessionPayload'),
    error: SessionNotFound,
  }),
  /**
   * Puts a question to a Session's context, leaving the Session untouched.
   * With a JSON Schema the answer is data of that shape. Never stored.
   */
  Rpc.make('ask', {
    payload: ESchema.make('AskPayload', {
      sessionId: Schema.String,
      question: Schema.String,
      schema: Schema.NullOr(Opaque),
    }).build().schema,
    success: AskAnswer.schema,
    error: Schema.Union([SessionNotFound, AskFailed]),
  }),
  /** Writes the Session's Title afresh from its latest user messages. */
  Rpc.make('regenerateTitle', {
    payload: OnSession('RegenerateTitlePayload'),
    success: Schema.String,
    error: SessionNotFound,
  }),
  /** Which MCP servers the Session's agent is connected to; opens it if needed. */
  Rpc.make('mcpStatus', {
    payload: OnSession('McpStatusPayload'),
    success: McpServers.schema,
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
  /** How full the Session's context is; opens its agent if needed. */
  Rpc.make('contextUsage', {
    payload: OnSession('ContextUsagePayload'),
    success: ContextUsage.schema,
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
  /** Every Session changed after the cursor, then each change live. */
  Rpc.make('sessions', {
    payload: Cursor.schema,
    success: Batch,
    stream: true,
  }),
);
