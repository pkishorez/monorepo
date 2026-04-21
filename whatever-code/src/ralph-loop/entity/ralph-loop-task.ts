import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

export const RalphLoopTaskStatus = Schema.Literal(
  'pending',
  'running',
  'completed',
  'failed',
);
export type RalphLoopTaskStatus = typeof RalphLoopTaskStatus.Type;

export const ralphLoopTaskEntity = EntityESchema.make('ralphLoopTask', 'id', {
  ralphLoopId: Schema.String,
  title: Schema.String,
  description: Schema.String,
  status: RalphLoopTaskStatus,
  order: Schema.Number,
  sessionId: Schema.optionalWith(Schema.String, { exact: true }),
  outcome: Schema.optionalWith(Schema.String, { exact: true }),
  learnings: Schema.optionalWith(Schema.String, { exact: true }),
}).build();
