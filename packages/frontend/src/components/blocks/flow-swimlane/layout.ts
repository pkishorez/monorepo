import { makeFlowSteps } from './event-summary';
import type { RecordedFlow } from './model';
import { makeParticipantHierarchy } from './participant-hierarchy';

type RecordedFlowItem = RecordedFlow['items'][number];
export type FlowLayoutItem = ReturnType<typeof makeFlowSteps>[number];

/** One Participant's Activation placed in row space. */
export type FlowLayoutActivation = {
  readonly participantName: string;
  readonly name: string;
  readonly outcome: RecordedFlow['activations'][number]['outcome'];
  readonly startY: number;
  readonly endY: number;
  readonly open: boolean;
};

const minimumWidth = 520;
const minimumSidePadding = 24;
export const flowCanvasTopPadding = 24;
export const flowRowGap = 88;

const rowY = (index: number) =>
  flowCanvasTopPadding + index * flowRowGap + flowRowGap / 2;

const orderedParticipantNames = (items: readonly RecordedFlowItem[]) => [
  ...new Set(
    items.flatMap((item) => [
      item.participantName,
      ...(item.kind === 'message' ? [item.destination] : []),
    ]),
  ),
];

/** Positions visible Flow Steps at equal ordinal steps rather than elapsed time. */
export const makeFlowLayout = (
  flow: RecordedFlow,
  options: {
    readonly hiddenPaths?: ReadonlySet<string>;
    readonly hiddenParticipantNames?: ReadonlySet<string>;
    readonly collapsedPaths?: ReadonlySet<string>;
    readonly collapsedSummaryIds?: ReadonlySet<string>;
  } = {},
) => {
  const chronologicalItems = flow.items.toSorted(
    (left, right) => left.timestamp - right.timestamp,
  );
  const hierarchy = makeParticipantHierarchy(
    orderedParticipantNames(chronologicalItems),
    options,
  );
  const visibleItems = chronologicalItems.filter((item) => {
    if (!hierarchy.visibleParticipants.has(item.participantName)) return false;
    return (
      item.kind !== 'message' ||
      hierarchy.visibleParticipants.has(item.destination)
    );
  });
  const items = makeFlowSteps(
    visibleItems,
    options.collapsedSummaryIds ?? new Set<string>(),
  );

  const columnWidth = hierarchy.columns.reduce(
    (total, column) => total + column.width,
    0,
  );
  const sidePadding = Math.max(
    minimumSidePadding,
    (minimumWidth - columnWidth) / 2,
  );
  const columnLeft = new Map<string, number>();
  const columnX = new Map<string, number>();
  let cursor = sidePadding;
  for (const column of hierarchy.columns) {
    columnLeft.set(column.key, cursor);
    columnX.set(column.key, cursor + column.width / 2);
    cursor += column.width;
  }
  const width = Math.max(minimumWidth, columnWidth + sidePadding * 2);
  const laneX = new Map(
    hierarchy.columns.flatMap((column) =>
      column.kind === 'participant'
        ? [[column.participantName, columnX.get(column.key)!] as const]
        : [],
    ),
  );

  const rowByItemId = new Map(
    items.flatMap((item, index) =>
      item.members.map(({ id }) => [id, index] as const),
    ),
  );
  const height =
    flowCanvasTopPadding + Math.max(1, items.length) * flowRowGap + 42;
  const laneEndY = height - 22;

  const activations: FlowLayoutActivation[] = flow.activations.flatMap(
    (activation) => {
      if (!hierarchy.visibleParticipants.has(activation.participantName)) {
        return [];
      }
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
    items.flatMap((item) => {
      if (item.kind !== 'message' || item.replyTo === undefined) return [];
      const sent = timestampByMessageId.get(item.replyTo);
      return sent === undefined
        ? []
        : [[item.id, item.timestamp - sent] as const];
    }),
  );

  /** Participants that only ever receive Messages and record nothing. */
  const silentParticipants = new Set(
    [...hierarchy.visibleParticipants].filter(
      (participant) =>
        !items.some((item) => item.participantName === participant),
    ),
  );

  const itemCenters = new Map(
    items.flatMap((item, index) => {
      const sourceX = laneX.get(item.participantName)!;
      const x =
        item.kind === 'message'
          ? (sourceX + laneX.get(item.destination)!) / 2
          : sourceX;
      const center = { x, y: rowY(index) };
      return item.members.map(({ id }) => [id, center] as const);
    }),
  );

  return {
    activations,
    columnLeft,
    columnX,
    height,
    hierarchy,
    itemCenters,
    items,
    laneEndY,
    laneX,
    participants: [...hierarchy.visibleParticipants],
    replyLatency,
    rowByItemId,
    sidePadding,
    silentParticipants,
    width,
  };
};

export type FlowLayout = ReturnType<typeof makeFlowLayout>;
