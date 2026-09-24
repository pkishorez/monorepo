import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { HARNESS_IDS, RUN_STATUSES } from '../../protocol/index.js';

const ClaudeRunDataSchema = Schema.Struct({
  type: Schema.Literal('claude'),
  model: Schema.String,
  thinking: Schema.NullOr(Schema.Struct({ budgetTokens: Schema.Number })),
  permissionMode: Schema.String,
  allowDangerouslySkipPermissions: Schema.Boolean,
  maxTurns: Schema.NullOr(Schema.Number),
  permissionTimeoutMs: Schema.NullOr(Schema.Number),
  inputHash: Schema.String,
});

const CodexRunDataSchema = Schema.Struct({
  type: Schema.Literal('codex'),
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  approvalPolicy: Schema.String,
  sandbox: Schema.String,
  requestTimeoutMs: Schema.NullOr(Schema.Number),
  inputHash: Schema.String,
});

export const RunSchema = EntityESchema.make('AiRun', 'id', {
  threadId: Schema.String,
  harness: Schema.Literals(HARNESS_IDS),
  status: Schema.Literals(RUN_STATUSES),
  hostId: Schema.String,
  startedAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  data: Schema.Union([ClaudeRunDataSchema, CodexRunDataSchema]),
}).build();

export type Run = typeof RunSchema.Type;
