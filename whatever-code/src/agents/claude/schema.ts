import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { SessionCapabilities } from "./internal/index.js";
export { ImageBlock, TextBlock, ContentBlock, PromptContent, InteractionMode } from "../shared/schema.js";
import { PromptContent, InteractionMode } from "../shared/schema.js";
import type { ProjectedClaudeMessage } from "../../projection/claude-message.js";
export type { ProjectedClaudeMessage } from "../../projection/claude-message.js";

export const Message = Typed<ProjectedClaudeMessage>();

export const Effort = Schema.Literal("low", "medium", "high", "max");

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

export const UpdateSessionParams = Schema.Struct({
  sessionId: Schema.String,
  updates: Schema.Struct({
    model: Schema.optionalWith(Schema.String, { exact: true }),
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
  interactionMode: Schema.optionalWith(InteractionMode, { exact: true, default: () => "default" as const }),
  persistSession: Schema.Boolean,
  effort: Effort,
  maxTurns: Schema.Number,
  maxBudgetUsd: Schema.Number,
});

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
