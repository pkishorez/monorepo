import { Schema } from 'effect';
import { EntitySchema } from 'std-toolkit/core';
import { EntityESchema, fromType } from 'std-toolkit/eschema';
import type {
  ExportLogsServiceRequest,
  ExportTraceServiceRequest,
  OtlpLogRecord,
  OtlpSpan,
  TelemetryContext,
} from './otlp.js';

export type SpanPayload = Omit<OtlpSpan, 'traceId' | 'spanId'>;
export type LogPayload = Omit<OtlpLogRecord, 'traceId' | 'spanId'>;

export const SpanEntitySchema = EntityESchema.make('Span', 'spanId', {
  traceId: Schema.String,
  span: fromType<SpanPayload>(),
  context: fromType<TelemetryContext>(),
})
  .evolve(
    'v2',
    {
      flowId: Schema.NullOr(Schema.String),
      participantName: Schema.NullOr(Schema.String),
    },
    (previous) => ({
      ...previous,
      flowId: null,
      participantName: null,
    }),
  )
  .build();

export const LogEntitySchema = EntityESchema.make('LogRecord', 'id', {
  traceId: Schema.NullOr(Schema.String),
  spanId: Schema.NullOr(Schema.String),
  log: fromType<LogPayload>(),
  context: fromType<TelemetryContext>(),
})
  .evolve(
    'v2',
    {
      flowId: Schema.NullOr(Schema.String),
      participantName: Schema.NullOr(Schema.String),
    },
    (previous) => ({
      ...previous,
      flowId: null,
      participantName: null,
    }),
  )
  .build();

export type SpanRecord = typeof SpanEntitySchema.Type;
export type LogRecord = typeof LogEntitySchema.Type;

export const NewLogRecordSchema = Schema.Struct({
  traceId: Schema.NullOr(Schema.String),
  spanId: Schema.NullOr(Schema.String),
  log: fromType<LogPayload>(),
  context: fromType<TelemetryContext>(),
});

export const NewSpanRecordSchema = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  span: fromType<SpanPayload>(),
  context: fromType<TelemetryContext>(),
});

export type NewSpanRecord = typeof NewSpanRecordSchema.Type;

export type NewLogRecord = typeof NewLogRecordSchema.Type;

export const UpdateCursorSchema = Schema.Union([
  Schema.Struct({ '>': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '>=': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<=': Schema.NullOr(Schema.String) }),
]);

export type UpdateCursor = typeof UpdateCursorSchema.Type;

export const ListPayloadSchema = Schema.Struct({
  _u: UpdateCursorSchema,
  limit: Schema.optional(Schema.Number),
});

export const SpanListSchema = Schema.Struct({
  items: Schema.Array(EntitySchema(SpanEntitySchema)),
});

export const LogListSchema = Schema.Struct({
  items: Schema.Array(EntitySchema(LogEntitySchema)),
});

export const TraceDetailsSchema = Schema.Struct({
  traceId: Schema.String,
  spans: Schema.Array(EntitySchema(SpanEntitySchema)),
  logs: Schema.Array(EntitySchema(LogEntitySchema)),
});

export const BatchWriteResultSchema = Schema.Struct({
  accepted: Schema.Number,
  rejected: Schema.Number,
});

export const ClearTelemetryResultSchema = Schema.Struct({
  deleted: Schema.Number,
});

export class LotelRpcError extends Schema.TaggedErrorClass<LotelRpcError>(
  'LotelRpcError',
)('LotelRpcError', { message: Schema.String }) {}

export class TraceNotFound extends Schema.TaggedErrorClass<TraceNotFound>(
  'TraceNotFound',
)('TraceNotFound', { traceId: Schema.String }) {}

export const ExportTraceServiceRequestSchema =
  fromType<ExportTraceServiceRequest>();

export const ExportLogsServiceRequestSchema =
  fromType<ExportLogsServiceRequest>();

export const ExportTraceServiceResponseSchema = Schema.Struct({
  partialSuccess: Schema.Struct({
    rejectedSpans: Schema.Number,
    errorMessage: Schema.optional(Schema.String),
  }),
});

export const ExportLogsServiceResponseSchema = Schema.Struct({
  partialSuccess: Schema.Struct({
    rejectedLogRecords: Schema.Number,
    errorMessage: Schema.optional(Schema.String),
  }),
});

export class OtlpBadRequest extends Schema.TaggedErrorClass<OtlpBadRequest>()(
  'OtlpBadRequest',
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class OtlpInternalError extends Schema.TaggedErrorClass<OtlpInternalError>()(
  'OtlpInternalError',
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}

export type {
  ExportLogsServiceRequest,
  ExportTraceServiceRequest,
  OtlpLogRecord,
  OtlpSpan,
  KeyValue,
  TelemetryContext,
} from './otlp.js';
