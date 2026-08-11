import {
  flowItemTypes,
  type RecordedFlow,
} from '@pkishorez/effect-tracer/flow';
import type { EntityType } from 'std-toolkit/core';
import type { AnyValue } from '../telemetry-schema/otlp.js';
import type { LogRecord, SpanRecord } from '../telemetry-schema/index.js';
import type { FlowEntity } from './flow.js';
import { readFlowAttribute, readTerminalStatus } from './attributes.js';
import { validateFlowRecords } from './validation.js';

type RecordedFlowItem = RecordedFlow['items'][number];

const milliseconds = (value: string | number | undefined) => {
  if (value === undefined) return 0;
  try {
    return Number(BigInt(value)) / 1_000_000;
  } catch {
    return Number(value) || 0;
  }
};

const bodyText = (value: AnyValue | undefined): string => {
  if (!value) return '';
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return String(value.boolValue);
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  if (value.arrayValue?.values) {
    return JSON.stringify(value.arrayValue.values.map(bodyText));
  }
  if (value.kvlistValue?.values) {
    return JSON.stringify(
      Object.fromEntries(
        value.kvlistValue.values.map((entry) => [
          entry.key ?? '',
          bodyText(entry.value),
        ]),
      ),
    );
  }
  return value.bytesValue ?? '';
};

const severity = (number: number | undefined) => {
  if ((number ?? 0) >= 17) return 'error' as const;
  if ((number ?? 0) >= 13) return 'warning' as const;
  if ((number ?? 0) > 0 && (number ?? 0) <= 8) return 'debug' as const;
  return 'info' as const;
};

const activity = (record: EntityType<SpanRecord>): RecordedFlowItem => {
  const span = record.value.span;
  const start = milliseconds(span.startTimeUnixNano);
  const end =
    span.endTimeUnixNano === undefined
      ? null
      : milliseconds(span.endTimeUnixNano);
  return {
    kind: 'activity',
    id: `${record.value.traceId}:${record.value.spanId}`,
    participantName: record.value.participantName!,
    name: span.name ?? 'Activity',
    timestamp: start,
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

const event = (record: EntityType<LogRecord>): RecordedFlowItem => {
  const log = record.value.log;
  const common = {
    id: record.value.id,
    participantName: record.value.participantName!,
    name: (log.eventName ?? bodyText(log.body)) || 'Event',
    timestamp: milliseconds(log.timeUnixNano ?? log.observedTimeUnixNano),
    severity: severity(log.severityNumber),
  };
  const destination = readFlowAttribute(log.attributes, 'messageTo');
  if (
    readFlowAttribute(log.attributes, 'itemType') === flowItemTypes.message &&
    destination
  ) {
    return { kind: 'message', destination, ...common };
  }
  const status = readTerminalStatus(log.attributes);
  return { kind: 'local-event', ...common, ...(status ? { status } : {}) };
};

export const projectStoredFlow = (
  flow: EntityType<FlowEntity>,
  spans: EntityType<SpanRecord>[],
  logs: EntityType<LogRecord>[],
): RecordedFlow => {
  const validated = validateFlowRecords(spans, logs);
  const items = [
    ...validated.spans.map((record) => ({
      item: activity(record),
      cursor: record.meta._u,
    })),
    ...validated.logs.map((record) => ({
      item: event(record),
      cursor: record.meta._u,
    })),
  ]
    .sort(
      (left, right) =>
        left.item.timestamp - right.item.timestamp ||
        left.cursor.localeCompare(right.cursor),
    )
    .map(({ item }) => item);

  return {
    id: flow.value.flowId,
    status: flow.value.status,
    latestTimestamp: milliseconds(flow.value.latestTimeUnixNano),
    items,
    warnings: validated.warnings,
  };
};
