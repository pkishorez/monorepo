import { Schema } from "effect";
import { EntityESchema } from "@std-toolkit/eschema";
import { Typed } from "../../lib/typed.js";
import type { ProjectedCodexEvent } from "../../projection/codex-event.js";
export type { ProjectedCodexEvent } from "../../projection/codex-event.js";

export const codexEventProjectedEntity = EntityESchema.make(
  "codexEvent",
  "id",
  {
    sessionId: Schema.String,
    turnId: Schema.String,
    data: Typed<ProjectedCodexEvent>(),
  },
).build();
