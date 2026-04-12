import { Rpc, RpcGroup } from "@effect/rpc";
import { EntitySchema } from "@std-toolkit/core";
import { Schema } from "effect";
import { ralphLoopEntity } from "../entity/ralph-loop.js";
import { ralphLoopTaskEntity } from "../entity/ralph-loop-task.js";
import {
  CreateRalphLoopParams,
  ContinuePlanningParams,
  FinalizeTasksParams,
  StartExecutionParams,
  RalphLoopIdParams,
  QueryRalphLoopsParams,
  QueryRalphLoopTasksParams,
  RalphLoopError,
} from "./schema.js";

export class RalphLoopRpcs extends RpcGroup.make(
  Rpc.make("create", {
    success: Schema.Struct({
      ralphLoopId: Schema.String,
      planningSessionId: Schema.String,
      workflowId: Schema.String,
    }),
    error: RalphLoopError,
    payload: CreateRalphLoopParams,
  }),
  Rpc.make("continuePlanning", {
    success: Schema.Void,
    error: RalphLoopError,
    payload: ContinuePlanningParams,
  }),
  Rpc.make("finalizeTasks", {
    success: Schema.Void,
    error: RalphLoopError,
    payload: FinalizeTasksParams,
  }),
  Rpc.make("startExecution", {
    success: Schema.Void,
    error: RalphLoopError,
    payload: StartExecutionParams,
  }),
  Rpc.make("interruptPlanning", {
    success: Schema.Void,
    error: RalphLoopError,
    payload: RalphLoopIdParams,
  }),
  Rpc.make("cancel", {
    success: Schema.Void,
    error: RalphLoopError,
    payload: RalphLoopIdParams,
  }),
  Rpc.make("query", {
    success: Schema.Array(EntitySchema(ralphLoopEntity)),
    error: RalphLoopError,
    payload: QueryRalphLoopsParams,
  }),
  Rpc.make("queryTasks", {
    success: Schema.Array(EntitySchema(ralphLoopTaskEntity)),
    error: RalphLoopError,
    payload: QueryRalphLoopTasksParams,
  }),
).prefix("ralphLoop.") {}
