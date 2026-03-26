import { Effect } from "effect";
import {
  startExecuteWorkflow,
  continueExecuteWorkflow,
  stopExecuteWorkflow,
} from "./execute.js";
import {
  startPlan,
  continuePlan,
  startExecutePhase,
  continueExecutePhase,
  stopPlanAndExecute,
} from "./plan-and-execute.js";

export class WorkflowOrchestrator extends Effect.Service<WorkflowOrchestrator>()(
  "WorkflowOrchestrator",
  {
    effect: Effect.succeed({
      execute: {
        start: startExecuteWorkflow,
        continue: continueExecuteWorkflow,
        stop: stopExecuteWorkflow,
      },
      planAndExecute: {
        startPlan,
        continuePlan,
        startExecute: startExecutePhase,
        continueExecute: continueExecutePhase,
        stop: stopPlanAndExecute,
      },
    }),
  },
) {}
