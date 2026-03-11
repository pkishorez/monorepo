import { Rpc, RpcGroup } from "@effect/rpc";
import { EntitySchema } from "@std-toolkit/core";
import { Schema } from "effect";
import { messageSchema } from "../entities/index.js";

export class ClaudeChatError extends Schema.TaggedError<ClaudeChatError>()(
  "ClaudeChatError",
  { message: Schema.String },
) {}

export class ClaudeRpcs extends RpcGroup.make(
  Rpc.make("claudeChat", {
    success: EntitySchema(messageSchema),
    error: ClaudeChatError,
    payload: {
      prompt: Schema.String,
      sessionId: Schema.String,
    },
    stream: true,
  }),
) {}
