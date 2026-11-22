import type { Entity } from '@kestack/std-toolkit/core';
import type {
  LogRecord,
  SpanRecord,
  TraceSummary,
} from '../../contract/index.js';

/*
 * Traces as the RPC reads them back: a Trace is not stored, it is the
 * Span Records that share a trace ID, ordered here by when each started.
 */

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

/** One Trace with its Span Records and Log Records, each in time order. */
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
