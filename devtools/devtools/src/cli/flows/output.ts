import type { Entry, Projection } from '@pkishorez/flow';
import {
  formatAttributes,
  formatMillis,
  isoTime,
  offsetColumn,
} from '../text-format.js';

export type SimpleFlow = {
  readonly flowId: string;
  readonly status: Projection['status'];
  readonly participants: ReadonlyArray<string>;
  readonly entries: number;
  readonly latestTime: string | null;
};

/** Reduces Projections to their identity, status, and latest activity. */
export const simplifyFlowList = (
  projections: ReadonlyArray<Projection>,
  limit?: number,
) => ({
  items: [...projections]
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp)
    .slice(0, limit)
    .map((projection) => ({
      flowId: projection.id,
      status: projection.status,
      participants: projection.participants,
      entries: projection.items.length,
      latestTime: isoTime(projection.latestTimestamp),
    })),
});

export const renderFlowListText = (list: {
  readonly items: ReadonlyArray<SimpleFlow>;
}) =>
  list.items.length === 0
    ? 'No Flows stored.'
    : list.items
        .map(
          (flow) =>
            `${flow.flowId}  [${flow.status}]  ${flow.entries} entries  latest ${flow.latestTime ?? '?'}  ${flow.participants.join(', ')}`,
        )
        .join('\n');

const entryLine = (entry: Entry) => {
  switch (entry.kind) {
    case 'event':
      return `• ${entry.severity} ${entry.name}`;
    case 'message': {
      const reply = entry.replyTo ? ` (reply to ${entry.replyTo})` : '';
      return `→ ${entry.destination}: ${entry.name}${reply}`;
    }
    case 'activation-start':
      return `⏵ activation start: ${entry.name}`;
    case 'activation-end':
      return `⏹ activation end (${entry.outcome}): ${entry.name}`;
    case 'wait':
      return `⏸ wait: ${entry.name}`;
    case 'resume':
      return `⏯ resume: ${entry.name}`;
    case 'check':
      return `${entry.passed ? '✓' : '✗'} check: ${entry.name}`;
    case 'close':
      return `⏏ close: ${entry.name}`;
  }
};

const itemLine = (entry: Entry, start: number) => {
  const attributes = entry.attributes ? formatAttributes(entry.attributes) : '';
  const tail = attributes ? `  ${attributes}` : '';
  return `${offsetColumn(entry.timestamp, start)}${entry.participantName} ${entryLine(entry)}${tail}`;
};

const activationLine = (
  activation: Projection['activations'][number],
  start: number,
) => {
  const duration =
    activation.endTimestamp === null
      ? '[running]'
      : `[${activation.outcome ?? 'unknown'} ${formatMillis(activation.endTimestamp - activation.startTimestamp)}]`;
  return `${offsetColumn(activation.startTimestamp, start)}${activation.participantName} ▸ ${activation.name} ${duration}`;
};

/** Renders a Flow Projection as one chronological line per Entry. */
export const renderFlowText = (projection: Projection) => {
  const start = projection.items[0]?.timestamp ?? projection.latestTimestamp;
  const lines = [
    `Flow ${projection.id} (${projection.ordering} order)`,
    [
      `participants ${projection.participants.join(', ') || '(none)'}`,
      `${projection.items.length} entries`,
      `${projection.activations.length} activations`,
      `${projection.waits.length} waits`,
      `status ${projection.status}`,
      `latest ${isoTime(projection.latestTimestamp) ?? '?'}`,
    ].join(' · '),
    '',
    ...projection.items.map((entry) => itemLine(entry, start)),
  ];
  if (projection.activations.length > 0) {
    lines.push(
      '',
      'Activations:',
      ...projection.activations.map(
        (activation) => `  ${activationLine(activation, start)}`,
      ),
    );
  }
  if (projection.warnings.length > 0) {
    lines.push(
      '',
      'Warnings:',
      ...projection.warnings.map(
        (warning) =>
          `  - ${warning.kind} ${warning.itemId}: ${warning.message}`,
      ),
    );
  }
  return lines.join('\n');
};
