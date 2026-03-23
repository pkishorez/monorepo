import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { TaskStatus } from "../status.js";

export const projectEntity = EntityESchema.make("project", "id", {
  name: Schema.String,
  homePath: Schema.String,
  gitPath: Schema.String,
  agent: Schema.Union(
    Schema.Struct({
      type: Schema.Literal("claude"),
      sessionId: Schema.NullOr(Schema.String),
    }),
    Schema.Struct({
      type: Schema.Literal("codex"),
      threadId: Schema.NullOr(Schema.String),
    }),
  ),
  status: TaskStatus,
}).build();
