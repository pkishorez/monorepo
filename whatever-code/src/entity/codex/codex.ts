import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { ServerNotification, TokenUsage, TurnError } from "./types.js";

export const codexThreadEntity = EntityESchema.make(
  "codexThread",
  "threadId",
  {
    status: Schema.Literal("in_progress", "success", "error", "interrupted"),
    absolutePath: Schema.String,
    name: Schema.optionalWith(Schema.String, { exact: true }),
    model: Schema.String,
    approvalPolicy: Schema.Literal(
      "untrusted",
      "on-failure",
      "on-request",
      "never",
    ),
    sandboxMode: Schema.Literal(
      "read-only",
      "workspace-write",
      "danger-full-access",
    ),
    sdkThreadId: Schema.NullOr(Schema.String),
  },
).build();

export const codexTurnEntity = EntityESchema.make("codexTurn", "id", {
  threadId: Schema.String,
  status: Schema.Literal("in_progress", "success", "error", "interrupted"),
  message: Schema.optionalWith(Schema.String, { exact: true }),
  sdkTurnId: Schema.NullOr(Schema.String),
  usage: Schema.NullOr(Typed<TokenUsage>()),
  error: Schema.NullOr(Typed<TurnError>()),
}).build();

export const codexEventEntity = EntityESchema.make("codexEvent", "id", {
  threadId: Schema.String,
  turnId: Schema.String,
  data: Typed<ServerNotification>(),
}).build();
