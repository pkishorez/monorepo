import { Schema } from "effect";
import { PromptContent } from "../shared/schema.js";

export const ApprovalPolicy = Schema.Literal(
  "untrusted",
  "on-failure",
  "on-request",
  "never",
);

export const SandboxMode = Schema.Literal(
  "read-only",
  "workspace-write",
  "danger-full-access",
);

export const CreateThreadParams = Schema.Struct({
  absolutePath: Schema.String,
  prompt: PromptContent,
  model: Schema.String,
  approvalPolicy: ApprovalPolicy,
  sandboxMode: SandboxMode,
});

export const ContinueThreadParams = Schema.Struct({
  threadId: Schema.String,
  prompt: PromptContent,
});

export const UpdateThreadParams = Schema.Struct({
  threadId: Schema.String,
  updates: Schema.Struct({
    model: Schema.optionalWith(Schema.String, { exact: true }),
    approvalPolicy: Schema.optionalWith(ApprovalPolicy, { exact: true }),
    sandboxMode: Schema.optionalWith(SandboxMode, { exact: true }),
  }),
});

export const RespondToApprovalParams = Schema.Struct({
  threadId: Schema.String,
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

export interface ActiveTurn {
  turnId: string;
  sdkTurnId: string | null;
}
