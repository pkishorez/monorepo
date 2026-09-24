import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { common } from '../../protocol/index.js';

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
  harness: Schema.Literals(common.harnessIds),
  cwd: Schema.String,
  status: Schema.Literals(common.threadStatuses),
  activeRunId: Schema.NullOr(Schema.String),
  data: ThreadDataSchema,
}).build();

export type Thread = typeof ThreadSchema.Type;
