import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import {
  ChatParams,
  GetSessionMessagesParams,
  ListSessionsParams,
  Message,
  SessionInfo,
  SessionMsg,
} from "./integrations/claude/index.js";

export class ClaudeChatError extends Schema.TaggedError<ClaudeChatError>()(
  "ClaudeChatError",
  { message: Schema.String },
) {}

export class ClaudeRpcs extends RpcGroup.make(
  Rpc.make("chat", {
    success: Message,
    error: ClaudeChatError,
    payload: ChatParams,
    stream: true,
  }),
  Rpc.make("listSessions", {
    success: Schema.Array(SessionInfo),
    error: ClaudeChatError,
    payload: ListSessionsParams,
  }),
  Rpc.make("getSessionMessages", {
    success: Schema.Array(SessionMsg),
    error: ClaudeChatError,
    payload: GetSessionMessagesParams,
  }),
).prefix("claude.") {}
