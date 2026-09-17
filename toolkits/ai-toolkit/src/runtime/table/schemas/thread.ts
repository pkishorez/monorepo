import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { HARNESS_IDS, THREAD_STATUSES } from '../../protocol/index.js';

const ThreadDataSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('claude'),
    sessionId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('codex'),
    threadId: Schema.NullOr(Schema.String),
  }),
]);

export const ThreadSchema = EntityESchema.make('AiThread', 'id', {
  harness: Schema.Literals(HARNESS_IDS),
  cwd: Schema.String,
  status: Schema.Literals(THREAD_STATUSES),
  activeRunId: Schema.NullOr(Schema.String),
  data: ThreadDataSchema,
}).build();

export type Thread = typeof ThreadSchema.Type;
