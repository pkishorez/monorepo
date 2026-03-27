import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { ServerNotification, TurnError } from "./types.js";
import type { ThreadTokenUsage } from "../../agents/codex/generated/v2/ThreadTokenUsage.js";
import { TaskStatus } from "../status.js";

export const codexTurnEntity = EntityESchema.make("codexTurn", "id", {
  sessionId: Schema.String,
  model: Schema.String,
  status: TaskStatus,
  sdkTurnId: Schema.NullOr(Schema.String),
  usage: Schema.NullOr(Typed<ThreadTokenUsage>()),
  error: Schema.NullOr(Typed<TurnError>()),
  planArtifact: Schema.NullOr(Schema.String),
}).build();

export const codexEventEntity = EntityESchema.make("codexEvent", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<ServerNotification>(),
}).build();
