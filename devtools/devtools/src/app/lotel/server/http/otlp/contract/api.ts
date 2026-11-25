import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { ESchema } from '@kestack/std-toolkit/eschema';
import type {
  ExportLogsServiceRequest,
  ExportTraceServiceRequest,
} from './otlp.js';

export const ExportTraceServiceRequestSchema =
  ESchema.fromType<ExportTraceServiceRequest>();

export const ExportLogsServiceRequestSchema =
  ESchema.fromType<ExportLogsServiceRequest>();

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

export class OtlpBadRequest extends Schema.TaggedError<OtlpBadRequest>()(
  'OtlpBadRequest',
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class OtlpInternalError extends Schema.TaggedError<OtlpInternalError>()(
  'OtlpInternalError',
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}

export const OtlpHttpGroup = HttpApiGroup.make('lotelOtlp')
  .add(
    HttpApiEndpoint.post('ingestTraces', '/v1/traces', {
      payload: ExportTraceServiceRequestSchema,
      success: ExportTraceServiceResponseSchema,
      error: [OtlpBadRequest, OtlpInternalError],
    }),
  )
  .add(
    HttpApiEndpoint.post('ingestLogs', '/v1/logs', {
      payload: ExportLogsServiceRequestSchema,
      success: ExportLogsServiceResponseSchema,
      error: [OtlpBadRequest, OtlpInternalError],
    }),
  );

export class OtlpHttpApi extends HttpApi.make('lotelOtlpHttpApi').add(
  OtlpHttpGroup,
) {}
