import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { EntityMetaSchema } from '@kestack/std-toolkit/core';
import {
  AskAnswerSchema,
  AttachmentSchema,
  BackgroundJobSchema,
  BinaryInfoSchema,
  ContextUsageSchema,
  McpServerStatusSchema,
  SkillSchema,
} from '../../harness-wire/index.js';
import { HARNESS_NAMES } from '../../raw/index.js';
import { ProjectSchema, SessionSchema } from '../../records/index.js';

/*
 * The one API every app speaks, over WebSocket: commands that ask the engine
 * to do something, and feeds that replay every change after a cursor, then
 * stay live. Feeds carry entities in encoded form, each at its own version,
 * so a client keeps them as they came and reads them with its own ESchemas.
 */

/** An entity in encoded form, as feeds send it and take it back as a cursor. */
export const WireEntity = Schema.Struct({
  value: Schema.Unknown,
  meta: EntityMetaSchema,
});
export type WireEntity = typeof WireEntity.Type;

// The records the API speaks of, as clients read them.
export {
  MessageSchema,
  PartSchema,
  type Message,
  type Part,
  type Role,
  type ToolKind,
  type TurnEndStatus,
  type Usage,
} from '../../projection/index.js';
export {
  HarnessConfigSchema,
  ProjectSchema,
  SessionSchema,
  type HarnessConfig,
  type Project,
  type Session,
  type SessionStatus,
} from '../../records/index.js';
export {
  AskAnswerSchema,
  AttachmentSchema,
  BACKGROUND_JOB_KINDS,
  BackgroundJobSchema,
  BinaryInfoSchema,
  ContextUsageSchema,
  MCP_SERVER_STATES,
  McpServerStatusSchema,
  SkillSchema,
  type AskAnswer,
  type Attachment,
  type BackgroundJob,
  type BackgroundJobKind,
  type BinaryInfo,
  type ContextUsage,
  type McpServerState,
  type McpServerStatus,
  type Skill,
} from '../../harness-wire/index.js';
export type { Json } from '../../raw/index.js';
export type { HarnessName } from '../../raw/index.js';

const Cursor = { after: Schema.NullOr(WireEntity) };
const Batch = Schema.Array(WireEntity);

export const Harness = Schema.Literals(HARNESS_NAMES);

/** One agent-specific setting, with what a client draws a picker from. */
export const SettingInfo = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
  choices: Schema.Array(
    Schema.Struct({ value: Schema.String, label: Schema.String }),
  ),
  default: Schema.String,
});

export const HarnessInfo = Schema.Struct({
  name: Harness,
  label: Schema.String,
  settings: Schema.Array(SettingInfo),
  /** The account's default model when the harness can say, else its own. */
  defaultModel: Schema.String,
  /** Its Harness Binary runs; a client offers it for new Sessions only then. */
  available: Schema.Boolean,
  /** Why its Harness Binary does not run; null when it does. */
  unavailableReason: Schema.NullOr(Schema.String),
});
export type HarnessInfo = typeof HarnessInfo.Type;

export const ModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** As models.dev gives it, `YYYY-MM-DD`; null when it lacks the model. */
  releaseDate: Schema.NullOr(Schema.String),
});
export type ModelInfo = typeof ModelInfo.Type;

export const ProjectValue = Schema.Struct(ProjectSchema.fields);
export const SessionValue = Schema.Struct(SessionSchema.fields);

/** One harness's Background Jobs, by the Session whose agent started them. */
export const SessionJobs = Schema.Struct({
  sessionId: Schema.String,
  projectId: Schema.String,
  jobs: Schema.Array(BackgroundJobSchema),
});
export type SessionJobs = typeof SessionJobs.Type;

/** A harness's Harness Binary: the path set for it, and what it resolved to. */
export const HarnessBinary = Schema.Struct({
  harness: Harness,
  /** null runs the harness's default. */
  configuredPath: Schema.NullOr(Schema.String),
  resolved: BinaryInfoSchema,
});
export type HarnessBinary = typeof HarnessBinary.Type;

export class FolderNotFound extends Schema.TaggedError<FolderNotFound>()(
  'FolderNotFound',
  { path: Schema.String },
) {}

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()(
  'ProjectNotFound',
  { id: Schema.String },
) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()(
  'SessionNotFound',
  { id: Schema.String },
) {}

export class UnknownHarness extends Schema.TaggedError<UnknownHarness>()(
  'UnknownHarness',
  { harness: Schema.String },
) {}

export class ModelsUnavailable extends Schema.TaggedError<ModelsUnavailable>()(
  'ModelsUnavailable',
  { message: Schema.String },
) {}

