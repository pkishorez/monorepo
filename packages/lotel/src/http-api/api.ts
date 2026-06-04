import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/unstable/httpapi';
import { EntitySchema } from '@std-toolkit/core';
import { fromType } from '@std-toolkit/eschema';
import { Schema } from 'effect';
import {
  LogRecordSchema,
  MetricRecordSchema,
  TraceRecordSchema,
  type ExportLogsServiceRequest,
  type ExportMetricsServiceRequest,
  type ExportTraceServiceRequest,
} from '../domain/index.js';
import {
  BadRequestError,
  InternalError,
  UnsupportedMediaTypeError,
} from './errors.js';

export const CursorParams = Schema.Struct({
  cursor: Schema.optional(Schema.String),
});

export const IngestResponse = Schema.Struct({
  partialSuccess: Schema.Struct({}),
  accepted: Schema.Number,
});

export const ClearResponse = Schema.Struct({
  deleted: Schema.Number,
});

const TraceListResponse = Schema.Struct({
  items: Schema.Array(EntitySchema(TraceRecordSchema)),
});

const LogListResponse = Schema.Struct({
  items: Schema.Array(EntitySchema(LogRecordSchema)),
});

const MetricListResponse = Schema.Struct({
  items: Schema.Array(EntitySchema(MetricRecordSchema)),
});

const ingestTraces = HttpApiEndpoint.post('ingestTraces', '/v1/traces', {
  payload: fromType<ExportTraceServiceRequest>(),
  success: IngestResponse,
  error: [BadRequestError, UnsupportedMediaTypeError, InternalError],
});

const ingestLogs = HttpApiEndpoint.post('ingestLogs', '/v1/logs', {
  payload: fromType<ExportLogsServiceRequest>(),
  success: IngestResponse,
  error: [BadRequestError, UnsupportedMediaTypeError, InternalError],
});

const ingestMetrics = HttpApiEndpoint.post('ingestMetrics', '/v1/metrics', {
  payload: fromType<ExportMetricsServiceRequest>(),
  success: IngestResponse,
  error: [BadRequestError, UnsupportedMediaTypeError, InternalError],
});

const queryTraces = HttpApiEndpoint.get('queryTraces', '/api/traces', {
  query: CursorParams,
  success: TraceListResponse,
  error: InternalError,
});

const queryLogs = HttpApiEndpoint.get('queryLogs', '/api/logs', {
  query: CursorParams,
  success: LogListResponse,
  error: InternalError,
});

const queryMetrics = HttpApiEndpoint.get('queryMetrics', '/api/metrics', {
  query: CursorParams,
  success: MetricListResponse,
  error: InternalError,
});

const clearTelemetry = HttpApiEndpoint.delete(
  'clearTelemetry',
  '/api/telemetry',
  {
    success: ClearResponse,
    error: InternalError,
  },
);

export const LotelGroup = HttpApiGroup.make('lotel')
  .add(ingestTraces)
  .add(ingestLogs)
  .add(ingestMetrics)
  .add(queryTraces)
  .add(queryLogs)
  .add(queryMetrics)
  .add(clearTelemetry);

export class LotelApi extends HttpApi.make('lotelApi').add(LotelGroup) {}
