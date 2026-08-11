import type {
  CapturedLog,
  CapturedSpan,
  CapturedTrace,
  TraceValue,
} from './recorder.js';
import {
  flowAttributes,
  flowItemTypes,
  isTerminalFlowStatus,
  type RecordedFlow,
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

const terminalStatus = (
  value: TraceValue | undefined,
): Exclude<RecordedFlowStatus, 'active'> | undefined =>
  isTerminalFlowStatus(value) ? value : undefined;

const activity = (
  span: CapturedSpan,
  flow: string,
  warnings: RecordedFlowWarning[],
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
  return {
    kind: 'activity',
    id: `${span.traceId}:${span.spanId}`,
    participantName: participant,
    name: span.name,
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
  const common = {
    id: log.id,
    participantName: participant,
    name: text(log.message) || 'Event',
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
  const items = [
    ...trace.spans.map((span) => activity(span, id, warnings)),
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
