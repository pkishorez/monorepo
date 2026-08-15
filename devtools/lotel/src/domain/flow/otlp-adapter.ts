import {
  flowAttributePrefix,
  type FlowObservation,
  type RecordedFlowAttributeValue,
} from '@pkishorez/effect-tracer/flow';
import type { EntityType } from 'std-toolkit/core';
import type { AnyValue } from '../telemetry-schema/otlp.js';
import type {
  KeyValue,
  LogRecord,
  SpanRecord,
} from '../telemetry-schema/index.js';
import { readFlowAttribute } from './attributes.js';

export const unixNanosToMilliseconds = (value: string | number | undefined) => {
  if (value === undefined) return 0;
  try {
    return Number(BigInt(value)) / 1_000_000;
  } catch {
    return Number(value) || 0;
  }
};

const valueText = (value: AnyValue | undefined): string => {
  if (!value) return '';
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return String(value.boolValue);
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  if (value.arrayValue?.values) {
    return JSON.stringify(value.arrayValue.values.map(valueText));
  }
  if (value.kvlistValue?.values) {
    return JSON.stringify(
      Object.fromEntries(
        value.kvlistValue.values.map((entry) => [
          entry.key ?? '',
          valueText(entry.value),
        ]),
      ),
    );
  }
  return value.bytesValue ?? '';
};

const flowValue = (value: AnyValue | undefined): RecordedFlowAttributeValue => {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue?.values) return value.arrayValue.values.map(flowValue);
  if (value.kvlistValue?.values) {
    return Object.fromEntries(
      value.kvlistValue.values.map((entry) => [
        entry.key ?? '',
        flowValue(entry.value),
      ]),
    );
  }
  return value.bytesValue ?? null;
};

const displayAttributes = (
  attributes: KeyValue[] | undefined,
): Readonly<Record<string, RecordedFlowAttributeValue>> | undefined => {
  const entries = (attributes ?? []).flatMap(({ key, value }) => {
    if (!key || key.startsWith('flow.')) return [];
    return [
      [
        key.startsWith(flowAttributePrefix)
          ? key.slice(flowAttributePrefix.length)
          : key,
        flowValue(value),
      ] as const,
    ];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const stateAttributes = (
  attributes: KeyValue[] | undefined,
): Readonly<Record<string, RecordedFlowAttributeValue>> =>
  Object.fromEntries(
    (attributes ?? []).flatMap(({ key, value }) =>
      key?.startsWith(flowAttributePrefix)
        ? [[key.slice(flowAttributePrefix.length), flowValue(value)] as const]
        : [],
    ),
  );

const severity = (number: number | undefined) => {
  if ((number ?? 0) >= 17) return 'error' as const;
  if ((number ?? 0) >= 13) return 'warning' as const;
  if ((number ?? 0) > 0 && (number ?? 0) <= 8) return 'debug' as const;
  return 'info' as const;
};

export const spanObservation = (
  record: EntityType<SpanRecord>,
): FlowObservation => {
  const span = record.value.span;
  const start = unixNanosToMilliseconds(span.startTimeUnixNano);
  const end =
    span.endTimeUnixNano === undefined
      ? null
      : unixNanosToMilliseconds(span.endTimeUnixNano);
  const attributes = displayAttributes(span.attributes);
  return {
    source: 'span',
    recordId: `${record.value.traceId}:${record.value.spanId}`,
    ...(record.value.participantName
      ? { participantName: record.value.participantName }
      : {}),
    name: span.name ?? 'Activity',
    timestamp: start,
    order: record.meta._u,
    ...(attributes ? { attributes } : {}),
    duration: end === null ? null : Math.max(0, end - start),
    status:
      end === null
        ? 'running'
        : span.status?.code === 2
          ? 'error'
          : span.status?.code === 1
            ? 'success'
            : 'unset',
    traceId: record.value.traceId,
    spanId: record.value.spanId,
  };
};

export const logObservation = (
  record: EntityType<LogRecord>,
): FlowObservation => {
  const log = record.value.log;
  const attributes = displayAttributes(log.attributes);
  const itemType = readFlowAttribute(log.attributes, 'itemType');
  const activationOutcome = readFlowAttribute(
    log.attributes,
    'activationOutcome',
  );
  const destination = readFlowAttribute(log.attributes, 'messageTo');
  const messageId = readFlowAttribute(log.attributes, 'messageId');
  const replyTo = readFlowAttribute(log.attributes, 'messageReplyTo');
  return {
    source: 'log',
    recordId: record.value.id,
    ...(record.value.participantName
      ? { participantName: record.value.participantName }
      : {}),
    name: (log.eventName ?? valueText(log.body)) || 'Event',
    timestamp: unixNanosToMilliseconds(
      log.timeUnixNano ?? log.observedTimeUnixNano,
    ),
    order: record.meta._u,
    ...(attributes ? { attributes } : {}),
    severity: severity(log.severityNumber),
    ...(itemType ? { itemType } : {}),
    ...(activationOutcome ? { activationOutcome } : {}),
    ...(destination ? { destination } : {}),
    ...(messageId ? { messageId } : {}),
    ...(replyTo ? { replyTo } : {}),
    state: stateAttributes(log.attributes),
  };
};
