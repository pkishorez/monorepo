import type {
  StoredLogRecordValue,
  StoredTraceRecordValue,
} from 'lotel/client';
import type { OtelEvent, OtelSpan, OtelStatus } from './types.js';

type KV = NonNullable<StoredTraceRecordValue['record']['attributes']>[number];
type AnyVal = NonNullable<KV['value']>;
type KVList = NonNullable<AnyVal['kvlistValue']>['values'];
type ScopeType = NonNullable<StoredTraceRecordValue['context']['scope']>;
type ResourceType = NonNullable<StoredTraceRecordValue['context']['resource']>;

function nanosToMs(nano: string | number | undefined): number {
  if (nano === undefined) return 0;
  return Number(nano) / 1_000_000;
}

function anyValueToUnknown(v: AnyVal | undefined): unknown {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.bytesValue !== undefined) return v.bytesValue;
  if (v.arrayValue?.values) return v.arrayValue.values.map(anyValueToUnknown);
  if (v.kvlistValue?.values) return kvArrayToRecord(v.kvlistValue.values);
  return undefined;
}

function kvArrayToRecord(kvs: KVList | undefined): Record<string, unknown> {
  if (!kvs) return {};
  const result: Record<string, unknown> = {};
  for (const kv of kvs) {
    if (kv.key) result[kv.key] = anyValueToUnknown(kv.value);
  }
  return result;
}

function resourceAttrs(
  resource: ResourceType | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(kvArrayToRecord(resource?.attributes))) {
    result[`resource.${k}`] = v;
  }
  return result;
}

function scopeAttrs(scope: ScopeType | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!scope) return result;
  if (scope.name) result['scope.name'] = scope.name;
  if (scope.version) result['scope.version'] = scope.version;
  for (const [k, v] of Object.entries(kvArrayToRecord(scope.attributes))) {
    result[`scope.${k}`] = v;
  }
  return result;
}

function resolveStatus(
  code: number | undefined,
  endTime: number | null,
): OtelStatus {
  if (endTime === null) return 'running';
  if (code === 2) return 'error';
  if (code === 1) return 'success';
  return 'unset';
}

/**
 * Upgrade the span status to 'error' when semantic conventions indicate a
 * failure even though the sender did not set status.code = ERROR. Catches HTTP
 * 5xx (and 4xx on client spans), the `error.type` attribute, and exception
 * events.
 */
function inferErrorFromSemantics(
  baseStatus: OtelStatus,
  attributes: Record<string, unknown>,
  events: OtelEvent[],
  spanKind: number | undefined,
): OtelStatus {
  if (baseStatus === 'error' || baseStatus === 'running') return baseStatus;

  if (attributes['error.type'] !== undefined) return 'error';
  if (events.some((e) => e.name === 'exception')) return 'error';

  const httpCodeRaw =
    attributes['http.response.status_code'] ?? attributes['http.status_code'];
  const httpCode =
    typeof httpCodeRaw === 'number'
      ? httpCodeRaw
      : typeof httpCodeRaw === 'string'
        ? Number(httpCodeRaw)
        : NaN;
  if (Number.isFinite(httpCode)) {
    // SPAN_KIND_CLIENT = 3 in OTel proto. For client spans, 4xx is also an
    // error from the caller's perspective. For other kinds (server, internal),
    // treat 5xx as error.
    const threshold = spanKind === 3 ? 400 : 500;
    if (httpCode >= threshold) return 'error';
  }

  return baseStatus;
}

export function transformSpan(stored: StoredTraceRecordValue): OtelSpan {
  const { record: span, context } = stored;

  const endTimeMs =
    span.endTimeUnixNano != null ? nanosToMs(span.endTimeUnixNano) : null;
  const statusCode =
    typeof span.status?.code === 'number' ? span.status.code : undefined;

  const attributes: Record<string, unknown> = {
    ...kvArrayToRecord(span.attributes),
    ...resourceAttrs(context.resource),
    ...scopeAttrs(context.scope),
  };

  const events: OtelEvent[] = (span.events ?? []).map((e) => ({
    name: e.name ?? '',
    timestamp: nanosToMs(e.timeUnixNano),
    attributes: kvArrayToRecord(e.attributes),
  }));

  const baseStatus = resolveStatus(statusCode, endTimeMs);
  const spanKind = typeof span.kind === 'number' ? span.kind : undefined;
  const status = inferErrorFromSemantics(
    baseStatus,
    attributes,
    events,
    spanKind,
  );

  return {
    traceId: span.traceId ?? '',
    spanId: span.spanId ?? '',
    parentSpanId: span.parentSpanId ?? null,
    name: span.name ?? '',
    startTime: nanosToMs(span.startTimeUnixNano),
    endTime: endTimeMs,
    status,
    attributes,
    events,
  };
}

export function transformLog(stored: StoredLogRecordValue): OtelEvent {
  const { record: log, context } = stored;

  const name =
    log.eventName ??
    log.severityText ??
    (log.body ? String(anyValueToUnknown(log.body)) : 'log');

  const attributes: Record<string, unknown> = {
    ...kvArrayToRecord(log.attributes),
    ...resourceAttrs(context.resource),
    ...scopeAttrs(context.scope),
    ...(log.body !== undefined ? { body: anyValueToUnknown(log.body) } : {}),
    ...(log.severityNumber !== undefined
      ? { severityNumber: log.severityNumber }
      : {}),
    ...(log.severityText !== undefined
      ? { severityText: log.severityText }
      : {}),
  };

  return {
    name,
    timestamp: nanosToMs(log.timeUnixNano ?? log.observedTimeUnixNano),
    attributes,
  };
}

export function attachLogs(span: OtelSpan, logs: OtelEvent[]): OtelSpan {
  return { ...span, events: [...span.events, ...logs] };
}
