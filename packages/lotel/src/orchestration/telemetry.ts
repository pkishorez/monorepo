import { Effect } from 'effect';
import { Db } from '../storage/index.js';
import {
  type ExportLogsServiceRequest,
  type ExportMetricsServiceRequest,
  type ExportTraceServiceRequest,
  type StoredLogRecordValue,
  type StoredMetricRecordValue,
  type StoredTraceRecordValue,
  type TelemetryQuery,
} from '../domain/index.js';
import { monotonicUlid } from './ulid.js';

const isArray = <T>(value: T[] | undefined): value is T[] =>
  Array.isArray(value);

export const traceRecordsFromRequest = (
  request: ExportTraceServiceRequest,
): StoredTraceRecordValue[] => {
  const records: StoredTraceRecordValue[] = [];
  for (const resourceSpans of request.resourceSpans ?? []) {
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        records.push({
          id: monotonicUlid(),
          record: span,
          context: {
            ...(resourceSpans.resource && { resource: resourceSpans.resource }),
            ...(scopeSpans.scope && { scope: scopeSpans.scope }),
            ...(resourceSpans.schemaUrl && {
              schemaUrl: resourceSpans.schemaUrl,
            }),
            ...(scopeSpans.schemaUrl && {
              scopeSchemaUrl: scopeSpans.schemaUrl,
            }),
          },
        });
      }
    }
  }
  return records;
};

export const logRecordsFromRequest = (
  request: ExportLogsServiceRequest,
): StoredLogRecordValue[] => {
  const records: StoredLogRecordValue[] = [];
  for (const resourceLogs of request.resourceLogs ?? []) {
    for (const scopeLogs of resourceLogs.scopeLogs ?? []) {
      for (const logRecord of scopeLogs.logRecords ?? []) {
        records.push({
          id: monotonicUlid(),
          record: logRecord,
          context: {
            ...(resourceLogs.resource && { resource: resourceLogs.resource }),
            ...(scopeLogs.scope && { scope: scopeLogs.scope }),
            ...(resourceLogs.schemaUrl && {
              schemaUrl: resourceLogs.schemaUrl,
            }),
            ...(scopeLogs.schemaUrl && { scopeSchemaUrl: scopeLogs.schemaUrl }),
          },
        });
      }
    }
  }
  return records;
};

export const metricRecordsFromRequest = (
  request: ExportMetricsServiceRequest,
): StoredMetricRecordValue[] => {
  const records: StoredMetricRecordValue[] = [];
  for (const resourceMetrics of request.resourceMetrics ?? []) {
    for (const scopeMetrics of resourceMetrics.scopeMetrics ?? []) {
      for (const metric of scopeMetrics.metrics ?? []) {
        records.push({
          id: monotonicUlid(),
          record: metric,
          context: {
            ...(resourceMetrics.resource && {
              resource: resourceMetrics.resource,
            }),
            ...(scopeMetrics.scope && { scope: scopeMetrics.scope }),
            ...(resourceMetrics.schemaUrl && {
              schemaUrl: resourceMetrics.schemaUrl,
            }),
            ...(scopeMetrics.schemaUrl && {
              scopeSchemaUrl: scopeMetrics.schemaUrl,
            }),
          },
        });
      }
    }
  }
  return records;
};

export const isTraceRequest = (request: ExportTraceServiceRequest): boolean =>
  isArray(request.resourceSpans);

export const isLogsRequest = (request: ExportLogsServiceRequest): boolean =>
  isArray(request.resourceLogs);

export const isMetricsRequest = (
  request: ExportMetricsServiceRequest,
): boolean => isArray(request.resourceMetrics);

export const ingestTraces = (request: ExportTraceServiceRequest) =>
  Effect.gen(function* () {
    const { registry, traceRecord } = yield* Db;
    const records = traceRecordsFromRequest(request);
    yield* registry.transaction(
      Effect.forEach(records, (record) => traceRecord.insert(record), {
        discard: true,
      }),
    );
    return records.length;
  });

export const ingestLogs = (request: ExportLogsServiceRequest) =>
  Effect.gen(function* () {
    const { registry, logRecord } = yield* Db;
    const records = logRecordsFromRequest(request);
    yield* registry.transaction(
      Effect.forEach(records, (record) => logRecord.insert(record), {
        discard: true,
      }),
    );
    return records.length;
  });

export const ingestMetrics = (request: ExportMetricsServiceRequest) =>
  Effect.gen(function* () {
    const { registry, metricRecord } = yield* Db;
    const records = metricRecordsFromRequest(request);
    yield* registry.transaction(
      Effect.forEach(records, (record) => metricRecord.insert(record), {
        discard: true,
      }),
    );
    return records.length;
  });

export const queryTraces = (
  sk: TelemetryQuery = { '>': null },
  limit?: number,
) =>
  Effect.gen(function* () {
    const { traceRecord } = yield* Db;
    return yield* traceRecord.query('primary', { sk }, { limit });
  });

export const queryLogs = (sk: TelemetryQuery = { '>': null }, limit?: number) =>
  Effect.gen(function* () {
    const { logRecord } = yield* Db;
    return yield* logRecord.query('primary', { sk }, { limit });
  });

export const queryMetrics = (
  sk: TelemetryQuery = { '>': null },
  limit?: number,
) =>
  Effect.gen(function* () {
    const { metricRecord } = yield* Db;
    return yield* metricRecord.query('primary', { sk }, { limit });
  });

export const clearTelemetry = Effect.gen(function* () {
  const { table } = yield* Db;
  const { rowsDeleted } = yield* table.dangerouslyRemoveAllRows(
    'i know what i am doing',
  );
  return rowsDeleted;
});
