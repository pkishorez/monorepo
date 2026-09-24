import type { KeyValue } from '@pkishorez/lotel/telemetry';
import { byTime, isoTime, nanosToMillis } from '../text-format.js';

type AnyValue = NonNullable<KeyValue['value']>;

type StoredSpan = {
  readonly value: {
    readonly traceId: string;
    readonly spanId: string;
    readonly flowId: string | null;
    readonly participantName: string | null;
    readonly span: {
      readonly parentSpanId?: string;
      readonly name?: string;
      readonly startTimeUnixNano?: string | number;
      readonly endTimeUnixNano?: string | number;
      readonly attributes?: KeyValue[];
      readonly status?: { readonly code?: number; readonly message?: string };
    };
    readonly context: {
      readonly resource?: { readonly attributes?: KeyValue[] };
      readonly instrumentationScope?: { readonly name?: string };
    };
  };
};

type StoredLog = {
  readonly value: {
    readonly id: string;
    readonly traceId: string | null;
    readonly spanId: string | null;
    readonly log: {
      readonly timeUnixNano?: string | number;
      readonly observedTimeUnixNano?: string | number;
      readonly severityNumber?: number;
      readonly severityText?: string;
      readonly body?: AnyValue;
      readonly attributes?: KeyValue[];
      readonly eventName?: string;
    };
  };
};

export type TraceDetailsInput = {
  readonly traceId: string;
  readonly spans: ReadonlyArray<StoredSpan>;
  readonly logs: ReadonlyArray<StoredLog>;
};

export type TraceSummaryInput = {
  readonly traceId: string;
  readonly name: string | null;
  readonly serviceName: string | null;
  readonly startTimeUnixNano: string | null;
  readonly endTimeUnixNano: string | null;
  readonly spanCount: number;
  readonly errorCount: number;
  readonly running: boolean;
};

export type SpanStatus = 'ok' | 'error' | 'unset' | 'running';

export type SimpleLog = {
  readonly id: string;
  readonly time: string | null;
  readonly severity: string;
  readonly body: string;
  readonly eventName: string | null;
  readonly attributes: Record<string, unknown>;
  readonly timeMs: number | null;
};

export type SimpleSpan = {
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly narrative: string | null;
  readonly serviceName: string | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly durationMs: number | null;
  readonly status: SpanStatus;
  readonly statusMessage: string | null;
  readonly flowId: string | null;
  readonly participantName: string | null;
  readonly attributes: Record<string, unknown>;
  readonly logs: ReadonlyArray<SimpleLog>;
  readonly startMs: number | null;
};

export type SimpleTrace = {
  readonly traceId: string;
  readonly name: string | null;
  readonly serviceName: string | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly durationMs: number | null;
  readonly spanCount: number;
  readonly errorCount: number;
  readonly running: boolean;
  readonly spans: ReadonlyArray<SimpleSpan>;
  readonly logs: ReadonlyArray<SimpleLog>;
  readonly startMs: number | null;
};

export type SimpleTraceSummary = Omit<
  SimpleTrace,
  'spans' | 'logs' | 'startMs'
>;

const NARRATIVE_KEY = 'narrative';
const SERVICE_NAME_KEY = 'service.name';

const SEVERITY_BANDS: ReadonlyArray<readonly [number, string]> = [
  [4, 'TRACE'],
  [8, 'DEBUG'],
  [12, 'INFO'],
  [16, 'WARN'],
  [20, 'ERROR'],
  [24, 'FATAL'],
];

export const attributeValue = (value: AnyValue | undefined): unknown => {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue?.values)
    return value.arrayValue.values.map(attributeValue);
  if (value.kvlistValue?.values)
    return attributeRecord(value.kvlistValue.values);
  return value.bytesValue ?? null;
};

export const attributeRecord = (
  attributes: ReadonlyArray<KeyValue> | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    (attributes ?? [])
      .filter((attribute) => attribute.key)
      .map((attribute) => [attribute.key!, attributeValue(attribute.value)]),
  );

