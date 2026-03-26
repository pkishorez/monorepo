import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { ServerNotification, TurnError } from "./types.js";
import type { ThreadTokenUsage } from "../../agents/codex/generated/v2/ThreadTokenUsage.js";
import { TaskStatus } from "../status.js";

export const codexThreadEntity = EntityESchema.make(
  "codexThread",
  "threadId",
  {
    status: TaskStatus,
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
  model: Schema.String,
  status: TaskStatus,
  sdkTurnId: Schema.NullOr(Schema.String),
  usage: Schema.NullOr(Typed<ThreadTokenUsage>()),
  error: Schema.NullOr(Typed<TurnError>()),
}).build();

export const codexEventEntity = EntityESchema.make("codexEvent", "id", {
  threadId: Schema.String,
  turnId: Schema.String,
  data: Typed<ServerNotification>(),
}).build();
