import { Rpc, RpcGroup } from "@effect/rpc";
import { EntitySchema } from "@std-toolkit/core";
import { Schema } from "effect";
import { workflowEntity } from "../../entity/workflow/index.js";
import {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  ExecuteWorkflowError,
  StartPlanParams,
  ContinuePlanParams,
  StartExecutePhaseParams,
  ContinueExecutePhaseParams,
  StopPlanAndExecuteParams,
  PlanAndExecuteWorkflowError,
} from "../../workflow/schema.js";

export class WorkflowRpcs extends RpcGroup.make(
  Rpc.make("execute.start", {
    success: Schema.Struct({ workflowId: Schema.String }),
    error: ExecuteWorkflowError,
    payload: StartExecuteParams,
  }),
  Rpc.make("execute.continue", {
    success: Schema.Void,
    error: ExecuteWorkflowError,
    payload: ContinueExecuteParams,
  }),
  Rpc.make("execute.stop", {
    success: Schema.Void,
    error: ExecuteWorkflowError,
    payload: StopExecuteParams,
  }),
  Rpc.make("planAndExecute.startPlan", {
    success: Schema.Struct({ workflowId: Schema.String }),
    error: PlanAndExecuteWorkflowError,
    payload: StartPlanParams,
  }),
  Rpc.make("planAndExecute.continuePlan", {
    success: Schema.Void,
    error: PlanAndExecuteWorkflowError,
    payload: ContinuePlanParams,
  }),
  Rpc.make("planAndExecute.startExecute", {
    success: Schema.Void,
    error: PlanAndExecuteWorkflowError,
    payload: StartExecutePhaseParams,
  }),
  Rpc.make("planAndExecute.continueExecute", {
    success: Schema.Void,
    error: PlanAndExecuteWorkflowError,
    payload: ContinueExecutePhaseParams,
  }),
  Rpc.make("planAndExecute.stop", {
    success: Schema.Void,
    error: PlanAndExecuteWorkflowError,
    payload: StopPlanAndExecuteParams,
  }),
  Rpc.make("query", {
    success: Schema.Array(EntitySchema(workflowEntity)),
    error: ExecuteWorkflowError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
).prefix("workflow.") {}