/** The Turn asked for cannot be forked after. */
export class NotForkable extends Schema.TaggedError<NotForkable>()(
  'NotForkable',
  { reason: Schema.String },
) {}

export class AskFailed extends Schema.TaggedError<AskFailed>()('AskFailed', {
  message: Schema.String,
}) {}

export class SkillsUnavailable extends Schema.TaggedError<SkillsUnavailable>()(
  'SkillsUnavailable',
  { message: Schema.String },
) {}

/** The path is missing, not executable, or its `--version` failed. */
export class InvalidBinary extends Schema.TaggedError<InvalidBinary>()(
  'InvalidBinary',
  { message: Schema.String },
) {}

/** A harness failed to answer for a live Session. */
export class HarnessFailed extends Schema.TaggedError<HarnessFailed>()(
  'HarnessFailed',
  { message: Schema.String },
) {}

export class AiApi extends RpcGroup.make(
  /** Every Coding Harness this server runs. */
  Rpc.make('harnesses', { success: Schema.Array(HarnessInfo) }),
  /**
   * The models a harness can run on this machine's login, filled in from
   * models.dev, newest first; the models.dev models it accepts when the
   * login cannot be asked.
   */
  Rpc.make('models', {
    payload: { harness: Harness },
    success: Schema.Array(ModelInfo),
    error: ModelsUnavailable,
  }),
  /** Adds a folder as a Project; the one already added for it, if any. */
  Rpc.make('addProject', {
    payload: { path: Schema.String },
    success: ProjectValue,
    error: FolderNotFound,
  }),
  /** Removes a Project; its folder is never touched. */
  Rpc.make('removeProject', {
    payload: { id: Schema.String },
    error: ProjectNotFound,
  }),
  /** Starts a Session, already running its first message. */
  Rpc.make('startSession', {
    payload: {
      projectId: Schema.String,
      harness: Harness,
      model: Schema.String,
      settings: Schema.Record(Schema.String, Schema.String),
      text: Schema.String,
      attachments: Schema.Array(AttachmentSchema),
    },
    success: SessionValue,
    error: Schema.Union([ProjectNotFound, UnknownHarness]),
  }),
  /**
   * Starts a turn, or steers the running one. A model or settings given
   * hold from this Turn on, within the Session's harness.
   */
  Rpc.make('send', {
    payload: {
      sessionId: Schema.String,
      text: Schema.String,
      attachments: Schema.Array(AttachmentSchema),
      model: Schema.optionalKey(Schema.String),
      settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    },
    error: SessionNotFound,
  }),
  Rpc.make('cancel', {
    payload: { sessionId: Schema.String },
    error: SessionNotFound,
  }),
  /**
   * A new Session in the same harness with the context up to the end of a
   * finished Turn; null forks after the latest finished Turn.
   */
  Rpc.make('forkSession', {
    payload: {
      sessionId: Schema.String,
      afterTurnId: Schema.NullOr(Schema.String),
    },
    success: SessionValue,
    error: Schema.Union([SessionNotFound, NotForkable]),
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
  /** The Skills a harness offers in a Project's folder. */
  Rpc.make('skills', {
    payload: { projectId: Schema.String, harness: Harness },
    success: Schema.Array(SkillSchema),
    error: Schema.Union([ProjectNotFound, SkillsUnavailable]),
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
  /** Every Session's Background Jobs, whole, then again on each change. */
  Rpc.make('backgroundJobs', {
    success: Schema.Array(SessionJobs),
    stream: true,
  }),
  Rpc.make('stopBackgroundJob', {
    payload: { sessionId: Schema.String, jobId: Schema.String },
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
  /** Every harness's Harness Binary. */
  Rpc.make('harnessBinaries', { success: Schema.Array(HarnessBinary) }),
  /** Sets a harness's Harness Binary once it runs; null goes back to the default. */
  Rpc.make('setHarnessBinary', {
    payload: { harness: Harness, path: Schema.NullOr(Schema.String) },
    success: HarnessBinary,
    error: InvalidBinary,
  }),
  /** Every Project changed after the cursor, then each change live. */
  Rpc.make('projects', { payload: Cursor, success: Batch, stream: true }),
  /** Every Session changed after the cursor, then each change live. */
  Rpc.make('sessions', { payload: Cursor, success: Batch, stream: true }),
  /** A session's Messages after the cursor, then each new one live. */
  Rpc.make('messages', {
    payload: { sessionId: Schema.String, ...Cursor },
    success: Batch,
    stream: true,
  }),
) {}
