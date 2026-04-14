import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

export const ExecuteStatus = Schema.Literal(
  "executing",
  "question",
  "plan-ready",
  "success",
  "error",
  "interrupted",
);
export type ExecuteStatus = typeof ExecuteStatus.Type;

export const RalphLoopSpecStatus = Schema.Literal(
  "planning",
  "executing",
  "reviewing",
  "completed",
  "failed",
  "cancelled",
);
export type RalphLoopSpecStatus = typeof RalphLoopSpecStatus.Type;

const ExecuteWorkflowSpec = Schema.Struct({
  type: Schema.Literal("execute"),
  executeSession: Schema.String,
  worktree: Schema.optionalWith(
    Schema.Struct({
      path: Schema.String,
      branch: Schema.String,
      repoPath: Schema.String,
    }),
    { exact: true },
  ),
  status: Schema.optionalWith(ExecuteStatus, { exact: true }),
});

const RalphLoopWorkflowSpec = Schema.Struct({
  type: Schema.Literal("ralph-loop"),
  ralphLoopId: Schema.String,
  status: Schema.optionalWith(RalphLoopSpecStatus, { exact: true }),
  completedTasks: Schema.optionalWith(Schema.Number, { exact: true }),
  totalTasks: Schema.optionalWith(Schema.Number, { exact: true }),
});

const WorkflowSpec = Schema.Union(ExecuteWorkflowSpec, RalphLoopWorkflowSpec);

export const workflowEntity = EntityESchema.make("workflow", "workflowId", {
  projectId: Schema.String,
  spec: WorkflowSpec,
})
  .evolve(
    "v2",
    { archived: Schema.optionalWith(Schema.Boolean, { exact: true }) },
    (prev) => ({ ...prev }),
  )
  .evolve(
    "v3",
    { name: Schema.optionalWith(Schema.String, { exact: true }) },
    (prev) => ({ ...prev }),
  )
  .build();
