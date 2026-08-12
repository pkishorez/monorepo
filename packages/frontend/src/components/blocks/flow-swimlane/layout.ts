import type { RecordedFlow } from '@pkishorez/effect-tracer/flow';

type RecordedFlowItem = RecordedFlow['items'][number];
export type FlowLayoutItem = RecordedFlowItem & {
  readonly members: readonly RecordedFlowItem[];
  readonly repeatCount: number;
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

/** Positions Flow items at equal ordinal steps rather than elapsed-time scale. */
export const makeFlowLayout = (unorderedItems: readonly RecordedFlowItem[]) => {
  const items = consolidateSyncWrites(
    unorderedItems.toSorted((left, right) => left.timestamp - right.timestamp),
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

  return {
    items,
    participants,
    laneX,
    width: Math.max(
      520,
      sidePadding * 2 + Math.max(0, participants.length - 1) * laneWidth,
    ),
    height: flowHeaderHeight + Math.max(1, items.length) * flowRowGap + 42,
  };
};

export type FlowLayout = ReturnType<typeof makeFlowLayout>;
