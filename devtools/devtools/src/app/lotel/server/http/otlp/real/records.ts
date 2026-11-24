import type {
  ExportLogsServiceRequest,
  ExportTraceServiceRequest,
} from '../contract/index.js';
import type {
  NewLogRecord,
  NewSpanRecord,
} from '../../../rpc/telemetry/contract/index.js';

/*
 * An OTLP export request as the records the Telemetry Store keeps: each
 * Span and Log Record keeps the Resource and Instrumentation Scope it came
 * under as its context. A Span without a trace ID or span ID has no
 * identity, so it is rejected; a Log Record needs neither.
 */

/** The Span Records of a trace export request, and how many Spans had no identity. */
export const spanRecordsFromRequest = (request: ExportTraceServiceRequest) => {
  const records: NewSpanRecord[] = [];
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

/** The Log Records of a logs export request; none is rejected. */
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
