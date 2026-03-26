import { Schema } from "effect";
import { CreateSessionParams, Effort } from "../claude/schema.js";
import { PromptContent } from "../shared/schema.js";

const ExecutePermissionMode = Schema.Literal(
  "default",
  "acceptEdits",
  "bypassPermissions",
  "dontAsk",
);
import { CreateThreadParams } from "../codex/schema.js";

const StartClaudeParams = Schema.Struct({
  projectId: Schema.String,
  agent: Schema.Literal("claude"),
  session: CreateSessionParams,
});

const StartCodexParams = Schema.Struct({
  projectId: Schema.String,
  agent: Schema.Literal("codex"),
  thread: CreateThreadParams,
});

export const StartExecuteParams = Schema.Union(
  StartClaudeParams,
  StartCodexParams,
);

export const ContinueExecuteParams = Schema.Struct({
  workflowId: Schema.String,
  prompt: PromptContent,
});

export const StopExecuteParams = Schema.Struct({
  workflowId: Schema.String,
});

export class ExecuteWorkflowError extends Schema.TaggedError<ExecuteWorkflowError>()(
  "ExecuteWorkflowError",
  { message: Schema.String },
) {}

export const StartPlanParams = Schema.Struct({
  projectId: Schema.String,
  session: CreateSessionParams,
});

export const ContinuePlanParams = Schema.Struct({
  workflowId: Schema.String,
  prompt: PromptContent,
});

export const StartExecutePhaseParams = Schema.Struct({
  workflowId: Schema.String,
  model: Schema.String,
  permissionMode: ExecutePermissionMode,
  effort: Effort,
  maxTurns: Schema.Number,
  maxBudgetUsd: Schema.Number,
});

export const ContinueExecutePhaseParams = Schema.Struct({
  workflowId: Schema.String,
  prompt: PromptContent,
});

export const StopPlanAndExecuteParams = Schema.Struct({
  workflowId: Schema.String,
});

export class PlanAndExecuteWorkflowError extends Schema.TaggedError<PlanAndExecuteWorkflowError>()(
  "PlanAndExecuteWorkflowError",
  { message: Schema.String },
) {}
