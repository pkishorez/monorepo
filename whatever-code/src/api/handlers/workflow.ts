import { Effect } from "effect";
import { WorkflowRpcs } from "../definitions/workflow.js";
import { WorkflowOrchestrator } from "../../workflow/index.js";
import { workflowSqliteEntity } from "../../db/workflow.js";
import { ExecuteWorkflowError } from "../../workflow/index.js";
import { errorMessage } from "../../lib/error.js";

export const WorkflowHandlers = WorkflowRpcs.toLayer(
  WorkflowRpcs.of({
    "workflow.execute.start": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        const workflowId = yield* orchestrator.execute.start(params);
        return { workflowId };
      }),
    "workflow.execute.continue": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.execute.continue(params);
      }),
    "workflow.execute.stop": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.execute.stop(params);
      }),
    "workflow.planAndExecute.startPlan": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        const workflowId = yield* orchestrator.planAndExecute.startPlan(params);
        return { workflowId };
      }),
    "workflow.planAndExecute.continuePlan": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.planAndExecute.continuePlan(params);
      }),
    "workflow.planAndExecute.startExecute": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.planAndExecute.startExecute(params);
      }),
    "workflow.planAndExecute.continueExecute": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.planAndExecute.continueExecute(params);
      }),
    "workflow.planAndExecute.stop": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.planAndExecute.stop(params);
      }),
    "workflow.query": ({ ">": cursor }) =>
      workflowSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new ExecuteWorkflowError({ message: errorMessage(e) })),
        ),
  }),
);
