import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { SDKMessage, SDKResultMessage } from "./types.js";
import { Typed } from "../../lib/typed.js";

export const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();

export const claudeSessionEntity = EntityESchema.make("claudeSession", "id", {
  status: Schema.Literal("in_progress", "success", "error", "interrupted"),
  absolutePath: Schema.String,
  name: Schema.optionalWith(Schema.String, { default: () => "New Session" }),
  model: Schema.optional(Schema.String),
  permissionMode: Schema.optional(
    Schema.Literal("acceptEdits", "bypassPermissions", "plan"),
  ),
  sdkSessionCreated: Schema.Boolean,
}).build();

export const claudeTurnEntity = EntityESchema.make("claudeTurn", "id", {
  sessionId: Schema.String,
  status: Schema.Literal("in_progress", "success", "error", "interrupted"),
  init: Schema.NullOr(Typed<SDKMessage>()),
  result: Schema.NullOr(Typed<SDKResultMessage>()),
}).build();
