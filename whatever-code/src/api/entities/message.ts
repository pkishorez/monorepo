import { Schema } from "effect";
import { EntityESchema, type ESchemaType } from "@std-toolkit/eschema";
import type { SDKMessage as _SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const Typed = <A>(): Schema.Schema<A> => Schema.Unknown as never;

class ClaudeCodePayload extends Schema.Class<ClaudeCodePayload>(
  "ClaudeCodePayload",
)({
  type: Schema.Literal("claude-code"),
  message: Typed<_SDKMessage>(),
}) {}

export const ChatPayload = Schema.Union(ClaudeCodePayload);

export const messageSchema = EntityESchema.make("Message", "messageId", {
  sessionId: Schema.String,
  payload: ChatPayload,
}).build();

export type Message = ESchemaType<typeof messageSchema>;
