import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  ContinueSessionParams,
  CreateSessionParams,
  UpdateSessionParams,
} from "../../claude/index.js";
import { EntitySchema } from "@std-toolkit/core";
import {
  claudeMessageEntity,
  claudeSessionEntity,
  claudeTurnEntity,
} from "../../entity/claude/index.js";

export class ClaudeChatError extends Schema.TaggedError<ClaudeChatError>()(
  "ClaudeChatError",
  { message: Schema.String },
) {}

export class ClaudeRpcs extends RpcGroup.make(
  Rpc.make("createSession", {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: CreateSessionParams,
  }),
  Rpc.make("continueSession", {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: ContinueSessionParams,
  }),
  Rpc.make("stopSession", {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: Schema.Struct({ sessionId: Schema.String }),
  }),
  Rpc.make("queryMessages", {
    success: Schema.Array(EntitySchema(claudeMessageEntity)),
    error: ClaudeChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("querySessions", {
    success: Schema.Array(EntitySchema(claudeSessionEntity)),
    error: ClaudeChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("queryTurns", {
    success: Schema.Array(EntitySchema(claudeTurnEntity)),
    error: ClaudeChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("getSessionStatus", {
    success: Schema.Struct({
      session: Schema.NullOr(EntitySchema(claudeSessionEntity)),
      latestTurn: Schema.NullOr(EntitySchema(claudeTurnEntity)),
      isActiveInMemory: Schema.Boolean,
      activeQueues: Schema.NullOr(
        Schema.Struct({
          outputQueueIsShutdown: Schema.Boolean,
        }),
      ),
    }),
    error: ClaudeChatError,
    payload: Schema.Struct({ sessionId: Schema.String }),
  }),
  Rpc.make("updateSession", {
    success: EntitySchema(claudeSessionEntity),
    error: ClaudeChatError,
    payload: UpdateSessionParams,
  }),
  Rpc.make("getCapabilities", {
    success: Schema.Struct({
      models: Schema.Array(
        Schema.Struct({
          value: Schema.String,
          displayName: Schema.String,
          description: Schema.String,
          supportsEffort: Schema.optional(Schema.Boolean),
          supportsFastMode: Schema.optional(Schema.Boolean),
          supportsAutoMode: Schema.optional(Schema.Boolean),
        }),
      ),
      commands: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          description: Schema.String,
          argumentHint: Schema.String,
        }),
      ),
    }),
    error: ClaudeChatError,
    payload: Schema.Struct({ absolutePath: Schema.String }),
  }),
).prefix("claude.") {}
