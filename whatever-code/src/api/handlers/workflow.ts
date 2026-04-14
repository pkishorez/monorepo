import { Effect } from "effect";
import { WorkflowRpcs } from "../definitions/workflow.js";
import { WorkflowOrchestrator } from "../../agents/workflow/index.js";
import { workflowSqliteEntity } from "../../db/entities/workflow.js";
import { ExecuteWorkflowError } from "../../agents/workflow/index.js";
import { errorMessage } from "../../core/lib/error.js";

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
    "workflow.execute.remove": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.execute.remove(params);
      }),
    "workflow.archive": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.archive(params);
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
