import type { Deferred, Queue } from "effect";
import { Schema } from "effect";
import type { SDKMessage, McpServerConfig, HookEvent, HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import { Typed } from "../../lib/typed.js";
export { ImageBlock, TextBlock, ContentBlock, PromptContent, InteractionMode } from "../shared/schema.js";
import { PromptContent, InteractionMode } from "../shared/schema.js";

export const Message = Typed<SDKMessage>();

export const Effort = Schema.Literal("low", "medium", "high", "max");

export const PermissionMode = Schema.Literal(
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
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
  prompt: PromptContent,
  interactionMode: Schema.optionalWith(InteractionMode, { exact: true }),
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
  initialized: Deferred.Deferred<void, Error>;
}

export const UpdateSessionParams = Schema.Struct({
  sessionId: Schema.String,
  updates: Schema.Struct({
    model: Schema.optionalWith(Schema.String, { exact: true }),
    permissionMode: Schema.optionalWith(PermissionMode, { exact: true }),
    interactionMode: Schema.optionalWith(InteractionMode, { exact: true }),
    persistSession: Schema.optionalWith(Schema.Boolean, { exact: true }),
    effort: Schema.optionalWith(Effort, { exact: true }),
    maxTurns: Schema.optionalWith(Schema.Number, { exact: true }),
    maxBudgetUsd: Schema.optionalWith(Schema.Number, { exact: true }),
  }),
});

export const CreateSessionParams = Schema.Struct({
  absolutePath: Schema.String,
  prompt: PromptContent,
  model: Schema.String,
  permissionMode: PermissionMode,
  interactionMode: Schema.optionalWith(InteractionMode, { exact: true, default: () => "default" as const }),
  persistSession: Schema.Boolean,
  effort: Effort,
  maxTurns: Schema.Number,
  maxBudgetUsd: Schema.Number,
});

export interface SessionCapabilities {
  models: { value: string; displayName: string; description: string }[];
  commands: { name: string; description: string; argumentHint: string }[];
}

export interface SessionRuntimeOptions {
  mcpServers?: Record<string, McpServerConfig>;
  systemPrompt?:
    | string
    | { type: "preset"; preset: "claude_code"; append?: string };
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
}

export const MODELS: SessionCapabilities["models"] = [
  {
    value: "claude-opus-4-6",
    displayName: "Opus 4.6",
    description: "Most capable model for complex tasks",
  },
  {
    value: "claude-sonnet-4-6",
    displayName: "Sonnet 4.6",
    description: "Best balance of speed and capability",
  },
  {
    value: "claude-haiku-4-5-20251001",
    displayName: "Haiku 4.5",
    description: "Fastest model for simple tasks",
  },
];
