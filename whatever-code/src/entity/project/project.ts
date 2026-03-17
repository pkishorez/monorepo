import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

export const projectEntity = EntityESchema.make("project", "id", {
  name: Schema.String,
  homePath: Schema.String,
  gitPath: Schema.String,
  agentType: Schema.Literal("claude", "codex"),
  sessionId: Schema.NullOr(Schema.String),
  status: Schema.Literal("idle", "active", "error"),
}).build();
