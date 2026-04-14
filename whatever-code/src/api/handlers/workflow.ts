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
      }).pipe(
        Effect.withSpan("rpc.workflow.execute.start", { attributes: { agent: params.agent } }),
      ),
    "workflow.execute.continue": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.execute.continue(params);
      }).pipe(
        Effect.withSpan("rpc.workflow.execute.continue", { attributes: { workflowId: params.workflowId } }),
      ),
    "workflow.execute.stop": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.execute.stop(params);
      }).pipe(
        Effect.withSpan("rpc.workflow.execute.stop", { attributes: { workflowId: params.workflowId } }),
      ),
    "workflow.execute.remove": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.execute.remove(params);
      }).pipe(
        Effect.withSpan("rpc.workflow.execute.remove", { attributes: { workflowId: params.workflowId } }),
      ),
    "workflow.archive": (params) =>
      Effect.gen(function* () {
        const orchestrator = yield* WorkflowOrchestrator;
        yield* orchestrator.archive(params);
      }).pipe(
        Effect.withSpan("rpc.workflow.archive", { attributes: { workflowId: params.workflowId } }),
      ),
    "workflow.query": ({ ">": cursor }) =>
      workflowSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new ExecuteWorkflowError({ message: errorMessage(e) })),
          Effect.withSpan("rpc.workflow.query"),
        ),
  }),
);
