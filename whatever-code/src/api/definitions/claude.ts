import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  ContinueSessionParams,
  QueryParams,
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
    success: Schema.Struct({ sessionId: Schema.String }),
    error: ClaudeChatError,
    payload: QueryParams,
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
  Rpc.make("getProjects", {
    success: Schema.Array(
      Schema.Struct({
        absolutePath: Schema.String,
        homePath: Schema.String,
        gitPath: Schema.String,
        sessionCount: Schema.Number,
      }),
    ),
    error: ClaudeChatError,
    payload: Schema.Void,
  }),
).prefix("claude.") {}
