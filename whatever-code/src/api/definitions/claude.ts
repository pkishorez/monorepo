import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import {
  ContinueSessionParams,
  CreateSessionParams,
  RespondToToolParams,
  UpdateSessionParams,
} from '../../agents/claude/schema.js';
import { EntitySchema } from '@std-toolkit/core';
import { claudeMessageProjectedEntity } from '../../core/entity/projection/claude-message.js';

export class ClaudeChatError extends Schema.TaggedError<ClaudeChatError>()(
  'ClaudeChatError',
  { message: Schema.String },
) {}

export class ClaudeRpcs extends RpcGroup.make(
  Rpc.make('createSession', {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: CreateSessionParams,
  }),
  Rpc.make('continueSession', {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: ContinueSessionParams,
  }),
  Rpc.make('stopSession', {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: Schema.Struct({ sessionId: Schema.String }),
  }),
  Rpc.make('respondToTool', {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: RespondToToolParams,
  }),
  Rpc.make('queryMessages', {
    success: Schema.Array(EntitySchema(claudeMessageProjectedEntity)),
    error: ClaudeChatError,
    payload: Schema.Struct({ '>': Schema.NullOr(Schema.String) }),
  }),
  Rpc.make('queryMessagesBySession', {
    success: Schema.Array(EntitySchema(claudeMessageProjectedEntity)),
    error: ClaudeChatError,
    payload: Schema.Struct({
      sessionId: Schema.String,
      '>': Schema.NullOr(Schema.String),
    }),
  }),
  Rpc.make('updateSession', {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: UpdateSessionParams,
  }),
).prefix('claude.') {}
