import type { RecordedFlow } from './model';

type RecordedFlowItem = RecordedFlow['items'][number];

type SingleFlowStep = RecordedFlowItem & {
  readonly members: readonly RecordedFlowItem[];
  readonly repeatCount: number;
  readonly summaryId?: string;
};

type FlowStepSummary = {
  readonly id: string;
  readonly kind: 'summary';
  readonly members: readonly RecordedFlowItem[];
  readonly name: string;
  readonly participantName: string;
  readonly repeatCount: number;
  readonly summaryId: string;
  readonly timestamp: number;
};

export type FlowStep = SingleFlowStep | FlowStepSummary;

const oneStep = (item: RecordedFlowItem, summaryId?: string): FlowStep => ({
  ...item,
  members: [item],
  repeatCount: 1,
  ...(summaryId === undefined ? {} : { summaryId }),
});

export const makeFlowSteps = (
  items: readonly RecordedFlowItem[],
  collapsedSummaryIds: ReadonlySet<string>,
): readonly FlowStep[] => {
  const steps: FlowStep[] = [];

  for (let index = 0; index < items.length;) {
    const first = items[index]!;
    if (first.kind === 'message') {
      steps.push(oneStep(first));
      index += 1;
      continue;
    }
    let end = index + 1;
    while (
      end < items.length &&
      items[end]!.kind !== 'message' &&
      items[end]!.participantName === first.participantName
    ) {
      end += 1;
    }
    const members = items.slice(index, end);
    if (members.length < 3) {
      steps.push(...members.map((item) => oneStep(item)));
    } else if (collapsedSummaryIds.has(first.id)) {
      steps.push({
        id: first.id,
        kind: 'summary',
        members,
        name: `${members.length} steps`,
        participantName: first.participantName,
        repeatCount: members.length,
        summaryId: first.id,
        timestamp: first.timestamp,
      });
    } else {
      steps.push(...members.map((item) => oneStep(item, first.id)));
    }
    index = end;
  }

  return steps;
};
