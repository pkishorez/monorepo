import type { Entity } from 'std-toolkit/core';
import {
  ExportLogsServiceRequestSchema,
  ExportTraceServiceRequestSchema,
  NewLogRecordSchema,
} from '../telemetry-schema/index.js';
import type {
  LogRecord,
  SpanRecord,
  TraceSummary,
} from '../telemetry-schema/index.js';

type ExportLogsServiceRequest = typeof ExportLogsServiceRequestSchema.Type;
type ExportTraceServiceRequest = typeof ExportTraceServiceRequestSchema.Type;
type NewLogRecord = typeof NewLogRecordSchema.Type;

const toNanoseconds = (value: string | number | undefined): bigint | null => {
  if (value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const compareTime = (
  left: string | number | undefined,
  right: string | number | undefined,
) => {
  const leftTime = toNanoseconds(left);
  const rightTime = toNanoseconds(right);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime < rightTime ? -1 : 1;
  }
  if (leftTime !== null) return -1;
  if (rightTime !== null) return 1;
  return 0;
};

export const spanRecordsFromRequest = (request: ExportTraceServiceRequest) => {
  const records: SpanRecord[] = [];
  let rejected = 0;

  for (const resourceSpans of request.resourceSpans ?? []) {
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const candidate of scopeSpans.spans ?? []) {
        const { traceId, spanId, ...span } = candidate;
        if (!traceId || !spanId) {
          rejected += 1;
          continue;
        }
        records.push({
          traceId,
          spanId,
          flowId: null,
          participantName: null,
          span,
          context: {
            ...(resourceSpans.resource && { resource: resourceSpans.resource }),
            ...(scopeSpans.scope && {
              instrumentationScope: scopeSpans.scope,
            }),
            ...(resourceSpans.schemaUrl && {
              resourceSchemaUrl: resourceSpans.schemaUrl,
            }),
            ...(scopeSpans.schemaUrl && {
              scopeSchemaUrl: scopeSpans.schemaUrl,
            }),
          },
        });
      }
    }
  }

  return { records, rejected };
};

export const logRecordsFromRequest = (request: ExportLogsServiceRequest) => {
  const records: NewLogRecord[] = [];

  for (const resourceLogs of request.resourceLogs ?? []) {
    for (const scopeLogs of resourceLogs.scopeLogs ?? []) {
      for (const candidate of scopeLogs.logRecords ?? []) {
        const { traceId, spanId, ...log } = candidate;
        records.push({
          traceId: traceId ?? null,
          spanId: spanId ?? null,
          log,
          context: {
            ...(resourceLogs.resource && { resource: resourceLogs.resource }),
            ...(scopeLogs.scope && {
              instrumentationScope: scopeLogs.scope,
            }),
            ...(resourceLogs.schemaUrl && {
              resourceSchemaUrl: resourceLogs.schemaUrl,
            }),
            ...(scopeLogs.schemaUrl && {
              scopeSchemaUrl: scopeLogs.schemaUrl,
            }),
          },
        });
      }
    }
  }

  return { records, rejected: 0 };
};

export const makeTraceDetails = (
  traceId: string,
  spans: Entity<SpanRecord>[],
  logs: Entity<LogRecord>[],
) => ({
  traceId,
  spans: [...spans].sort((left, right) => {
    const compared = compareTime(
      left.value.span.startTimeUnixNano,
      right.value.span.startTimeUnixNano,
    );
    return compared || left.meta._u.localeCompare(right.meta._u);
  }),
  logs: [...logs].sort((left, right) => {
    const compared = compareTime(
      left.value.log.timeUnixNano ?? left.value.log.observedTimeUnixNano,
      right.value.log.timeUnixNano ?? right.value.log.observedTimeUnixNano,
    );
    return compared || left.meta._u.localeCompare(right.meta._u);
  }),
});

const SERVICE_NAME_KEY = 'service.name';

const serviceNameOf = (record: SpanRecord) =>
  record.context.resource?.attributes?.find(
    (attribute) => attribute.key === SERVICE_NAME_KEY,
  )?.value?.stringValue ?? null;

const timeText = (value: string | number | undefined) =>
  value === undefined ? null : String(value);

/** Summarises the stored Spans of one Trace into a Trace Summary. */
export const makeTraceSummary = (
  traceId: string,
  spans: Entity<SpanRecord>[],
): TraceSummary => {
  const records = spans.map((span) => span.value);
  const knownSpanIds = new Set(records.map((record) => record.spanId));
  const root =
    records.find(
      (record) =>
        !record.span.parentSpanId ||
        !knownSpanIds.has(record.span.parentSpanId),
    ) ?? records[0];
  const starts = records.map((record) => record.span.startTimeUnixNano);
  const ends = records.map((record) => record.span.endTimeUnixNano);
  const running = ends.some((end) => end === undefined);
  const earliest = starts.reduce<string | number | undefined>(
    (min, start) => (compareTime(start, min) < 0 ? start : min),
    undefined,
  );
  const latest = running
    ? undefined
    : ends.reduce<string | number | undefined>(
        (max, end) =>
          max === undefined || compareTime(end, max) > 0 ? end : max,
        undefined,
      );

  return {
    traceId,
    name: root?.span.name ?? null,
    serviceName: root ? serviceNameOf(root) : null,
    startTimeUnixNano: timeText(earliest),
    endTimeUnixNano: timeText(latest),
    spanCount: records.length,
    errorCount: records.filter((record) => record.span.status?.code === 2)
      .length,
    running,
  };
};
