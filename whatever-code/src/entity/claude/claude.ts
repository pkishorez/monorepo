import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { SDKMessage } from "./types.js";
import { Typed } from "../../lib/typed.js";

export const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();
