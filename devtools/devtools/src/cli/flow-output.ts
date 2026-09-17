import type { RecordedFlowSchema } from '@pkishorez/lotel/flow';
import {
  formatAttributes,
  formatMillis,
  isoTime,
  nanosToMillis,
  offsetColumn,
} from './output.js';

type RecordedFlow = typeof RecordedFlowSchema.Type;
type RecordedFlowItem = RecordedFlow['items'][number];

type StoredFlow = {
  readonly value: {
    readonly flowId: string;
    readonly latestTimeUnixNano: string;
  };
};

export type FlowListInput = { readonly items: ReadonlyArray<StoredFlow> };

export type SimpleFlowEntry = {
  readonly flowId: string;
  readonly latestTime: string | null;
};

/** Reduces stored Flow Entities to their identity and latest activity. */
export const simplifyFlowList = (list: FlowListInput) => ({
  items: list.items.map((flow) => ({
    flowId: flow.value.flowId,
    latestTime: isoTime(nanosToMillis(flow.value.latestTimeUnixNano)),
  })),
});

export const renderFlowListText = (list: {
  readonly items: ReadonlyArray<SimpleFlowEntry>;
}) =>
  list.items.length === 0
    ? 'No Flows stored.'
    : list.items
        .map((flow) => `${flow.flowId}  latest ${flow.latestTime ?? '?'}`)
        .join('\n');

const itemLine = (item: RecordedFlowItem, start: number) => {
  const offset = offsetColumn(item.timestamp, start);
  const attributes = item.attributes ? formatAttributes(item.attributes) : '';
  const tail = attributes ? `  ${attributes}` : '';
  switch (item.kind) {
    case 'activity': {
      const status =
        item.status === 'running'
          ? '[running]'
          : `[${item.status} ${formatMillis(item.duration)}]`;
      const logs = (item.logs ?? []).map(
        (log) =>
          `${offsetColumn(log.timestamp, start)}    · ${log.severity.toUpperCase()} ${log.message}${log.attributes ? `  ${formatAttributes(log.attributes)}` : ''}`,
      );
      return [
        `${offset}${item.participantName} ▸ ${item.name} ${status}${tail}`,
        ...logs,
      ];
    }
    case 'message': {
      const reply = item.replyTo ? ` (reply to ${item.replyTo})` : '';
      return [
        `${offset}${item.participantName} → ${item.destination}: ${item.name}${reply}${tail}`,
      ];
    }
    case 'local-event':
      return [
        `${offset}${item.participantName} • ${item.severity} ${item.name}${tail}`,
      ];
    case 'activation-start':
      return [
        `${offset}${item.participantName} ⏵ activation start: ${item.name}${tail}`,
      ];
    case 'activation-end':
      return [
        `${offset}${item.participantName} ⏹ activation end (${item.outcome}): ${item.name}${tail}`,
      ];
  }
};

/** Renders a Recorded Flow as one chronological line per Flow Item. */
export const renderFlowText = (flow: RecordedFlow) => {
  const participants = [
    ...new Set(flow.items.map((item) => item.participantName)),
  ];
  const start = flow.items[0]?.timestamp ?? flow.latestTimestamp;
  const lines = [
    `Flow ${flow.id}${flow.parentFlowId ? ` (parent ${flow.parentFlowId})` : ''}`,
    [
      `participants ${participants.join(', ') || '(none)'}`,
      `${flow.items.length} items`,
      `${flow.activations.length} activations`,
      `latest ${isoTime(flow.latestTimestamp) ?? '?'}`,
    ].join(' · '),
    '',
    ...flow.items.flatMap((item) => itemLine(item, start)),
  ];
  if (flow.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of flow.warnings) {
      lines.push(
        `  - ${warning.recordType} ${warning.recordId}: ${warning.message}`,
      );
    }
  }
  return lines.join('\n');
};
