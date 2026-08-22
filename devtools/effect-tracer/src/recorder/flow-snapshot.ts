import {
  flowAttributePrefix,
  flowAttributes,
  projectFlow,
  RecordedFlowSchema,
  type FlowObservation,
  type RecordedFlowAttributeValue,
} from '../flow/index.js';
import type {
  CapturedLog,
  CapturedSpan,
  CapturedTrace,
  TraceValue,
} from './recorder.js';

type RecordedFlow = typeof RecordedFlowSchema.Type;
type RecordedFlowActivityLog = NonNullable<
  Extract<FlowObservation, { source: 'span' }>['logs']
>[number];

const text = (value: TraceValue | undefined) =>
  typeof value === 'string'
    ? value
    : value === undefined
      ? ''
      : JSON.stringify(value);

const severity = (level: CapturedLog['level']) => {
  switch (level) {
    case 'Fatal':
    case 'Error':
      return 'error' as const;
    case 'Warn':
      return 'warning' as const;
    case 'Debug':
    case 'Trace':
      return 'debug' as const;
    default:
      return 'info' as const;
  }
};

const displayAttributes = (
  record: Readonly<Record<string, TraceValue>>,
): Readonly<Record<string, RecordedFlowAttributeValue>> | undefined => {
  const entries = Object.entries(record)
    .filter(([key]) => !key.startsWith('flow.'))
    .map(
      ([key, value]) =>
        [
          key.startsWith(flowAttributePrefix)
            ? key.slice(flowAttributePrefix.length)
            : key,
          value,
        ] as const,
    );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const activityObservation = (
  span: CapturedSpan,
  flowId: string,
  order: string,
  nestedLogs: (spanId: string) => readonly RecordedFlowActivityLog[],
): FlowObservation | null => {
  if (span.attributes[flowAttributes.id] !== flowId) return null;
  const participant = span.attributes[flowAttributes.participantName];
  const attributes = displayAttributes(span.attributes);
  const logs = nestedLogs(span.spanId);
  return {
    source: 'span',
    recordId: `${span.traceId}:${span.spanId}`,
    ...(typeof participant === 'string' && participant.length > 0
      ? { participantName: participant }
      : {}),
    name: span.name,
    timestamp: span.startTime,
    order,
    ...(attributes ? { attributes } : {}),
    ...(logs.length > 0 ? { logs } : {}),
    duration:
      span.endTime === null ? null : Math.max(0, span.endTime - span.startTime),
    status: span.status,
    traceId: span.traceId,
    spanId: span.spanId,
  };
};

const eventObservation = (
  log: CapturedLog,
  flowId: string,
  order: string,
): FlowObservation | null => {
  if (log.annotations[flowAttributes.id] !== flowId) return null;
  const participant = log.annotations[flowAttributes.participantName];
  const attributes = displayAttributes(log.annotations);
  const itemType = log.annotations[flowAttributes.itemType];
  const activationOutcome = log.annotations[flowAttributes.activationOutcome];
  const destination = log.annotations[flowAttributes.messageTo];
  const messageId = log.annotations[flowAttributes.messageId];
  const replyTo = log.annotations[flowAttributes.messageReplyTo];
  return {
    source: 'log',
    recordId: log.id,
    ...(typeof participant === 'string' && participant.length > 0
      ? { participantName: participant }
      : {}),
    name: text(log.message) || 'Event',
    timestamp: log.timestamp,
    order,
    ...(attributes ? { attributes } : {}),
    severity: severity(log.level),
    ...(typeof itemType === 'string' ? { itemType } : {}),
    ...(typeof activationOutcome === 'string' ? { activationOutcome } : {}),
    ...(typeof destination === 'string' ? { destination } : {}),
    ...(typeof messageId === 'string' ? { messageId } : {}),
    ...(typeof replyTo === 'string' ? { replyTo } : {}),
  };
};

export const recordedFlowIds = (trace: CapturedTrace) => [
  ...new Set(
    [
      ...trace.spans.map((span) => span.attributes[flowAttributes.id]),
      ...trace.logs.map((log) => log.annotations[flowAttributes.id]),
    ].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    ),
  ),
];

const observationOrder = (index: number) => index.toString().padStart(12, '0');

export const projectRecordedFlow = (
  trace: CapturedTrace,
  id: string,
): RecordedFlow | null => {
  const childrenOf = new Map<string, CapturedSpan[]>();
  for (const span of trace.spans) {
    if (span.parentSpanId === null) continue;
    const children = childrenOf.get(span.parentSpanId) ?? [];
    children.push(span);
    childrenOf.set(span.parentSpanId, children);
  }

  const plainLogsBySpan = new Map<string, CapturedLog[]>();
  for (const log of trace.logs) {
    if (log.spanId === null) continue;
    if (log.annotations[flowAttributes.id] !== undefined) continue;
    const logs = plainLogsBySpan.get(log.spanId) ?? [];
    logs.push(log);
    plainLogsBySpan.set(log.spanId, logs);
  }

  const nestedLogs = (spanId: string): readonly RecordedFlowActivityLog[] => {
    const collected: CapturedLog[] = [];
    const visit = (current: string) => {
      collected.push(...(plainLogsBySpan.get(current) ?? []));
      for (const child of childrenOf.get(current) ?? []) {
        if (typeof child.attributes[flowAttributes.id] === 'string') continue;
        visit(child.spanId);
      }
    };
    visit(spanId);
    return collected
      .sort((left, right) => left.timestamp - right.timestamp)
      .map((log) => {
        const attributes = displayAttributes(log.annotations);
        return {
          timestamp: log.timestamp,
          severity: severity(log.level),
          message: text(log.message) || 'Log',
          ...(attributes ? { attributes } : {}),
        };
      });
  };

  const observations = [
    ...trace.spans.map((span, index) =>
      activityObservation(span, id, observationOrder(index), nestedLogs),
    ),
    ...trace.logs.map((log, index) =>
      eventObservation(log, id, observationOrder(trace.spans.length + index)),
    ),
  ].filter((observation) => observation !== null);
  if (observations.length === 0) return null;

  const projected = projectFlow({ id, latestTimestamp: 0, observations });
  const latestTimestamp = Math.max(
    0,
    ...projected.items.map((item) =>
      item.kind === 'activity' && item.duration !== null
        ? item.timestamp + item.duration
        : item.timestamp,
    ),
  );
  return { ...projected, latestTimestamp };
};
