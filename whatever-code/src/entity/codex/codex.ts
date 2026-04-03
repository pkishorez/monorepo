import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { ServerNotification } from "./types.js";

export const codexEventEntity = EntityESchema.make("codexEvent", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<ServerNotification>(),
}).build();
