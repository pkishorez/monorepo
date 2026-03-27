import { Schema } from "effect";
import { CreateSessionParams } from "../claude/schema.js";
import { PromptContent } from "../shared/schema.js";

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