const stringAttribute = (attributes: Record<string, unknown>, key: string) => {
  const value = attributes[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const severityLabel = (log: StoredLog['value']['log']) => {
  if (log.severityText) return log.severityText.toUpperCase();
  const number = log.severityNumber ?? 0;
  return SEVERITY_BANDS.find(([max]) => number <= max)?.[1] ?? 'UNSET';
};

const bodyText = (body: AnyValue | undefined) => {
  const value = attributeValue(body);
  return value === null
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
};

const spanStatus = (span: StoredSpan['value']['span']): SpanStatus => {
  if (span.endTimeUnixNano === undefined) return 'running';
  switch (span.status?.code) {
    case 1:
      return 'ok';
    case 2:
      return 'error';
    default:
      return 'unset';
  }
};

const simplifyLog = (record: StoredLog): SimpleLog => {
  const log = record.value.log;
  const timeMs = nanosToMillis(log.timeUnixNano ?? log.observedTimeUnixNano);
  return {
    id: record.value.id,
    time: isoTime(timeMs),
    severity: severityLabel(log),
    body: bodyText(log.body),
    eventName: log.eventName ?? null,
    attributes: attributeRecord(log.attributes),
    timeMs,
  };
};

const simplifySpan = (
  record: StoredSpan,
  knownSpanIds: ReadonlySet<string>,
  logs: ReadonlyArray<SimpleLog>,
): SimpleSpan => {
  const { span, context } = record.value;
  const attributes = attributeRecord(span.attributes);
  const startMs = nanosToMillis(span.startTimeUnixNano);
  const endMs = nanosToMillis(span.endTimeUnixNano);
  const parentSpanId =
    span.parentSpanId && knownSpanIds.has(span.parentSpanId)
      ? span.parentSpanId
      : null;
  return {
    spanId: record.value.spanId,
    parentSpanId,
    name: span.name ?? '',
    narrative: stringAttribute(attributes, NARRATIVE_KEY),
    serviceName: stringAttribute(
      attributeRecord(context.resource?.attributes),
      SERVICE_NAME_KEY,
    ),
    startTime: isoTime(startMs),
    endTime: isoTime(endMs),
    durationMs: startMs !== null && endMs !== null ? endMs - startMs : null,
    status: spanStatus(span),
    statusMessage: span.status?.message ?? null,
    flowId: record.value.flowId,
    participantName: record.value.participantName,
    attributes,
    logs,
    startMs,
  };
};

/** Reduces stored Trace Details to the flat shape Client Commands print. */
export const simplifyTrace = (details: TraceDetailsInput): SimpleTrace => {
  const knownSpanIds = new Set(details.spans.map((span) => span.value.spanId));
  const logsBySpan = new Map<string, SimpleLog[]>();
  const traceLogs: SimpleLog[] = [];
  for (const record of details.logs) {
    const log = simplifyLog(record);
    const spanId = record.value.spanId;
    if (spanId && knownSpanIds.has(spanId)) {
      const bucket = logsBySpan.get(spanId) ?? [];
      bucket.push(log);
      logsBySpan.set(spanId, bucket);
    } else {
      traceLogs.push(log);
    }
  }
  const spans = details.spans
    .map((record) =>
      simplifySpan(
        record,
        knownSpanIds,
        (logsBySpan.get(record.value.spanId) ?? []).sort(
          byTime((log) => log.timeMs),
        ),
      ),
    )
    .sort(byTime((span) => span.startMs));

  const root = spans.find((span) => span.parentSpanId === null) ?? spans[0];
  const starts = spans
    .map((span) => span.startMs)
    .filter((v): v is number => v !== null);
  const running = spans.some((span) => span.status === 'running');
  const ends = spans
    .map((span) =>
      span.startMs !== null && span.durationMs !== null
        ? span.startMs + span.durationMs
        : null,
    )
    .filter((v): v is number => v !== null);
  const startMs = starts.length > 0 ? Math.min(...starts) : null;
  const endMs = running || ends.length === 0 ? null : Math.max(...ends);

  return {
    traceId: details.traceId,
    name: root?.name ?? null,
    serviceName: root?.serviceName ?? null,
    startTime: isoTime(startMs),
    endTime: isoTime(endMs),
    durationMs: startMs !== null && endMs !== null ? endMs - startMs : null,
    spanCount: spans.length,
    errorCount: spans.filter((span) => span.status === 'error').length,
    running,
    spans,
    logs: traceLogs.sort(byTime((log) => log.timeMs)),
    startMs,
  };
};

/** Converts a Trace Summary's OTLP times to ISO strings and a duration. */
export const simplifyTraceSummary = (
  summary: TraceSummaryInput,
): SimpleTraceSummary => {
  const startMs = nanosToMillis(summary.startTimeUnixNano);
  const endMs = nanosToMillis(summary.endTimeUnixNano);
  return {
    traceId: summary.traceId,
    name: summary.name,
    serviceName: summary.serviceName,
    startTime: isoTime(startMs),
    endTime: isoTime(endMs),
    durationMs: startMs !== null && endMs !== null ? endMs - startMs : null,
    spanCount: summary.spanCount,
    errorCount: summary.errorCount,
    running: summary.running,
  };
};

/** Strips the internal millisecond fields that only the text renderer needs. */
export const traceJson = ({ startMs: _start, ...trace }: SimpleTrace) => ({
  ...trace,
  spans: trace.spans.map(({ startMs: _start, logs, ...span }) => ({
    ...span,
    logs: logs.map(({ timeMs: _time, ...log }) => log),
  })),
  logs: trace.logs.map(({ timeMs: _time, ...log }) => log),
});
