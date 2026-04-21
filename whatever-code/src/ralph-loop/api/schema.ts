import { Schema } from 'effect';
import { PromptContent } from '../../agents/shared/schema.js';

export const CreateRalphLoopParams = Schema.Struct({
  projectId: Schema.String,
  model: Schema.String,
  prompt: PromptContent,
});

export const ContinuePlanningParams = Schema.Struct({
  ralphLoopId: Schema.String,
  prompt: PromptContent,
});

export const StartExecutionParams = Schema.Struct({
  ralphLoopId: Schema.String,
  model: Schema.String,
  prompt: Schema.String,
  branchName: Schema.String,
  tasks: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      description: Schema.String,
    }),
  ),
});

export const RalphLoopIdParams = Schema.Struct({
  ralphLoopId: Schema.String,
});

export const QueryRalphLoopsParams = Schema.Struct({
  '>': Schema.NullOr(Schema.String),
});

export const QueryRalphLoopTasksParams = Schema.Struct({
  ralphLoopId: Schema.String,
});

export class RalphLoopError extends Schema.TaggedError<RalphLoopError>()(
  'RalphLoopError',
  { message: Schema.String },
) {}
