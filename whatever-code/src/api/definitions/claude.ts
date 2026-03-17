import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  ContinueSessionParams,
  UpdateModelParams,
  UpdateModeParams,
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
  Rpc.make("updateModel", {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: UpdateModelParams,
  }),
  Rpc.make("updateMode", {
    success: Schema.Void,
    error: ClaudeChatError,
    payload: UpdateModeParams,
  }),
  Rpc.make("getModels", {
    success: Schema.Array(
      Schema.Struct({
        model: Schema.String,
        label: Schema.String,
      }),
    ),
    error: ClaudeChatError,
    payload: Schema.Void,
  }),
).prefix("claude.") {}
