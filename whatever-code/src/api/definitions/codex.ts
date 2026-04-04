import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToApprovalParams,
} from "../../agents/codex/schema.js";
import { EntitySchema } from "@std-toolkit/core";
import { codexEventProjectedEntity } from "../../entity/projection/codex-event.js";

export class CodexChatError extends Schema.TaggedError<CodexChatError>()(
  "CodexChatError",
  { message: Schema.String },
) {}

export class CodexRpcs extends RpcGroup.make(
  Rpc.make("createThread", {
    success: Schema.Void,
    error: CodexChatError,
    payload: CreateThreadParams,
  }),
  Rpc.make("continueThread", {
    success: Schema.Void,
    error: CodexChatError,
    payload: ContinueThreadParams,
  }),
  Rpc.make("stopThread", {
    success: Schema.Void,
    error: CodexChatError,
    payload: Schema.Struct({ sessionId: Schema.String }),
  }),
  Rpc.make("updateThread", {
    success: Schema.Void,
    error: CodexChatError,
    payload: UpdateThreadParams,
  }),
  Rpc.make("respondToApproval", {
    success: Schema.Void,
    error: CodexChatError,
    payload: RespondToApprovalParams,
  }),
  Rpc.make("queryEvents", {
    success: Schema.Array(EntitySchema(codexEventProjectedEntity)),
    error: CodexChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
).prefix("codex.") {}
