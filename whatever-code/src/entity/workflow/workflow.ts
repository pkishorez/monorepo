import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

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
});

const RalphLoopWorkflowSpec = Schema.Struct({
  type: Schema.Literal("ralph-loop"),
  ralphLoopId: Schema.String,
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
  .build();
