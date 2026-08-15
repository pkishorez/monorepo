import type { RecordedFlow } from './model';

type RecordedFlowItem = RecordedFlow['items'][number];
export type FlowLayoutItem = RecordedFlowItem & {
  readonly members: readonly RecordedFlowItem[];
  readonly repeatCount: number;
};

/** One Participant's Activation placed in row space. */
export type FlowLayoutActivation = {
  readonly participantName: string;
  readonly name: string;
  readonly outcome: RecordedFlow['activations'][number]['outcome'];
  readonly startY: number;
  readonly endY: number;
  readonly open: boolean;
};

const laneWidth = 260;
const sidePadding = 140;
export const flowHeaderHeight = 74;
export const flowRowGap = 88;

const syncWriteEvent = 'Source of Truth write';

const consolidateSyncWrites = (
  items: readonly RecordedFlowItem[],
): FlowLayoutItem[] => {
  const consolidated: FlowLayoutItem[] = [];
  const openSummary = new Map<string, number>();

  for (const item of items) {
    if (item.kind === 'local-event' && item.name === syncWriteEvent) {
      const existingIndex = openSummary.get(item.participantName);
      if (existingIndex !== undefined) {
        const existing = consolidated[existingIndex]!;
        consolidated[existingIndex] = {
          ...existing,
          members: [...existing.members, item],
          repeatCount: existing.repeatCount + 1,
        };
        continue;
      }
      openSummary.set(item.participantName, consolidated.length);
    } else {
      openSummary.delete(item.participantName);
    }
    consolidated.push({ ...item, members: [item], repeatCount: 1 });
  }

  return consolidated;
};

const rowY = (index: number) =>
  flowHeaderHeight + index * flowRowGap + flowRowGap / 2;

/** Positions Flow items at equal ordinal steps rather than elapsed-time scale. */
export const makeFlowLayout = (flow: RecordedFlow) => {
  const items = consolidateSyncWrites(
    flow.items.toSorted((left, right) => left.timestamp - right.timestamp),
  );
  const participants = [
    ...new Set(
      items.flatMap((item) => [
        item.participantName,
        ...(item.kind === 'message' ? [item.destination] : []),
      ]),
    ),
  ];
  const laneX = new Map(
    participants.map((participant, index) => [
      participant,
      sidePadding + index * laneWidth,
    ]),
  );

  const rowByItemId = new Map(
    items.flatMap((item, index) =>
      item.members.map(({ id }) => [id, index] as const),
    ),
  );
  const height = flowHeaderHeight + Math.max(1, items.length) * flowRowGap + 42;
  const laneEndY = height - 22;

  const activations: FlowLayoutActivation[] = flow.activations.flatMap(
    (activation) => {
      const startRow = rowByItemId.get(activation.startItemId);
      if (startRow === undefined) return [];
      const endRow =
        activation.endItemId === null
          ? undefined
          : rowByItemId.get(activation.endItemId);
      return [
        {
          participantName: activation.participantName,
          name: activation.name,
          outcome: activation.outcome,
          startY: rowY(startRow),
          endY: endRow === undefined ? laneEndY : rowY(endRow),
          open: activation.endItemId === null,
        },
      ];
    },
  );

  /** A Reply's elapsed time since the Message it answers, by item id. */
  const timestampByMessageId = new Map(
    flow.items.flatMap((item) =>
      item.kind === 'message'
        ? [[item.messageId, item.timestamp] as const]
        : [],
    ),
  );
  const replyLatency = new Map(
    flow.items.flatMap((item) => {
      if (item.kind !== 'message' || item.replyTo === undefined) return [];
      const sent = timestampByMessageId.get(item.replyTo);
      return sent === undefined
        ? []
        : [[item.id, item.timestamp - sent] as const];
    }),
  );

  /** Participants that only ever receive Messages and record nothing. */
  const silentParticipants = new Set(
    participants.filter(
      (participant) =>
        !items.some((item) => item.participantName === participant),
    ),
  );

  return {
    activations,
    items,
    laneEndY,
    laneX,
    participants,
    replyLatency,
    silentParticipants,
    width: Math.max(
      520,
      sidePadding * 2 + Math.max(0, participants.length - 1) * laneWidth,
    ),
    height,
  };
};

export type FlowLayout = ReturnType<typeof makeFlowLayout>;
