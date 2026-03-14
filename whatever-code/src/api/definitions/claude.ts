import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  ContinueSessionParams,
  Message,
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
    success: Message,
    error: ClaudeChatError,
    payload: QueryParams,
    stream: true,
  }),
  Rpc.make("continueSession", {
    success: Message,
    error: ClaudeChatError,
    payload: ContinueSessionParams,
    stream: true,
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
).prefix("claude.") {}
