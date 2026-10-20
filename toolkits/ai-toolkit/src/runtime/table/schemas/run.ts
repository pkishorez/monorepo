import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { HARNESS_IDS, RUN_STATUSES } from '../../protocol/index.js';

const ClaudeRunDataSchema = Schema.Struct({
  type: Schema.Literal('claude'),
  model: Schema.String,
  thinking: Schema.NullOr(Schema.Struct({ budgetTokens: Schema.Finite })),
  permissionMode: Schema.String,
  allowDangerouslySkipPermissions: Schema.Boolean,
  maxTurns: Schema.NullOr(Schema.Finite),
  permissionTimeoutMs: Schema.NullOr(Schema.Finite),
  inputHash: Schema.String,
});

const CodexRunDataSchema = Schema.Struct({
  type: Schema.Literal('codex'),
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  approvalPolicy: Schema.String,
  sandbox: Schema.String,
  requestTimeoutMs: Schema.NullOr(Schema.Finite),
  inputHash: Schema.String,
});

export const RunSchema = EntityESchema.make('AiRun', 'id', {
  threadId: Schema.String,
  harness: Schema.Literals(HARNESS_IDS),
  status: Schema.Literals(RUN_STATUSES),
  hostId: Schema.String,
  startedAt: Schema.Finite,
  finishedAt: Schema.NullOr(Schema.Finite),
  data: Schema.Union([ClaudeRunDataSchema, CodexRunDataSchema]),
}).build();

export type Run = typeof RunSchema.Type;
