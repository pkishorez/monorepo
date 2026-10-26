import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import {
  AskAnswerSchema,
  AttachmentSchema,
  ContextUsageSchema,
  McpServerStatusSchema,
} from '@kestack/ai-toolkit/contract';
import { SessionSchema } from '../../records/index.js';
import {
  AskFailed,
  HarnessFailed,
  NotForkable,
  ProjectNotFound,
  SessionNotFound,
  UnknownAccount,
} from './errors.js';
import { Batch, Cursor } from './wire.js';

/* Sessions as a whole: started, forked, Settled, asked, and how they stand. */

/** A Session as a reply carries it; an older Connect's is read as it is now. */
export const SessionValue = SessionSchema.schema;

export const SessionsRpc = RpcGroup.make(
  /** Starts a Session, already running its first message. */
  Rpc.make('startSession', {
    payload: {
      /**
       * Its id, chosen by the App so it knows the Session before the
       * answer: a ULID. The Machine chooses one when it is not given, or
       * is another Project's Session's. Asked again with one of this
       * Project's, it starts nothing and answers with that Session as it
       * is now.
       */
      id: Schema.optionalKey(
        Schema.String.check(Schema.isPattern(/^[0-9A-HJKMNP-TV-Z]{26}$/)),
      ),
      projectId: Schema.String,
      /** The Harness Account it runs as, and so its harness. */
      account: Schema.String,
      model: Schema.String,
      settings: Schema.Record(Schema.String, Schema.String),
      text: Schema.String,
      attachments: Schema.Array(AttachmentSchema),
    },
    success: SessionValue,
    error: Schema.Union([ProjectNotFound, UnknownAccount]),
  }),
  /**
   * A new Session in the same harness with the context up to the end of a
   * finished Turn, its own or one it inherited; null forks after the latest.
   * Nothing is copied: `forkedFrom` names the Session whose Messages hold
   * that Turn, and the Fork's own Messages start after it.
   */
  Rpc.make('forkSession', {
    payload: {
      sessionId: Schema.String,
      afterTurnId: Schema.NullOr(Schema.String),
    },
    success: SessionValue,
    error: Schema.Union([SessionNotFound, NotForkable]),
  }),
  /** Settles a Session; a running Turn carries on. */
  Rpc.make('settleSession', {
    payload: { sessionId: Schema.String },
    error: SessionNotFound,
  }),
  Rpc.make('unsettleSession', {
    payload: { sessionId: Schema.String },
    error: SessionNotFound,
  }),
  /**
   * Puts a question to a Session's context, leaving the Session untouched.
   * With a JSON Schema the answer is data of that shape. Never stored.
   */
  Rpc.make('ask', {
    payload: {
      sessionId: Schema.String,
      question: Schema.String,
      schema: Schema.NullOr(Schema.Unknown),
    },
    success: AskAnswerSchema,
    error: Schema.Union([SessionNotFound, AskFailed]),
  }),
  /** Writes the Session's Title afresh from its latest user messages. */
  Rpc.make('regenerateTitle', {
    payload: { sessionId: Schema.String },
    success: Schema.String,
    error: SessionNotFound,
  }),
  /** Which MCP servers the Session's agent is connected to; opens it if needed. */
  Rpc.make('mcpStatus', {
    payload: { sessionId: Schema.String },
    success: Schema.Array(McpServerStatusSchema),
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
  /** How full the Session's context is; opens its agent if needed. */
  Rpc.make('contextUsage', {
    payload: { sessionId: Schema.String },
    success: ContextUsageSchema,
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
  /** Every Session changed after the cursor, then each change live. */
  Rpc.make('sessions', { payload: Cursor, success: Batch, stream: true }),
);
