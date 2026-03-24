import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { SDKMessage, SDKResultMessage } from "./types.js";
import { Typed } from "../../lib/typed.js";
import { SDKSystemMessage } from "@anthropic-ai/claude-agent-sdk";
import { TaskStatus } from "../status.js";

export const claudeSessionEntity = EntityESchema.make(
  "claudeSession",
  "sessionId",
  {
    status: TaskStatus,
    absolutePath: Schema.String,
    name: Schema.optionalWith(Schema.String, { exact: true }),
    model: Schema.String,
    permissionMode: Schema.Literal("default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"),
    persistSession: Schema.Boolean,
    effort: Schema.Literal("low", "medium", "high", "max"),
    maxTurns: Schema.Number,
    maxBudgetUsd: Schema.Number,
  },
).build();

export const claudeTurnEntity = EntityESchema.make("claudeTurn", "id", {
  sessionId: Schema.String,
  status: TaskStatus,
  init: Schema.NullOr(Typed<SDKSystemMessage>()),
  result: Schema.NullOr(Typed<SDKResultMessage>()),
}).build();

export const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();
