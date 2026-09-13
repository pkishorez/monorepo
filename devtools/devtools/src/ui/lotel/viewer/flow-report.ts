import type { RecordedFlowSchema } from '@pkishorez/lotel/flow';

type RecordedFlow = typeof RecordedFlowSchema.Type;
type RecordedFlowItem = RecordedFlow['items'][number];
type RecordedFlowActivation = RecordedFlow['activations'][number];
type RecordedFlowAttributes = NonNullable<RecordedFlowItem['attributes']>;

export type FlowStatus =
  | 'active'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'unknown';

/** Summarizes a Flow's Activations into one status for lists and headers. */
export function flowStatusOf(flow: RecordedFlow | undefined): FlowStatus {
  if (!flow) return 'unknown';
  if (flow.activations.some((activation) => activation.outcome === 'failed'))
    return 'failed';
  if (flow.activations.some((activation) => activation.outcome === null))
    return 'active';
  if (
    flow.activations.some((activation) => activation.outcome === 'interrupted')
  )
    return 'interrupted';
  return 'completed';
}

/**
 * Renders one Recorded Flow as Markdown that reads without the Flow view:
 * a summary, every Participant with its Activations, every Message, the full
 * chronological timeline with attributes and Activity logs, and warnings.
 * Meant to be pasted into a bug report or handed to an agent.
 */
export function makeFlowReport(
  flow: RecordedFlow,
  options: { readonly copiedAt: Date },
): string {
  const items = flow.items.toSorted(
    (left, right) => left.timestamp - right.timestamp,
  );
  const startTimestamp = items[0]?.timestamp ?? flow.latestTimestamp;
  const offset = (timestamp: number) =>
    formatOffset(timestamp - startTimestamp);
  const participantNames = orderedParticipantNames(items);

  const sections = [
    summarySection(flow, items, startTimestamp, options.copiedAt),
    participantsSection(flow, items, participantNames, offset),
    messagesSection(items, offset),
    timelineSection(items, offset),
    warningsSection(flow),
  ];
  return `${sections.filter((section) => section !== null).join('\n\n')}\n`;
}

function summarySection(
  flow: RecordedFlow,
  items: readonly RecordedFlowItem[],
  startTimestamp: number,
  copiedAt: Date,
) {
  const counts = countByKind(items);
  const participantCount = orderedParticipantNames(items).length;
  const lines = [
    `# Flow ${flow.id}`,
    '',
    `Recorded Flow copied from DevTools Lotel at ${copiedAt.toISOString()}.`,
    'A Flow is correlated work across Participants. Timeline entries are chronological;',
    '`+t` is the offset from the first Flow Item. Trace ids can be expanded with',
    '`devtools get-trace <trace-id>`.',
    '',
    `- Status: ${flowStatusOf(flow)}`,
    ...(flow.parentFlowId === undefined
      ? []
      : [`- Parent Flow: ${flow.parentFlowId}`]),
    `- Started: ${items.length === 0 ? 'unknown (no Flow Items)' : isoTime(startTimestamp)}`,
    `- Latest: ${isoTime(flow.latestTimestamp)} (${formatDuration(flow.latestTimestamp - startTimestamp)} after start)`,
    `- Participants: ${participantCount}`,
    `- Flow Items: ${items.length} (${counts})`,
    `- Activations: ${flow.activations.length}`,
    `- Warnings: ${flow.warnings.length}`,
  ];
  return lines.join('\n');
}

function participantsSection(
  flow: RecordedFlow,
  items: readonly RecordedFlowItem[],
  participantNames: readonly string[],
  offset: (timestamp: number) => string,
) {
  if (participantNames.length === 0) {
    return '## Participants\n\nNone.';
  }
  const lines = participantNames.flatMap((participantName) => {
    const ownItems = items.filter(
      (item) => item.participantName === participantName,
    );
    const activations = flow.activations.filter(
      (activation) => activation.participantName === participantName,
    );
    const summary =
      ownItems.length === 0
        ? 'receives Messages only'
        : `${ownItems.length} item${ownItems.length === 1 ? '' : 's'}, ${describeActivations(activations)}`;
    return [
      `- ${participantName} — ${summary}`,
      ...activations.map(
        (activation) => `  - ${describeActivation(activation, offset)}`,
      ),
    ];
  });
  return ['## Participants', '', ...lines].join('\n');
}

function messagesSection(
  items: readonly RecordedFlowItem[],
  offset: (timestamp: number) => string,
) {
  const timestampByMessageId = new Map(
    items.flatMap((item) =>
      item.kind === 'message'
        ? [[item.messageId, item.timestamp] as const]
        : [],
    ),
  );
  const lines = items.flatMap((item) => {
    if (item.kind !== 'message') return [];
    const sent =
      item.replyTo === undefined
        ? undefined
        : timestampByMessageId.get(item.replyTo);
    const reply =
      item.replyTo === undefined
        ? ''
        : `, reply to ${item.replyTo}${
            sent === undefined
              ? ''
              : ` after ${formatDuration(item.timestamp - sent)}`
          }`;
    return [
      `- ${offset(item.timestamp)} ${item.participantName} → ${item.destination}: ${quote(item.name)} (id ${item.messageId}${reply})`,
    ];
  });
  if (lines.length === 0) return null;
  return ['## Messages', '', ...lines].join('\n');
}

