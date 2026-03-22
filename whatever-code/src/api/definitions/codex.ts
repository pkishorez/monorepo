import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToApprovalParams,
} from "../../codex/index.js";
import { EntitySchema } from "@std-toolkit/core";
import {
  codexEventEntity,
  codexThreadEntity,
  codexTurnEntity,
} from "../../entity/codex/index.js";

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
    payload: Schema.Struct({ threadId: Schema.String }),
  }),
  Rpc.make("updateThread", {
    success: EntitySchema(codexThreadEntity),
    error: CodexChatError,
    payload: UpdateThreadParams,
  }),
  Rpc.make("respondToApproval", {
    success: Schema.Void,
    error: CodexChatError,
    payload: RespondToApprovalParams,
  }),
  Rpc.make("queryEvents", {
    success: Schema.Array(EntitySchema(codexEventEntity)),
    error: CodexChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("queryThreads", {
    success: Schema.Array(EntitySchema(codexThreadEntity)),
    error: CodexChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("queryTurns", {
    success: Schema.Array(EntitySchema(codexTurnEntity)),
    error: CodexChatError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
).prefix("codex.") {}
