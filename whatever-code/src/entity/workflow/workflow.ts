import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

const PlanningStage = Schema.Struct({
  stage: Schema.Literal("planning"),
  planSession: Schema.String,
  planArtifact: Schema.NullOr(Schema.String),
});

const ExecutingStage = Schema.Struct({
  stage: Schema.Literal("executing"),
  planSession: Schema.String,
  planArtifact: Schema.String,
  executeSession: Schema.String,
});

const DoneStage = Schema.Struct({
  stage: Schema.Literal("done"),
  planSession: Schema.String,
  planArtifact: Schema.String,
  executeSession: Schema.String,
});

const PlanAndExecuteSpec = Schema.Struct({
  type: Schema.Literal("plan-and-execute"),
  current: Schema.Union(PlanningStage, ExecutingStage, DoneStage),
});

const ExecuteSpec = Schema.Struct({
  type: Schema.Literal("execute"),
  executeSession: Schema.String,
});

const WorkflowSpec = Schema.Union(PlanAndExecuteSpec, ExecuteSpec);

export const workflowEntity = EntityESchema.make("workflow", "workflowId", {
  projectId: Schema.String,
  spec: WorkflowSpec,
}).build();
