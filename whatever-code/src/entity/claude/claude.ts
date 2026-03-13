import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { SDKMessage, SDKSystemMessage, SDKResultMessage } from "./types.js";
import { Typed } from "../../lib/typed.js";

export const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();

export const claudeSessionEntity = EntityESchema.make("claudeSession", "id", {
  init: Schema.NullOr(Typed<SDKSystemMessage>()),
  result: Schema.NullOr(Typed<SDKResultMessage>()),
}).build();
