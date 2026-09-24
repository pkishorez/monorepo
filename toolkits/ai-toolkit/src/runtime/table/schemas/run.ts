import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { claude, codex, common } from '../../protocol/index.js';

const ClaudeRunDataV1Schema = Schema.Struct({
  type: Schema.Literal('claude'),
  model: Schema.String,
  thinking: Schema.NullOr(Schema.Struct({ budgetTokens: Schema.Number })),
  permissionMode: Schema.String,
  allowDangerouslySkipPermissions: Schema.Boolean,
  maxTurns: Schema.NullOr(Schema.Number),
  permissionTimeoutMs: Schema.NullOr(Schema.Number),
  inputHash: Schema.String,
});

const CodexRunDataV1Schema = Schema.Struct({
  type: Schema.Literal('codex'),
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  approvalPolicy: Schema.String,
  sandbox: Schema.String,
  requestTimeoutMs: Schema.NullOr(Schema.Number),
  inputHash: Schema.String,
});

const RunDataV1Schema = Schema.Union([
  ClaudeRunDataV1Schema,
  CodexRunDataV1Schema,
]);

const RunDataV2Schema = Schema.Union([
  Schema.Struct({
    ...ClaudeRunDataV1Schema.fields,
    facts: Schema.NullOr(claude.schemas.runFacts),
  }),
  Schema.Struct({
    ...CodexRunDataV1Schema.fields,
    facts: Schema.NullOr(codex.schemas.runFacts),
  }),
]);

export const RunSchema = EntityESchema.make('AiRun', 'id', {
  threadId: Schema.String,
  harness: Schema.Literals(common.harnessIds),
  status: Schema.Literals(common.runStatuses),
  hostId: Schema.String,
  startedAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  data: RunDataV1Schema,
})
  .evolve('v2', { data: RunDataV2Schema }, (run) => ({
    ...run,
    data: { ...run.data, facts: null },
  }))
  .build();

export type Run = typeof RunSchema.Type;
