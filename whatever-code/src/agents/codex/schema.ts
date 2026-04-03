import { Schema } from "effect";
import { PromptContent, InteractionMode } from "../shared/schema.js";

export { InteractionMode, AccessMode } from "../shared/schema.js";

export const CreateThreadParams = Schema.Struct({
  absolutePath: Schema.String,
  prompt: PromptContent,
  model: Schema.String,
  interactionMode: Schema.optionalWith(InteractionMode, { exact: true, default: () => "default" as const }),
});

export const ContinueThreadParams = Schema.Struct({
  sessionId: Schema.String,
  prompt: PromptContent,
  interactionMode: Schema.optionalWith(InteractionMode, { exact: true }),
});

export const UpdateThreadParams = Schema.Struct({
  sessionId: Schema.String,
  updates: Schema.Struct({
    model: Schema.optionalWith(Schema.String, { exact: true }),
    interactionMode: Schema.optionalWith(InteractionMode, { exact: true }),
  }),
});

export const RespondToApprovalParams = Schema.Struct({
  sessionId: Schema.String,
  requestId: Schema.String,
  decision: Schema.Literal("accept", "acceptForSession", "decline"),
});

export const MODELS = [
  {
    value: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    description: "Fast and efficient for responsive coding tasks",
  },
  {
    value: "gpt-5.4",
    displayName: "GPT-5.4",
    description: "Flagship frontier model for professional work",
  },
  {
    value: "gpt-5.3-codex",
    displayName: "GPT-5.3 Codex",
    description: "Industry-leading coding model for complex engineering",
  },
  {
    value: "gpt-5.3-codex-spark",
    displayName: "Codex Spark",
    description: "Near-instant coding iteration (Pro only)",
  },
];
