import { Schema } from "effect";

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
  prompt: Schema.String,
  model: Schema.String,
  approvalPolicy: ApprovalPolicy,
  sandboxMode: SandboxMode,
});

export const ContinueThreadParams = Schema.Struct({
  threadId: Schema.String,
  prompt: Schema.String,
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

export interface ActiveTurn {
  turnId: string;
  sdkTurnId: string | null;
}