function timelineSection(
  items: readonly RecordedFlowItem[],
  offset: (timestamp: number) => string,
) {
  if (items.length === 0) return '## Timeline\n\nNo Flow Items.';
  const lines = items.flatMap((item, index) => [
    `${index + 1}. ${offset(item.timestamp)} ${describeItem(item)}`,
    ...attributeLines(item.attributes, '   '),
    ...(item.kind === 'activity'
      ? (item.logs ?? []).flatMap((log) => [
          `   - log ${offset(log.timestamp)} ${log.severity}: ${quote(log.message)}`,
          ...attributeLines(log.attributes, '     '),
        ])
      : []),
  ]);
  return ['## Timeline', '', ...lines].join('\n');
}

function warningsSection(flow: RecordedFlow) {
  if (flow.warnings.length === 0) return null;
  return [
    '## Warnings',
    '',
    ...flow.warnings.map(
      (warning) =>
        `- ${warning.recordType} ${warning.recordId}: ${warning.message}`,
    ),
  ].join('\n');
}

function describeItem(item: RecordedFlowItem) {
  switch (item.kind) {
    case 'activity':
      return `[${item.participantName}] activity ${quote(item.name)} ${item.status} ${formatDuration(item.duration)} (trace ${item.traceId}, span ${item.spanId})`;
    case 'message':
      return `[${item.participantName} → ${item.destination}] message ${quote(item.name)} (id ${item.messageId}${
        item.replyTo === undefined ? '' : `, reply to ${item.replyTo}`
      })`;
    case 'local-event':
      return `[${item.participantName}] ${item.severity} event ${quote(item.name)}`;
    case 'activation-start':
      return `[${item.participantName}] activation start ${quote(item.name)}`;
    case 'activation-end':
      return `[${item.participantName}] activation end ${item.outcome} ${quote(item.name)}`;
  }
}

function describeActivations(activations: readonly RecordedFlowActivation[]) {
  if (activations.length === 0) return 'no Activations';
  const outcomes = new Map<string, number>();
  for (const activation of activations) {
    const key = activation.outcome ?? 'open';
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
  }
  const detail = [...outcomes]
    .map(([outcome, count]) => `${count} ${outcome}`)
    .join(', ');
  return `${activations.length} Activation${activations.length === 1 ? '' : 's'} (${detail})`;
}

function describeActivation(
  activation: RecordedFlowActivation,
  offset: (timestamp: number) => string,
) {
  const end =
    activation.endTimestamp === null
      ? 'still open'
      : `${offset(activation.endTimestamp)} (${formatDuration(activation.endTimestamp - activation.startTimestamp)})`;
  return `Activation ${quote(activation.name)}: ${offset(activation.startTimestamp)} → ${end}, ${activation.outcome ?? 'open'}`;
}

function attributeLines(
  attributes: RecordedFlowAttributes | undefined,
  indent: string,
) {
  if (!attributes) return [];
  return Object.entries(attributes).map(
    ([key, value]) => `${indent}- ${key}: ${formatValue(value)}`,
  );
}

function countByKind(items: readonly RecordedFlowItem[]) {
  const labels: Record<RecordedFlowItem['kind'], string> = {
    activity: 'activities',
    message: 'messages',
    'local-event': 'local events',
    'activation-start': 'activation starts',
    'activation-end': 'activation ends',
  };
  const counts = new Map<RecordedFlowItem['kind'], number>();
  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  if (counts.size === 0) return 'none';
  return (Object.keys(labels) as RecordedFlowItem['kind'][])
    .filter((kind) => counts.has(kind))
    .map((kind) => `${counts.get(kind)} ${labels[kind]}`)
    .join(', ');
}

function orderedParticipantNames(items: readonly RecordedFlowItem[]) {
  return [
    ...new Set(
      items.flatMap((item) => [
        item.participantName,
        ...(item.kind === 'message' ? [item.destination] : []),
      ]),
    ),
  ];
}

function formatValue(value: unknown) {
  if (typeof value === 'string' && !value.includes('\n')) return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function quote(text: string) {
  return JSON.stringify(text);
}

function isoTime(timestamp: number) {
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : 'unknown';
}

function formatOffset(milliseconds: number) {
  const sign = milliseconds < 0 ? '-' : '+';
  return `${sign}${(Math.abs(milliseconds) / 1_000).toFixed(3)}s`;
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return 'running';
  if (milliseconds < 1) return '<1ms';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1_000).toFixed(2)}s`;
}
