import type { EntityType } from 'std-toolkit/core';
import {
  ExportLogsServiceRequestSchema,
  ExportTraceServiceRequestSchema,
  NewLogRecordSchema,
} from '../telemetry-schema/index.js';
import type { LogRecord, SpanRecord } from '../telemetry-schema/index.js';

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
  spans: EntityType<SpanRecord>[],
  logs: EntityType<LogRecord>[],
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
