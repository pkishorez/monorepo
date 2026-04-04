import { Schema } from "effect";
import { EntityESchema } from "@std-toolkit/eschema";
import { Typed } from "../../lib/typed.js";
import type { ProjectedClaudeMessage } from "../../projection/claude-message.js";
export type { ProjectedClaudeMessage } from "../../projection/claude-message.js";

export const claudeMessageProjectedEntity = EntityESchema.make(
  "claudeMessage",
  "id",
  {
    sessionId: Schema.String,
    turnId: Schema.String,
    data: Typed<ProjectedClaudeMessage>(),
  },
).build();
