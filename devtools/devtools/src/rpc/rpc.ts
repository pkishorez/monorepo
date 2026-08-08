import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  LogRecordSchema,
  MetricRecordSchema,
  TraceRecordSchema,
} from '@pkishorez/lotel/client';
import {
  ArchitectureAnalysisSchema,
  ConfigValidationIssueSchema,
} from 'laymos/architecture-analysis-schema';
import { EntitySchema } from 'std-toolkit/core';

export class DevtoolsRpcError extends Schema.TaggedErrorClass<DevtoolsRpcError>(
  'DevtoolsRpcError',
)('DevtoolsRpcError', {
  message: Schema.String,
}) {}

export class TraceNotFound extends Schema.TaggedErrorClass<TraceNotFound>(
  'TraceNotFound',
)('TraceNotFound', {
  traceId: Schema.String,
}) {}

export class InvalidProjectPath extends Schema.TaggedErrorClass<InvalidProjectPath>(
  'InvalidProjectPath',
)('InvalidProjectPath', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
}) {}

export class ConfigReadError extends Schema.TaggedErrorClass<ConfigReadError>(
  'ConfigReadError',
)('ConfigReadError', { message: Schema.String }) {}

export class ConfigParseError extends Schema.TaggedErrorClass<ConfigParseError>(
  'ConfigParseError',
)('ConfigParseError', { message: Schema.String }) {}

export class ConfigSchemaError extends Schema.TaggedErrorClass<ConfigSchemaError>(
  'ConfigSchemaError',
)('ConfigSchemaError', { message: Schema.String }) {}

export class ConfigValidationError extends Schema.TaggedErrorClass<ConfigValidationError>(
  'ConfigValidationError',
)('ConfigValidationError', {
  issues: Schema.Array(ConfigValidationIssueSchema),
}) {}

export class SourceAnalysisError extends Schema.TaggedErrorClass<SourceAnalysisError>(
  'SourceAnalysisError',
)('SourceAnalysisError', {
  message: Schema.String,
  baseDir: Schema.optional(Schema.String),
}) {}

const AnalyzeLaymosProjectError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  SourceAnalysisError,
]);

const SkBound = Schema.Union([
  Schema.Struct({ '>': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '>=': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<=': Schema.NullOr(Schema.String) }),
]);

const QueryPayload = { sk: SkBound, limit: Schema.optional(Schema.Number) };

const TraceListSuccess = Schema.Struct({
  items: Schema.Array(EntitySchema(TraceRecordSchema)),
});
const TraceSuccess = Schema.Struct({
  traceId: Schema.String,
  spans: Schema.Array(
    TraceRecordSchema.schema as unknown as Schema.Codec<
      typeof TraceRecordSchema.Type,
      typeof TraceRecordSchema.Type
    >,
  ),
});
const LogListSuccess = Schema.Struct({
  items: Schema.Array(EntitySchema(LogRecordSchema)),
});
const MetricListSuccess = Schema.Struct({
  items: Schema.Array(EntitySchema(MetricRecordSchema)),
});
const ClearSuccess = Schema.Struct({ deleted: Schema.Number });

export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('QueryTraces', {
    payload: QueryPayload,
    success: TraceListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('GetTrace', {
    payload: { traceId: Schema.String },
    success: TraceSuccess,
    error: Schema.Union([TraceNotFound, DevtoolsRpcError]),
  }),
  Rpc.make('QueryLogs', {
    payload: QueryPayload,
    success: LogListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('QueryMetrics', {
    payload: QueryPayload,
    success: MetricListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('ClearTelemetry', {
    payload: {},
    success: ClearSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('AnalyzeLaymosProject', {
    payload: { projectPath: Schema.String },
    success: ArchitectureAnalysisSchema,
    error: AnalyzeLaymosProjectError,
  }),
);
