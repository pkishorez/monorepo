import type { Queue } from "effect";
import { Schema } from "effect";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Typed } from "../lib/typed.js";

export const Message = Typed<SDKMessage>();

export const PermissionMode = Schema.Literal(
  "acceptEdits",
  "bypassPermissions",
  "plan",
);
export type PermissionModeValue = typeof PermissionMode.Type;

export const ToolResponse = Schema.Union(
  Schema.mutable(
    Schema.Struct({
      behavior: Schema.Literal("allow"),
      updatedInput: Schema.optionalWith(
        Schema.mutable(
          Schema.Record({ key: Schema.String, value: Schema.Unknown }),
        ),
        { exact: true },
      ),
    }),
  ),
  Schema.mutable(
    Schema.Struct({
      behavior: Schema.Literal("deny"),
      message: Schema.String,
    }),
  ),
);
export type ToolResponse = typeof ToolResponse.Type;

export const ContinueSessionParams = Schema.Struct({
  sessionId: Schema.String,
  prompt: Schema.String,
});

export const RespondToToolParams = Schema.Struct({
  sessionId: Schema.String,
  toolUseId: Schema.String,
  response: ToolResponse,
});

export interface ActiveTurn {
  abortController: AbortController;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
}

export const UpdateSessionParams = Schema.Struct({
  sessionId: Schema.String,
  updates: Schema.Struct({
    model: Schema.optionalWith(Schema.String, { exact: true }),
    permissionMode: Schema.optionalWith(PermissionMode, { exact: true }),
  }),
});

export const CreateSessionParams = Schema.Struct({
  absolutePath: Schema.String,
  prompt: Schema.String,
  model: Schema.String,
  permissionMode: PermissionMode,
});
