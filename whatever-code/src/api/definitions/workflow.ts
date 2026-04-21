import { Rpc, RpcGroup } from '@effect/rpc';
import { EntitySchema } from '@std-toolkit/core';
import { Schema } from 'effect';
import { workflowEntity } from '../../core/entity/workflow/index.js';
import {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  RemoveExecuteParams,
  ArchiveWorkflowParams,
  ExecuteWorkflowError,
} from '../../agents/workflow/schema.js';

export class WorkflowRpcs extends RpcGroup.make(
  Rpc.make('execute.start', {
    success: Schema.Struct({ workflowId: Schema.String }),
    error: ExecuteWorkflowError,
    payload: StartExecuteParams,
  }),
  Rpc.make('execute.continue', {
    success: Schema.Void,
    error: ExecuteWorkflowError,
    payload: ContinueExecuteParams,
  }),
  Rpc.make('execute.stop', {
    success: Schema.Void,
    error: ExecuteWorkflowError,
    payload: StopExecuteParams,
  }),
  Rpc.make('execute.remove', {
    success: Schema.Void,
    error: ExecuteWorkflowError,
    payload: RemoveExecuteParams,
  }),
  Rpc.make('archive', {
    success: Schema.Void,
    error: ExecuteWorkflowError,
    payload: ArchiveWorkflowParams,
  }),
  Rpc.make('query', {
    success: Schema.Array(EntitySchema(workflowEntity)),
    error: ExecuteWorkflowError,
    payload: Schema.Struct({ '>': Schema.NullOr(Schema.String) }),
  }),
).prefix('workflow.') {}
