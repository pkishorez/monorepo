import { EntityESchema, fromType } from 'std-toolkit/eschema';
import type {
  LogRecord,
  LogRecordContext,
  Metric,
  MetricRecordContext,
  Span,
  TraceRecordContext,
} from './otel-proto/index.js';

export const TraceRecordSchema = EntityESchema.make('TraceRecord', 'id', {
  record: fromType<Span>(),
  context: fromType<TraceRecordContext>(),
}).build();

export const LogRecordSchema = EntityESchema.make('LogRecord', 'id', {
  record: fromType<LogRecord>(),
  context: fromType<LogRecordContext>(),
}).build();

export const MetricRecordSchema = EntityESchema.make('MetricRecord', 'id', {
  record: fromType<Metric>(),
  context: fromType<MetricRecordContext>(),
}).build();

export type StoredTraceRecordValue = typeof TraceRecordSchema.Type;
export type StoredLogRecordValue = typeof LogRecordSchema.Type;
export type StoredMetricRecordValue = typeof MetricRecordSchema.Type;

/**
 * A sort-key bound over a record's monotonic id. The operator encodes the scan
 * direction: `>`/`>=` page oldest-to-newest (the live tail), `<`/`<=` page
 * newest-to-oldest (the new-to-old backfill); a `null` value drops the bound and
 * scans the whole set in the operator's direction.
 */
export type TelemetryQuery =
  | { '>': string | null }
  | { '>=': string | null }
  | { '<': string | null }
  | { '<=': string | null };
