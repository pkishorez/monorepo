import { Effect } from "effect";
import {
  startExecuteWorkflow,
  continueExecuteWorkflow,
  stopExecuteWorkflow,
} from "./execute.js";

export class WorkflowOrchestrator extends Effect.Service<WorkflowOrchestrator>()(
  "WorkflowOrchestrator",
  {
    effect: Effect.succeed({
      execute: {
        start: startExecuteWorkflow,
        continue: continueExecuteWorkflow,
        stop: stopExecuteWorkflow,
      },
    }),
  },
) {}
