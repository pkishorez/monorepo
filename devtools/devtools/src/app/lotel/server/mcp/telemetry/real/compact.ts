import type { Entity } from '@kestack/std-toolkit/core';
import type { KeyValue } from '../../../http/otlp/contract/index.js';
import type {
  LogRecord,
  SpanRecord,
  TraceSummary,
} from '../../../rpc/telemetry/contract/index.js';

type AnyValue = NonNullable<KeyValue['value']>;
type Nanos = string | number | undefined;

const ERROR = 2;
const OK = 1;

const nanos = (value: Nanos): bigint | null => {
  if (value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const ms = (from: bigint, to: bigint) =>
  Math.round(Number(to - from) / 1e4) / 100;

export const text = (value: AnyValue | undefined): string => {
  if (value === undefined) return '';
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return String(value.boolValue);
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.arrayValue !== undefined)
    return `[${(value.arrayValue.values ?? []).map(text).join(', ')}]`;
  return JSON.stringify(
    Object.fromEntries(
      (value.kvlistValue?.values ?? []).map(({ key, value: each }) => [
        key ?? '',
        text(each),
      ]),
    ),
  );
};

const flat = (attributes: ReadonlyArray<KeyValue> | undefined) =>
  Object.fromEntries(
    (attributes ?? []).map(({ key, value }) => [key ?? '', text(value)]),
  );

const serviceOf = ({ context }: { context: SpanRecord['context'] }) =>
  context.resource?.attributes?.find(({ key }) => key === 'service.name')?.value
    ?.stringValue ?? null;

const statusOf = ({ span }: SpanRecord) =>
  span.status?.code === ERROR
    ? span.status.message
      ? `error: ${span.status.message}`
      : 'error'
    : span.status?.code === OK
      ? 'ok'
      : 'unset';

export const compactTrace = (
  traceId: string,
  spans: ReadonlyArray<Entity<SpanRecord>>,
  logs: ReadonlyArray<Entity<LogRecord>>,
) => {
  const starts = spans.flatMap(({ value }) => {
    const start = nanos(value.span.startTimeUnixNano);
    return start === null ? [] : [start];
  });
  const origin = starts.reduce<bigint | null>(
    (min, start) => (min === null || start < min ? start : min),
    null,
  );
  const since = (value: Nanos) => {
    const at = nanos(value);
    return at === null || origin === null ? null : ms(origin, at);
  };
  return {
    traceId,
    spans: spans.map(({ value }) => {
      const start = nanos(value.span.startTimeUnixNano);
      const end = nanos(value.span.endTimeUnixNano);
      return {
        span: value.spanId,
        parent: value.span.parentSpanId || null,
        name: value.span.name ?? '',
        service: serviceOf(value),
        startMs: since(value.span.startTimeUnixNano) ?? 0,
        durationMs: start === null || end === null ? null : ms(start, end),
        status: statusOf(value),
        attributes: flat(value.span.attributes),
        events: (value.span.events ?? []).map((event) => {
          const fields = Object.entries(flat(event.attributes))
            .map(([key, each]) => `${key}=${each}`)
            .join(' ');
          const at = since(event.timeUnixNano);
          return `${at === null ? '' : `${at}ms `}${event.name ?? ''}${fields ? ` ${fields}` : ''}`;
        }),
      };
    }),
    logs: logs.map(({ value }) => ({
      atMs: since(value.log.timeUnixNano ?? value.log.observedTimeUnixNano),
      span: value.spanId,
      severity: value.log.severityText ?? null,
      body: text(value.log.body),
    })),
  };
};

const isoOf = (value: Nanos) => {
  const at = nanos(value);
  return at === null ? null : new Date(Number(at / 1_000_000n)).toISOString();
};

export const compactLog = ({ value }: Entity<LogRecord>) => ({
  at: isoOf(value.log.timeUnixNano ?? value.log.observedTimeUnixNano),
  service: serviceOf(value),
  severity: value.log.severityText ?? null,
  body: text(value.log.body),
  trace: value.traceId,
  span: value.spanId,
});

export const compactSummary = (summary: TraceSummary) => {
  const start = nanos(summary.startTimeUnixNano ?? undefined);
  const end = nanos(summary.endTimeUnixNano ?? undefined);
  return {
    traceId: summary.traceId,
    name: summary.name,
    service: summary.serviceName,
    startedAt: isoOf(summary.startTimeUnixNano ?? undefined),
    durationMs: start === null || end === null ? null : ms(start, end),
    spans: summary.spanCount,
    errors: summary.errorCount,
    running: summary.running,
  };
};
