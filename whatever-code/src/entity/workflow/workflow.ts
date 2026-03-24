import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

export const SessionRef = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("claude"),
    sessionId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("codex"),
    threadId: Schema.String,
  }),
);

const PlanningStage = Schema.Struct({
  stage: Schema.Literal("planning"),
  planSession: SessionRef,
  planArtifact: Schema.NullOr(Schema.String),
});

const ExecutingStage = Schema.Struct({
  stage: Schema.Literal("executing"),
  planSession: SessionRef,
  planArtifact: Schema.String,
  executeSession: SessionRef,
});

const DoneStage = Schema.Struct({
  stage: Schema.Literal("done"),
  planSession: SessionRef,
  planArtifact: Schema.String,
  executeSession: SessionRef,
});

const PlanAndExecuteSpec = Schema.Struct({
  type: Schema.Literal("plan-and-execute"),
  current: Schema.Union(PlanningStage, ExecutingStage, DoneStage),
});

const ExecuteSpec = Schema.Struct({
  type: Schema.Literal("execute"),
  executeSession: SessionRef,
});

const WorkflowSpec = Schema.Union(PlanAndExecuteSpec, ExecuteSpec);

export const workflowEntity = EntityESchema.make("workflow", "workflowId", {
  projectId: Schema.String,
  spec: WorkflowSpec,
}).build();
