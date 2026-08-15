import type {
  CapturedLog,
  CapturedSpan,
  CapturedTrace,
  TraceValue,
} from './recorder.js';
import {
  flowAttributePrefix,
  flowAttributes,
  flowItemTypes,
  isTerminalFlowStatus,
  type RecordedFlow,
  type RecordedFlowActivityLog,
} from '../flow/index.js';

type RecordedFlowItem = RecordedFlow['items'][number];
type RecordedFlowStatus = RecordedFlow['status'];
type RecordedFlowWarning = RecordedFlow['warnings'][number];

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
): Readonly<Record<string, TraceValue>> | undefined => {
  const entries = Object.entries(record)
    .filter(([key]) => !key.startsWith('flow.'))
    .map(([key, value]) => [
      key.startsWith(flowAttributePrefix)
        ? key.slice(flowAttributePrefix.length)
        : key,
      value,
    ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const terminalStatus = (
  value: TraceValue | undefined,
): Exclude<RecordedFlowStatus, 'active'> | undefined =>
  isTerminalFlowStatus(value) ? value : undefined;

const activity = (
  span: CapturedSpan,
  flow: string,
  warnings: RecordedFlowWarning[],
  nestedLogs: (spanId: string) => readonly RecordedFlowActivityLog[],
): RecordedFlowItem | null => {
  if (span.attributes[flowAttributes.id] !== flow) return null;
  const participant = span.attributes[flowAttributes.participantName];
  if (typeof participant !== 'string' || participant.length === 0) {
    warnings.push({
      recordType: 'span',
      recordId: `${span.traceId}:${span.spanId}`,
      message: 'Flow Span is missing flow.participant.name.',
    });
    return null;
  }
  const attributes = displayAttributes(span.attributes);
  const logs = nestedLogs(span.spanId);
  return {
    kind: 'activity',
    id: `${span.traceId}:${span.spanId}`,
    participantName: participant,
    name: span.name,
    ...(attributes ? { attributes } : {}),
    ...(logs.length > 0 ? { logs } : {}),
    timestamp: span.startTime,
    duration:
      span.endTime === null ? null : Math.max(0, span.endTime - span.startTime),
    status: span.status,
    traceId: span.traceId,
    spanId: span.spanId,
  };
};

const event = (
  log: CapturedLog,
  flow: string,
  warnings: RecordedFlowWarning[],
): RecordedFlowItem | null => {
  if (log.annotations[flowAttributes.id] !== flow) return null;
  const participant = log.annotations[flowAttributes.participantName];
  if (typeof participant !== 'string' || participant.length === 0) {
    warnings.push({
      recordType: 'log',
      recordId: log.id,
      message: 'Flow Log Record is missing flow.participant.name.',
    });
    return null;
  }
  const attributes = displayAttributes(log.annotations);
  const common = {
    id: log.id,
    participantName: participant,
    name: text(log.message) || 'Event',
    ...(attributes ? { attributes } : {}),
    timestamp: log.timestamp,
    severity: severity(log.level),
  };
  if (log.annotations[flowAttributes.itemType] !== flowItemTypes.message) {
    const status = terminalStatus(log.annotations[flowAttributes.status]);
    return {
      kind: 'local-event',
      ...common,
      ...(status ? { status } : {}),
    };
  }
  const destination = log.annotations[flowAttributes.messageTo];
  if (typeof destination !== 'string' || destination.length === 0) {
    warnings.push({
      recordType: 'log',
      recordId: common.id,
      message: 'Flow Message is missing flow.message.to.',
    });
    return null;
  }
  return { kind: 'message', destination, ...common };
};

const itemTimestamp = (item: RecordedFlowItem) => item.timestamp;

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

export const projectRecordedFlow = (
  trace: CapturedTrace,
  id: string,
): RecordedFlow | null => {
  const warnings: RecordedFlowWarning[] = [];
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
        // A nested flow activity owns its own subtree.
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
  const items = [
    ...trace.spans.map((span) => activity(span, id, warnings, nestedLogs)),
    ...trace.logs.map((log) => event(log, id, warnings)),
  ]
    .filter((item) => item !== null)
    .sort((left, right) => itemTimestamp(left) - itemTimestamp(right));
  if (items.length === 0 && warnings.length === 0) return null;

  let status: RecordedFlowStatus = 'active';
  for (const log of trace.logs) {
    if (log.annotations[flowAttributes.id] !== id) continue;
    const terminal = terminalStatus(log.annotations[flowAttributes.status]);
    if (terminal) {
      status = terminal;
      break;
    }
  }
  const latestTimestamp = Math.max(
    0,
    ...items.map((item) =>
      item.kind === 'activity' && item.duration !== null
        ? item.timestamp + item.duration
        : item.timestamp,
    ),
  );

  return { id, status, latestTimestamp, items, warnings };
};
