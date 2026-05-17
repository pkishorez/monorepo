import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
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

const ingestTraces = HttpApiEndpoint.post('ingestTraces', '/v1/traces')
  .setPayload(fromType<ExportTraceServiceRequest>())
  .addSuccess(IngestResponse)
  .addError(BadRequestError)
  .addError(UnsupportedMediaTypeError)
  .addError(InternalError);

const ingestLogs = HttpApiEndpoint.post('ingestLogs', '/v1/logs')
  .setPayload(fromType<ExportLogsServiceRequest>())
  .addSuccess(IngestResponse)
  .addError(BadRequestError)
  .addError(UnsupportedMediaTypeError)
  .addError(InternalError);

const ingestMetrics = HttpApiEndpoint.post('ingestMetrics', '/v1/metrics')
  .setPayload(fromType<ExportMetricsServiceRequest>())
  .addSuccess(IngestResponse)
  .addError(BadRequestError)
  .addError(UnsupportedMediaTypeError)
  .addError(InternalError);

const queryTraces = HttpApiEndpoint.get('queryTraces', '/api/traces')
  .setUrlParams(CursorParams)
  .addSuccess(TraceListResponse)
  .addError(InternalError);

const queryLogs = HttpApiEndpoint.get('queryLogs', '/api/logs')
  .setUrlParams(CursorParams)
  .addSuccess(LogListResponse)
  .addError(InternalError);

const queryMetrics = HttpApiEndpoint.get('queryMetrics', '/api/metrics')
  .setUrlParams(CursorParams)
  .addSuccess(MetricListResponse)
  .addError(InternalError);

const clearTelemetry = HttpApiEndpoint.del('clearTelemetry', '/api/telemetry')
  .addSuccess(ClearResponse)
  .addError(InternalError);

export const LotelGroup = HttpApiGroup.make('lotel')
  .add(ingestTraces)
  .add(ingestLogs)
  .add(ingestMetrics)
  .add(queryTraces)
  .add(queryLogs)
  .add(queryMetrics)
  .add(clearTelemetry);

export class LotelApi extends HttpApi.make('lotelApi').add(LotelGroup) {}
