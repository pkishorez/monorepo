import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

export const RalphLoopStatus = Schema.Literal(
  'planning',
  'reviewing',
  'executing',
  'completed',
  'failed',
  'cancelled',
);
export type RalphLoopStatus = typeof RalphLoopStatus.Type;

const WorktreeMeta = Schema.Struct({
  path: Schema.String,
  branch: Schema.String,
  repoPath: Schema.String,
});

export const ralphLoopEntity = EntityESchema.make('ralphLoop', 'id', {
  projectId: Schema.String,
  planningSessionId: Schema.String,
  status: RalphLoopStatus,
  prompt: Schema.optionalWith(Schema.String, { exact: true }),
  branchName: Schema.optionalWith(Schema.String, { exact: true }),
  model: Schema.optionalWith(Schema.String, { exact: true }),
  worktree: Schema.optionalWith(WorktreeMeta, { exact: true }),
  activeSessionId: Schema.optionalWith(Schema.NullOr(Schema.String), {
    exact: true,
  }),
}).build();
