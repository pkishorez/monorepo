import { Schema } from "effect";
import { CreateSessionParams } from "../claude/schema.js";
import { PromptContent } from "../shared/schema.js";

import { CreateThreadParams } from "../codex/schema.js";

const WorktreeParams = Schema.Struct({
  baseBranch: Schema.optionalWith(Schema.String, { exact: true }),
  branchName: Schema.optionalWith(Schema.String, { exact: true }),
});

const StartClaudeParams = Schema.Struct({
  projectId: Schema.String,
  agent: Schema.Literal("claude"),
  session: CreateSessionParams,
  worktree: Schema.optionalWith(WorktreeParams, { exact: true }),
});

const StartCodexParams = Schema.Struct({
  projectId: Schema.String,
  agent: Schema.Literal("codex"),
  thread: CreateThreadParams,
  worktree: Schema.optionalWith(WorktreeParams, { exact: true }),
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

export const RemoveExecuteParams = Schema.Struct({
  workflowId: Schema.String,
});

export const ArchiveWorkflowParams = Schema.Struct({
  workflowId: Schema.String,
  archived: Schema.Boolean,
});

export class ExecuteWorkflowError extends Schema.TaggedError<ExecuteWorkflowError>()(
  "ExecuteWorkflowError",
  { message: Schema.String },
) {}
