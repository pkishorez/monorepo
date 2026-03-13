import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { SDKMessage, SDKResultMessage } from "./types.js";
import { Typed } from "../../lib/typed.js";

export const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();

export const claudeSessionEntity = EntityESchema.make("claudeSession", "id", {
  result: Schema.NullOr(Typed<SDKResultMessage>()),
}).build();
