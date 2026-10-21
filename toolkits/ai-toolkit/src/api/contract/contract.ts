import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { EntityMetaSchema } from '@kestack/std-toolkit/core';
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
  ProjectSchema,
  SessionSchema,
  type Project,
  type Session,
  type SessionStatus,
} from '../../records/index.js';
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
  defaultModel: Schema.String,
});
export type HarnessInfo = typeof HarnessInfo.Type;

export const ModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** As models.dev gives it, `YYYY-MM-DD`; null when it gives none. */
  releaseDate: Schema.NullOr(Schema.String),
});
export type ModelInfo = typeof ModelInfo.Type;

export const ProjectValue = Schema.Struct(ProjectSchema.fields);
export const SessionValue = Schema.Struct(SessionSchema.fields);

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

export class AiApi extends RpcGroup.make(
  /** Every Coding Harness this server runs. */
  Rpc.make('harnesses', { success: Schema.Array(HarnessInfo) }),
  /** The models a harness accepts, from models.dev, newest first. */
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
    },
    success: SessionValue,
    error: Schema.Union([ProjectNotFound, UnknownHarness]),
  }),
  /** Starts a turn, or steers the running one. */
  Rpc.make('send', {
    payload: { sessionId: Schema.String, text: Schema.String },
    error: SessionNotFound,
  }),
  Rpc.make('cancel', {
    payload: { sessionId: Schema.String },
    error: SessionNotFound,
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
