export {
  LogRecordSchema,
  MetricRecordSchema,
  TraceRecordSchema,
  type StoredLogRecordValue,
  type StoredMetricRecordValue,
  type StoredTraceRecordValue,
} from './schema.js';
export type {
  ExportLogsServiceRequest,
  ExportMetricsServiceRequest,
  ExportTraceServiceRequest,
} from './otel-proto/index.js';
