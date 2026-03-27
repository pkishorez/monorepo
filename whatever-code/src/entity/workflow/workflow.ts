import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

const WorkflowSpec = Schema.Struct({
  type: Schema.Literal("execute"),
  executeSession: Schema.String,
});

export const workflowEntity = EntityESchema.make("workflow", "workflowId", {
  projectId: Schema.String,
  spec: WorkflowSpec,
}).build();
